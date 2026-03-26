"""CFarm Local Server - Main Application."""

import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.server.routes import cameras_router, ptz_router, recording_router
from src.server.routes.iot import router as iot_router
from src.cameras.stream.mjpeg_stream import router as stream_router, setup_mjpeg
from src.services.storage.config_service import ConfigService
from src.services.storage.recording_service import recording_service
from src.cameras.capture.camera_manager import camera_manager
from src.iot.mqtt_client import mqtt_client
from src.iot.mqtt_listener import mqtt_listener
from src.services.database.db import db

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
    version="0.4.0"
)


@app.on_event("startup")
async def startup_event():
    """Startup: connect DB, MQTT, then start cameras."""
    config = config_service.load_config()

    # 1. Connect to TimescaleDB
    db_config = config.get("database", {})
    db.configure(db_config if db_config else {
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026",
    })
    await db.connect()

    # 2. Connect to local MQTT broker
    mqtt_config = config.get("mqtt", {})
    if mqtt_config:
        mqtt_client.configure(mqtt_config)
    else:
        mqtt_client.configure_local_default()
    mqtt_client.connect()

    # 3. Start MQTT listener (processes ESP32 messages → DB)
    mqtt_listener.start()

    # 4. Load curtains from config
    from src.iot.curtain_service import curtain_service
    curtains_config = config.get("curtains", [])
    if curtains_config:
        curtain_service.load_from_config(curtains_config)
        logger.info(f"Loaded {len(curtains_config)} curtain(s)")

    # 5. Register frame callbacks BEFORE starting cameras
    setup_mjpeg()

    # 6. Setup recording service from config
    rec_config = config_service.get_recording_config()
    recording_service.update_settings(
        recording_dir=rec_config.get("recording_dir", "F:\\Camera"),
        segment_duration=rec_config.get("segment_duration", 600),
    )
    camera_manager.add_frame_callback(recording_service.on_frame)

    # 7. Start all enabled cameras
    cameras = config_service.get_cameras()
    started = 0
    for camera in cameras:
        if camera.enabled:
            if camera_manager.add_camera(camera):
                started += 1
    logger.info(f"Started {started}/{len(cameras)} cameras")

    logger.info("CFarm Local Server ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown: stop all services cleanly."""
    recording_service.stop_all()
    for camera_id in list(camera_manager.get_all_cameras().keys()):
        camera_manager.stop_camera(camera_id)
    mqtt_client.disconnect()
    await db.disconnect()
    logger.info("CFarm Local Server stopped")


# Setup templates
templates = Jinja2Templates(directory=str(BASE_DIR / "src" / "server" / "templates"))

# Mount static files
static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Include routers
app.include_router(cameras_router)
app.include_router(ptz_router)
app.include_router(stream_router)
app.include_router(recording_router)
app.include_router(iot_router)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve dashboard."""
    return templates.TemplateResponse("index.html", {"request": {}})


@app.get("/recordings", response_class=HTMLResponse)
async def recordings_page():
    """Serve recordings browser page."""
    return templates.TemplateResponse("recordings.html", {"request": {}})


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    mqtt_stats = mqtt_client.get_stats()
    return {
        "status": "healthy",
        "mqtt": {
            "connected": mqtt_stats["connected"],
            "host": mqtt_stats["host"],
            "messages": mqtt_stats["message_count"],
        },
        "database": {
            "connected": db.pool is not None,
        },
    }


if __name__ == "__main__":
    import uvicorn

    server_config = config_service.get_server_config()
    uvicorn.run(
        "src.server.main:app",
        host=server_config.get("host", "0.0.0.0"),
        port=server_config.get("port", 8000),
        reload=True
    )
