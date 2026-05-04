"""Bat control API routes - for barn ventilation curtains/bats."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.bat_service import bat_service

router = APIRouter(prefix="/api/bats", tags=["bats"])


# ── Request Models ──────────────────────────────────

class BatUpdateRequest(BaseModel):
    name: Optional[str] = None
    device_id: Optional[int] = None
    up_relay_channel: Optional[int] = None
    down_relay_channel: Optional[int] = None
    auto_enabled: Optional[bool] = None
    timeout_seconds: Optional[int] = None


# ── Bat CRUD ────────────────────────────────────────

@router.get("/barns/{barn_id}")
async def list_bats(barn_id: str):
    """Get all bats for a barn."""
    return await bat_service.list_by_barn(barn_id)


@router.get("/{bat_id}")
async def get_bat(bat_id: int):
    """Get single bat details."""
    bat = await bat_service.get(bat_id)
    if not bat:
        raise HTTPException(status_code=404, detail="Bat not found")
    return bat


@router.put("/{bat_id}")
async def update_bat(bat_id: int, data: BatUpdateRequest):
    """Update bat configuration."""
    bat = await bat_service.get(bat_id)
    if not bat:
        raise HTTPException(status_code=404, detail="Bat not found")

    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        return {"ok": False, "message": "No fields to update"}

    result = await bat_service.update(bat_id, update_data)
    return result


# ── Bat Movement Commands ────────────────────────────

@router.post("/{bat_id}/up")
async def move_up(bat_id: int):
    """Start bat moving UP."""
    result = await bat_service.move_up(bat_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed"))
    return result


@router.post("/{bat_id}/down")
async def move_down(bat_id: int):
    """Start bat moving DOWN."""
    result = await bat_service.move_down(bat_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed"))
    return result


@router.post("/{bat_id}/stop")
async def stop_bat(bat_id: int):
    """Stop bat movement."""
    result = await bat_service.stop(bat_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed"))
    return result


# ── Bat Logs ────────────────────────────────────────

@router.get("/{bat_id}/logs")
async def get_bat_logs(bat_id: int, limit: int = 50):
    """Get movement history for a bat."""
    return await bat_service.get_logs(bat_id, limit)


@router.get("/barns/{barn_id}/logs")
async def get_barn_bat_logs(barn_id: str, limit: int = 100):
    """Get movement history for all bats in a barn."""
    return await bat_service.get_logs_by_barn(barn_id, limit)
