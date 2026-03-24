"""Camera Server - Main Application."""

from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.server.routes import cameras_router, ptz_router, recording_router
from src.cameras.stream.mjpeg_stream import router as stream_router, setup_mjpeg
from src.services.storage.config_service import ConfigService
from src.services.storage.recording_service import recording_service
from src.cameras.capture.camera_manager import camera_manager

# Initialize
BASE_DIR = Path(__file__).resolve().parent.parent.parent
config_service = ConfigService(str(BASE_DIR / "config" / "cameras.yaml"))

app = FastAPI(
    title="Camera Server",
    description="Local camera management and streaming server",
    version="0.2.0"
)


@app.on_event("startup")
async def startup_event():
    """Startup: register callbacks then start cameras."""
    # 1. Register frame callbacks BEFORE starting cameras
    setup_mjpeg()

    # 1b. Setup recording service from config
    rec_config = config_service.get_recording_config()
    recording_service.update_settings(
        recording_dir=rec_config.get("recording_dir", "F:\\Camera"),
        segment_duration=rec_config.get("segment_duration", 600),
    )
    camera_manager.add_frame_callback(recording_service.on_frame)

    # 2. Start all enabled cameras
    cameras = config_service.get_cameras()
    started = 0
    for camera in cameras:
        if camera.enabled:
            if camera_manager.add_camera(camera):
                started += 1
    print(f"Started {started}/{len(cameras)} cameras")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown: stop all cameras."""
    recording_service.stop_all()
    for camera_id in list(camera_manager.get_all_cameras().keys()):
        camera_manager.stop_camera(camera_id)


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
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    server_config = config_service.get_server_config()
    uvicorn.run(
        "src.server.main:app",
        host=server_config.get("host", "0.0.0.0"),
        port=server_config.get("port", 8000),
        reload=True
    )
