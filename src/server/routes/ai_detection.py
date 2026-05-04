"""AI Detection Routes - YOLO-based chicken detection with heatmap and auto-tune."""

import asyncio
import cv2
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.storage.config_service import ConfigService
from src.cameras.ptz.ptz_controller import get_ptz_controller
from src.ai.chicken_detect_service import chicken_detect_service
from src.ai.heatmap_service import heatmap_service

router = APIRouter(prefix="/api/ai", tags=["ai-detection"])


class DetectRequest(BaseModel):
    camera_id: str
    preset_id: int = 1
    snapshot_count: int = 3
    move_to_preset: bool = True
    confidence: float = 0.5
    grid_size: int = 4


class HeatmapRequest(BaseModel):
    camera_id: str
    preset_id: int = 1
    confidence: float = 0.5
    grid_size: int = 6


class AutoTuneRequest(BaseModel):
    camera_id: str
    preset_id: int = 1
    conf_thresholds: list[float] = [0.3, 0.4, 0.5, 0.6, 0.7]
    radii: list[int] = [80, 120, 150, 200, 250]


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


@router.post("/detect")
async def detect_chickens(data: DetectRequest):
    """Run YOLO detection on camera feed with enhanced debug info."""
    # Validate camera_id
    if not data.camera_id or data.camera_id.strip() == "":
        raise HTTPException(status_code=400, detail="camera_id is required")

    result = {"success": False, "camera_id": data.camera_id}

    # Move to preset if requested
    if data.move_to_preset:
        camera = None
        config_svc = ConfigService()
        camera = config_svc.get_camera(data.camera_id)
        if camera:
            controller = get_ptz_controller(camera)
            if controller:
                preset_result = await controller.goto_preset(data.preset_id)
                result["preset_moved"] = preset_result.get("ok", False)
                await asyncio.sleep(2)  # Wait for PTZ movement

    # Capture frame directly
    frame, camera_obj = capture_frame_direct(data.camera_id)
    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to capture frame from camera")

    # Save temp frame for detection
    timestamp = Path("E:/AI/Snapshots") / f"{data.camera_id}_temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    Path("E:/AI/Snapshots").mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(timestamp), frame)

    # Run detection
    detect_result = chicken_detect_service.detect_from_image(
        image_path=str(timestamp),
        conf=data.confidence,
        grid_size=data.grid_size,
    )

    # Cleanup temp file
    try:
        timestamp.unlink()
    except:
        pass

    return {
        "success": detect_result.success,
        "total_chickens": int(detect_result.total_chickens),
        "total_feeders": int(detect_result.total_feeders),
        "feeder_counts": [int(x) for x in detect_result.feeder_counts],
        "density_grid": [[int(v) for v in row] for row in detect_result.density_grid],
        "density_max": int(detect_result.density_max),
        "density_level": str(detect_result.density_level),
        "debug_image": detect_result.debug_image,
        "message": detect_result.message,
        # Enhanced debug info
        "confidence_distribution": detect_result.confidence_distribution,
        "avg_confidence": detect_result.avg_confidence,
        "all_boxes": detect_result.all_boxes,
    }


@router.post("/detect/heatmap")
async def generate_heatmap(data: HeatmapRequest):
    """Generate density heatmap from camera feed."""
    # Move to preset if needed
    config_svc = ConfigService()
    camera = config_svc.get_camera(data.camera_id)
    if camera:
        controller = get_ptz_controller(camera)
        if controller:
            await controller.goto_preset(data.preset_id)
            await asyncio.sleep(2)

    # Capture frame
    frame, _ = capture_frame_direct(data.camera_id)
    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to capture frame")

    # Save temp frame
    timestamp = Path("E:/AI/Snapshots") / f"{data.camera_id}_hm_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    Path("E:/AI/Snapshots").mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(timestamp), frame)

    # Run detection
    detect_result = chicken_detect_service.detect_from_image(
        image_path=str(timestamp),
        conf=data.confidence,
        grid_size=data.grid_size,
    )

    if not detect_result.success:
        try:
            timestamp.unlink()
        except:
            pass
        raise HTTPException(status_code=500, detail=detect_result.message)

    # Extract chicken centroids
    chicken_points = []
    for box in detect_result.all_boxes:
        if box["class"] == 0:  # chick
            chicken_points.append(tuple(box["center"]))

    # Generate heatmap
    heatmap_path = heatmap_service.generate_heatmap(
        image_path=str(timestamp),
        points=chicken_points,
        grid_size=data.grid_size,
    )

    # Cleanup temp
    try:
        timestamp.unlink()
    except:
        pass

    if heatmap_path is None:
        raise HTTPException(status_code=500, detail="Failed to generate heatmap")

    return {
        "success": True,
        "heatmap_image": heatmap_path.replace("E:\\AI\\Snapshots\\", "").replace("\\", "/"),
        "total_chickens": detect_result.total_chickens,
        "points": chicken_points,
        "density_grid": detect_result.density_grid,
        "density_max": detect_result.density_max,
        "density_level": detect_result.density_level,
    }


@router.post("/detect/auto-tune")
async def auto_tune_threshold(data: AutoTuneRequest):
    """
    Auto-tune detection parameters:
    - Tests multiple confidence thresholds
    - Tests multiple feeder radii
    - Returns optimal configuration
    """
    results = []

    # Test confidence thresholds
    config_svc = ConfigService()
    camera = config_svc.get_camera(data.camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    controller = None
    if data.preset_id > 0:
        controller = get_ptz_controller(camera)
        if controller:
            await controller.goto_preset(data.preset_id)
            await asyncio.sleep(2)

    for conf in data.conf_thresholds:
        frame, _ = capture_frame_direct(data.camera_id)
        if frame is None:
            continue

        # Save temp frame
        tmp_path = Path("E:/AI/Snapshots") / f"tune_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        cv2.imwrite(str(tmp_path), frame)

        detect_result = chicken_detect_service.detect_from_image(
            image_path=str(tmp_path),
            conf=conf,
            grid_size=4,
        )

        try:
            tmp_path.unlink()
        except:
            pass

        results.append({
            "confidence": conf,
            "chickens": detect_result.total_chickens,
            "feeders": detect_result.total_feeders,
            "avg_confidence": detect_result.avg_confidence,
        })

    # Test radii
    radius_results = []
    if controller:
        for radius in data.radii:
            chicken_detect_service.set_radius(radius)
            # Re-run with same frame
            frame, _ = capture_frame_direct(data.camera_id)
            if frame is None:
                continue

            tmp_path = Path("E:/AI/Snapshots") / f"tune_r_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            cv2.imwrite(str(tmp_path), frame)

            detect_result = chicken_detect_service.detect_from_image(
                image_path=str(tmp_path),
                conf=0.5,
                grid_size=4,
            )

            try:
                tmp_path.unlink()
            except:
                pass

            radius_results.append({
                "radius": radius,
                "feeder_counts": detect_result.feeder_counts,
                "total_chickens": detect_result.total_chickens,
            })

    # Reset to default radius
    chicken_detect_service.set_radius(150)

    # Find best confidence (highest chickens with reasonable conf)
    best_conf = 0.5
    best_score = 0
    for r in results:
        score = r["chickens"] * r["avg_confidence"]
        if score > best_score:
            best_score = score
            best_conf = r["confidence"]

    return {
        "success": True,
        "best_confidence": best_conf,
        "confidence_test_results": results,
        "radius_test_results": radius_results,
        "default_radius": 150,
        "current_radius": chicken_detect_service._radius_px,
    }


@router.get("/detect/status")
async def get_detect_status():
    """Check if YOLO model is loaded."""
    return {
        "model_loaded": chicken_detect_service._model is not None,
        "model_path": chicken_detect_service._model_path,
    }


@router.post("/detect/load-model")
async def load_model(model_path: str = None):
    """Load YOLO model."""
    success = chicken_detect_service.load_model(model_path)
    return {"success": success, "model_path": chicken_detect_service._model_path}


@router.get("/detect/progress")
async def get_training_progress():
    """Get training progress (delegated to training_service)."""
    from src.ai.training_service import training_service
    return await training_service.get_progress()