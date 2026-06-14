"""AI Logic Routes - CRUD + execute endpoints."""

from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from src.iot.ai_logic_service import ai_logic_service
from src.server.auth import require_auth

router = APIRouter(prefix="/api/ai-logic", tags=["ai-logic"], dependencies=[Depends(require_auth)])


# ── Request models ─────────────────────────────────────

class StepModel(BaseModel):
    action_type: str
    camera_id: Optional[str] = None
    preset_id: Optional[int] = None
    duration_seconds: Optional[int] = 0
    config: Optional[dict] = {}


class CreateRuleModel(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: Optional[bool] = True
    trigger_type: str  # 'schedule', 'manual'
    cron_expression: Optional[str] = None
    cooldown_seconds: Optional[int] = 60
    steps: list[StepModel] = []


class UpdateRuleModel(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    trigger_type: Optional[str] = None
    cron_expression: Optional[str] = None
    cooldown_seconds: Optional[int] = None
    steps: Optional[list[StepModel]] = None


# ── CRUD ────────────────────────────────────────────────

@router.get("/rules")
async def list_rules():
    rules = await ai_logic_service.list_rules()
    return {"rules": rules}


@router.post("/rules")
async def create_rule(data: CreateRuleModel):
    rule = await ai_logic_service.create_rule(data.model_dump())
    return {"ok": True, "rule": rule}


@router.get("/rules/{rule_id}")
async def get_rule(rule_id: int):
    rule = await ai_logic_service.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, data: UpdateRuleModel):
    rule = await ai_logic_service.update_rule(rule_id, data.model_dump(exclude_unset=True))
    return {"ok": True, "rule": rule}


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int):
    deleted = await ai_logic_service.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


@router.post("/rules/{rule_id}/execute")
async def execute_rule(rule_id: int):
    result = await ai_logic_service.execute_rule(rule_id)
    return result


@router.post("/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, enabled: bool = True):
    result = await ai_logic_service.toggle_rule(rule_id, enabled)
    return result


# ── Direct count endpoint (for testing without creating a rule) ────

class CountTestModel(BaseModel):
    camera_id: str
    snapshot_count: int = 5
    snapshot_interval: float = 0.5
    count_method: str = "max"
    preset_id: Optional[int] = None
    # YOLO options
    class_filter: Optional[list[int]] = [14]  # COCO bird
    # Density options
    avg_pixels_per_object: float = 3000
    lower_hsv: Optional[list[int]] = [10, 30, 60]
    upper_hsv: Optional[list[int]] = [40, 255, 255]


@router.post("/count-test")
async def count_test(data: CountTestModel):
    """Test count objects on a camera without creating a rule."""
    from src.services.storage.config_service import ConfigService
    from src.cameras.ptz.ptz_controller import get_ptz_controller
    from src.ai.training_service import training_service

    # Goto preset 1
    result = {"preset_moved": False}
    config_svc = ConfigService()
    camera = config_svc.get_camera(data.camera_id)
    if camera:
        controller = get_ptz_controller(camera)
        if controller:
            preset_result = await controller.goto_preset(data.preset_id or 1)
            result["preset_moved"] = preset_result.get("ok", False)

    # Capture burst
    from src.services.storage.snapshot_service import snapshot_service
    burst = await snapshot_service.capture_burst(
        camera_id=data.camera_id,
        count=data.snapshot_count,
        interval_sec=data.snapshot_interval,
    )
    result["burst_captured"] = len([r for r in burst if r.get("success")])
    result["burst_results"] = burst

    image_paths = [r["path"] for r in burst if r.get("success") and r.get("path")]

    # Use YOLO model if available, otherwise fall back to density
    model_path = training_service.get_model_path()
    if model_path:
        from src.ai.ai_counting_service import AICountingService
        # Create instance with custom model and LOW confidence for crowded scenes
        yolo_service = AICountingService(model_name=model_path, confidence=0.01)
        if image_paths:
            yolo_result = yolo_service.count_from_paths(
                image_paths=image_paths,
                class_filter=[0],  # Use class 0 for custom model (chick)
                count_method=data.count_method,
            )
            # Generate debug image with bounding boxes
            debug_img_path = yolo_service.generate_debug_image(image_paths[0], class_filter=[0])
            result["count"] = yolo_result.count
            result["frame_counts"] = yolo_result.frame_counts
            result["frames_analyzed"] = yolo_result.images_processed
            result["method"] = "yolo_custom"
            result["model_path"] = model_path
            # Return relative path from E:\AI\Snapshots
            if debug_img_path:
                rel_path = str(Path(debug_img_path)).replace("E:\\AI\\Snapshots\\", "").replace("\\", "/")
                result["debug_image"] = rel_path
            else:
                result["debug_image"] = None
            result["success"] = True
    else:
        # Count using density method
        from src.ai.density_counting_service import density_counting_service
        if image_paths:
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
            result["method"] = "density"
            result["avg_pixels_per_object"] = data.avg_pixels_per_object
            result["debug_image"] = density_result.debug_image_path
            result["success"] = True
        else:
            result["count"] = 0
            result["success"] = False

    return result