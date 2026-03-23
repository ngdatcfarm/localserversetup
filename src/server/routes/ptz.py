"""PTZ control API routes."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from src.services.storage.config_service import ConfigService
from src.cameras.ptz.ptz_controller import get_ptz_controller, PTZ_DIRECTIONS

router = APIRouter(prefix="/api/cameras", tags=["ptz"])
config_service = ConfigService()


class PTZMoveRequest(BaseModel):
    direction: str  # up, down, left, right
    speed: int = 6  # 1-10


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
