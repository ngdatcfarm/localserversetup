"""Dataset Capture Routes - Auto-capture images from cameras for dataset building."""

import asyncio
import cv2
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from src.services.storage.config_service import ConfigService
from src.services.database.db import db
from src.server.auth import require_auth

router = APIRouter(prefix="/api/ml/dataset", tags=["dataset-capture"], dependencies=[Depends(require_auth)])

DATASET_DIR = Path("E:/AI/Dataset")
DATASET_DIR.mkdir(parents=True, exist_ok=True)


class CaptureRequest(BaseModel):
    camera_id: str
    preset_ids: list[int] = [1]
    shots_per_preset: int = 15
    interval_sec: float = 2.0


def capture_frame_direct(camera_id: str) -> tuple:
    """Capture a single frame directly via RTSP using OpenCV."""
    config_svc = ConfigService()
    camera = config_svc.get_camera(camera_id)
    if not camera:
        return None, None

    rtsp_url = f"rtsp://{camera.username}:{camera.password}@{camera.ip}:{camera.port}{camera.rtsp_path}"
    cap = cv2.VideoCapture(rtsp_url)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        return None, None

    return frame, camera


@router.post("/capture")
async def capture_for_dataset(data: CaptureRequest):
    """
    Capture multiple images from camera presets for dataset building.

    - Captures from multiple presets for diversity
    - Saves images with 'unlabeled' status in DB
    - Returns count of captured images
    """
    config_svc = ConfigService()
    camera = config_svc.get_camera(data.camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail=f"Camera not found: {data.camera_id}")

    # Get PTZ controller for preset navigation
    from src.cameras.ptz.ptz_controller import get_ptz_controller
    controller = get_ptz_controller(camera)

    captured = []
    errors = []

    for preset_id in data.preset_ids:
        # Move to preset if controller available
        if controller:
            try:
                await controller.goto_preset(preset_id)
                await asyncio.sleep(2)  # Wait for movement
            except Exception as e:
                errors.append(f"Preset {preset_id}: movement error - {e}")

        # Capture multiple shots
        for shot in range(data.shots_per_preset):
            frame, cam_obj = capture_frame_direct(data.camera_id)
            if frame is None:
                errors.append(f"Preset {preset_id} shot {shot}: failed to capture")
                continue

            # Save image file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"cap_p{preset_id}_{timestamp}_{shot:02d}.jpg"
            filepath = DATASET_DIR / filename

            cv2.imwrite(str(filepath), frame)

            # Get dimensions
            h, w = frame.shape[:2]

            # Save to DB
            try:
                row = await db.fetchrow(
                    """INSERT INTO ml_dataset_images (filename, filepath, original_width, original_height, label_status)
                       VALUES ($1, $2, $3, $4, 'unlabeled') RETURNING *""",
                    filename, str(filepath), w, h
                )
                captured.append({
                    "id": row["id"],
                    "preset_id": preset_id,
                    "filename": filename,
                })
            except Exception as e:
                errors.append(f"DB insert error: {e}")
                try:
                    filepath.unlink()
                except:
                    pass

            # Wait before next shot
            if shot < data.shots_per_preset - 1:
                await asyncio.sleep(data.interval_sec)

    return {
        "success": True,
        "captured_count": len(captured),
        "preset_ids": data.preset_ids,
        "shots_per_preset": data.shots_per_preset,
        "images": captured,
        "errors": errors if errors else None,
    }


@router.post("/capture-single")
async def capture_single(camera_id: str, preset_id: int = 1):
    """Capture a single image and add to dataset."""
    frame, camera = capture_frame_direct(camera_id)
    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to capture frame")

    # Move to preset if specified
    if preset_id > 0:
        from src.cameras.ptz.ptz_controller import get_ptz_controller
        controller = get_ptz_controller(camera)
        if controller:
            try:
                await controller.goto_preset(preset_id)
                await asyncio.sleep(1.5)
                # Re-capture after movement
                frame, _ = capture_frame_direct(camera_id)
                if frame is None:
                    raise HTTPException(status_code=400, detail="Failed to capture after preset move")
            except Exception as e:
                pass  # Continue even if movement fails

    # Save image
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"single_p{preset_id}_{timestamp}.jpg"
    filepath = DATASET_DIR / filename
    cv2.imwrite(str(filepath), frame)

    h, w = frame.shape[:2]

    row = await db.fetchrow(
        """INSERT INTO ml_dataset_images (filename, filepath, original_width, original_height, label_status)
           VALUES ($1, $2, $3, $4, 'unlabeled') RETURNING *""",
        filename, str(filepath), w, h
    )

    return {
        "success": True,
        "image": dict(row),
    }