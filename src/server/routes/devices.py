"""Device management API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.device_service import device_service

router = APIRouter(prefix="/api/devices", tags=["devices"])


# ── Request Models ──────────────────────────────────

class DeviceCreateRequest(BaseModel):
    device_code: str
    name: str
    device_type_id: Optional[int] = None
    barn_id: Optional[str] = None
    mqtt_topic: str


class DeviceUpdateRequest(BaseModel):
    name: Optional[str] = None
    device_type_id: Optional[int] = None
    barn_id: Optional[str] = None
    mqtt_topic: Optional[str] = None
    alert_offline: Optional[bool] = None


class ChannelConfig(BaseModel):
    channel_number: int
    function: Optional[str] = None
    name: Optional[str] = None
    gpio_pin: Optional[int] = None


# ── Device CRUD ─────────────────────────────────────

@router.get("")
async def list_devices(barn_id: str = None):
    """List all devices, optionally filter by barn."""
    return await device_service.list_all(barn_id)


@router.get("/types")
async def list_device_types():
    """List available device types."""
    return await device_service.list_types()


@router.post("")
async def create_device(req: DeviceCreateRequest):
    """Register a new IoT device."""
    result = await device_service.create(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result["device"]


@router.get("/{device_id}")
async def get_device(device_id: int):
    """Get device details."""
    device = await device_service.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}")
async def update_device(device_id: int, req: DeviceUpdateRequest):
    """Update device configuration."""
    device = await device_service.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return await device_service.update(device_id, req.model_dump(exclude_none=True))


@router.delete("/{device_id}")
async def delete_device(device_id: int):
    """Delete a device."""
    deleted = await device_service.delete(device_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"ok": True}


# ── Channels ────────────────────────────────────────

@router.get("/{device_id}/channels")
async def get_channels(device_id: int):
    """Get device channel configuration."""
    return await device_service.get_channels(device_id)


@router.put("/{device_id}/channels")
async def set_channels(device_id: int, channels: list[ChannelConfig]):
    """Set device channels (replaces all)."""
    device = await device_service.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return await device_service.set_channels(
        device_id, [ch.model_dump() for ch in channels]
    )


# ── Device States ───────────────────────────────────

@router.get("/{device_id}/states")
async def get_device_states(device_id: int):
    """Get current state of all channels."""
    return await device_service.get_states(device_id)
