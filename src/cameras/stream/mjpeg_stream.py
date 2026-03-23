"""MJPEG Stream Server."""

import asyncio
import cv2
import io
import logging
import threading
import time
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.cameras.capture import camera_manager
from src.models.camera import CameraConfig

logger = logging.getLogger(__name__)

router = APIRouter(tags=["streaming"])

# Store latest frames for each camera
_frames_cache: Dict[str, bytes] = {}
_frames_lock = threading.Lock()


def _mjpeg_frame_callback(camera_id: str, frame, stats):
    """Callback to store latest frame for MJPEG streaming."""
    try:
        # Encode frame as JPEG
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        with _frames_lock:
            _frames_cache[camera_id] = jpeg.tobytes()
    except Exception as e:
        logger.error(f"Error encoding frame for {camera_id}: {e}")


# Register the MJPEG callback with camera manager
def setup_mjpeg_callbacks():
    """Setup MJPEG callbacks for all running cameras."""
    for camera_id, camera_info in camera_manager.get_all_cameras().items():
        if camera_info.client:
            camera_info.client.on_frame = lambda cam_id=camera_id: lambda f, s: _mjpeg_frame_callback(cam_id, f, s)


# Setup on module load
setup_mjpeg_callbacks()


def generate_mjpeg(camera_id: str):
    """Generate MJPEG stream for a camera."""
    while True:
        with _frames_lock:
            frame = _frames_cache.get(camera_id)

        if frame is None:
            time.sleep(0.1)
            continue

        # MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


@router.get("/stream/{camera_id}/snapshot")
async def get_snapshot(camera_id: str):
    """Get single snapshot from camera."""
    # Check if camera exists
    from src.services.storage.config_service import ConfigService
    config_service = ConfigService()
    camera = config_service.get_camera(camera_id)

    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Check if camera is running
    camera_info = camera_manager.get_camera(camera_id)

    if camera_info is None or camera_info.client is None:
        raise HTTPException(status_code=404, detail="Camera not running")

    # Get cached frame
    with _frames_lock:
        frame = _frames_cache.get(camera_id)

    if frame is None:
        raise HTTPException(status_code=404, detail="No frame available - camera may be offline")

    return StreamingResponse(
        io.BytesIO(frame),
        media_type="image/jpeg"
    )


@router.get("/stream/{camera_id}")
async def get_stream(camera_id: str):
    """Get MJPEG stream for a camera."""
    # Check if camera exists
    from src.services.storage.config_service import ConfigService
    config_service = ConfigService()
    camera = config_service.get_camera(camera_id)

    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Check if camera is running
    camera_info = camera_manager.get_camera(camera_id)
    if camera_info is None or camera_info.client is None:
        # Start camera
        camera_manager.add_camera(camera)
        await asyncio.sleep(2)  # Wait for connection

    # Ensure frame callback is set
    camera_info = camera_manager.get_camera(camera_id)
    if camera_info and camera_info.client:
        # Set callback to store frames for snapshot
        if camera_info.client.on_frame is None:
            camera_info.client.on_frame = lambda f, s: _mjpeg_frame_callback(camera_id, f, s)

    return StreamingResponse(
        generate_mjpeg(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
