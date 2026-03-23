"""Camera Server - Main Application."""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.server.routes import cameras_router
from src.cameras.stream.mjpeg_stream import router as stream_router
from src.services.storage.config_service import ConfigService
from src.cameras.capture import camera_manager
import src.cameras.stream.mjpeg_stream as mjpeg_module


# Initialize
BASE_DIR = Path(__file__).resolve().parent.parent.parent
config_service = ConfigService(str(BASE_DIR / "config" / "cameras.yaml"))
from src.cameras.capture import camera_manager

# Auto-start enabled cameras
def startup_cameras():
    """Start all enabled cameras on startup."""
    cameras = config_service.get_cameras()
    for camera in cameras:
        if camera.enabled:
            camera_manager.add_camera(camera)
    print(f"Started {sum(1 for c in cameras if c.enabled)} cameras")

app = FastAPI(
    title="Camera Server",
    description="Local camera management and streaming server",
    version="0.1.0"
)


@app.on_event("startup")
async def startup_event():
    """Startup event - start cameras."""
    startup_cameras()
    # Setup MJPEG frame callback for all cameras
    import src.cameras.stream.mjpeg_stream as mjpeg_module
    for camera_id in camera_manager.get_all_cameras():
        camera_info = camera_manager.get_camera(camera_id)
        if camera_info and camera_info.client:
            def make_callback(cid):
                return lambda f, s: mjpeg_module._mjpeg_frame_callback(cid, f, s)
            camera_info.client.on_frame = make_callback(camera_id)


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event - stop cameras."""
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
app.include_router(stream_router)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve dashboard."""
    return templates.TemplateResponse("index.html", {"request": {}})


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
