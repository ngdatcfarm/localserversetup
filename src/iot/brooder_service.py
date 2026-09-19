"""Brooder Service - Server-side PID for chicken brooder heating.

Architecture (Master-Edge with bumpless failsafe):
    ESP32 node                         Local Server (this module)
    ─────────                          ──────────────────────────
    2x SHT40 → min(T1,T2)  ──MQTT──►   Subscribe telemetry
                          ◄──MQTT──   Publish power (PID output)
                          ◄──MQTT──   Publish setpoint (cached in NVS on ESP32)

Day-age setpoint auto-calculated from cycle.brooding_start_date.
Manual override via brooder_nodes.manual_setpoint (Dashboard).

Failsafe: ESP32 switches to local PID if no MQTT cmd in 5s. This module
just needs to keep publishing — if it goes down, ESP32 holds last setpoint
from NVS.

Topics:
    Subscribe:  cfarm/brooder-+/telemetry  (QoS 0)
                cfarm/brooder-+/status     (QoS 1)
                cfarm/brooder-+/lwt        (QoS 1)
    Publish:    cfarm/brooder-{code}/power     (QoS 1, not retained)
                cfarm/brooder-{code}/setpoint  (QoS 1, retained)

Database:
    brooder_nodes (device_code PK, cycle_id FK→cycles.id, manual_setpoint,
                   enabled, created_at, updated_at)
    telemetry → reuses sensor_data hypertable (sensor_type='brooder_temp')
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Dict, List, Tuple

from simple_pid import PID

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)


# ============================================================
# SETPOINT TABLE (Vietnamese free-range tropical chickens)
# Day-age (1-indexed) → setpoint °C
# ============================================================

SETPOINT_TABLE: List[tuple] = [
    (1,   3,   33.5),
    (4,   7,   32.0),
    (8,   14,  29.5),
    (15,  21,  27.0),
    (22,  28,  25.0),
    (29, 999,  22.0),    # 29+ → 22°C (or heater OFF via manual override)
]

DEFAULT_SETPOINT_C    = 33.5
# Max setpoint the firmware will accept from the server. Bumped down from 38.0°C
# on 2026-09-18 — chicks cooked past 35°C start to show mortality spike in week
# 1. This constant is published to ESP32 in every setpoint payload as
# `max_safe`, and the firmware clamps incoming setpoints to this value.
# Mirrors firmware EMERGENCY_MAX_TEMP_C in firmware/esp32_brooder/esp32_brooder.ino
# (latch at 35.1°C, release at 34.6°C). The bimetal hardware thermostat at 38°C
# is the FINAL mechanical backup if both this software limit and the firmware
# emergency clamp fail.
MAX_SAFE_TEMPERATURE  = 34.6
TELEMETRY_STALE_S     = 120    # Mark node as stale after 2 minutes no data
SENSOR_TYPE_CODE      = "brooder_temp"   # entry in sensor_types table
SENSOR_TYPE_POWER_CODE = "brooder_power"  # actuator output stream (%)


def _seconds_since(dt: Optional[datetime]) -> Optional[int]:
    """Seconds between now (UTC) and ``dt``. None when ``dt`` is None.

    Used by ``BrooderNode.to_dict`` / ``Zone.to_dict`` to expose a
    humanizable ``last_seen_seconds`` for the UI (color-coded by freshness).
    Returned as int (not float) so JSON consumers don't carry trailing noise.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))


def _max_member_last_seen(zone) -> Optional[int]:
    """Smallest (i.e. freshest) ``last_seen_seconds`` across zone members.

    A zone with one fresh + one stale member should look fresh overall —
    "last activity" should mean "most recent activity". Returns None when
    no member has ever reported telemetry.
    """
    freshest: Optional[int] = None
    for n in zone.member_nodes.values():
        s = _seconds_since(n.last_telemetry_at)
        if s is None:
            continue
        if freshest is None or s < freshest:
            freshest = s
    return freshest


def build_setpoint_payload(setpoint: float, manual_override: bool,
                           fallback_delta_c: float) -> dict:
    """Single source for the MQTT setpoint payload published to ESP32.

    All 5 publish sites in this module + 1 in routes/brooder.py use this
    helper so that adding a new field (e.g. emergency_off, sensor_bias)
    requires editing one place, not six. Mirrors firmware topic_setpoint
    schema in esp32_brooder.ino. mac `now()` is captured here so the
    timestamp is consistent with the moment of publish.
    """
    return {
        "setpoint":         setpoint,
        "max_safe":         MAX_SAFE_TEMPERATURE,
        "manual_override":  manual_override,
        "fallback_delta_c": fallback_delta_c,
        "ts":               datetime.now(timezone.utc).isoformat(),
    }


def extract_device_code(topic: str) -> Optional[str]:
    """Parse device code from a `cfarm/brooder-{code}/...` MQTT topic.

    Used by both BrooderController (per-node legacy path) and ZoneController
    (multi-ESP zone path). Module-level helper because both controllers
    subscribe to the same topic prefix and parse identically — keeping this
    out of class scope avoids subtle drift if one class updated its
    predicate but the other didn't.
    """
    parts = topic.split('/')
    if len(parts) >= 3 and parts[0] == 'cfarm' and parts[1].startswith('brooder-'):
        return parts[1][len('brooder-'):]
    return None

# Zone-reference (reference sensor) tunables
ZONE_TEMP_PUBLISH_S   = 20     # Server → brooder zone_temp cadence
ZONE_TEMP_STALE_S     = 180    # Drop a sensor reading older than 3 min (was 5)
ZONE_TEMP_SENSOR_TYPE = "temperature"  # sensor_latest.sensor_type for env sensors

# PID power-publish heartbeat to ESP32. Firmware FAILSAFE_TIMEOUT_MS=5000
# (esp32_brooder.ino:116) → lastMqttCmdMs resets only on /power or /cmd topics
# (NOT on /setpoint). If server only publishes /power when input changes,
# ESP32 would stay in FAILSAFE for the full 5s timeout window. PID_HEARTBEAT_S=4
# (just under 5s) keeps ESP32 in NORMAL continuously when server is alive and
# telemetry is flowing — but doesn't drown MQTT (one publish per telemetry
# event since telemetry cadence is 5s). Both BrooderController._tick_pid and
# ZoneController._tick_zone_pid use this constant for the skip window.
PID_HEARTBEAT_S       = 4

# PID tuning — conservative (was Kp=30/Ki=0.5/Kd=50 which overshoots ±0.5°C).
# Matches the firmware local-PID so server and failsafe behave identically.
PID_KP = 12.0
PID_KI = 0.25
PID_KD = 25.0
PID_OUTPUT_LIMITS = (0, 100)
PID_SAMPLE_TIME_S  = 2.0

# Deadband — suppress PID micro-corrections within ±0.1°C of setpoint.
# Reduces heater on/off cycling once zone is stable.
DEADBAND_C = 0.1


# ============================================================
# ZONE-TEMP BLENDING (pure helper, no I/O)
# ============================================================
def blend_zone_temp(rows, now=None, stale_s: float = ZONE_TEMP_STALE_S):
    """Weighted-average zone temperature from reference sensors.

    `rows` is an iterable of dicts with keys:
        - temp:       float | None  (the latest reading)
        - weight:     float          (default 1.0)
        - last_seen:  datetime | None  (when the reading arrived)

    Returns (value, fresh_count) where value is the weighted average
    in °C, or None if no fresh readings contributed.

    Stale filter: any reading older than `stale_s` is dropped.
    Zero-weight filter: a sensor with weight=0 contributes nothing but
    does not crash the average.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    weighted_sum = 0.0
    weight_total = 0.0
    fresh_count = 0
    for r in rows:
        temp = r.get("temp")
        last_seen = r.get("last_seen")
        if temp is None or last_seen is None:
            continue
        age = (now - last_seen).total_seconds()
        if age > stale_s:
            continue
        w_raw = r.get("weight")
        # None / missing → 1.0; explicit 0.0 is preserved (operator disable).
        w = 1.0 if w_raw is None else float(w_raw)
        if w <= 0:
            continue
        weighted_sum += float(temp) * w
        weight_total += w
        fresh_count += 1
    if fresh_count == 0 or weight_total <= 0:
        return (None, 0)
    return (weighted_sum / weight_total, fresh_count)


# ============================================================
# PID TUNING (carbon fiber heater via phase-angle SSR)
# Conservative tuning per design v1.0.8: goal is ±0.5°C zone stability
# using zone-reference sensors (heater-zone SHT40 is NOT a control input).
# ============================================================


def calc_setpoint_for_day_age(day_age: int) -> float:
    """Return setpoint (°C) based on day_age (1-indexed)."""
    if day_age < 1:
        return SETPOINT_TABLE[0][2]
    for min_age, max_age, sp in SETPOINT_TABLE:
        if min_age <= day_age <= max_age:
            return sp
    return SETPOINT_TABLE[-1][2]


# ============================================================
# PROFILE CACHE (Phase 1 + 2)
# ============================================================
# A cached resolution of (cycle → profile → stage) computed once per periodic
# tick. Avoids N DB lookups inside current_setpoint() and lets the PID
# reference the resolved setpoint without hitting the DB on every telemetry
# arrival.
# ============================================================


@dataclass
class CachedProfile:
    profile_code:    str
    stage_id:        int
    setpoint_target: float
    heater_limit:    float
    night_boost:     float
    humidity_range:  Tuple[Optional[float], Optional[float]]


# ============================================================
# PER-NODE STATE
# ============================================================

@dataclass
class BrooderNode:
    device_code: str
    cycle_id: Optional[int] = None
    brooding_start_date: Optional[date] = None
    manual_setpoint: Optional[float] = None      # Dashboard override (None = auto)
    fallback_delta_c: float = 0.0                # Admin-tuned offset for Tier-2 fallback
    enabled: bool = True

    # Profile cache (Phase 1+2): filled by BrooderController._refresh_profile_caches.
    # When set, current_setpoint() returns profile_cache.setpoint_target (+night_boost)
    # instead of falling back to SETPOINT_TABLE day-age lookup.
    profile_cache: Optional["CachedProfile"]     = None
    profile_cache_cycle_date: Optional[date]     = None
    profile_cache_night_flag: Optional[bool]     = None

    # PID
    pid: Optional[PID] = None

    # Telemetry cache
    last_temp1: Optional[float] = None
    last_temp2: Optional[float] = None
    last_temp_min: Optional[float] = None
    last_hum_avg: Optional[float] = None
    last_telemetry_at: Optional[datetime] = None

    # Zone (reference sensor) cache
    last_zone_temp: Optional[float] = None       # weighted-avg of zone sensors
    last_zone_temp_at: Optional[datetime] = None # when we last computed it
    zone_sensors_count: int = 0                  # # configured reference sensors
    pid_source: Optional[str] = None             # "zone" | "local+delta" (echoed from ESP)

    # PID input cache — used to skip _tick_pid when the input hasn't actually
    # changed (telemetry arrives every 5s; zone_temp only changes every 20s).
    # Without this gate the simple_pid integral accumulates 4× the same error
    # per real measurement, causing windup + overshoot.
    last_pid_input: Optional[float] = None
    last_pid_input_at: Optional[datetime] = None

    # v1.3.0: zone_temp low-pass filter (α=0.3, τ≈2.5s with 5s tick).
    # Server-side smoothing for Tier-1 input. The zone_temp payload arrives
    # in 20s steps (large discrete jumps when sensor readings change), and
    # Kd=25 multiplied by a 20s step would cause D-term spikes. Filtering
    # the zone input before PID makes step changes gradual.
    zone_lpf: Optional[float] = None
    zone_lpf_init: bool = False

    # Sent state
    last_power_sent: int = 0
    last_setpoint_sent: Optional[float] = None
    last_setpoint_sent_at: Optional[datetime] = None

    # Status
    mode: str = "unknown"     # normal | failsafe | offline | stale
    last_error: Optional[str] = None

    def __post_init__(self):
        # v1.3.0: removed sample_time=PID_SAMPLE_TIME_S. simple_pid then uses
        # real elapsed dt between calls — critical because _tick_pid is
        # event-driven by telemetry (5s cadence) AND gated by zone_temp
        # updates (20s cadence). With fixed sample_time=2.0s, the D-term
        # would be calculated assuming dt=2s even when actual dt=20s →
        # 10x larger derivative kick on every zone_temp payload arrival.
        self.pid = PID(
            Kp=PID_KP, Ki=PID_KI, Kd=PID_KD,
            setpoint=self.current_setpoint(),
            output_limits=PID_OUTPUT_LIMITS,
        )
        self.pid.auto_mode = True

    # --------------------------------------------------------

    def current_setpoint(self) -> float:
        if self.manual_setpoint is not None:
            return self.manual_setpoint
        # Profile cache (Phase 1+2): if cycle has an active profile assignment
        # AND we're inside [start_date, end_date], use the resolved stage.
        if self.profile_cache is not None:
            sp = self.profile_cache.setpoint_target
            if self.profile_cache_night_flag:
                sp += self.profile_cache.night_boost
            return min(sp, MAX_SAFE_TEMPERATURE)
        # Legacy day-age fallback (kept for backward compat with cycles
        # that have no brooder_profile_id assigned).
        if self.brooding_start_date is None:
            return DEFAULT_SETPOINT_C
        days = (date.today() - self.brooding_start_date).days + 1
        return calc_setpoint_for_day_age(days)

    def current_day_age(self) -> Optional[int]:
        if self.brooding_start_date is None:
            return None
        return (date.today() - self.brooding_start_date).days + 1

    def update_pid_setpoint(self) -> None:
        sp = self.current_setpoint()
        if abs(self.pid.setpoint - sp) > 0.01:
            self.pid.setpoint = sp
            logger.info(f"Brooder {self.device_code}: setpoint → {sp:.2f}°C")

    def compute_power(self, current_temp: float) -> int:
        self.update_pid_setpoint()
        # Deadband: when within ±DEADBAND_C of setpoint, hold last output to
        # avoid relay-like on/off cycling. Integral still accumulates (so a
        # slow drift out of the band gets a non-zero response).
        err = self.pid.setpoint - current_temp
        if abs(err) < DEADBAND_C:
            return max(0, min(100, self.last_power_sent))
        out = self.pid(current_temp)
        return max(0, min(100, int(round(out))))

    def reset_pid_bumpless(self, last_output_pct: Optional[int] = None) -> None:
        """Reset PID for clean handoff (cycle change, manual clear, etc.)."""
        if last_output_pct is not None:
            # simple-pid: set_auto_mode(True, last_output) → resume from this output
            self.pid.set_auto_mode(True, last_output_pct)
        else:
            self.pid.reset()

    def is_online(self) -> bool:
        if self.last_telemetry_at is None:
            return False
        age = (datetime.now(timezone.utc) - self.last_telemetry_at).total_seconds()
        return age < 30

    def to_dict(self) -> dict:
        return {
            "device_code":        self.device_code,
            "cycle_id":           self.cycle_id,
            "day_age":            self.current_day_age(),
            "enabled":            self.enabled,
            "mode":               self.mode,
            "online":             self.is_online(),
            "setpoint":           self.current_setpoint(),
            "manual_setpoint":    self.manual_setpoint,
            "fallback_delta_c":   self.fallback_delta_c,
            "last_temp1":         self.last_temp1,
            "last_temp2":         self.last_temp2,
            "last_temp_min":      self.last_temp_min,
            "last_hum_avg":       self.last_hum_avg,
            "last_telemetry_at":  self.last_telemetry_at.isoformat() if self.last_telemetry_at else None,
            "last_power_sent":    self.last_power_sent,
            "last_setpoint_sent": self.last_setpoint_sent,
            "last_setpoint_sent_at": (
                self.last_setpoint_sent_at.isoformat()
                if self.last_setpoint_sent_at else None
            ),
            "last_zone_temp":       self.last_zone_temp,
            "last_zone_temp_at":    (
                self.last_zone_temp_at.isoformat()
                if self.last_zone_temp_at else None
            ),
            "zone_sensors_count":   self.zone_sensors_count,
            "pid_source":           self.pid_source,
            "last_error":         self.last_error,
            # UI-friendly: seconds since last telemetry (None if never).
            # Pair with `last_telemetry_at` so clients can format relative time.
            "last_seen_seconds":    _seconds_since(self.last_telemetry_at),
        }


# ============================================================
# CONTROLLER (singleton)
# ============================================================

class BrooderController:
    """Manages all brooder nodes. One process-wide singleton."""

    def __init__(self):
        self.nodes: Dict[str, BrooderNode] = {}
        self._running = False
        self._periodic_task: Optional[asyncio.Task] = None
        # Profile cache dirty flag — flipped by invalidate_profile_cache() or
        # by _reload_config when a node's cycle_id changes. Forces a refresh
        # on the next periodic tick.
        self._profile_cache_dirty: bool = False

    # ─── lifecycle ─────────────────────────────────────────

    async def start(self) -> None:
        """Load config, subscribe MQTT, start periodic task."""
        if self._running:
            return
        self._running = True
        await self._load_nodes()
        self._subscribe_mqtt()
        self._periodic_task = asyncio.create_task(self._periodic_loop())
        self._zone_task = asyncio.create_task(self._zone_temp_loop())
        # v1.3.0: keepalive watchdog — publishes current power every 6s
        # independent of telemetry. Keeps ESP in NORMAL when telemetry is
        # jittery but server is alive. Without this, server→ESP timeout
        # could trip from a single delayed telemetry packet.
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info(f"BrooderController started: {len(self.nodes)} nodes loaded")

    async def stop(self) -> None:
        self._running = False
        for t in (self._periodic_task,
                 getattr(self, "_zone_task", None),
                 getattr(self, "_keepalive_task", None)):
            if t:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("BrooderController stopped")

    async def _zone_temp_loop(self) -> None:
        """Independent 20s cadence for zone_temp publishing.

        Kept separate from the 60s _periodic_loop so we don't pay the
        config-reload cost 3× per minute.
        """
        while self._running:
            try:
                await asyncio.sleep(ZONE_TEMP_PUBLISH_S)
                await self._publish_zone_temps()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Brooder zone_temp loop error: {e}", exc_info=True)

    # ─── keepalive watchdog (v1.3.0) ────────────────────────
    #
    # Publishes a `power` message every 6s with the LAST power value the
    # server commanded — no PID recompute, no telemetry needed. This keeps
    # ESP in MODE_NORMAL across telemetry gaps/jitter even when no fresh
    # measurement has arrived. Cadence is 6s, just under the firmware
    # FAILSAFE_TIMEOUT_MS=8000 (was 5000; bumped to 8000 in v1.3.0), so
    # one missed keepalive window still has 2s of margin before failsafe.

    KEEPALIVE_INTERVAL_S = 6

    async def _keepalive_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.KEEPALIVE_INTERVAL_S)
                await self._publish_keepalive_power()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Brooder keepalive loop error: {e}", exc_info=True)

    async def _publish_keepalive_power(self) -> None:
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            # Skip if we never sent a power value yet (no PID has run).
            # First PID run is gated on telemetry arrival.
            if node.last_power_sent is None:
                continue
            topic = f"cfarm/brooder-{code}/power"
            try:
                mqtt_client.publish(topic, {
                    "power":    node.last_power_sent,
                    "setpoint": round(node.pid.setpoint, 2),
                    "ts":       datetime.now(timezone.utc).isoformat(),
                    "keepalive": True,
                }, qos=1)
            except Exception as e:
                logger.debug(f"Brooder {code}: keepalive publish failed: {e}")

    # ─── zone-reference (reference sensors) ────────────────
    #
    # Each brooder pulls its zone temperature from N ESP-sensor devices in the
    # same barn. Server blends their latest temperature readings (weighted avg)
    # and publishes the result to cfarm/brooder-{code}/zone_temp every 20s.
    # ESP uses the zone reading as the sole PID input in Tier 1 — NO blend
    # with its own SHT40 in that tier. Tier 2 falls back to filtered local
    # SHT40 minus an admin-tuned delta when zone_temp is stale (>3 min).
    # Local-only mode disables the heater entirely if even the SHT40 fails.

    async def _publish_zone_temps(self) -> None:
        """Run once per periodic tick: for each brooder with reference
        sensors attached, compute the weighted-avg zone temperature from
        sensor_latest and publish via MQTT.

        Reads from sensor_latest (snapshot, fast) — NOT sensor_data
        (hypertable). Joins devices for current barn context, but barn
        filtering is already enforced by what the admin attached.
        """
        now = datetime.now(timezone.utc)
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            try:
                rows = await db.fetch(
                    """
                    SELECT
                        bzs.sensor_device_code,
                        bzs.weight,
                        sl.value      AS temp,
                        sl.time       AS last_seen,
                        d.barn_id     AS sensor_barn_id,
                        d.name        AS sensor_name
                    FROM brooder_zone_sensors bzs
                    JOIN devices d
                         ON d.device_code = bzs.sensor_device_code
                    LEFT JOIN sensor_latest sl
                         ON sl.device_id = d.id
                        AND sl.sensor_type = $2
                    WHERE bzs.brooder_device_code = $1
                    ORDER BY bzs.id
                    """,
                    code, ZONE_TEMP_SENSOR_TYPE,
                )
            except Exception as e:
                logger.debug(f"Brooder {code}: zone-sensor query failed: {e}")
                continue

            node.zone_sensors_count = len(rows)
            if not rows:
                # No sensors configured → publish zero source count so ESP
                # can clear its stale zone_temp cache.
                node.last_zone_temp = None
                node.last_zone_temp_at = now
                self._send_zone_temp(code, None, 0)
                continue

            # Filter to fresh readings (≤ ZONE_TEMP_STALE_S old)
            weighted_sum = 0.0
            weight_total = 0.0
            fresh_count = 0
            for r in rows:
                if r["temp"] is None:
                    continue
                if r["last_seen"] is None:
                    continue
                age = (now - r["last_seen"]).total_seconds()
                if age > ZONE_TEMP_STALE_S:
                    continue
                w = float(r["weight"] or 1.0)
                weighted_sum += float(r["temp"]) * w
                weight_total += w
                fresh_count += 1

            if fresh_count == 0 or weight_total <= 0:
                # All sensors stale → don't override ESP's stale cache;
                # publish an explicit "no_fresh" sentinel so ESP knows.
                node.last_zone_temp = None
                node.last_zone_temp_at = now
                self._send_zone_temp(code, None, 0)
                continue

            zone_temp = weighted_sum / weight_total
            node.last_zone_temp = zone_temp
            node.last_zone_temp_at = now
            self._send_zone_temp(code, zone_temp, fresh_count)

    def _send_zone_temp(self, code: str,
                        value: Optional[float], source_count: int) -> None:
        """Publish zone_temp payload to MQTT.

        value=None with source_count=0  → ESP should drop its cache and
                                          fall back to local-only.
        value=N    → use 50/50 blend.
        """
        topic = f"cfarm/brooder-{code}/zone_temp"
        payload = {
            "temp":         value,            # None if no fresh sources
            "source_count": source_count,
            "stale_max_s":  ZONE_TEMP_STALE_S,
            "ts":           datetime.now(timezone.utc).isoformat(),
        }
        try:
            mqtt_client.publish(topic, payload, qos=0, retain=False)
        except Exception as e:
            logger.debug(f"Brooder {code}: zone_temp publish failed: {e}")

    # ─── DB loading ────────────────────────────────────────

    async def _load_nodes(self) -> None:
        """Load all enabled brooder_nodes from DB; join with cycles for start_date."""
        try:
            rows = await db.fetch("""
                SELECT device_code, cycle_id, manual_setpoint, fallback_delta_c, enabled
                FROM brooder_nodes
            """)
        except Exception as e:
            logger.error(f"Brooder: failed to load nodes (table missing?): {e}")
            return

        loaded_codes = set()
        for r in rows:
            code = r['device_code']
            loaded_codes.add(code)
            brooding_start = None
            if r['cycle_id']:
                try:
                    cycle = await db.fetchrow(
                        "SELECT start_date FROM cycles WHERE id = $1", r['cycle_id']
                    )
                    if cycle and cycle['start_date']:
                        brooding_start = cycle['start_date']
                except Exception as e:
                    logger.warning(f"Brooder: cycle lookup failed for {code}: {e}")

            if code in self.nodes:
                # Update existing in-place to preserve PID state
                node = self.nodes[code]
                node.cycle_id = r['cycle_id']
                node.brooding_start_date = brooding_start
                if node.manual_setpoint != r['manual_setpoint']:
                    node.manual_setpoint = r['manual_setpoint']
                    node.update_pid_setpoint()
                node.fallback_delta_c = float(r['fallback_delta_c'] or 0.0)
                node.enabled = r['enabled']
            else:
                self.nodes[code] = BrooderNode(
                    device_code=code,
                    cycle_id=r['cycle_id'],
                    brooding_start_date=brooding_start,
                    manual_setpoint=r['manual_setpoint'],
                    fallback_delta_c=float(r['fallback_delta_c'] or 0.0),
                    enabled=r['enabled'],
                )

    # ─── MQTT subscription ─────────────────────────────────

    def _subscribe_mqtt(self) -> None:
        """Subscribe to brooder telemetry/status/lwt topics.

        NOTE: MQTT spec [MQTT-4.7.3-1] requires '+' to be the ENTIRE
        level — patterns like 'cfarm/brooder-+/telemetry' are INVALID
        and will raise ValueError in paho-mqtt on reconnect, killing
        the MQTT listener thread. Use 'cfarm/+/telemetry' and filter
        by topic prefix in the handler.
        """
        mqtt_client.subscribe("cfarm/+/telemetry", self._on_telemetry)
        mqtt_client.subscribe("cfarm/+/status",    self._on_status)
        mqtt_client.subscribe("cfarm/+/lwt",       self._on_lwt)

    def _on_telemetry(self, topic: str, payload) -> None:
        """Handle telemetry from ESP32 (payload is already-parsed dict)."""
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.warning(f"Brooder telemetry JSON decode error on {topic}: {e}")
                return
        if not isinstance(payload, dict):
            return

        device_code = extract_device_code(topic)
        if not device_code:
            return

        # Auto-register unknown nodes (zero-config onboarding)
        if device_code not in self.nodes:
            logger.info(f"Brooder: auto-registering new node {device_code}")
            self.nodes[device_code] = BrooderNode(device_code=device_code)

        node = self.nodes[device_code]
        node.last_temp1    = payload.get('temp1')
        node.last_temp2    = payload.get('temp2')
        node.last_temp_min = payload.get('temp_min')
        node.last_hum_avg  = payload.get('hum_avg')
        # Zone (reference sensor) contribution reported by ESP for diagnostics.
        # Firmware populates these when it has a fresh zone_temp payload.
        zt = payload.get('zone_temp')
        if zt is not None and zt != -999.0:
            node.last_zone_temp = float(zt)
        else:
            node.last_zone_temp = None
        # ESP also reports which tier is feeding PID + the cached delta
        node.pid_source    = payload.get('pid_source')
        # (fallback_delta_c is server-published; ESP just echoes it back)
        node.last_telemetry_at = datetime.now(timezone.utc)
        node.mode          = payload.get('mode', node.mode)

        # Run PID if enabled and we have temperature
        if node.enabled and node.last_temp_min is not None:
            asyncio.create_task(self._tick_pid(node))

    def _on_status(self, topic: str, payload) -> None:
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception:
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if device_code and device_code in self.nodes:
            new_mode = payload.get('status', self.nodes[device_code].mode)
            self.nodes[device_code].mode = new_mode

    def _on_lwt(self, topic: str, payload) -> None:
        device_code = extract_device_code(topic)
        if device_code and device_code in self.nodes:
            self.nodes[device_code].mode = 'offline'
            logger.warning(f"Brooder {device_code}: LWT received → offline")

    # ─── PID tick + telemetry persistence ──────────────────

    async def _tick_pid(self, node: BrooderNode) -> None:
        """Compute new power, publish MQTT cmd, persist telemetry.

        Fix #5: PID input is NOT the heater-zone SHT40 reading — that's biased
        +1.5 to +3.0°C relative to the chick zone. We use the same Tier-1/Tier-2
        logic as the firmware:
          Tier 1: last_zone_temp alone (server-computed weighted avg of reference
                  sensors; firmware uses it directly without blending with local)
          Tier 2: last_temp_min − fallback_delta_c  (admin-tuned heater/zone bias)
        Plus: skip the tick when the input hasn't changed since the last PID
        update — otherwise we'd call compute_power() 4× per zone_temp update
        (telemetry cadence 5s, zone_temp cadence 20s) and the integral would
        accumulate 4× the stale error per real measurement.
        """
        try:
            now = datetime.now(timezone.utc)
            # Tier 1: zone reference sensors alone (no 50/50 blend) when fresh
            zone_age_s = None
            if node.last_zone_temp is not None and node.last_zone_temp_at is not None:
                zone_age_s = (now - node.last_zone_temp_at).total_seconds()
            zone_fresh = (zone_age_s is not None
                          and zone_age_s <= ZONE_TEMP_STALE_S)

            if zone_fresh and node.last_zone_temp is not None:
                # v1.3.0: low-pass filter the zone input. zone_temp arrives in
                # 20s steps (large discrete jumps when sensor readings change),
                # and Kd=25 multiplied by a 20s step would cause D-term spikes.
                # α=0.3 with 5s tick → τ≈2.5s, smooths step into a gradual ramp.
                raw_zone = node.last_zone_temp
                if not node.zone_lpf_init:
                    node.zone_lpf = raw_zone
                    node.zone_lpf_init = True
                else:
                    node.zone_lpf = 0.3 * raw_zone + 0.7 * node.zone_lpf
                temp = node.zone_lpf
                pid_source = "zone"
            else:
                # Tier 2: estimate chick-zone by subtracting the admin-tuned
                # heater/zone bias from the local SHT40 reading.
                # (delta>0 → heater is hotter than zone; we want zone estimate.)
                if node.last_temp_min is None:
                    return
                temp = node.last_temp_min - node.fallback_delta_c
                pid_source = "local+delta"
                # Reset LPF state on tier transition — Tier-1 and Tier-2 use
                # different inputs, so accumulated LPF state is meaningless.
                node.zone_lpf_init = False

            # Skip when input hasn't changed AND recent enough — avoids integral
            # windup on repeated telemetry that carries the same zone_temp.
            # Window is PID_HEARTBEAT_S (4s) — just under firmware FAILSAFE_TIMEOUT
            # (5s) so the power topic still acts as a server-alive heartbeat even
            # when temp is dead-stable. Without this, ESP32 enters failsafe every
            # 20s (the old ZONE_TEMP_PUBLISH_S window).
            if (node.last_pid_input == temp
                    and node.last_pid_input_at is not None
                    and (now - node.last_pid_input_at).total_seconds() < PID_HEARTBEAT_S):
                return

            power_pct = node.compute_power(temp)
            node.last_pid_input = temp
            node.last_pid_input_at = now
            node.pid_source = pid_source
            sp = node.pid.setpoint

            topic = f"cfarm/brooder-{node.device_code}/power"
            ok = mqtt_client.publish(topic, {
                "power":    power_pct,
                "setpoint": round(sp, 2),
                "ts":       datetime.now(timezone.utc).isoformat(),
            }, qos=1)
            node.last_power_sent = power_pct

            # Persist to sensor_data hypertable — two streams for the same tick:
            #   1. brooder_temp  → °C   (PID input, drives chart)
            #   2. brooder_power → %    (actuator output, drives correlation chart)
            # Both share the same metadata blob so a future JOIN can recover
            # the full (temp1, temp2, setpoint, mode) tuple per sample.
            metadata = json.dumps({
                "hum_avg":   node.last_hum_avg,
                "temp1":     node.last_temp1,
                "temp2":     node.last_temp2,
                "setpoint":  sp,
                "mode":      node.mode,
                "day_age":   node.current_day_age(),
            })
            try:
                async with db.transaction() as conn:
                    # Temperature row
                    await conn.execute(
                        """
                        INSERT INTO sensor_data
                            (device_id, sensor_type_id, value, recorded_at, metadata)
                        SELECT d.id, st.id, $2, NOW(), $3::jsonb
                        FROM devices d, sensor_types st
                        WHERE d.device_code = $1 AND st.code = $4
                        LIMIT 1
                        """,
                        node.device_code, temp, metadata, SENSOR_TYPE_CODE,
                    )
                    # Power row (same tick, same metadata)
                    await conn.execute(
                        """
                        INSERT INTO sensor_data
                            (device_id, sensor_type_id, value, recorded_at, metadata)
                        SELECT d.id, st.id, $2, NOW(), $3::jsonb
                        FROM devices d, sensor_types st
                        WHERE d.device_code = $1 AND st.code = $4
                        LIMIT 1
                        """,
                        node.device_code, float(power_pct), metadata,
                        SENSOR_TYPE_POWER_CODE,
                    )
            except Exception as e:
                # Telemetry persistence is best-effort; don't break control loop
                logger.debug(f"Brooder {node.device_code}: persist skipped: {e}")

            if not ok:
                logger.debug(f"Brooder {node.device_code}: MQTT publish queued/offline")

        except Exception as e:
            logger.error(f"Brooder {node.device_code} PID tick error: {e}")
            node.last_error = str(e)

    # ─── periodic tasks ────────────────────────────────────

    async def _periodic_loop(self) -> None:
        """Run every 60s: reload config, publish setpoint changes, mark stale."""
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._reload_config()
                # Profile cache (Phase 1+2): sweep expired test assignments
                # BEFORE refreshing the cache so the sweeper's cleared rows
                # are visible to the resolver. Both run before publish so
                # the next setpoint payload reflects the fresh profile.
                await self._sweep_test_assignments()
                await self._refresh_profile_caches()
                await self._publish_setpoint_changes()
                await self._mark_stale_nodes()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Brooder periodic loop error: {e}", exc_info=True)

    async def _reload_config(self) -> None:
        """Pick up DB changes (manual override, cycle reassignment, new node)."""
        try:
            rows = await db.fetch("""
                SELECT device_code, cycle_id, manual_setpoint, fallback_delta_c, enabled
                FROM brooder_nodes
            """)
        except Exception as e:
            logger.error(f"Brooder: reload config failed: {e}")
            return

        for r in rows:
            code = r['device_code']
            if code not in self.nodes:
                # New node — load with cycle lookup
                brooding_start = None
                if r['cycle_id']:
                    cycle = await db.fetchrow(
                        "SELECT start_date FROM cycles WHERE id = $1", r['cycle_id']
                    )
                    if cycle and cycle['start_date']:
                        brooding_start = cycle['start_date']
                self.nodes[code] = BrooderNode(
                    device_code=code,
                    cycle_id=r['cycle_id'],
                    brooding_start_date=brooding_start,
                    manual_setpoint=r['manual_setpoint'],
                    fallback_delta_c=float(r['fallback_delta_c'] or 0.0),
                    enabled=r['enabled'],
                )
                logger.info(f"Brooder: picked up new node {code}")
            else:
                node = self.nodes[code]
                if node.manual_setpoint != r['manual_setpoint']:
                    logger.info(f"Brooder {code}: manual_setpoint "
                                f"{node.manual_setpoint} → {r['manual_setpoint']}")
                    node.manual_setpoint = r['manual_setpoint']
                    node.update_pid_setpoint()
                new_delta = float(r['fallback_delta_c'] or 0.0)
                if abs(node.fallback_delta_c - new_delta) > 0.01:
                    logger.info(f"Brooder {code}: fallback_delta_c "
                                f"{node.fallback_delta_c} → {new_delta}")
                    node.fallback_delta_c = new_delta
                if node.cycle_id != r['cycle_id']:
                    node.cycle_id = r['cycle_id']
                    if r['cycle_id']:
                        cycle = await db.fetchrow(
                            "SELECT start_date FROM cycles WHERE id = $1",
                            r['cycle_id'],
                        )
                        node.brooding_start_date = (
                            cycle['start_date'] if cycle and cycle['start_date']
                            else None
                        )
                    else:
                        node.brooding_start_date = None
                    # Profile cache depends on cycle — flip dirty so the next
                    # periodic tick re-resolves.
                    self._profile_cache_dirty = True
                    node.update_pid_setpoint()
                node.enabled = r['enabled']

    async def _publish_setpoint_changes(self) -> None:
        """Publish setpoint when day-age crosses a band boundary (1× per day)."""
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            new_sp = node.current_setpoint()
            if (node.last_setpoint_sent is None
                    or abs(new_sp - node.last_setpoint_sent) > 0.05):
                topic = f"cfarm/brooder-{code}/setpoint"
                payload = build_setpoint_payload(
                    new_sp,
                    manual_override=node.manual_setpoint is not None,
                    fallback_delta_c=node.fallback_delta_c,
                )
                # Phase 1+2: append profile_code (firmware ignores unknown
                # keys; this is an extension for the dashboard / audit log).
                if node.profile_cache is not None:
                    payload["profile_code"] = node.profile_cache.profile_code
                mqtt_client.publish(topic, payload, qos=1, retain=True)
                node.last_setpoint_sent = new_sp
                node.last_setpoint_sent_at = datetime.now(timezone.utc)
                logger.info(f"Brooder {code}: published setpoint {new_sp:.1f}°C "
                            f"(day_age={node.current_day_age()}, "
                            f"fallback_delta={node.fallback_delta_c:+.1f}°C, "
                            f"profile={node.profile_cache.profile_code if node.profile_cache else 'legacy'})")

    async def _mark_stale_nodes(self) -> None:
        now = datetime.now(timezone.utc)
        for code, node in self.nodes.items():
            if node.last_telemetry_at is None:
                continue
            age = (now - node.last_telemetry_at).total_seconds()
            if age > TELEMETRY_STALE_S and node.mode not in ('offline', 'stale'):
                node.mode = 'stale'
                logger.warning(f"Brooder {code}: stale telemetry "
                               f"({age:.0f}s > {TELEMETRY_STALE_S}s)")

    # ─── profile cache (Phase 1+2) ────────────────────────────
    #
    # Profile state is computed once per periodic tick per node, NOT in the
    # hot path of _tick_pid. The PID tick reads node.profile_cache (a simple
    # attribute access). A flag + per-node date/night-bool gate means we
    # only re-query DB when the day rolled over, the night/day window
    # flipped, or _profile_cache_dirty was set by an external mutation
    # (profile CRUD, test apply/clear, cycle_id change).

    def invalidate_profile_cache(self) -> None:
        """Flip the dirty flag so the next periodic tick re-resolves
        every node's profile cache. Called by routes/brooder_profiles.py
        after mutations and by _reload_config when cycle_id changes.
        """
        self._profile_cache_dirty = True

    async def _resolve_profile_setpoint_async(self, node: BrooderNode) -> None:
        """One-shot DB lookup → fills node.profile_cache (or leaves None).

        Honors:
          - cycle.status = 'active'
          - today ∈ [cycle.start_date, cycle.end_date]
          - profile.is_active = TRUE
          - unexpired test assignment override (takes precedence over
            cycle.brooder_profile_id when present)
          - feature flag `brooder.profiles_enabled` in cameras.yaml
            (when false, leaves cache as None — legacy fallback always wins)

        Safe to call concurrently; sets/reads on node.profile_cache are
        non-atomic but only this method writes, and _refresh_profile_caches
        is single-threaded per tick.
        """
        # Feature flag: skip if disabled in config
        try:
            from src.services.storage.config_service import config_service
            cfg = config_service.load_config() or {}
            if not (cfg.get("brooder", {}) or {}).get("profiles_enabled", True):
                node.profile_cache = None
                return
        except Exception:
            # If config can't be read, default ON (fail-open)
            pass

        if node.cycle_id is None:
            node.profile_cache = None
            return

        today = date.today()
        try:
            from src.utils.timezone import now_hcm
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            night_now = False

        try:
            row = await db.fetchrow(
                """
                SELECT cp.id           AS cycle_id,
                       cp.status       AS cycle_status,
                       cp.start_date   AS cycle_start,
                       cp.expected_end_date AS cycle_end,
                       cp.brooder_profile_id AS cycle_pid,
                       p.code          AS cycle_pcode,
                       p.is_active     AS cycle_pactive,
                       tst.profile_id  AS test_pid,
                       tst.expires_at  AS test_expires_at
                FROM cycles cp
                LEFT JOIN brooder_profiles p
                       ON p.id = cp.brooder_profile_id
                LEFT JOIN brooder_profile_test_assignments tst
                       ON tst.cycle_id = cp.id
                      AND tst.cleared_at IS NULL
                WHERE cp.id = $1
                """,
                node.cycle_id,
            )
        except Exception as e:
            logger.debug(f"Brooder {node.device_code}: profile resolve query failed: {e}")
            node.profile_cache = None
            return

        if not row or not row["cycle_start"]:
            node.profile_cache = None
            return

        # Test assignment overrides permanent profile when active + unexpired
        eff_pid = None
        eff_pcode = None
        if (row["test_pid"]
                and row["test_expires_at"]
                and row["test_expires_at"] > datetime.now(timezone.utc)):
            eff_pid = row["test_pid"]
            # Need to look up the test profile's code
            try:
                tp = await db.fetchrow(
                    "SELECT code, is_active FROM brooder_profiles WHERE id = $1",
                    row["test_pid"],
                )
                if tp and tp["is_active"]:
                    eff_pcode = tp["code"]
                else:
                    eff_pid = None  # test profile inactive — fall through
            except Exception as e:
                logger.debug(f"Brooder {node.device_code}: test profile lookup failed: {e}")
                eff_pid = None
        if eff_pid is None:
            eff_pid = row["cycle_pid"]
            eff_pcode = row["cycle_pcode"]
            if eff_pcode is None or not row["cycle_pactive"]:
                node.profile_cache = None
                return

        # Cycle must be active
        if row["cycle_status"] != "active":
            node.profile_cache = None
            return

        # Today must be inside [start, end]
        end_date = row["cycle_end"] or date.max
        if not (row["cycle_start"] <= today <= end_date):
            node.profile_cache = None
            return

        day_age = (today - row["cycle_start"]).days + 1
        try:
            stage = await db.fetchrow(
                """
                SELECT id, setpoint_target, heater_zone_limit,
                       night_boost_offset, humidity_min_pct, humidity_max_pct
                FROM brooder_profile_schedules
                WHERE profile_id = $1
                  AND day_range_start <= $2
                  AND day_range_end   >= $2
                LIMIT 1
                """,
                eff_pid, day_age,
            )
        except Exception as e:
            logger.debug(f"Brooder {node.device_code}: stage resolve query failed: {e}")
            node.profile_cache = None
            return

        if not stage:
            node.profile_cache = None
            return

        node.profile_cache = CachedProfile(
            profile_code=eff_pcode or "(unknown)",
            stage_id=int(stage["id"]),
            setpoint_target=float(stage["setpoint_target"]),
            heater_limit=float(stage["heater_zone_limit"]),
            night_boost=float(stage["night_boost_offset"] or 0.0),
            humidity_range=(stage["humidity_min_pct"], stage["humidity_max_pct"]),
        )
        node.profile_cache_cycle_date = today
        node.profile_cache_night_flag = night_now

    async def _refresh_profile_caches(self) -> None:
        """Walk every node; resolve only the stale ones. Cheap when nothing
        changed: a single DATE / bool compare per node."""
        try:
            from src.utils.timezone import now_hcm
            today = date.today()
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            today = date.today()
            night_now = False

        for node in self.nodes.values():
            if not self._profile_cache_dirty \
                    and node.profile_cache_cycle_date == today \
                    and node.profile_cache_night_flag == night_now \
                    and node.profile_cache is not None:
                continue
            try:
                await self._resolve_profile_setpoint_async(node)
            except Exception as e:
                logger.warning(f"Brooder {node.device_code}: profile refresh failed: {e}")
        self._profile_cache_dirty = False

    async def _sweep_test_assignments(self) -> None:
        """Auto-clear test assignments whose expires_at ≤ NOW(). Called once
        per periodic tick (before _refresh_profile_caches so the sweeper's
        rows are visible to the resolver)."""
        try:
            rows = await db.fetch(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'auto_expired'
                WHERE cleared_at IS NULL AND expires_at <= NOW()
                RETURNING id, cycle_id, profile_id
                """
            )
        except Exception as e:
            logger.debug(f"Brooder test sweeper query failed: {e}")
            return
        if rows:
            self._profile_cache_dirty = True
            logger.info(
                f"Brooder test sweeper: auto-expired {len(rows)} assignment(s)"
            )

    async def apply_test_profile(self, cycle_id: int, profile_id: int,
                                 hours: int, note: Optional[str] = None) -> dict:
        """Public entrypoint used by routes/brooder_profiles.apply_test.
        Marks any existing active test on the cycle as 'replaced', inserts
        a fresh one, and flips the dirty flag.

        Returns the new row as a dict. Raises ValueError on bad inputs
        (cycle or profile missing) — caller maps to HTTPException.
        """
        cyc = await db.fetchrow("SELECT id FROM cycles WHERE id = $1", cycle_id)
        if not cyc:
            raise ValueError(f"Cycle {cycle_id} not found")
        prof = await db.fetchrow(
            "SELECT id, code FROM brooder_profiles WHERE id = $1 AND is_active = TRUE",
            profile_id,
        )
        if not prof:
            raise ValueError(f"Profile {profile_id} not found or inactive")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        async with db.transaction() as tx:
            await tx.execute(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'replaced'
                WHERE cycle_id = $1 AND cleared_at IS NULL
                """,
                cycle_id,
            )
            row = await tx.fetchrow(
                """
                INSERT INTO brooder_profile_test_assignments
                    (cycle_id, profile_id, expires_at, note)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                cycle_id, profile_id, expires_at, note,
            )
        self._profile_cache_dirty = True
        out = dict(row)
        out["profile_code"] = prof["code"]
        return out

    async def clear_test_profile(self, cycle_id: int) -> bool:
        """Manual clear. Returns True if any row was cleared."""
        row = await db.fetchrow(
            """
            UPDATE brooder_profile_test_assignments
            SET cleared_at = NOW(), cleared_reason = 'manual_clear'
            WHERE cycle_id = $1 AND cleared_at IS NULL
            RETURNING id
            """,
            cycle_id,
        )
        if row:
            self._profile_cache_dirty = True
            return True
        return False

    # ─── public API (for routes / dashboard) ───────────────

    async def set_manual_setpoint(self, device_code: str,
                                  setpoint: Optional[float]) -> dict:
        """Dashboard override. None = clear manual override (back to auto)."""
        if device_code not in self.nodes:
            # Ensure node exists in DB before override
            row = await db.fetchrow(
                "SELECT 1 FROM brooder_nodes WHERE device_code = $1", device_code
            )
            if not row:
                raise ValueError(f"Unknown brooder node: {device_code}")
            await self._load_nodes()

        node = self.nodes[device_code]
        node.manual_setpoint = setpoint
        node.update_pid_setpoint()

        # Persist
        await db.execute(
            "UPDATE brooder_nodes SET manual_setpoint = $1, "
            "updated_at = NOW() WHERE device_code = $2",
            setpoint, device_code,
        )

        # Publish immediately (retain so ESP32 gets it after restart)
        topic = f"cfarm/brooder-{device_code}/setpoint"
        payload = build_setpoint_payload(
            node.pid.setpoint,
            manual_override=setpoint is not None,
            fallback_delta_c=node.fallback_delta_c,
        )
        if node.profile_cache is not None:
            payload["profile_code"] = node.profile_cache.profile_code
        mqtt_client.publish(topic, payload, qos=1, retain=True)
        node.last_setpoint_sent = node.pid.setpoint
        node.last_setpoint_sent_at = datetime.now(timezone.utc)
        logger.info(f"Brooder {device_code}: manual override → "
                    f"{setpoint if setpoint is not None else 'auto'} "
                    f"(effective {node.pid.setpoint:.2f}°C)")
        return node.to_dict()

    async def register_node(self, device_code: str,
                            cycle_id: Optional[int] = None,
                            manual_setpoint: Optional[float] = None) -> dict:
        """Register or update a brooder node in DB and in-memory."""
        await db.execute(
            """
            INSERT INTO brooder_nodes (device_code, cycle_id, manual_setpoint, enabled)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (device_code) DO UPDATE
              SET cycle_id = EXCLUDED.cycle_id,
                  manual_setpoint = EXCLUDED.manual_setpoint,
                  enabled = TRUE,
                  updated_at = NOW()
            """,
            device_code, cycle_id, manual_setpoint,
        )
        await self._load_nodes()
        return self.nodes[device_code].to_dict()

    async def unregister_node(self, device_code: str) -> None:
        await db.execute(
            "UPDATE brooder_nodes SET enabled = FALSE, "
            "updated_at = NOW() WHERE device_code = $1",
            device_code,
        )
        if device_code in self.nodes:
            self.nodes[device_code].enabled = False

    def get_status(self, device_code: Optional[str] = None):
        if device_code:
            node = self.nodes.get(device_code)
            return node.to_dict() if node else None
        return [n.to_dict() for n in self.nodes.values()]


# ============================================================
# Module-level singleton
# ============================================================

brooder_controller = BrooderController()


# ============================================================
# ZONE MODEL (Phase B — Brooder Zone Refactor)
# ============================================================
#
# A Zone is a thermal control unit: 1 PID + N heaters (across N ESP32
# nodes, each ESP32 contributes 1-2 heaters via its 2 DAC channels)
# + M reference sensors. The zone is the new unit of control — ESP32
# brooder_nodes are now just dumb actuators (member devices) inside
# a zone, and they receive a per-channel power command from the server.
#
# Phase B runs ZoneController PARALLEL with BrooderController — if the
# zone path breaks, legacy per-zone still keeps the farm warm.
# ============================================================


@dataclass
class Heater:
    """1 ESP32 + 1 channel + max wattage. Server splits PID output across
    all enabled heaters in a zone by max-power weighting."""
    id: int
    zone_id: int
    device_code: str
    channel: int                    # 1 hoặc 2 (matches DAC1 / DAC2)
    label: Optional[str]
    max_power_w: float
    enabled: bool
    last_power_pct: int = 0         # cached from last MQTT publish
    last_published_at: Optional[datetime] = None


@dataclass
class Zone:
    """A thermal control unit — 1 PID, N heaters, M sensors."""
    id: int
    barn_id: Optional[int]
    name: str
    manual_setpoint: Optional[float] = None
    fallback_delta_c: float = 0.0
    enabled: bool = True
    max_total_w: Optional[float] = None

    # Profile cache (Phase 1+2) — mirrored from the first member node with
    # a cycle_id set (zones typically share one cycle). Mirrored so we can
    # publish setpoint per-zone (zone.current_setpoint() reads these) without
    # hitting the DB inside the PID tick.
    profile_cache: Optional["CachedProfile"]     = None
    profile_cache_cycle_date: Optional[date]     = None
    profile_cache_night_flag: Optional[bool]     = None

    # Filled by ZoneController._load_zones()
    pid: Optional[PID] = field(default=None, init=False)
    member_device_codes: List[str] = field(default_factory=list, init=False)
    member_nodes: Dict[str, "BrooderNode"] = field(default_factory=dict, init=False)
    heaters: Dict[int, Heater] = field(default_factory=dict, init=False)

    # Live overlay
    last_zone_temp: Optional[float] = None
    last_zone_temp_at: Optional[datetime] = None
    zone_sensors_count: int = 0
    pid_source: Optional[str] = None
    last_pid_input: Optional[float] = None
    last_pid_input_at: Optional[datetime] = None
    last_power_total_pct: int = 0
    last_setpoint_sent: Optional[float] = None
    last_setpoint_sent_at: Optional[datetime] = None
    mode: str = "unknown"           # normal | failsafe | offline | stale | startup

    def __post_init__(self):
        # v1.3.0: removed sample_time=PID_SAMPLE_TIME_S. simple_pid then uses
        # real elapsed dt between calls — critical because _tick_pid is
        # event-driven by telemetry (5s cadence) AND gated by zone_temp
        # updates (20s cadence). With fixed sample_time=2.0s, the D-term
        # would be calculated assuming dt=2s even when actual dt=20s →
        # 10x larger derivative kick on every zone_temp payload arrival.
        self.pid = PID(
            Kp=PID_KP, Ki=PID_KI, Kd=PID_KD,
            setpoint=self.current_setpoint(),
            output_limits=PID_OUTPUT_LIMITS,
        )
        self.pid.auto_mode = True

    # ─── setpoint logic (mirrors BrooderNode.current_setpoint) ───

    def current_setpoint(self) -> float:
        if self.manual_setpoint is not None:
            return self.manual_setpoint
        # Profile cache (Phase 1+2) — mirrors BrooderNode.current_setpoint
        if self.profile_cache is not None:
            sp = self.profile_cache.setpoint_target
            if self.profile_cache_night_flag:
                sp += self.profile_cache.night_boost
            return min(sp, MAX_SAFE_TEMPERATURE)
        # Earliest brooding_start_date across member cycles (a zone can
        # span multiple barns → multiple cycles). For now take any member
        # node's brooding_start_date; legacy 1:1 backfill means it's
        # deterministic.
        for n in self.member_nodes.values():
            if n.brooding_start_date is not None:
                days = (date.today() - n.brooding_start_date).days + 1
                return calc_setpoint_for_day_age(days)
        return DEFAULT_SETPOINT_C

    def update_pid_setpoint(self) -> None:
        sp = self.current_setpoint()
        if abs(self.pid.setpoint - sp) > 0.01:
            self.pid.setpoint = sp
            logger.info(f"Zone {self.id}: setpoint → {sp:.2f}°C")

    # ─── power distribution (max-power weighted) ──────────────

    def distribute_power(self, output_pct: float) -> Dict[int, int]:
        """Split a PID output (0-100%) across this zone's enabled heaters
        using max-power weighting.

        Formula: heater_i_pct = output_pct × (w_i / Σw)
        Then fold rounding remainder onto the heater with the largest
        max_power_w to keep the total exact.

        Returns {heater_id: pct} for all enabled heaters (skips disabled).
        Empty dict if no enabled heaters (zone has been deconfigured).
        """
        active = [h for h in self.heaters.values() if h.enabled]
        if not active:
            return {}
        total_w = sum(h.max_power_w for h in active)
        if total_w <= 0:
            # Pathological — equal split
            n = len(active)
            base = int(round(output_pct)) // n
            rem = int(round(output_pct)) - base * n
            return {h.id: base + (1 if i < rem else 0)
                    for i, h in enumerate(active)}
        result = {}
        for h in active:
            share = (h.max_power_w / total_w) * output_pct
            result[h.id] = max(0, min(100, int(round(share))))
        # Rounding drift correction — sum may be off by ±N
        target = int(round(output_pct))
        diff = target - sum(result.values())
        if diff != 0 and active:
            biggest = max(active, key=lambda h: h.max_power_w)
            result[biggest.id] = max(0, min(100, result[biggest.id] + diff))
        return result

    # ─── online / status ──────────────────────────────────────

    def is_online(self) -> bool:
        # Zone is "online" if any member has fresh telemetry
        for n in self.member_nodes.values():
            if n.is_online():
                return True
        return False

    def to_dict(self) -> dict:
        return {
            "id":                    self.id,
            "barn_id":               self.barn_id,
            "name":                  self.name,
            "manual_setpoint":       self.manual_setpoint,
            "effective_setpoint":    self.current_setpoint(),
            "fallback_delta_c":      self.fallback_delta_c,
            "enabled":               self.enabled,
            "max_total_w":           self.max_total_w,
            "online":                self.is_online(),
            "mode":                  self.mode,
            "setpoint_sent":         self.last_setpoint_sent,
            "setpoint_sent_at":      (self.last_setpoint_sent_at.isoformat()
                                       if self.last_setpoint_sent_at else None),
            "last_zone_temp":        self.last_zone_temp,
            "last_zone_temp_at":     (self.last_zone_temp_at.isoformat()
                                       if self.last_zone_temp_at else None),
            "zone_sensors_count":    self.zone_sensors_count,
            "pid_source":            self.pid_source,
            "last_power_total_pct":  self.last_power_total_pct,
            "member_count":          len(self.member_device_codes),
            "heater_count":          len([h for h in self.heaters.values()
                                          if h.enabled]),
            # UI-friendly freshness: take the freshest member's telemetry so the
            # zone reflects real recent activity, not the most-stale member.
            "last_seen_seconds":    _max_member_last_seen(self),
        }


# ============================================================
# ZONE CONTROLLER — singleton
# ============================================================

class ZoneController:
    """Parallel to BrooderController but acts at the zone level.

    Subscribes to the same MQTT topics (`cfarm/+/telemetry`, etc.) and
    filters by `brooder-` prefix. For each zone with a member node's
    telemetry, runs the PID and distributes output across the zone's
    heaters via per-ESP32 MQTT publish.

    Backward compatibility: legacy BrooderController keeps running so
    the legacy `/api/brooder/nodes/{code}/...` endpoints still work and
    the firmware receives a single `power` payload it can interpret
    (firmware v1.0.x) OR a per-channel `ch1`/`ch2` payload it can
    interpret (firmware v1.1.0+).
    """

    def __init__(self):
        self.zones: Dict[int, Zone] = {}
        self._running = False
        self._periodic_task: Optional[asyncio.Task] = None
        self._zone_temp_task: Optional[asyncio.Task] = None
        # Profile cache dirty flag (Phase 1+2). Mirrors BrooderController.
        self._profile_cache_dirty: bool = False

    # ─── lifecycle ─────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        try:
            await self._load_zones()
        except Exception as e:
            logger.error(f"ZoneController: _load_zones failed: {e}")
        self._subscribe_mqtt()
        self._zone_temp_task = asyncio.create_task(self._zone_temp_loop())
        self._periodic_task = asyncio.create_task(self._periodic_loop())
        logger.info(f"ZoneController started: {len(self.zones)} zones loaded")

    async def stop(self) -> None:
        self._running = False
        for t in (self._periodic_task, self._zone_temp_task):
            if t:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("ZoneController stopped")

    # ─── DB loading ────────────────────────────────────────

    async def _load_zones(self) -> None:
        """Build Zone objects from DB: zones + zone_devices + heaters."""
        # Load zones
        try:
            zone_rows = await db.fetch("""
                SELECT id, barn_id, name, manual_setpoint, fallback_delta_c,
                       enabled, is_active, max_total_w
                FROM brooder_zones
                WHERE is_active = TRUE
                ORDER BY id
            """)
        except Exception as e:
            logger.error(f"ZoneController: load_zones failed: {e}")
            return

        for r in zone_rows:
            zid = r["id"]
            if zid in self.zones:
                # In-place update — preserves PID state
                z = self.zones[zid]
                z.barn_id          = r["barn_id"]
                z.name             = r["name"]
                z.manual_setpoint  = r["manual_setpoint"]
                z.fallback_delta_c = float(r["fallback_delta_c"] or 0.0)
                z.enabled          = r["enabled"]
                z.max_total_w      = r["max_total_w"]
                if z.manual_setpoint != r["manual_setpoint"]:
                    z.update_pid_setpoint()
            else:
                self.zones[zid] = Zone(
                    id=zid,
                    barn_id=r["barn_id"],
                    name=r["name"],
                    manual_setpoint=r["manual_setpoint"],
                    fallback_delta_c=float(r["fallback_delta_c"] or 0.0),
                    enabled=r["enabled"],
                    max_total_w=r["max_total_w"],
                )

        # Load zone→device mapping
        try:
            zd_rows = await db.fetch("""
                SELECT zone_id, brooder_device_code
                FROM brooder_zone_devices
            """)
        except Exception as e:
            logger.warning(f"ZoneController: zone_devices load failed: {e}")
            zd_rows = []

        # Reset member lists then refill (cheap — N zones × N devices)
        for z in self.zones.values():
            z.member_device_codes = []
            z.member_nodes = {}

        for r in zd_rows:
            z = self.zones.get(r["zone_id"])
            if z is None:
                continue
            code = r["brooder_device_code"]
            z.member_device_codes.append(code)
            # Reuse the BrooderNode instance if it exists (shared cache)
            node = brooder_controller.nodes.get(code)
            if node is None:
                # Auto-register a stub so we can read telemetry as it arrives
                node = BrooderNode(device_code=code)
                brooder_controller.nodes[code] = node
            z.member_nodes[code] = node

        # Load heaters
        try:
            heater_rows = await db.fetch("""
                SELECT id, zone_id, device_code, channel, label, max_power_w,
                       enabled, is_active
                FROM brooder_heaters
                WHERE is_active = TRUE
            """)
        except Exception as e:
            logger.warning(f"ZoneController: heaters load failed: {e}")
            heater_rows = []

        # Reset heater maps then refill
        for z in self.zones.values():
            z.heaters = {}

        # Preserve last_power_pct if heater already loaded
        for r in heater_rows:
            z = self.zones.get(r["zone_id"])
            if z is None:
                continue
            hid = r["id"]
            old = z.heaters.get(hid)
            z.heaters[hid] = Heater(
                id=hid,
                zone_id=r["zone_id"],
                device_code=r["device_code"],
                channel=r["channel"],
                label=r["label"],
                max_power_w=float(r["max_power_w"] or 1500.0),
                enabled=r["enabled"],
                last_power_pct=old.last_power_pct if old else 0,
                last_published_at=old.last_published_at if old else None,
            )

    # ─── MQTT subscription ─────────────────────────────────
    #
    # Subscribes to the SAME topics as BrooderController — that's fine
    # because paho-mqtt allows multiple subscribers on a topic; both
    # controllers just observe the same messages. ZoneController filters
    # for `cfarm/brooder-*/telemetry` etc.

    def _subscribe_mqtt(self) -> None:
        mqtt_client.subscribe("cfarm/+/telemetry", self._on_telemetry)
        mqtt_client.subscribe("cfarm/+/status",    self._on_status)
        mqtt_client.subscribe("cfarm/+/lwt",       self._on_lwt)

    def _zone_for_device(self, device_code: str) -> Optional[Zone]:
        for z in self.zones.values():
            if device_code in z.member_nodes:
                return z
        return None

    def _on_telemetry(self, topic: str, payload) -> None:
        """Mirror BrooderController._on_telemetry but resolve the zone and
        run the zone-level PID tick."""
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.warning(f"Zone telemetry JSON decode error on {topic}: {e}")
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if not device_code:
            return

        zone = self._zone_for_device(device_code)
        if zone is None:
            return  # Not in any zone — legacy BrooderController handles it

        # Sync to in-memory BrooderNode (shared with BrooderController)
        node = zone.member_nodes[device_code]
        node.last_temp1    = payload.get('temp1')
        node.last_temp2    = payload.get('temp2')
        node.last_temp_min = payload.get('temp_min')
        node.last_hum_avg  = payload.get('hum_avg')
        zt = payload.get('zone_temp')
        if zt is not None and zt != -999.0:
            node.last_zone_temp = float(zt)
        else:
            node.last_zone_temp = None
        node.pid_source = payload.get('pid_source')
        node.last_telemetry_at = datetime.now(timezone.utc)
        node.mode = payload.get('mode', node.mode)
        zone.mode = node.mode  # mirror

        if zone.enabled and node.last_temp_min is not None:
            asyncio.create_task(self._tick_zone_pid(zone, node))

    def _on_status(self, topic: str, payload) -> None:
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception:
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if not device_code:
            return
        zone = self._zone_for_device(device_code)
        if zone is None:
            return
        node = zone.member_nodes.get(device_code)
        if node is None:
            return
        new_mode = payload.get('status', node.mode)
        node.mode = new_mode
        zone.mode = new_mode

    def _on_lwt(self, topic: str, payload) -> None:
        device_code = extract_device_code(topic)
        if not device_code:
            return
        zone = self._zone_for_device(device_code)
        if zone is None:
            return
        node = zone.member_nodes.get(device_code)
        if node is not None:
            node.mode = 'offline'
        # Zone mode becomes offline only if ALL members offline
        if all((n.mode in ('offline', 'unknown') or n.last_telemetry_at is None)
               for n in zone.member_nodes.values()):
            zone.mode = 'offline'

    # ─── Zone-level PID tick + telemetry persistence ───────

    async def _tick_zone_pid(self, zone: Zone, source_node: BrooderNode) -> None:
        """Compute new power, distribute across heaters, publish per-ESP
        MQTT commands, persist telemetry.

        Same Tier-1/Tier-2 logic as BrooderController._tick_pid but
        keyed on the zone, not a single node.
        """
        try:
            now = datetime.now(timezone.utc)

            # Tier 1: zone-weighted-avg when fresh (≤ ZONE_TEMP_STALE_S old)
            zone_age_s = None
            if zone.last_zone_temp is not None and zone.last_zone_temp_at is not None:
                zone_age_s = (now - zone.last_zone_temp_at).total_seconds()
            zone_fresh = (zone_age_s is not None
                          and zone_age_s <= ZONE_TEMP_STALE_S)

            if zone_fresh and zone.last_zone_temp is not None:
                temp = zone.last_zone_temp
                pid_source = "zone"
            else:
                # Tier 2: local SHT40 of ANY member node, adjusted by zone-level
                # fallback_delta_c. Pick the freshest reading.
                freshest: Optional[BrooderNode] = None
                freshest_age: Optional[float] = None
                for n in zone.member_nodes.values():
                    if n.last_temp_min is None or n.last_telemetry_at is None:
                        continue
                    age = (now - n.last_telemetry_at).total_seconds()
                    if freshest_age is None or age < freshest_age:
                        freshest = n
                        freshest_age = age
                if freshest is None or freshest_age is None or freshest_age > ZONE_TEMP_STALE_S:
                    return
                temp = freshest.last_temp_min - zone.fallback_delta_c
                pid_source = "local+delta"

            # Skip when input hasn't changed AND recent enough — the 4s window
            # also acts as a server-alive heartbeat (firmware failsafe after 5s).
            # Note: this is the ZONE equivalent of BrooderController._tick_pid's
            # skip gate, which uses PID_HEARTBEAT_S (=4). Keeping both in sync
            # so NORMAL-mode ESP32 doesn't fall into failsafe just because the
            # zone reference sensor hasn't ticked (sensors are still updating).
            if (zone.last_pid_input == temp
                    and zone.last_pid_input_at is not None
                    and (now - zone.last_pid_input_at).total_seconds() < PID_HEARTBEAT_S):
                return

            zone.update_pid_setpoint()
            err = zone.pid.setpoint - temp
            if abs(err) < DEADBAND_C:
                # Hold last output (PID integral still accumulates)
                out_pct = zone.last_power_total_pct
            else:
                out_raw = zone.pid(temp)
                out_pct = max(0, min(100, int(round(out_raw))))

            zone.last_pid_input = temp
            zone.last_pid_input_at = now
            zone.pid_source = pid_source
            zone.last_power_total_pct = out_pct
            sp = zone.pid.setpoint

            # Distribute across heaters, group by ESP
            distribution = zone.distribute_power(out_pct)
            per_esp: Dict[str, Dict[str, int]] = {}
            for hid, pct in distribution.items():
                h = zone.heaters.get(hid)
                if h is None:
                    continue
                per_esp.setdefault(h.device_code, {})[f"ch{h.channel}"] = pct

            # Publish per-ESP (firmware v1.1.0 prefers ch1/ch2; v1.0.x falls
            # back to single `power` field which we also include for safety).
            for code, channels in per_esp.items():
                payload = {
                    **channels,
                    "power":    int((sum(channels.values()) / max(len(channels), 1))),
                    "setpoint": round(sp, 2),
                    "ts":       now.isoformat(),
                }
                topic = f"cfarm/brooder-{code}/power"
                mqtt_client.publish(topic, payload, qos=1)

                # Update heater cache
                for h in zone.heaters.values():
                    if h.device_code != code:
                        continue
                    key = f"ch{h.channel}"
                    if key in channels:
                        h.last_power_pct = channels[key]
                        h.last_published_at = now

                # Persist to hypertable (same as BrooderController)
                await self._persist_zone_telemetry(code, temp, channels, sp, zone)

        except Exception as e:
            logger.error(f"Zone {zone.id} PID tick error: {e}")
            zone.mode = "error"

    async def _persist_zone_telemetry(self, code: str, temp: float,
                                      channels: Dict[str, int], sp: float,
                                      zone: Zone) -> None:
        """Mirror BrooderController tick persistence but per-zone metadata."""
        try:
            avg_pct = (sum(channels.values()) / max(len(channels), 1)) if channels else 0.0
            metadata = json.dumps({
                "setpoint":  sp,
                "zone_id":   zone.id,
                "mode":      zone.mode,
                "channels":  channels,
                "zone_temp": zone.last_zone_temp,
            })
            async with db.transaction() as conn:
                await conn.execute(
                    """
                    INSERT INTO sensor_data
                        (device_id, sensor_type_id, value, recorded_at, metadata)
                    SELECT d.id, st.id, $2, NOW(), $3::jsonb
                    FROM devices d, sensor_types st
                    WHERE d.device_code = $1 AND st.code = $4
                    LIMIT 1
                    """,
                    code, temp, metadata, SENSOR_TYPE_CODE,
                )
                await conn.execute(
                    """
                    INSERT INTO sensor_data
                        (device_id, sensor_type_id, value, recorded_at, metadata)
                    SELECT d.id, st.id, $2, NOW(), $3::jsonb
                    FROM devices d, sensor_types st
                    WHERE d.device_code = $1 AND st.code = $4
                    LIMIT 1
                    """,
                    code, float(avg_pct), metadata, SENSOR_TYPE_POWER_CODE,
                )
        except Exception as e:
            logger.debug(f"Zone {zone.id}: persist telemetry skipped: {e}")

    # ─── zone_temp publishing (one per zone) ───────────────

    async def _zone_temp_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(ZONE_TEMP_PUBLISH_S)
                await self._publish_zone_temps()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"ZoneController zone_temp loop error: {e}", exc_info=True)

    async def _publish_zone_temps(self) -> None:
        """Compute weighted-avg of each zone's attached sensors, publish to
        cfarm/brooder-{code}/zone_temp for EVERY member ESP."""
        now = datetime.now(timezone.utc)
        for z in self.zones.values():
            if not z.enabled:
                continue
            try:
                rows = await db.fetch(
                    """
                    SELECT
                        bzs.sensor_device_code,
                        bzs.weight,
                        sl.value      AS temp,
                        sl.time       AS last_seen
                    FROM brooder_zone_sensors bzs
                    LEFT JOIN devices d
                         ON d.device_code = bzs.sensor_device_code
                    LEFT JOIN sensor_latest sl
                         ON sl.device_id = d.id
                        AND sl.sensor_type = $2
                    WHERE bzs.zone_id = $1
                    ORDER BY bzs.id
                    """,
                    z.id, ZONE_TEMP_SENSOR_TYPE,
                )
            except Exception as e:
                logger.debug(f"Zone {z.id}: zone-sensor query failed: {e}")
                continue

            z.zone_sensors_count = len(rows)
            # Plain dict() before passing — asyncpg.Record is immutable
            # (see MEMORY.md asyncpg-pitfalls).
            payload = [dict(r) for r in rows]
            value, fresh_count = blend_zone_temp(payload, now=now)

            if value is None:
                z.last_zone_temp = None
                z.last_zone_temp_at = now
            else:
                z.last_zone_temp = value
                z.last_zone_temp_at = now

            # Publish to every member ESP
            for code in z.member_device_codes:
                topic = f"cfarm/brooder-{code}/zone_temp"
                payload = {
                    "temp":         value,
                    "source_count": fresh_count,
                    "stale_max_s":  ZONE_TEMP_STALE_S,
                    "ts":           now.isoformat(),
                }
                try:
                    mqtt_client.publish(topic, payload, qos=0, retain=False)
                except Exception as e:
                    logger.debug(f"Zone {z.id}/{code}: zone_temp publish failed: {e}")

    # ─── periodic tasks ────────────────────────────────────

    async def _periodic_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._reload_config()
                # Profile cache (Phase 1+2): sweep expired tests, then refresh
                # the per-zone cache. Runs BEFORE publish so the next setpoint
                # payload reflects the fresh profile.
                await self._sweep_test_assignments()
                await self._refresh_profile_caches()
                await self._publish_setpoint_changes()
                await self._mark_stale_zones()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"ZoneController periodic loop error: {e}", exc_info=True)

    async def _reload_config(self) -> None:
        """Pick up DB changes (manual override, new zone, new heater)."""
        try:
            await self._load_zones()
        except Exception as e:
            logger.error(f"ZoneController: reload failed: {e}")

    async def _publish_setpoint_changes(self) -> None:
        """Publish setpoint retained to ALL member ESPs when day-age changes
        or manual override is set/cleared."""
        for z in self.zones.values():
            if not z.enabled:
                continue
            new_sp = z.current_setpoint()
            if (z.last_setpoint_sent is None
                    or abs(new_sp - z.last_setpoint_sent) > 0.05):
                payload = build_setpoint_payload(
                    new_sp,
                    manual_override=z.manual_setpoint is not None,
                    fallback_delta_c=z.fallback_delta_c,
                )
                # Phase 1+2: append profile_code (firmware ignores unknown
                # keys). Same extension as BrooderController.
                if z.profile_cache is not None:
                    payload["profile_code"] = z.profile_cache.profile_code
                for code in z.member_device_codes:
                    topic = f"cfarm/brooder-{code}/setpoint"
                    mqtt_client.publish(topic, payload, qos=1, retain=True)
                z.last_setpoint_sent = new_sp
                z.last_setpoint_sent_at = datetime.now(timezone.utc)
                logger.info(f"Zone {z.id} ({z.name}): published setpoint "
                            f"{new_sp:.1f}°C to {len(z.member_device_codes)} member(s) "
                            f"(profile={z.profile_cache.profile_code if z.profile_cache else 'legacy'})")

    async def _mark_stale_zones(self) -> None:
        now = datetime.now(timezone.utc)
        for z in self.zones.values():
            # Zone is stale if NO member has fresh telemetry
            any_fresh = False
            for n in z.member_nodes.values():
                if n.last_telemetry_at is None:
                    continue
                age = (now - n.last_telemetry_at).total_seconds()
                if age <= TELEMETRY_STALE_S:
                    any_fresh = True
                    break
            if not any_fresh and z.mode not in ('offline', 'stale'):
                if z.member_nodes:
                    z.mode = 'stale'

    # ─── profile cache (Phase 1+2) ────────────────────────────
    #
    # Mirrors BrooderController. Zones typically share one cycle, so the
    # resolver looks up via the first member node with cycle_id set and
    # mirrors the result into the Zone cache (one DB hit per zone per tick,
    # not per member).

    def invalidate_profile_cache(self) -> None:
        """Flip the dirty flag so the next periodic tick re-resolves."""
        self._profile_cache_dirty = True

    async def _resolve_profile_setpoint_async(self, zone: "Zone") -> None:
        """Look up the cycle (via first member node with cycle_id) and
        mirror the resolved CachedProfile into the Zone. Mirrors
        BrooderController._resolve_profile_setpoint_async."""
        # Feature flag
        try:
            from src.services.storage.config_service import config_service
            cfg = config_service.load_config() or {}
            if not (cfg.get("brooder", {}) or {}).get("profiles_enabled", True):
                zone.profile_cache = None
                return
        except Exception:
            pass

        cycle_id = None
        for n in zone.member_nodes.values():
            if n.cycle_id is not None:
                cycle_id = n.cycle_id
                break
        if cycle_id is None:
            zone.profile_cache = None
            return

        today = date.today()
        try:
            from src.utils.timezone import now_hcm
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            night_now = False

        try:
            row = await db.fetchrow(
                """
                SELECT cp.status       AS cycle_status,
                       cp.start_date   AS cycle_start,
                       cp.expected_end_date AS cycle_end,
                       cp.brooder_profile_id AS cycle_pid,
                       p.code          AS cycle_pcode,
                       p.is_active     AS cycle_pactive,
                       tst.profile_id  AS test_pid,
                       tst.expires_at  AS test_expires_at
                FROM cycles cp
                LEFT JOIN brooder_profiles p
                       ON p.id = cp.brooder_profile_id
                LEFT JOIN brooder_profile_test_assignments tst
                       ON tst.cycle_id = cp.id
                      AND tst.cleared_at IS NULL
                WHERE cp.id = $1
                """,
                cycle_id,
            )
        except Exception as e:
            logger.debug(f"Zone {zone.id}: profile resolve query failed: {e}")
            zone.profile_cache = None
            return

        if not row or not row["cycle_start"]:
            zone.profile_cache = None
            return

        eff_pid = None
        eff_pcode = None
        if (row["test_pid"]
                and row["test_expires_at"]
                and row["test_expires_at"] > datetime.now(timezone.utc)):
            eff_pid = row["test_pid"]
            try:
                tp = await db.fetchrow(
                    "SELECT code, is_active FROM brooder_profiles WHERE id = $1",
                    row["test_pid"],
                )
                if tp and tp["is_active"]:
                    eff_pcode = tp["code"]
                else:
                    eff_pid = None
            except Exception:
                eff_pid = None
        if eff_pid is None:
            eff_pid = row["cycle_pid"]
            eff_pcode = row["cycle_pcode"]
            if eff_pcode is None or not row["cycle_pactive"]:
                zone.profile_cache = None
                return

        if row["cycle_status"] != "active":
            zone.profile_cache = None
            return

        end_date = row["cycle_end"] or date.max
        if not (row["cycle_start"] <= today <= end_date):
            zone.profile_cache = None
            return

        day_age = (today - row["cycle_start"]).days + 1
        try:
            stage = await db.fetchrow(
                """
                SELECT id, setpoint_target, heater_zone_limit,
                       night_boost_offset, humidity_min_pct, humidity_max_pct
                FROM brooder_profile_schedules
                WHERE profile_id = $1
                  AND day_range_start <= $2
                  AND day_range_end   >= $2
                LIMIT 1
                """,
                eff_pid, day_age,
            )
        except Exception as e:
            logger.debug(f"Zone {zone.id}: stage resolve query failed: {e}")
            zone.profile_cache = None
            return

        if not stage:
            zone.profile_cache = None
            return

        zone.profile_cache = CachedProfile(
            profile_code=eff_pcode or "(unknown)",
            stage_id=int(stage["id"]),
            setpoint_target=float(stage["setpoint_target"]),
            heater_limit=float(stage["heater_zone_limit"]),
            night_boost=float(stage["night_boost_offset"] or 0.0),
            humidity_range=(stage["humidity_min_pct"], stage["humidity_max_pct"]),
        )
        zone.profile_cache_cycle_date = today
        zone.profile_cache_night_flag = night_now

    async def _refresh_profile_caches(self) -> None:
        try:
            from src.utils.timezone import now_hcm
            today = date.today()
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            today = date.today()
            night_now = False

        for z in self.zones.values():
            if not self._profile_cache_dirty \
                    and z.profile_cache_cycle_date == today \
                    and z.profile_cache_night_flag == night_now \
                    and z.profile_cache is not None:
                continue
            try:
                await self._resolve_profile_setpoint_async(z)
            except Exception as e:
                logger.warning(f"Zone {z.id}: profile refresh failed: {e}")
        self._profile_cache_dirty = False

    async def _sweep_test_assignments(self) -> None:
        """Mirror of BrooderController._sweep_test_assignments — same DB
        rows, same auto-expire semantics. Idempotent (the WHERE clause
        only matches cleared_at IS NULL rows)."""
        try:
            rows = await db.fetch(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'auto_expired'
                WHERE cleared_at IS NULL AND expires_at <= NOW()
                RETURNING id, cycle_id, profile_id
                """
            )
        except Exception as e:
            logger.debug(f"ZoneController test sweeper query failed: {e}")
            return
        if rows:
            self._profile_cache_dirty = True
            logger.info(
                f"ZoneController test sweeper: auto-expired {len(rows)} assignment(s)"
            )

    async def apply_test_profile(self, cycle_id: int, profile_id: int,
                                 hours: int, note: Optional[str] = None) -> dict:
        """Mirror of BrooderController.apply_test_profile. Both controllers
        call this from routes/brooder_profiles.apply_test — one DB row is
        the source of truth."""
        cyc = await db.fetchrow("SELECT id FROM cycles WHERE id = $1", cycle_id)
        if not cyc:
            raise ValueError(f"Cycle {cycle_id} not found")
        prof = await db.fetchrow(
            "SELECT id, code FROM brooder_profiles WHERE id = $1 AND is_active = TRUE",
            profile_id,
        )
        if not prof:
            raise ValueError(f"Profile {profile_id} not found or inactive")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        async with db.transaction() as tx:
            await tx.execute(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'replaced'
                WHERE cycle_id = $1 AND cleared_at IS NULL
                """,
                cycle_id,
            )
            row = await tx.fetchrow(
                """
                INSERT INTO brooder_profile_test_assignments
                    (cycle_id, profile_id, expires_at, note)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                cycle_id, profile_id, expires_at, note,
            )
        self._profile_cache_dirty = True
        out = dict(row)
        out["profile_code"] = prof["code"]
        return out

    async def clear_test_profile(self, cycle_id: int) -> bool:
        row = await db.fetchrow(
            """
            UPDATE brooder_profile_test_assignments
            SET cleared_at = NOW(), cleared_reason = 'manual_clear'
            WHERE cycle_id = $1 AND cleared_at IS NULL
            RETURNING id
            """,
            cycle_id,
        )
        if row:
            self._profile_cache_dirty = True
            return True
        return False

    # ─── public API (for routes / dashboard) ───────────────

    async def set_zone_setpoint(self, zone_id: int,
                                setpoint: Optional[float],
                                note: Optional[str] = None) -> dict:
        """Set or clear manual setpoint override on a zone.

        setpoint=None → clear override (back to day-age auto).
        Re-publishes /setpoint retained to every member ESP.
        """
        z = self.zones.get(zone_id)
        if z is None:
            raise ValueError(f"Unknown zone: {zone_id}")
        z.manual_setpoint = setpoint
        z.update_pid_setpoint()
        effective = z.pid.setpoint

        await db.execute(
            "UPDATE brooder_zones SET manual_setpoint = $1, "
            "updated_at = NOW() WHERE id = $2",
            setpoint, zone_id,
        )

        # Publish retained setpoint to all member ESPs
        payload = build_setpoint_payload(
            effective,
            manual_override=setpoint is not None,
            fallback_delta_c=z.fallback_delta_c,
        )
        if z.profile_cache is not None:
            payload["profile_code"] = z.profile_cache.profile_code
        for code in z.member_device_codes:
            topic = f"cfarm/brooder-{code}/setpoint"
            mqtt_client.publish(topic, payload, qos=1, retain=True)
        z.last_setpoint_sent = effective
        z.last_setpoint_sent_at = datetime.now(timezone.utc)

        # Audit
        try:
            await db.execute(
                """
                INSERT INTO zone_setpoint_history
                    (zone_id, manual_setpoint, effective_setpoint, source, note)
                VALUES ($1, $2, $3, 'manual', $4)
                """,
                zone_id, setpoint, effective, note,
            )
        except Exception as e:
            logger.debug(f"Zone {zone_id}: audit write failed: {e}")

        logger.info(f"Zone {zone_id}: manual override → "
                    f"{setpoint if setpoint is not None else 'auto'} "
                    f"(effective {effective:.2f}°C)")
        return z.to_dict()

    async def set_zone_fallback_delta(self, zone_id: int, delta: float) -> dict:
        """Update Tier-2 fallback delta (admin-tuned offset for the local
        SHT40 path). Re-publishes setpoint retained."""
        z = self.zones.get(zone_id)
        if z is None:
            raise ValueError(f"Unknown zone: {zone_id}")
        z.fallback_delta_c = float(delta)
        await db.execute(
            "UPDATE brooder_zones SET fallback_delta_c = $1, "
            "updated_at = NOW() WHERE id = $2",
            float(delta), zone_id,
        )
        # Republish
        payload = build_setpoint_payload(
            z.pid.setpoint,
            manual_override=z.manual_setpoint is not None,
            fallback_delta_c=z.fallback_delta_c,
        )
        if z.profile_cache is not None:
            payload["profile_code"] = z.profile_cache.profile_code
        for code in z.member_device_codes:
            topic = f"cfarm/brooder-{code}/setpoint"
            mqtt_client.publish(topic, payload, qos=1, retain=True)
        return z.to_dict()

    def get_zone(self, zone_id: int) -> Optional[dict]:
        z = self.zones.get(zone_id)
        return z.to_dict() if z else None

    def list_zones(self) -> List[dict]:
        return [z.to_dict() for z in self.zones.values()]

    def get_zone_heaters(self, zone_id: int) -> List[dict]:
        z = self.zones.get(zone_id)
        if z is None:
            return []
        out = []
        for h in z.heaters.values():
            out.append({
                "id":              h.id,
                "zone_id":         h.zone_id,
                "device_code":     h.device_code,
                "channel":         h.channel,
                "label":           h.label,
                "max_power_w":     h.max_power_w,
                "enabled":         h.enabled,
                "last_power_pct":  h.last_power_pct,
                "last_published_at": (h.last_published_at.isoformat()
                                       if h.last_published_at else None),
            })
        return out

    def get_zone_members(self, zone_id: int) -> List[dict]:
        z = self.zones.get(zone_id)
        if z is None:
            return []
        return [n.to_dict() for n in z.member_nodes.values()]


# ============================================================
# Module-level singleton (ZoneController)
# ============================================================

zone_controller = ZoneController()