"""MJPEG Stream Server - Async streaming with GPU-aware encoding."""

import asyncio
import cv2
import io
import logging
import threading
from pathlib import Path
from typing import Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from src.cameras.capture.camera_manager import camera_manager
from src.services.storage.config_service import ConfigService

_templates_dir = Path(__file__).resolve().parent.parent.parent / "server" / "templates"
_templates = Jinja2Templates(directory=str(_templates_dir))

logger = logging.getLogger(__name__)

router = APIRouter(tags=["streaming"])

# Store latest JPEG-encoded frames for each camera
_frames_cache: Dict[str, bytes] = {}
_frames_lock = threading.Lock()
_frame_events: Dict[str, asyncio.Event] = {}


def frame_to_jpeg(frame, quality: int = 85) -> bytes:
    """Encode frame to JPEG bytes."""
    _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return jpeg.tobytes()


def on_camera_frame(camera_id: str, frame, stats):
    """Callback registered with CameraManager - encodes and caches frame."""
    try:
        jpeg_bytes = frame_to_jpeg(frame)
        with _frames_lock:
            _frames_cache[camera_id] = jpeg_bytes

        # Signal async waiters that a new frame is available
        event = _frame_events.get(camera_id)
        if event is not None:
            event.set()
    except Exception as e:
        logger.error(f"Error encoding frame for {camera_id}: {e}")


def setup_mjpeg():
    """Register frame callback with the global camera manager."""
    camera_manager.add_frame_callback(on_camera_frame)
    logger.info("MJPEG stream callback registered")


async def generate_mjpeg(camera_id: str):
    """Async MJPEG generator - yields frames without blocking the event loop."""
    # Create an asyncio Event for this camera if not exists
    loop = asyncio.get_event_loop()
    if camera_id not in _frame_events:
        _frame_events[camera_id] = asyncio.Event()

    event = _frame_events[camera_id]

    while True:
        # Wait for new frame with timeout (non-blocking)
        try:
            await asyncio.wait_for(event.wait(), timeout=2.0)
            event.clear()
        except asyncio.TimeoutError:
            # No frame in 2s - camera might be offline, keep waiting
            continue

        with _frames_lock:
            frame = _frames_cache.get(camera_id)

        if frame is None:
            continue

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


@router.get("/stream/{camera_id}/snapshot")
async def get_snapshot(camera_id: str):
    """Get single snapshot from camera."""
    config_service = ConfigService()
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    camera_info = camera_manager.get_camera(camera_id)
    if camera_info is None or camera_info.client is None:
        raise HTTPException(status_code=404, detail="Camera not running")

    # Try cached JPEG first
    with _frames_lock:
        frame = _frames_cache.get(camera_id)

    # If no cached frame, try getting directly from client
    if frame is None and camera_info.client is not None:
        raw_frame = camera_info.client.get_latest_frame()
        if raw_frame is not None:
            frame = frame_to_jpeg(raw_frame)

    if frame is None:
        raise HTTPException(status_code=404, detail="No frame available")

    return StreamingResponse(io.BytesIO(frame), media_type="image/jpeg")


@router.get("/stream/{camera_id}")
async def get_stream_page(camera_id: str):
    """Stream viewer page with PTZ controls."""
    config_service = ConfigService()
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Auto-start camera if not running
    camera_info = camera_manager.get_camera(camera_id)
    if camera_info is None or camera_info.client is None:
        camera_manager.add_camera(camera)
        await asyncio.sleep(2)

    return _templates.TemplateResponse("stream_view.html", {
        "request": {},
        "camera_id": camera_id,
        "camera_name": camera.name,
        "camera_ip": camera.ip,
    })


@router.get("/stream/{camera_id}/mjpeg")
async def get_stream_mjpeg(camera_id: str):
    """Get raw MJPEG stream for a camera."""
    config_service = ConfigService()
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    camera_info = camera_manager.get_camera(camera_id)
    if camera_info is None or camera_info.client is None:
        camera_manager.add_camera(camera)
        await asyncio.sleep(2)

    return StreamingResponse(
        generate_mjpeg(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
