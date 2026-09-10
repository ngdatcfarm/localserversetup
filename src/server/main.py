"""CFarm Local Server - Main Application."""

import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.templating import Jinja2Templates

from src.server.routes import cameras_router, ptz_router, recording_router
from src.server.routes.preset_automation import router as preset_automation_router
from src.server.routes.auth import router as auth_router
from src.server.routes.iot import router as iot_router
from src.server.routes.snapshots import router as snapshots_router
from src.server.routes.devices import router as devices_router
from src.server.routes.sensors import router as sensors_router
from src.server.routes.automation import router as automation_router
from src.server.routes.firmware import router as firmware_router
from src.server.routes.farm import router as farm_router
from src.server.routes.farm_extended import router as farm_extended_router
from src.server.routes.medication_aliases import router as medication_aliases_router
from src.server.routes.notifications import router as notifications_router
from src.server.routes.bats import router as bats_router
from src.server.routes.equipment import router as equipment_router
from src.server.routes.mq_tare import router as mq_tare_router
from src.iot.mq_tare_service import mq_tare_service
from src.server.routes.sync import router as sync_router
from src.server.routes.database import router as database_router
from src.sync.sync_service import sync_service

from src.cameras.stream.mjpeg_stream import router as stream_router, setup_mjpeg
from src.cameras.capture.camera_manager import camera_manager
from src.services.storage.config_service import ConfigService
from src.services.storage.recording_service import recording_service
from src.services.storage.snapshot_service import snapshot_service
from src.iot.mqtt_client import mqtt_client
from src.iot.mqtt_listener import mqtt_listener
from src.iot.device_service import device_service
from src.iot.automation_service import automation_service
from src.iot.alert_service import alert_service
from src.iot.notification_service import notification_service
from src.iot.vaccine_notification_service import vaccine_notification_service
from src.iot.care_notification_service import care_notification_service
from src.iot.weight_notification_service import weight_notification_service
from src.iot.ai_logic_service import ai_logic_service
from src.iot.inverter_service import inverter_service
from src.iot.cf_relay import cf_relay
from src.server.routes.ml import router as ml_router
from src.server.routes.ai_logic import router as ai_logic_router
from src.server.routes.ml_dataset import router as ml_dataset_router
from src.server.routes.ml_training import router as ml_training_router
from src.server.routes.density import router as density_router
from src.server.routes.ai_detection import router as ai_detection_router
from src.server.routes.dataset_capture import router as dataset_capture_router
from src.server.routes.capture_scheduler_routes import router as capture_scheduler_router
from src.server.routes.chat import router as chat_router
from src.server.routes.cycle_snapshots import router as cycle_snapshots_router
from src.iot.cycle_snapshot_service import start_snapshot_scheduler
from src.server.routes.terminal import router as terminal_router
from src.server.routes.inverter import router as inverter_router
from src.server.routes.security import router as security_router
from src.server.routes.relay_bind import router as relay_bind_router
from src.security.security_service import security_service, set_main_event_loop
from src.services.database.db import db
from src.server.session_store import SessionStore

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Initialize
BASE_DIR = Path(__file__).resolve().parent.parent.parent
config_service = ConfigService(str(BASE_DIR / "config" / "cameras.yaml"))

app = FastAPI(
    title="CFarm Local Server",
    description="Local-first IoT hub for camera, sensor, and device management",
    version="0.10.0"
)

# Background task handle
_offline_check_task = None
_snapshot_task = None


async def _offline_check_loop():
    """Background task: check for offline devices every 60 seconds."""
    while True:
        await asyncio.sleep(60)
        try:
            newly_offline = await device_service.check_offline(timeout_seconds=90)
            for d in newly_offline:
                logger.warning(f"Device offline: {d['device_code']} ({d['name']})")
        except Exception as e:
            logger.error(f"Offline check error: {e}")


@app.on_event("startup")
async def startup_event():
    """Startup: connect DB, MQTT, then start cameras."""
    global _offline_check_task
    config = config_service.load_config()

    # 1. Connect to TimescaleDB (retry up to 60 times, 5s apart — DB in Docker may need ~2min)
    db_config = config.get("database", {})
    db.configure(db_config if db_config else {
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026",
    })
    for _db_attempt in range(60):
        await db.connect()
        if db.pool is not None:
            break
        logger.warning("DB not ready, retrying in 5s... (%d/60)", _db_attempt + 1)
        await asyncio.sleep(5)
    if db.pool is None:
        logger.error("DB connection failed after 60 attempts — app running WITHOUT database")

    # 2. Connect to local MQTT broker
    mqtt_config = config.get("mqtt", {})
    if mqtt_config:
        mqtt_client.configure(mqtt_config)
    else:
        mqtt_client.configure_local_default()
    mqtt_client.connect()

    # 3. Start MQTT listener (processes ESP32 messages → DB)
    mqtt_listener.start()
    mqtt_listener.start_queue_processor()

    # 4. Start background services
    _offline_check_task = asyncio.create_task(_offline_check_loop())
    logger.info("Device offline detection started (every 60s)")

    # 4a. Start cycle_daily_snapshots scheduler (daily 00:30 VN + backfill on startup).
    #     Replaces the old "manual CLI only" workflow that left snapshot table empty
    #     for cycles 13/14/15 and any cycle active after 2026-05-26.
    global _snapshot_task
    _snapshot_task = asyncio.create_task(start_snapshot_scheduler())
    logger.info("Cycle daily snapshots scheduler started (daily 00:30 VN + 30d backfill)")

    await automation_service.start()
    await alert_service.start()
    await vaccine_notification_service.start()
    await care_notification_service.start()
    await weight_notification_service.start()
    await ai_logic_service.start()

    # 4b. Start cloud sync service
    # ARCHIVED 2026-09-07: cloud DB sync (app.cfarm.vn) replaced by Cloudflare Worker
    # (cfarm-relay) for Telegram notifications. Sync service is no-op (sync.enabled=false,
    # cloud_url cleared, triggers gated on sync_config.archived). Kept in codebase for
    # potential re-activation. See CLAUDE.md "Cloud DB Sync (archived)".
    # await sync_service.start()

    # 4b-2. Start terminal SessionStore cleanup loop (kills expired
    #        pinned/unpinned sessions every 30s; see session_store.py).
    SessionStore.get_instance().start_cleanup()

    # 4c. Configure push notifications (optional)
    push_config = config.get("push_notifications", {})
    if push_config:
        notification_service.configure(push_config)
        logger.info("Push notifications configured")

    # 4c-2. Configure Cloudflare Worker relay (optional, fire-and-forget).
    # Mirrors local WebPush + cloud sync — never blocks the alert path.
    cf_relay_cfg = config.get("cf_relay", {})
    if cf_relay_cfg:
        await cf_relay.configure(cf_relay_cfg)
        if cf_relay.is_ready():
            logger.info("Cloudflare Worker relay configured (cf_relay)")
        else:
            logger.debug("cf_relay block present but disabled or missing worker_url")

    # 4d. Reconcile MQ tare sessions from previous server lifetime
    try:
        await mq_tare_service.reconcile_on_startup()
    except Exception as e:
        logger.error("MQ tare reconcile failed: %s", e)

    # 5. Load curtains from config
    from src.iot.curtain_service import curtain_service
    curtains_config = config.get("curtains", [])
    if curtains_config:
        curtain_service.load_from_config(curtains_config)
        logger.info(f"Loaded {len(curtains_config)} curtain(s)")

    # 5b. Configure + start inverter poller (read-only). Wrapped in try/except
    #     so a config error here can never block the rest of startup.
    try:
        inverter_cfg = config.get("inverter", {})
        inverter_service.configure(inverter_cfg)
        await inverter_service.start()
    except Exception as e:
        logger.error("Inverter service start failed: %s", e)

    # 5c. Configure + start security service (motion + YOLO person detection).
    #     MUST come BEFORE camera frame-callback registration so the worker is
    #     ready when frames start flowing.
    try:
        sec_cfg = config.get("security", {})
        security_service.configure(sec_cfg)
        # Capture the main event loop so the worker thread can dispatch
        # async side-effects (push notification, siren).
        try:
            set_main_event_loop(asyncio.get_running_loop())
        except RuntimeError:
            pass
        await security_service.start()
    except Exception as e:
        logger.error("Security service start failed: %s", e)

    # 5d. Snapshot cleanup cron — runs hourly, deletes security snapshots
    #     older than retention_days (default 30). Cheap, blocks nothing.
    async def _cleanup_old_security_snapshots():
        from datetime import datetime, timedelta
        while True:
            await asyncio.sleep(3600)  # hourly
            try:
                cfg = config.get("security", {})
                snap_dir = Path(cfg.get("snapshot_dir", "E:\\AI\\Snapshots\\security"))
                retention_days = int(cfg.get("snapshot_retention_days", 30))
                if not snap_dir.exists():
                    continue
                cutoff = datetime.now().timestamp() - (retention_days * 86400)
                deleted = 0
                for f in snap_dir.rglob("*.jpg"):
                    try:
                        if f.stat().st_mtime < cutoff:
                            f.unlink()
                            deleted += 1
                    except Exception:
                        pass
                if deleted:
                    logger.info("Security snapshot cleanup: deleted %d files", deleted)
            except Exception as e:
                logger.warning("Security snapshot cleanup failed: %s", e)
    asyncio.create_task(_cleanup_old_security_snapshots())

    # 6. Register frame callbacks BEFORE starting cameras
    setup_mjpeg()

    # 7. Setup recording service from config
    rec_config = config_service.get_recording_config()
    recording_service.update_settings(
        recording_dir=rec_config.get("recording_dir", "F:\\Camera"),
        segment_duration=rec_config.get("segment_duration", 600),
    )
    camera_manager.add_frame_callback(recording_service.on_frame)

    # 7b. Setup snapshot service from config
    snap_config = config_service.get_snapshot_config()
    snapshot_service.update_settings(
        snapshot_dir=snap_config.get("snapshot_dir", "E:\\AI\\Snapshots"),
        retention_days=snap_config.get("retention_days", 7),
    )
    # Run initial cleanup
    snapshot_service.cleanup_old()

    # 8. Start all enabled cameras.
    # Each camera is wrapped in a 5s timeout — if a camera is unreachable
    # (LAN drop, IP changed, RTSP auth changed), don't let it block the
    # whole startup forever. Cameras that don't connect in time will be
    # retried by the camera manager's background reconnect loop.
    cameras = config_service.get_cameras()
    started = 0
    for camera in cameras:
        if not camera.enabled:
            continue
        try:
            ok = await asyncio.wait_for(
                asyncio.to_thread(camera_manager.add_camera, camera),
                timeout=5.0,
            )
            if ok:
                started += 1
        except asyncio.TimeoutError:
            logger.warning(
                "Camera %s add timed out after 5s — continuing startup; "
                "camera may reconnect in background.",
                camera.id,
            )
        except Exception as e:
            logger.warning("Camera %s add failed: %s", camera.id, e)
    logger.info(f"Started {started}/{len(cameras)} cameras")

    logger.info("CFarm Local Server v0.10.0 ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown: stop all services cleanly."""
    global _offline_check_task, _snapshot_task
    if _offline_check_task:
        _offline_check_task.cancel()
    if _snapshot_task:
        _snapshot_task.cancel()
        try:
            await _snapshot_task
        except asyncio.CancelledError:
            pass
    await sync_service.stop()
    await automation_service.stop()
    await alert_service.stop()
    await vaccine_notification_service.stop()
    await care_notification_service.stop()
    await weight_notification_service.stop()
    await ai_logic_service.stop()
    try:
        await inverter_service.stop()
    except Exception as e:
        logger.warning("Inverter service stop error: %s", e)
    recording_service.stop_all()
    for camera_id in list(camera_manager.get_all_cameras().keys()):
        camera_manager.stop_camera(camera_id)
    try:
        await cf_relay.close()
    except Exception as e:
        logger.warning("CfRelay close error: %s", e)
    # Stop security service AFTER cameras so no callback can fire mid-shutdown.
    try:
        await security_service.stop()
    except Exception as e:
        logger.warning("Security service stop error: %s", e)
    mqtt_client.disconnect()
    # Kill any remaining terminal sessions (pinned or otherwise).
    SessionStore.get_instance().shutdown_all()
    await db.disconnect()
    logger.info("CFarm Local Server stopped")


# Setup templates
templates = Jinja2Templates(directory=str(BASE_DIR / "src" / "server" / "templates"))

# Custom StaticFiles with no-cache headers — prevents browser from caching old JS
# (we hit this when fixing bugs: the page would show stale code with syntax errors)
class NoCacheStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send):
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Strip any existing cache headers, force fresh
                headers = [(k, v) for (k, v) in headers
                           if k.lower() not in (b"cache-control", b"expires", b"pragma")]
                headers.extend([
                    (b"cache-control", b"no-store, no-cache, must-revalidate, max-age=0"),
                    (b"pragma", b"no-cache"),
                ])
                message["headers"] = headers
            await send(message)
        await super().__call__(scope, receive, send_wrapper)


# Mount static files
static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", NoCacheStaticFiles(directory=str(static_dir)), name="static")

# Mount snapshot folder for debug images
snapshot_dir = Path("E:/AI/Snapshots")
if snapshot_dir.exists():
    app.mount("/snapshots", StaticFiles(directory=str(snapshot_dir)), name="snapshots")

# Mount security snapshot subfolder. URLs in security_events.snapshot_url
# use /snapshots/security/<date>/<file>.jpg — the StaticFiles mount above
# already covers this path because /snapshots/security is a subdir of E:/AI/Snapshots.
# No separate mount needed.

# Mount dataset folder for ML training images
dataset_dir = Path("E:/AI/Dataset")
if dataset_dir.exists():
    app.mount("/dataset", StaticFiles(directory=str(dataset_dir)), name="dataset")

# Serve service worker at root (required for push notifications)
@app.get("/sw.js")
async def serve_sw():
    from fastapi.responses import FileResponse
    sw_path = static_dir / "sw.js"
    if sw_path.exists():
        return FileResponse(str(sw_path), media_type="application/javascript")
    raise HTTPException(status_code=404, detail="Service Worker not found")

# Serve SSL certificate for mobile device installation
@app.get("/cfarm.crt")
async def serve_cert():
    """Download SSL certificate for installing on mobile devices."""
    from fastapi.responses import FileResponse
    cert_path = BASE_DIR / "cert.pem"
    if cert_path.exists():
        return FileResponse(str(cert_path), media_type="application/x-x509-ca-cert", filename="cfarm.crt")
    raise HTTPException(status_code=404, detail="Certificate not found")

# Include routers
app.include_router(auth_router)
app.include_router(cameras_router)
app.include_router(preset_automation_router)
app.include_router(ptz_router)
app.include_router(sync_router)
app.include_router(stream_router)
app.include_router(recording_router)
app.include_router(iot_router)
app.include_router(devices_router)
app.include_router(sensors_router)
app.include_router(automation_router)
app.include_router(firmware_router)
app.include_router(farm_router)
app.include_router(farm_extended_router)
app.include_router(medication_aliases_router)
app.include_router(notifications_router)
app.include_router(database_router)
app.include_router(bats_router)
app.include_router(equipment_router)
app.include_router(mq_tare_router)
app.include_router(snapshots_router)
app.include_router(ai_logic_router)
app.include_router(ml_router)
app.include_router(ml_dataset_router)
app.include_router(ml_training_router)
app.include_router(density_router)
app.include_router(ai_detection_router)
app.include_router(dataset_capture_router)
app.include_router(capture_scheduler_router)
app.include_router(chat_router)
app.include_router(cycle_snapshots_router)
app.include_router(terminal_router)
app.include_router(inverter_router)
app.include_router(security_router)
app.include_router(relay_bind_router)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve farm management webapp."""
    farm_html = BASE_DIR / "src" / "server" / "templates" / "farm.html"
    return FileResponse(str(farm_html), media_type="text/html")


@app.get("/recordings", response_class=HTMLResponse)
async def recordings_page():
    """Serve recordings browser page."""
    return templates.TemplateResponse("recordings.html", {"request": {}})


@app.get("/database", response_class=HTMLResponse)
async def database_page():
    """Serve database manager page."""
    return templates.TemplateResponse("database.html", {"request": {}})


@app.get("/iot", response_class=HTMLResponse)
async def iot_page():
    """Serve IoT manager page (firmware, devices, types)."""
    return templates.TemplateResponse("iot.html", {"request": {}})


@app.get("/health")
async def health_check():
    """Health check endpoint — returns 503 if database is down."""
    mqtt_stats = mqtt_client.get_stats()
    db_connected = db.pool is not None
    device_count = await db.fetchval("SELECT COUNT(*) FROM devices") if db_connected else 0
    online_count = await db.fetchval(
        "SELECT COUNT(*) FROM devices WHERE is_online = TRUE"
    ) if db_connected else 0

    # Terminal subsystem metrics (session count, active WS, cmd.exe
    # process count, oldest session age). Lets external monitors /
    # future guardian enhancements detect "FastAPI up but pywinpty
    # broken" vs "FastAPI up and everything works".
    # stats() shells out to `tasklist` (up to 2 s) — run in a thread so
    # the asyncio loop isn't blocked while /health is being polled.
    try:
        from src.server.session_store import SessionStore
        terminal_stats = await asyncio.to_thread(
            SessionStore.get_instance().stats
        )
    except Exception as e:
        terminal_stats = {"error": str(e)}

    body = {
        "status": "healthy" if db_connected else "degraded",
        "version": "0.10.0",
        "mqtt": {
            "connected": mqtt_stats["connected"],
            "host": mqtt_stats["host"],
            "messages": mqtt_stats["message_count"],
        },
        "database": {
            "connected": db_connected,
        },
        "devices": {
            "total": device_count,
            "online": online_count,
        },
        "terminal": terminal_stats,
    }

    if not db_connected:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=body)
    return body


if __name__ == "__main__":
    import uvicorn

    server_config = config_service.get_server_config()
    uvicorn.run(
        "src.server.main:app",
        host=server_config.get("host", "0.0.0.0"),
        port=server_config.get("port", 8000),
        reload=True,
    )
