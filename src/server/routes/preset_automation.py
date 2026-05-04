"""Camera Preset Automation API routes - Config-based presets (System 1)."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from src.cameras.preset_service import preset_service
from src.cameras.ptz.ptz_controller import get_ptz_controller
from src.services.storage.config_service import ConfigService

router = APIRouter(prefix="/api/cameras", tags=["camera-presets"])
config_service = ConfigService()


# ── Request Models ─────────────────────────────────────

class PresetCreateRequest(BaseModel):
    preset_type: str = 'ptz_position'  # Default to ptz_position
    name: str
    config: Dict[str, Any] = {}


class PresetUpdateRequest(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


# ── CRUD Endpoints ─────────────────────────────────────

@router.get("/{camera_id}/presets-v2")
async def list_presets(camera_id: str):
    """List all presets for a camera."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    presets = preset_service.get_presets(camera_id)
    return {"camera_id": camera_id, "presets": presets}


@router.post("/{camera_id}/presets-v2", status_code=status.HTTP_201_CREATED)
async def create_preset(camera_id: str, req: PresetCreateRequest):
    """Create a new preset."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Only ptz_position supported in config-based system
    if req.preset_type not in ['ptz_position']:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid preset_type. Must be 'ptz_position' in config-based system"
        )

    try:
        preset = preset_service.create_preset(
            camera_id=camera_id,
            preset_type=req.preset_type,
            name=req.name,
            config=req.config or {}
        )
        return preset
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{camera_id}/presets-v2/{preset_id}")
async def update_preset(camera_id: str, preset_id: int, req: PresetUpdateRequest):
    """Update an existing preset."""
    existing = preset_service.get_preset_by_id(preset_id, camera_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Preset not found")

    updated = preset_service.update_preset(
        preset_id,
        camera_id=camera_id,
        name=req.name,
        config=req.config,
        is_active=req.is_active
    )
    return updated


@router.delete("/{camera_id}/presets-v2/{preset_id}")
async def delete_preset(camera_id: str, preset_id: int):
    """Delete a preset."""
    existing = preset_service.get_preset_by_id(preset_id, camera_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Preset not found")

    deleted = preset_service.delete_preset(preset_id, camera_id)
    return {"status": "deleted", "preset_id": preset_id}


# ── Save (Capture Current Position) ────────────────────

@router.post("/{camera_id}/presets-v2/{preset_id}/save")
async def save_preset_position(camera_id: str, preset_id: int):
    """Capture current PTZ position and save to preset config."""
    try:
        existing = preset_service.get_preset_by_id(preset_id, camera_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Preset not found")

        if existing.get('preset_type') != 'ptz_position':
            raise HTTPException(status_code=400, detail="Only ptz_position presets support save")

        camera = config_service.get_camera(camera_id)
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")

        controller = get_ptz_controller(camera)

        # Use hardware preset - save current position to the preset number
        result = await controller.set_preset(preset_id, existing.get('name', f'preset_{preset_id}'))

        # Update preset config in local storage (pan/tilt = 0 since hardware stores position)
        config = existing.get('config') or {}
        config['pan'] = 0
        config['tilt'] = 0

        updated = preset_service.update_preset(preset_id, camera_id=camera_id, config=config)
        return {
            "success": result.get("success", False),
            "message": result.get("message", "Đã lưu vào hardware preset"),
            "preset": updated
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── Execute Endpoint ───────────────────────────────────

@router.post("/{camera_id}/presets-v2/{preset_id}/execute")
async def execute_preset(camera_id: str, preset_id: int):
    """Execute a preset action (PTZ, snapshot, video, alert)."""
    existing = preset_service.get_preset_by_id(preset_id, camera_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Preset not found")

    result = await preset_service.execute_preset(preset_id, camera_id)
    return {
        "preset_id": preset_id,
        "camera_id": camera_id,
        "type": existing.get('preset_type', 'ptz_position'),
        **result
    }