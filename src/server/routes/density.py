"""Density Routes - HSV-based density analysis without ML."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path

router = APIRouter(prefix="/api/density", tags=["density"])


class DensityCountModel(BaseModel):
    camera_id: str
    preset_id: int = 1
    snapshot_count: int = 3
    snapshot_interval: float = 0.5
    count_method: str = "max"
    avg_pixels_per_object: float = 3000
    hsv_ranges: list = None  # Multi-range HSV
    lower_hsv: list[int] = [10, 30, 60]
    upper_hsv: list[int] = [40, 255, 255]
    move_to_preset: bool = True  # Set false to skip PTZ movement


class CalibrateModel(BaseModel):
    camera_id: str
    preset_id: int = 1
    lower_hsv: list[int] = [10, 30, 60]
    upper_hsv: list[int] = [40, 255, 255]
    avg_pixels_per_object: float = 3000
    move_to_preset: bool = True


@router.post("/count")
async def density_count(data: DensityCountModel):
    """Count using HSV density analysis - no ML model needed."""
    from src.services.storage.config_service import ConfigService
    from src.cameras.ptz.ptz_controller import get_ptz_controller
    from src.services.storage.snapshot_service import snapshot_service
    from src.ai.density_counting_service import density_counting_service

    result = {"preset_moved": False}

    # Goto preset only if move_to_preset is True
    if data.move_to_preset:
        config_svc = ConfigService()
        camera = config_svc.get_camera(data.camera_id)
        if camera:
            controller = get_ptz_controller(camera)
            if controller:
                preset_result = await controller.goto_preset(data.preset_id)
                result["preset_moved"] = preset_result.get("ok", False)
                # Wait for PTZ movement to complete
                await asyncio.sleep(2)

    # Capture burst
    burst = await snapshot_service.capture_burst(
        camera_id=data.camera_id,
        count=data.snapshot_count,
        interval_sec=data.snapshot_interval,
    )
    result["burst_captured"] = len([r for r in burst if r.get("success")])

    image_paths = [r["path"] for r in burst if r.get("success") and r.get("path")]

    if image_paths:
        # Use multi-range if provided
        if data.hsv_ranges:
            density_config = {
                "avg_pixels_per_object": data.avg_pixels_per_object,
                "hsv_ranges": data.hsv_ranges,
            }
            results = []
            for path in image_paths:
                r = density_counting_service.count_from_image_multirange(path, density_config)
                results.append(r)

            if data.count_method == "max":
                count = max(r.estimated_count for r in results)
                total_pixels = max(r.total_pixels for r in results)
                contour_count = sum(r.contour_count for r in results)
            else:
                count = int(sum(r.estimated_count for r in results) / len(results))
                total_pixels = int(sum(r.total_pixels for r in results) / len(results))
                contour_count = int(sum(r.contour_count for r in results) / len(results))

            pixel_pct = sum(r.pixel_percentage for r in results) / len(results)
            result["count"] = count
            result["total_pixels"] = total_pixels
            result["contour_count"] = contour_count
            result["pixel_percentage"] = round(pixel_pct, 2)
            result["frames_analyzed"] = len(image_paths)
            if results[0].debug_image_path:
                result["debug_image"] = str(Path(results[0].debug_image_path)).replace("E:\\AI\\Snapshots\\", "").replace("\\", "/")
            result["method"] = "hsv_multirange"
        else:
            density_config = {
                "avg_pixels_per_object": data.avg_pixels_per_object,
                "lower_hsv": data.lower_hsv,
                "upper_hsv": data.upper_hsv,
            }
            density_result = density_counting_service.count_from_paths(
                image_paths=image_paths,
                config=density_config,
                method=data.count_method,
            )
            result["count"] = density_result.estimated_count
            result["total_pixels"] = density_result.total_pixels
            result["contour_count"] = density_result.contour_count
            result["pixel_percentage"] = density_result.pixel_percentage
            result["frames_analyzed"] = len(image_paths)
            if density_result.debug_image_path:
                result["debug_image"] = str(Path(density_result.debug_image_path)).replace("E:\\AI\\Snapshots\\", "").replace("\\", "/")
            result["method"] = "hsv_density"

        # Calculate density level
        pct = result["pixel_percentage"]
        if pct < 10:
            result["density_level"] = "Thưa"
            result["density_alert"] = False
        elif pct < 30:
            result["density_level"] = "Bình thường"
            result["density_alert"] = False
        elif pct < 50:
            result["density_level"] = "Đông"
            result["density_alert"] = True
        else:
            result["density_level"] = "Rất đông - Cảnh báo!"
            result["density_alert"] = True
        result["success"] = True
    else:
        result["success"] = False
        result["count"] = 0
        result["message"] = "No snapshots captured"

    return result


@router.post("/calibrate")
async def calibrate(data: CalibrateModel):
    """Get mask preview for calibration."""
    from src.services.storage.config_service import ConfigService
    from src.cameras.ptz.ptz_controller import get_ptz_controller
    from src.services.storage.snapshot_service import snapshot_service
    from src.ai.density_counting_service import density_counting_service

    # Goto preset only if move_to_preset is True
    if data.move_to_preset:
        config_svc = ConfigService()
        camera = config_svc.get_camera(data.camera_id)
        if camera:
            controller = get_ptz_controller(camera)
            if controller:
                await controller.goto_preset(data.preset_id)

    # Capture single frame
    burst = await snapshot_service.capture_burst(
        camera_id=data.camera_id,
        count=1,
        interval_sec=0.1,
    )

    image_paths = [r["path"] for r in burst if r.get("success") and r.get("path")]

    if not image_paths:
        return {"success": False, "error": "No snapshot captured"}

    # Create mask preview
    config = {
        "lower_hsv": data.lower_hsv,
        "upper_hsv": data.upper_hsv,
        "avg_pixels_per_object": data.avg_pixels_per_object,
    }
    preview_result = density_counting_service.create_mask_preview(image_paths[0], config)

    return {
        "success": True,
        "image_path": image_paths[0].replace("E:\\AI\\Snapshots\\", "").replace("\\", "/"),
        "preview": preview_result,
    }
