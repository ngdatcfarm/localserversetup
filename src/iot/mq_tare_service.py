"""MQ Sensor Tare (R0 baseline calibration) Service.

Collects raw ADC samples from MQ135/MQ137 sensors over a fixed window
(default 10 minutes), computes a robust baseline (median of Rs), and
exposes it via the API for ratio computation.

R0 cache: 60s TTL keyed by (device_id, sensor_type) — used by
on_sensor_reading() to insert mq_ratio_samples without re-reading
mq_calibrations on every MQTT message.

State machine per (device_id, sensor_type):
    none -> start_tare() -> 'collecting'
        -> finalize_tare() [MIN_SAMPLES ok] -> 'completed'
        -> finalize_tare() [insufficient]   -> 'failed'
        -> cancel_tare()                   -> 'cancelled'
    'collecting' rows from a previous server lifetime are reconciled
    to 'failed' on startup so the UI does not show stale progress.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import median, pstdev
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


# ── Constants ──────────────────────────────────────────────
MQ_SENSOR_TYPES = ("mq135_raw", "mq137_raw")
SENSOR_ONLY_TYPE_ID = 3
TARE_WINDOW_SECONDS = 600
MIN_SAMPLES = 10
R0_CACHE_TTL_SECONDS = 60
TARE_GATE_HOURS = 24
DEFAULT_LOAD_RESISTOR = 10000.0
DEFAULT_ADC_MAX = 4095


# ── Internal state ─────────────────────────────────────────

@dataclass
class SessionState:
    """In-memory state for an active tare session."""
    device_id: int
    sensor_type: str
    calibration_id: int
    deadline: float                  # time.time() when collection should end
    load_resistor: float
    adc_max: int
    samples: list[tuple[int, float]] = field(default_factory=list)  # (raw_adc, ts)
    task: Optional[asyncio.Task] = None


@dataclass
class _CacheEntry:
    r0: float
    calibration_id: int
    load_resistor: float
    adc_max: int
    expires_at: float


# ── Service ────────────────────────────────────────────────

class MqTareService:
    """Singleton — instantiated as `mq_tare_service` at module bottom."""

    def __init__(self):
        self._sessions: dict[tuple[int, str], SessionState] = {}
        self._r0_cache: dict[tuple[int, str], _CacheEntry] = {}
        self._lock = asyncio.Lock()

    # ── public API ─────────────────────────────────────

    async def start_tare(
        self,
        device_id: int,
        sensor_type: str,
        load_resistor: float = 10000.0,
    ) -> dict:
        """Begin a 10-minute tare window for (device_id, sensor_type).

        Validates:
          - sensor_type is one of MQ_SENSOR_TYPES
          - device exists and is type 3 (Sensor Only)
          - device has been online 24h+ (first_heartbeat_at gate)
          - no active session is already running for this pair
        """
        if sensor_type not in MQ_SENSOR_TYPES:
            return {
                "ok": False,
                "status_code": 400,
                "message": f"Unsupported sensor_type: {sensor_type}",
            }

        if not db.pool:
            return {"ok": False, "status_code": 503, "message": "Database not available"}

        # Validate device + 24h gate
        row = await db.fetchrow(
            """SELECT id, device_type_id, first_heartbeat_at, created_at
               FROM devices WHERE id = $1""",
            device_id,
        )
        if not row:
            return {
                "ok": False,
                "status_code": 404,
                "message": f"Device {device_id} not found",
            }

        if row["device_type_id"] != SENSOR_ONLY_TYPE_ID:
            return {
                "ok": False,
                "status_code": 400,
                "message": (
                    f"Chỉ hỗ trợ thiết bị Sensor Only (device_type_id={SENSOR_ONLY_TYPE_ID}). "
                    f"Thiết bị này là loại {row['device_type_id']}."
                ),
            }

        first_seen = row["first_heartbeat_at"] or row["created_at"]
        if not first_seen:
            return {
                "ok": False,
                "status_code": 400,
                "message": "Thiết bị chưa có heartbeat, không thể tare.",
            }

        now_utc = datetime.now(timezone.utc)
        first_seen_aware = first_seen if first_seen.tzinfo else first_seen.replace(tzinfo=timezone.utc)
        age_hours = (now_utc - first_seen_aware).total_seconds() / 3600.0
        if age_hours < TARE_GATE_HOURS:
            remaining_h = TARE_GATE_HOURS - age_hours
            return {
                "ok": False,
                "status_code": 403,
                "message": (
                    f"Thiết bị cần online ≥{TARE_GATE_HOURS}h trước khi tare. "
                    f"Còn ~{remaining_h:.1f}h."
                ),
            }

        # Concurrency: refuse if a session for this (device, sensor) is already running
        async with self._lock:
            key = (device_id, sensor_type)
            if key in self._sessions:
                sess = self._sessions[key]
                remaining = max(0, int(sess.deadline - time.time()))
                return {
                    "ok": False,
                    "status_code": 409,
                    "message": "Đang tare sensor này rồi.",
                    "calibration_id": sess.calibration_id,
                    "seconds_remaining": remaining,
                }

            calibration_id = await db.fetchval(
                """INSERT INTO mq_calibrations
                    (device_id, sensor_type, status, started_at, load_resistor)
                   VALUES ($1, $2, 'collecting', NOW(), $3) RETURNING id""",
                device_id, sensor_type, load_resistor,
            )
            if not calibration_id:
                return {"ok": False, "message": "Failed to insert calibration row"}

            deadline = time.time() + TARE_WINDOW_SECONDS
            sess = SessionState(
                device_id=device_id,
                sensor_type=sensor_type,
                calibration_id=calibration_id,
                deadline=deadline,
                load_resistor=load_resistor,
                adc_max=DEFAULT_ADC_MAX,
            )
            sess.task = asyncio.create_task(self._tare_watcher(device_id, sensor_type, deadline))
            self._sessions[key] = sess

        # Invalidate R0 cache for this pair — old R0 no longer current
        self._r0_cache.pop((device_id, sensor_type), None)

        logger.info(
            "MQ tare started: device=%s sensor=%s calibration_id=%s deadline=+%ss",
            device_id, sensor_type, calibration_id, TARE_WINDOW_SECONDS,
        )
        return {
            "ok": True,
            "calibration_id": calibration_id,
            "started_at": now_utc.isoformat(),
            "deadline": deadline,
            "seconds_remaining": TARE_WINDOW_SECONDS,
        }

    async def cancel_tare(self, device_id: int, sensor_type: str) -> dict:
        """Cancel an in-flight tare session."""
        if sensor_type not in MQ_SENSOR_TYPES:
            return {"ok": False, "message": f"Unsupported sensor_type: {sensor_type}"}

        async with self._lock:
            key = (device_id, sensor_type)
            sess = self._sessions.pop(key, None)

        if not sess:
            return {"ok": False, "message": "Không có session tare nào đang chạy.", "status_code": 404}

        # Cancel the watcher task if still running
        if sess.task and not sess.task.done():
            sess.task.cancel()
            try:
                await sess.task
            except asyncio.CancelledError:
                pass

        # Always manually mark DB as cancelled (watcher can't find session because we already popped it)
        await self._mark_status(
            sess.calibration_id, "cancelled", sample_count=len(sess.samples),
            note="cancelled by user",
        )

        logger.info("MQ tare cancelled: device=%s sensor=%s cal_id=%s",
                    device_id, sensor_type, sess.calibration_id)

        return {"ok": True, "status": "cancelled", "calibration_id": sess.calibration_id}

    async def finalize_tare(self, device_id: int, sensor_type: str) -> dict:
        """Compute R0 from buffered samples and persist. Called by the watcher."""
        async with self._lock:
            sess = self._sessions.pop((device_id, sensor_type), None)

        if not sess:
            return {"ok": False, "message": "No active session"}

        samples = sess.samples
        sample_count = len(samples)

        if sample_count < MIN_SAMPLES:
            await self._mark_status(
                sess.calibration_id, "failed",
                sample_count=sample_count,
                note=f"insufficient samples ({sample_count} < {MIN_SAMPLES})",
            )
            logger.info(
                "MQ tare failed: device=%s sensor=%s samples=%s (need %s)",
                device_id, sensor_type, sample_count, MIN_SAMPLES,
            )
            return {
                "ok": True, "status": "failed", "calibration_id": sess.calibration_id,
                "sample_count": sample_count, "message": "insufficient samples",
            }

        load_resistor = sess.load_resistor
        adc_max = sess.adc_max

        # Compute Rs for each sample; guard against zero raw
        rs_values: list[float] = []
        for raw, _ts in samples:
            r_raw = max(int(raw), 1)
            rs = load_resistor * (adc_max - r_raw) / r_raw
            if rs > 0:
                rs_values.append(rs)

        if not rs_values:
            await self._mark_status(
                sess.calibration_id, "failed",
                sample_count=sample_count,
                note="all samples produced non-positive Rs",
            )
            return {"ok": True, "status": "failed", "calibration_id": sess.calibration_id}

        r0 = float(median(rs_values))
        stddev = float(pstdev(rs_values))

        await db.execute(
            """UPDATE mq_calibrations SET
                status = 'completed',
                completed_at = NOW(),
                sample_count = $1,
                r0_ohms = $2,
                r0_stddev = $3
               WHERE id = $4""",
            sample_count, r0, stddev, sess.calibration_id,
        )

        # Pre-populate R0 cache so the next on_sensor_reading uses it immediately
        self._r0_cache[(device_id, sensor_type)] = _CacheEntry(
            r0=r0,
            calibration_id=sess.calibration_id,
            load_resistor=load_resistor,
            adc_max=adc_max,
            expires_at=time.time() + R0_CACHE_TTL_SECONDS,
        )

        logger.info(
            "MQ tare completed: device=%s sensor=%s calibration_id=%s r0=%.1fΩ stddev=%.1f samples=%s",
            device_id, sensor_type, sess.calibration_id, r0, stddev, sample_count,
        )
        return {
            "ok": True, "status": "completed", "calibration_id": sess.calibration_id,
            "r0_ohms": r0, "r0_stddev": stddev, "sample_count": sample_count,
        }

    async def on_sensor_reading(
        self,
        device_id: int,
        sensor_type: str,
        raw_adc: int,
        ts: datetime,
    ) -> None:
        """Hook called from the MQTT listener for every mq135_raw / mq137_raw.

        - If a tare session is active for (device_id, sensor_type): append sample.
        - If a recent R0 is cached: compute Rs and ratio, INSERT into mq_ratio_samples.

        Errors are logged but never raised (must not block MQTT path).
        """
        try:
            # 1. Append to active session buffer (if any)
            key = (device_id, sensor_type)
            sess = self._sessions.get(key)
            if sess and sess.deadline > time.time():
                sess.samples.append((int(raw_adc), ts.timestamp()))
            # If past deadline, leave for the watcher to finalize.

            # 2. Insert ratio sample if R0 is cached
            entry = self._r0_cache.get(key)
            if not entry or entry.expires_at < time.time():
                # Refresh from DB if missing/expired
                row = await db.fetchrow(
                    """SELECT id, r0_ohms, load_resistor, adc_max
                         FROM mq_calibrations
                        WHERE device_id = $1
                          AND sensor_type = $2
                          AND status = 'completed'
                        ORDER BY completed_at DESC
                        LIMIT 1""",
                    device_id, sensor_type,
                )
                if not row or row["r0_ohms"] is None or row["r0_ohms"] <= 0:
                    return  # No R0 yet — nothing to do
                entry = _CacheEntry(
                    r0=float(row["r0_ohms"]),
                    calibration_id=row["id"],
                    load_resistor=float(row["load_resistor"] or DEFAULT_LOAD_RESISTOR),
                    adc_max=int(row["adc_max"] or DEFAULT_ADC_MAX),
                    expires_at=time.time() + R0_CACHE_TTL_SECONDS,
                )
                self._r0_cache[key] = entry

            r_raw = max(int(raw_adc), 1)
            rs = entry.load_resistor * (entry.adc_max - r_raw) / r_raw
            if rs <= 0:
                return
            ratio = rs / entry.r0

            await db.execute(
                """INSERT INTO mq_ratio_samples
                    (time, device_id, sensor_type, raw_adc, rs_ohms, r0_ohms, rs_r0_ratio, calibration_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                ts, device_id, sensor_type, r_raw, rs, entry.r0, ratio, entry.calibration_id,
            )
        except Exception:
            logger.exception(
                "mq_tare hook failed: device=%s sensor=%s (non-fatal)",
                device_id, sensor_type,
            )

    async def get_status(self, device_id: int) -> list[dict]:
        """Return one entry per MQ sensor type: in-progress flag + active R0."""
        out: list[dict] = []
        for stype in MQ_SENSOR_TYPES:
            key = (device_id, stype)
            sess = self._sessions.get(key)
            in_progress = bool(sess and sess.deadline > time.time())
            entry = self._r0_cache.get(key)

            active_r0 = None
            calibration_id = None
            completed_at = None
            if entry and entry.expires_at >= time.time():
                active_r0 = entry.r0
                calibration_id = entry.calibration_id

            # If no cached R0, pull the most recent completed row from DB
            if active_r0 is None:
                row = await db.fetchrow(
                    """SELECT id, r0_ohms, completed_at
                         FROM mq_calibrations
                        WHERE device_id = $1 AND sensor_type = $2
                          AND status = 'completed' AND r0_ohms IS NOT NULL
                        ORDER BY completed_at DESC LIMIT 1""",
                    device_id, stype,
                )
                if row:
                    active_r0 = float(row["r0_ohms"])
                    calibration_id = row["id"]
                    completed_at = row["completed_at"].isoformat() if row["completed_at"] else None

            item: dict = {
                "sensor_type": stype,
                "in_progress": in_progress,
                "active_r0_ohms": active_r0,
                "calibration_id": calibration_id,
            }
            if in_progress and sess:
                item["seconds_remaining"] = max(0, int(sess.deadline - time.time()))
                item["sample_count"] = len(sess.samples)
            if completed_at:
                item["completed_at"] = completed_at
            out.append(item)
        return out

    async def get_history(self, device_id: int, sensor_type: str, limit: int = 20) -> list[dict]:
        if sensor_type not in MQ_SENSOR_TYPES:
            return []
        rows = await db.fetch(
            """SELECT id, status, started_at, completed_at, sample_count,
                      r0_ohms, r0_stddev, load_resistor, note
                 FROM mq_calibrations
                WHERE device_id = $1 AND sensor_type = $2
                ORDER BY started_at DESC
                LIMIT $3""",
            device_id, sensor_type, limit,
        )
        result = []
        for r in rows:
            d = dict(r)
            for k in ("started_at", "completed_at"):
                if d.get(k) is not None:
                    d[k] = d[k].isoformat()
            result.append(d)
        return result

    async def get_ratio_series(
        self, device_id: int, sensor_type: str, hours: int = 24,
    ) -> list[dict]:
        """Return 5-min aggregates. Falls back to raw samples if hypertable
        / continuous aggregate is not available in the current DB."""
        if sensor_type not in MQ_SENSOR_TYPES:
            return []

        # Try the continuous aggregate first
        try:
            rows = await db.fetch(
                """SELECT bucket, ratio_avg, ratio_min, ratio_max, sample_count
                     FROM mq_ratio_5min
                    WHERE device_id = $1
                      AND sensor_type = $2
                      AND bucket > NOW() - ($3 || ' hours')::interval
                    ORDER BY bucket DESC""",
                device_id, sensor_type, str(hours),
            )
            return [
                {
                    "bucket": r["bucket"].isoformat() if r["bucket"] else None,
                    "ratio_avg": float(r["ratio_avg"]) if r["ratio_avg"] is not None else None,
                    "ratio_min": float(r["ratio_min"]) if r["ratio_min"] is not None else None,
                    "ratio_max": float(r["ratio_max"]) if r["ratio_max"] is not None else None,
                    "sample_count": r["sample_count"],
                }
                for r in rows
            ]
        except Exception:
            # Continuous aggregate might not exist — fall back to raw samples
            rows = await db.fetch(
                """SELECT time, rs_r0_ratio
                     FROM mq_ratio_samples
                    WHERE device_id = $1
                      AND sensor_type = $2
                      AND time > NOW() - ($3 || ' hours')::interval
                    ORDER BY time DESC
                    LIMIT 500""",
                device_id, sensor_type, str(hours),
            )
            return [
                {
                    "time": r["time"].isoformat() if r["time"] else None,
                    "ratio": float(r["rs_r0_ratio"]) if r["rs_r0_ratio"] is not None else None,
                }
                for r in rows
            ]

    async def reconcile_on_startup(self) -> None:
        """Mark any 'collecting' rows from a previous server lifetime as 'failed'."""
        if not db.pool:
            return
        result = await db.execute(
            """UPDATE mq_calibrations
                  SET status = 'failed',
                      completed_at = NOW(),
                      note = COALESCE(note, '') || ' [server restarted during collection]'
                WHERE status = 'collecting'"""
        )
        logger.info("MQ tare sessions reconciled: %s", result)

    # ── internal ───────────────────────────────────────

    async def _tare_watcher(self, device_id: int, sensor_type: str, deadline: float) -> None:
        """Sleep until deadline, then finalize. Catches CancelledError → mark cancelled."""
        try:
            remaining = max(0.0, deadline - time.time())
            await asyncio.sleep(remaining)
            await self.finalize_tare(device_id, sensor_type)
        except asyncio.CancelledError:
            # User cancelled — mark DB row as cancelled
            sess = self._sessions.get((device_id, sensor_type))
            cal_id = sess.calibration_id if sess else None
            # Remove from sessions
            async with self._lock:
                self._sessions.pop((device_id, sensor_type), None)
            if cal_id:
                await self._mark_status(
                    cal_id, "cancelled",
                    sample_count=len(sess.samples) if sess else 0,
                    note="cancelled by user",
                )
            logger.info("MQ tare cancelled: device=%s sensor=%s", device_id, sensor_type)
        except Exception:
            logger.exception("MQ tare watcher error")

    async def _mark_status(
        self, calibration_id: int, status: str,
        sample_count: int = 0, note: Optional[str] = None,
    ) -> None:
        if not db.pool:
            return
        try:
            await db.execute(
                """UPDATE mq_calibrations SET
                    status = $1,
                    completed_at = NOW(),
                    sample_count = $2,
                    note = COALESCE($3, note)
                   WHERE id = $4""",
                status, sample_count, note, calibration_id,
            )
        except Exception:
            logger.exception("Failed to mark calibration %s as %s", calibration_id, status)


# Module-level singleton
mq_tare_service = MqTareService()
