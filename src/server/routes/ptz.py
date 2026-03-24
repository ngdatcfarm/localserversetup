"""PTZ control API routes."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from src.services.storage.config_service import ConfigService
from src.cameras.ptz.ptz_controller import get_ptz_controller, PTZ_DIRECTIONS

router = APIRouter(prefix="/api/cameras", tags=["ptz"])
config_service = ConfigService()


class PTZMoveRequest(BaseModel):
    direction: str  # up, down, left, right
    speed: int = 6  # 1-10


class PresetSaveRequest(BaseModel):
    name: Optional[str] = None  # Tên preset (optional khi goto)


@router.post("/{camera_id}/ptz/move")
async def ptz_move(camera_id: str, req: PTZMoveRequest):
    """Bắt đầu di chuyển camera."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if req.direction not in PTZ_DIRECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid direction. Use: {list(PTZ_DIRECTIONS.keys())}")

    controller = get_ptz_controller(camera)
    result = await controller.move(req.direction, req.speed)

    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result


@router.post("/{camera_id}/ptz/stop")
async def ptz_stop(camera_id: str, req: PTZMoveRequest):
    """Dừng di chuyển camera."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if req.direction not in PTZ_DIRECTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid direction. Use: {list(PTZ_DIRECTIONS.keys())}")

    controller = get_ptz_controller(camera)
    result = await controller.stop(req.direction, req.speed)

    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result


# ── Preset Endpoints ──────────────────────────────────

@router.get("/{camera_id}/ptz/presets")
async def get_presets(camera_id: str):
    """Lấy danh sách presets của camera (từ hardware + local config)."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    # Lấy từ local config trước
    local_presets = config_service.get_presets(camera_id)

    # Thử lấy từ hardware camera
    try:
        controller = get_ptz_controller(camera)
        hw_result = await controller.list_presets()
        if hw_result.get("success"):
            hw_presets = hw_result.get("presets", {})
            hw_preset_list = hw_presets.get("Response", {}).get("Data", {}).get("Presets", [])
            return {
                "local": local_presets,
                "hardware": hw_preset_list
            }
    except Exception as e:
        pass

    return {"local": local_presets, "hardware": []}


@router.post("/{camera_id}/ptz/presets/{preset_number}/set")
async def set_preset(camera_id: str, preset_number: int, req: PresetSaveRequest = None):
    """Lưu vị trí hiện tại vào preset (relative position)."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if preset_number < 1 or preset_number > 255:
        raise HTTPException(status_code=400, detail="Preset number must be 1-255")

    name = req.name if req and req.name else f"preset_{preset_number}"

    # Lưu preset với relative position
    controller = get_ptz_controller(camera)
    result = await controller.set_preset(preset_number, name)

    return {"success": True, "preset": {"number": preset_number, "name": name, "pan": result.get("pan", 0), "tilt": result.get("tilt", 0)}, "method": result.get("method")}


@router.post("/{camera_id}/ptz/presets/{preset_number}/goto")
async def goto_preset(camera_id: str, preset_number: int):
    """Di chuyển camera đến vị trí preset (relative position)."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if preset_number < 1 or preset_number > 255:
        raise HTTPException(status_code=400, detail="Preset number must be 1-255")

    # Lấy preset từ config (có thể chứa relative position)
    presets = config_service.get_presets(camera_id)
    preset_data = None
    for p in presets:
        if p.get("number") == preset_number:
            preset_data = p
            break

    if not preset_data:
        raise HTTPException(status_code=404, detail="Preset not found")

    controller = get_ptz_controller(camera)

    # Nếu có relative position thì dùng, không thì thử hardware preset
    preset_pan = preset_data.get("pan", 0)
    preset_tilt = preset_data.get("tilt", 0)

    result = await controller.goto_preset(preset_number, preset_pan, preset_tilt)

    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])

    return {"success": True, "preset_number": preset_number, "method": result.get("method"), "target": {"pan": preset_pan, "tilt": preset_tilt}}


@router.delete("/{camera_id}/ptz/presets/{preset_number}")
async def delete_preset(camera_id: str, preset_number: int):
    """Xóa preset khỏi config."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    deleted = config_service.delete_preset(camera_id, preset_number)
    if not deleted:
        raise HTTPException(status_code=404, detail="Preset not found")

    return {"success": True, "message": f"Preset {preset_number} deleted"}


# ── Position Query ─────────────────────────────────────

@router.get("/{camera_id}/ptz/position")
async def get_ptz_position(camera_id: str):
    """Lấy vị trí tương đối của camera (Pan/Tilt) - server tracked."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    controller = get_ptz_controller(camera)
    pos = controller.get_relative_position()

    return {
        "success": True,
        "pan": pos.get("pan", 0),
        "tilt": pos.get("tilt", 0),
        "mode": "relative"
    }


@router.post("/{camera_id}/ptz/tare")
async def tare_position(camera_id: str):
    """Đặt vị trí hiện tại làm gốc tọa độ (Tare) - gọi hardware Rectify."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    controller = get_ptz_controller(camera)
    result = await controller.rectify()

    if not result["success"]:
        raise HTTPException(status_code=502, detail=result.get("message"))

    return result
