"""Security Service — motion-triggered YOLOv8n person detection.

Architecture (see docs in plan):
    RTSP thread → CameraManager._dispatch_frame() → SecurityService.on_frame()
                                                              │
                                                      MOG2 motion gate
                                                              │
                                                  (motion_score > zone.threshold)
                                                              │
                                            inference_queue.put_nowait()  ← drop if full
                                                              │
                                                       Worker thread
                                                              │
                                                  YOLOv8n.predict() (COCO class 0)
                                                              │
                                                      person detected?
                                                     │              │
                                                    No              Yes
                                                     │              │
                                                  (skip)     snapshot + DB insert
                                                              │
                                                      push + MQTT siren
                                                              │
                                                    (60s cooldown per zone)

Integration:    registered as a CameraManager frame callback. Reuses the
                RTSP stream the MJPEG/Recorder callbacks already consume —
                no extra connection, no separate decoder thread.

Failure modes:
    - RTSP thread starvation: motion_score is ~1-3ms, queue.put_nowait is
      non-blocking. We never sleep on the RTSP thread.
    - YOLO crash: worker logs and skips the frame; next frame continues.
    - Queue full: frame is dropped silently (motion gate ensures most
      noise frames never reach the queue).
    - DB down: detection still happens, but side-effects log warning and
      skip — queue keeps draining.
"""
import asyncio
import json
import logging
import queue
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from src.cameras.capture.camera_manager import camera_manager
from src.services.database.db import db
from src.security.motion import MotionDetector
from src.utils.timezone import now_hcm

logger = logging.getLogger(__name__)


# COCO class IDs relevant to security.
# 0 = person. We only fire on person for Phase 1.
PERSON_CLASS_ID = 0


@dataclass
class _DetectionItem:
    """One frame pending YOLO inference (or already inferred)."""
    camera_id: str
    frame: np.ndarray             # BGR, full-res
    enqueued_at: float
    zone: dict                    # row from security_zones


class SecurityService:
    """Singleton service — manages detection worker, motion gates, arm state."""

    def __init__(self):
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._worker_stop = threading.Event()
        self._inference_queue: "queue.Queue[_DetectionItem]" = queue.Queue(maxsize=4)

        # Motion detectors — 1 per camera
        self._motion: dict[str, MotionDetector] = {}
        self._motion_lock = threading.Lock()

        # Last-trigger timestamp per zone (for cooldown)
        self._last_trigger: dict[int, float] = {}
        self._last_trigger_lock = threading.Lock()

        # YOLO model — lazy loaded in start() to warm during startup
        self._model = None
        self._device = "cpu"
        self._model_name = "yolov8n.pt"

        # Config (set via configure())
        self._config = {
            "enabled": True,
            "model_name": "yolov8n.pt",
            "inference_queue_size": 4,
            "motion_history": 500,
            "motion_var_threshold": 32,
            "default_cooldown_seconds": 60,
            "default_yolo_confidence": 0.30,
            "default_motion_threshold": 0.05,
            "snapshot_dir": "E:\\AI\\Snapshots\\security",
            "snapshot_url_prefix": "/snapshots/security",
            "snapshot_retention_days": 30,
            "worker_threads": 1,
        }

        # In-memory zone cache — refreshed on arm/disarm, also on demand
        self._zones_cache: list[dict] = []
        self._zones_lock = threading.Lock()
        self._zones_loaded_at: float = 0.0

        # Stats for /status
        self._stats = {
            "frames_received": 0,
            "motion_passes": 0,
            "yolo_runs": 0,
            "persons_detected": 0,
            "side_effects_ok": 0,
            "side_effects_failed": 0,
            "started_at": None,
            "last_event_at": None,
            "model_loaded": False,
            "worker_alive": False,
        }

    # ── Config / Lifecycle ──────────────────────────────────

    def configure(self, config: dict):
        """Apply config block (called from main.py startup)."""
        if config:
            for k, v in config.items():
                if k in self._config:
                    self._config[k] = v
        self._model_name = self._config["model_name"]
        logger.info(
            "SecurityService configured: enabled=%s model=%s queue=%s",
            self._config["enabled"], self._model_name,
            self._config["inference_queue_size"],
        )

    async def start(self):
        """Start the inference worker. Idempotent."""
        if self._running:
            return
        self._running = True
        self._worker_stop.clear()
        self._stats["started_at"] = datetime.utcnow().isoformat() + "Z"

        # Pre-load YOLO during startup so first detection isn't penalized.
        self._load_model()

        # Register frame callback
        try:
            camera_manager.add_frame_callback(self._on_frame_sync)
            logger.info("SecurityService: frame callback registered")
        except Exception as e:
            logger.error("SecurityService: failed to register frame callback: %s", e)

        # Refresh zone cache
        await self._refresh_zones()

        # Start worker thread(s)
        for i in range(self._config.get("worker_threads", 1)):
            t = threading.Thread(
                target=self._inference_worker,
                name=f"SecurityWorker-{i}",
                daemon=True,
            )
            t.start()
            self._worker_thread = t

        self._stats["worker_alive"] = True
        logger.info(
            "SecurityService started (model=%s, queue=%d, workers=%d)",
            self._model_name, self._config["inference_queue_size"],
            self._config.get("worker_threads", 1),
        )

    async def stop(self):
        """Stop the worker thread. Daemon=True so it dies with the process anyway."""
        self._running = False
        self._worker_stop.set()
        if self._worker_thread:
            # Worker checks _worker_stop.is_set() between items; bounded wait.
            self._worker_thread.join(timeout=2.0)
            self._worker_thread = None
        self._stats["worker_alive"] = False
        logger.info("SecurityService stopped")

    def _load_model(self):
        """Lazy-load YOLO model. Idempotent."""
        if self._model is not None:
            return
        try:
            import torch
            from ultralytics import YOLO
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("SecurityService: loading YOLO %s on %s", self._model_name, self._device)
            self._model = YOLO(self._model_name)
            self._model.to(self._device)
            self._stats["model_loaded"] = True
            logger.info("SecurityService: YOLO model loaded")
        except Exception as e:
            logger.error("SecurityService: YOLO load failed: %s", e)
            self._stats["model_loaded"] = False

    # ── Frame callback (runs on RTSP thread!) ───────────────

    def _on_frame_sync(self, camera_id: str, frame, stats):
        """CameraManager frame callback. FAST: just motion gate + enqueue.

        Runs on the RTSP capture thread — never block here.
        """
        if not self._config.get("enabled", True) or not self._running:
            return
        if frame is None or frame.size == 0:
            return

        self._stats["frames_received"] += 1

        # 1) Find zone for this camera (in-memory cache; cheap)
        zone = self._get_zone_for_camera(camera_id)
        if not zone or not zone.get("enabled") or not zone.get("armed"):
            return

        # 2) Motion gate (MOG2 ~1-3ms)
        motion_threshold = float(zone.get("motion_threshold") or self._config["default_motion_threshold"])
        motion_score = self._get_motion(camera_id).score(frame)
        if motion_score < motion_threshold:
            return

        # 3) Cooldown gate — skip if last trigger was within cooldown_seconds
        now = time.time()
        with self._last_trigger_lock:
            last = self._last_trigger.get(zone["id"])
            cooldown = int(zone.get("cooldown_seconds") or self._config["default_cooldown_seconds"])
            if last is not None and (now - last) < cooldown:
                return

        self._stats["motion_passes"] += 1

        # 4) Enqueue for inference worker — drop if full
        try:
            self._inference_queue.put_nowait(_DetectionItem(
                camera_id=camera_id,
                frame=frame,
                enqueued_at=now,
                zone=zone,
            ))
        except queue.Full:
            # Worker is behind. Drop this frame silently.
            pass

    # ── Worker thread ───────────────────────────────────────

    def _inference_worker(self):
        """Daemon thread — dequeue, run YOLO, dispatch side-effects."""
        logger.info("Security worker thread started")
        while not self._worker_stop.is_set():
            try:
                try:
                    item = self._inference_queue.get(timeout=1.0)
                except queue.Empty:
                    continue

                # Recompute cooldown at dequeue time — another event
                # could have just fired and re-armed the cooldown.
                zone = item.zone
                cooldown = int(zone.get("cooldown_seconds") or self._config["default_cooldown_seconds"])
                now = time.time()
                with self._last_trigger_lock:
                    self._last_trigger[zone["id"]] = now
                    last = self._last_trigger[zone["id"]]

                # Run YOLO
                self._stats["yolo_runs"] += 1
                person_box = self._detect_person(item.frame, zone)
                if person_box is None:
                    continue

                # Person detected → side-effects (sync DB+snapshot, async push+siren)
                self._stats["persons_detected"] += 1
                self._stats["last_event_at"] = datetime.utcnow().isoformat() + "Z"

                try:
                    # Capture snapshot + write DB row synchronously (worker is daemon thread).
                    snapshot_path, snapshot_url = self._capture_snapshot(item.frame, person_box, item.camera_id, zone)
                    event_id = self._insert_event_sync(zone, item.camera_id, person_box, snapshot_path, snapshot_url)

                    # Schedule async push + siren on the event loop (don't block worker)
                    asyncio.run_coroutine_threadsafe(
                        self._fire_alerts(event_id, zone, item.camera_id, person_box, snapshot_url),
                        _main_event_loop,
                    )

                    self._stats["side_effects_ok"] += 1
                    logger.info(
                        "[%s] PERSON DETECTED: conf=%.2f zone=%s event_id=%s",
                        item.camera_id, float(person_box[4]), zone["name"], event_id,
                    )
                except Exception as e:
                    self._stats["side_effects_failed"] += 1
                    logger.error("Security side-effects failed for %s: %s", item.camera_id, e)

            except Exception as e:
                logger.error("Security worker loop error: %s", e)
                # Brief backoff so we don't spin if a logic bug exists
                time.sleep(0.5)

    def _detect_person(self, frame: np.ndarray, zone: dict):
        """Run YOLO, return (x1, y1, x2, y2, conf) for best person, else None."""
        if self._model is None:
            self._load_model()
        if self._model is None:
            return None  # model unavailable; bail silently

        confidence = float(zone.get("yolo_confidence") or self._config["default_yolo_confidence"])
        try:
            results = self._model.predict(
                frame, conf=confidence, verbose=False, classes=[PERSON_CLASS_ID]
            )[0]
            boxes = results.boxes
            if boxes is None or len(boxes) == 0:
                return None
            # Pick highest-confidence detection
            best_i = max(range(len(boxes)), key=lambda i: float(boxes[i].conf[0]))
            b = boxes[best_i]
            x1, y1, x2, y2 = (int(v) for v in b.xyxy[0].tolist())
            conf = float(b.conf[0])
            return (x1, y1, x2, y2, conf)
        except Exception as e:
            logger.error("YOLO inference error: %s", e)
            return None

    # ── Side-effects ────────────────────────────────────────

    def _capture_snapshot(self, frame, person_box, camera_id, zone) -> tuple[str, str]:
        """Draw red bbox + label on frame, save JPEG, return (abs_path, url)."""
        x1, y1, x2, y2, conf = person_box
        annotated = frame.copy()
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 3)
        label = f"PERSON {conf:.2f}"
        # Background box for label readability
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        cv2.rectangle(annotated, (x1, max(0, y1 - th - baseline - 4)), (x1 + tw + 8, y1), (0, 0, 255), -1)
        cv2.putText(annotated, label, (x1 + 4, max(th, y1 - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Path: E:\AI\Snapshots\security\YYYY-MM-DD\camera_HH-MM-SS.jpg
        # HCM-local so a 23:00 HCM capture lands in today's HCM folder
        now = now_hcm()
        day_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")
        safe_cam = camera_id.replace("/", "_").replace("\\", "_")
        out_dir = Path(self._config["snapshot_dir"]) / day_str
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{safe_cam}_{time_str}.jpg"

        ok, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            return ("", "")
        out_path.write_bytes(buf.tobytes())

        # URL: /snapshots/security/YYYY-MM-DD/camera_HH-MM-SS.jpg
        url_prefix = self._config["snapshot_url_prefix"].rstrip("/")
        url = f"{url_prefix}/{day_str}/{out_path.name}"
        return (str(out_path), url)

    def _insert_event_sync(self, zone, camera_id, person_box, snapshot_path, snapshot_url) -> int:
        """Write security_events row + return id. Uses sync DB call (worker thread)."""
        x1, y1, x2, y2, conf = person_box
        row = db.fetchrow("""
            INSERT INTO security_events
                (time, zone_id, camera_id, confidence,
                 bbox_x, bbox_y, bbox_w, bbox_h,
                 snapshot_path, snapshot_url,
                 siren_triggered, notification_sent)
            VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE)
            RETURNING id
        """,
            int(zone["id"]), camera_id, conf,
            x1, y1, x2 - x1, y2 - y1,
            snapshot_path, snapshot_url,
        )
        return int(row["id"])

    async def _fire_alerts(self, event_id: int, zone: dict, camera_id: str, person_box, snapshot_url: str):
        """Async side-effects: push notification + MQTT siren. Best-effort."""
        x1, y1, x2, y2, conf = person_box
        conf = person_box[4] if len(person_box) == 5 else float(person_box[4])

        # ── Push notification
        notification_sent = False
        try:
            from src.iot.notification_service import notification_service
            title = f"🛡️ Phát hiện người — {zone['name']}"
            body = f"Camera {camera_id} vừa phát hiện người (độ tin cậy {conf*100:.0f}%)"
            data = {
                "type": "security",
                "event_id": event_id,
                "zone_id": int(zone["id"]),
                "camera_id": camera_id,
                "snapshot_url": snapshot_url,
                "confidence": conf,
            }
            await notification_service.send_to_all(title, body, data, "SECURITY")
            notification_sent = True
        except Exception as e:
            logger.warning("Security push notification failed: %s", e)

        # Forward to Cloudflare Worker relay (Telegram etc.) — fire-and-forget
        try:
            from src.iot.cf_relay import cf_relay
            await cf_relay.relay(
                alert_type="SECURITY",
                title=title,
                body=body,
                snapshot_url=snapshot_url,
                severity="danger",
                url=f"/security",
            )
        except Exception as relay_err:
            logger.debug("Security CfRelay skipped: %s", relay_err)

        if notification_sent:
            try:
                await db.execute(
                    "UPDATE security_events SET notification_sent = TRUE WHERE id = $1",
                    event_id,
                )
            except Exception:
                pass

        # ── Siren (optional, only if zone configured to trigger)
        siren_triggered = False
        try:
            if zone.get("trigger_siren") and zone.get("siren_device_id") and zone.get("siren_channel") is not None:
                from src.iot.mqtt_client import mqtt_client
                from src.iot.automation_service import automation_service
                # Fetch device mqtt_topic from DB (small one-shot read)
                topic_row = await db.fetchrow(
                    "SELECT mqtt_topic FROM devices WHERE id = $1", int(zone["siren_device_id"])
                )
                if topic_row and topic_row["mqtt_topic"]:
                    duration = int(zone.get("siren_duration_seconds") or 30)
                    await automation_service.send_timed_relay(
                        topic_row["mqtt_topic"],
                        int(zone["siren_channel"]),
                        duration,
                        int(zone["siren_device_id"]),
                        source=f"security#{event_id}",
                    )
                    siren_triggered = True
        except Exception as e:
            logger.warning("Security siren failed: %s", e)

        if siren_triggered:
            try:
                await db.execute(
                    "UPDATE security_events SET siren_triggered = TRUE WHERE id = $1",
                    event_id,
                )
            except Exception:
                pass

    # ── Zone CRUD ───────────────────────────────────────────

    async def _refresh_zones(self):
        """Reload zone cache from DB. Called on start + after arm/disarm."""
        try:
            rows = await db.fetch("""
                SELECT id, name, camera_id, enabled, armed,
                       motion_threshold, yolo_confidence, cooldown_seconds,
                       trigger_siren, siren_device_id, siren_channel,
                       siren_duration_seconds, notes
                FROM security_zones
            """)
            with self._zones_lock:
                self._zones_cache = [dict(r) for r in rows]
                self._zones_loaded_at = time.time()
            logger.info("SecurityService: loaded %d zone(s)", len(self._zones_cache))
        except Exception as e:
            logger.error("SecurityService: zone refresh failed: %s", e)

    async def refresh_zones_public(self):
        """External hook (called from route after zone CRUD)."""
        await self._refresh_zones()

    def _get_zone_for_camera(self, camera_id: str) -> Optional[dict]:
        """In-memory cache lookup. Refreshed on CRUD."""
        with self._zones_lock:
            for z in self._zones_cache:
                if z["camera_id"] == camera_id:
                    return z
        return None

    def _get_motion(self, camera_id: str) -> MotionDetector:
        with self._motion_lock:
            if camera_id not in self._motion:
                self._motion[camera_id] = MotionDetector(
                    history=self._config["motion_history"],
                    var_threshold=self._config["motion_var_threshold"],
                )
            return self._motion[camera_id]

    async def list_zones(self) -> list[dict]:
        await self._refresh_zones()
        with self._zones_lock:
            return list(self._zones_cache)

    async def get_zone(self, zone_id: int) -> Optional[dict]:
        await self._refresh_zones()
        with self._zones_lock:
            for z in self._zones_cache:
                if int(z["id"]) == int(zone_id):
                    return z
        return None

    async def create_zone(self, data: dict, user_id: Optional[int] = None) -> dict:
        row = await db.fetchrow("""
            INSERT INTO security_zones
                (name, camera_id, enabled, armed, motion_threshold,
                 yolo_confidence, cooldown_seconds, trigger_siren,
                 siren_device_id, siren_channel, siren_duration_seconds,
                 notes, created_by_user_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *
        """,
            data["name"], data["camera_id"],
            data.get("enabled", True), data.get("armed", False),
            float(data.get("motion_threshold", self._config["default_motion_threshold"])),
            float(data.get("yolo_confidence", self._config["default_yolo_confidence"])),
            int(data.get("cooldown_seconds", self._config["default_cooldown_seconds"])),
            bool(data.get("trigger_siren", False)),
            data.get("siren_device_id"),
            data.get("siren_channel"),
            int(data.get("siren_duration_seconds", 30)),
            data.get("notes"),
            user_id,
        )
        await self._refresh_zones()
        return dict(row)

    async def update_zone(self, zone_id: int, data: dict) -> bool:
        result = await db.execute("""
            UPDATE security_zones SET
                name = COALESCE($1, name),
                enabled = COALESCE($2, enabled),
                armed = COALESCE($3, armed),
                motion_threshold = COALESCE($4, motion_threshold),
                yolo_confidence = COALESCE($5, yolo_confidence),
                cooldown_seconds = COALESCE($6, cooldown_seconds),
                trigger_siren = COALESCE($7, trigger_siren),
                siren_device_id = COALESCE($8, siren_device_id),
                siren_channel = COALESCE($9, siren_channel),
                siren_duration_seconds = COALESCE($10, siren_duration_seconds),
                notes = COALESCE($11, notes)
            WHERE id = $12
        """,
            data.get("name"),
            data.get("enabled"),
            data.get("armed"),
            data.get("motion_threshold"),
            data.get("yolo_confidence"),
            data.get("cooldown_seconds"),
            data.get("trigger_siren"),
            data.get("siren_device_id"),
            data.get("siren_channel"),
            data.get("siren_duration_seconds"),
            data.get("notes"),
            zone_id,
        )
        await self._refresh_zones()
        # Clear cooldown so re-arming resumes detection immediately
        with self._last_trigger_lock:
            self._last_trigger.pop(zone_id, None)
        return True

    async def delete_zone(self, zone_id: int) -> bool:
        result = await db.execute("DELETE FROM security_zones WHERE id = $1", zone_id)
        # asyncpg returns "DELETE N"
        ok = result.endswith(" 1")
        await self._refresh_zones()
        with self._last_trigger_lock:
            self._last_trigger.pop(zone_id, None)
        return ok

    async def set_armed(self, zone_id: int, armed: bool) -> bool:
        await db.execute(
            "UPDATE security_zones SET armed = $1, updated_at = NOW() WHERE id = $2",
            armed, zone_id,
        )
        await self._refresh_zones()
        # Clear cooldown so re-arming resumes detection immediately
        with self._last_trigger_lock:
            self._last_trigger.pop(zone_id, None)
        return True

    # ── Events ──────────────────────────────────────────────

    async def list_events(self, limit: int = 50, camera_id: Optional[str] = None,
                          since: Optional[str] = None,
                          acknowledged: Optional[bool] = None) -> list[dict]:
        sql = """
            SELECT e.id, e.time, e.zone_id, e.camera_id, e.confidence,
                   e.bbox_x, e.bbox_y, e.bbox_w, e.bbox_h,
                   e.snapshot_path, e.snapshot_url,
                   e.siren_triggered, e.notification_sent,
                   e.acknowledged_at, e.acknowledged_by_user_id,
                   z.name AS zone_name
            FROM security_events e
            JOIN security_zones z ON z.id = e.zone_id
            WHERE 1=1
        """
        params = []
        if camera_id:
            params.append(camera_id)
            sql += f" AND e.camera_id = ${len(params)}"
        if since:
            params.append(since)
            sql += f" AND e.time >= ${len(params)}"
        if acknowledged is True:
            sql += " AND e.acknowledged_at IS NOT NULL"
        elif acknowledged is False:
            sql += " AND e.acknowledged_at IS NULL"
        sql += f" ORDER BY e.time DESC LIMIT {int(limit)}"
        rows = await db.fetch(sql, *params)
        return [dict(r) for r in rows]

    async def ack_event(self, event_id: int, user_id: Optional[int] = None) -> bool:
        result = await db.execute("""
            UPDATE security_events
            SET acknowledged_at = NOW(), acknowledged_by_user_id = $2
            WHERE id = $1 AND acknowledged_at IS NULL
        """, event_id, user_id)
        return True  # we treat either case as success; idempotent

    async def unack_event(self, event_id: int) -> bool:
        await db.execute("""
            UPDATE security_events
            SET acknowledged_at = NULL, acknowledged_by_user_id = NULL
            WHERE id = $1
        """, event_id)
        return True

    # ── Stats / Health ──────────────────────────────────────

    def get_status(self) -> dict:
        with self._zones_lock:
            zones = list(self._zones_cache)
        armed_zones = [z for z in zones if z.get("armed")]
        return {
            "running": self._running,
            "enabled": self._config.get("enabled", True),
            "model_loaded": self._stats["model_loaded"],
            "model_name": self._model_name,
            "device": self._device,
            "worker_alive": self._stats["worker_alive"],
            "queue_size": self._inference_queue.qsize(),
            "queue_capacity": self._config["inference_queue_size"],
            "zones_total": len(zones),
            "zones_armed": len(armed_zones),
            "stats": dict(self._stats),
        }


# Module-level singleton
security_service = SecurityService()


# ── Event-loop bridge ────────────────────────────────────────
# _inference_worker runs on a daemon thread, but the side-effects
# (push notification + siren) need an asyncio loop. We grab a reference
# to the FastAPI main loop during start() and use
# asyncio.run_coroutine_threadsafe() to dispatch.

_main_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_main_event_loop(loop: asyncio.AbstractEventLoop):
    """Called from main.py startup so the worker thread can schedule async side-effects."""
    global _main_event_loop
    _main_event_loop = loop