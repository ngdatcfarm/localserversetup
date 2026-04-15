"""Device management API routes."""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.device_service import device_service
from src.sync.sync_service import sync_service

router = APIRouter(prefix="/api/devices", tags=["devices"])


# ── Request Models ──────────────────────────────────

class DeviceCreateRequest(BaseModel):
    device_code: Optional[str] = None  # Auto-generate if not provided
    name: str
    device_type_id: Optional[int] = None
    barn_id: Optional[str] = None
    mqtt_topic: Optional[str] = None  # Auto-generate from device_code if not provided


class DeviceUpdateRequest(BaseModel):
    name: Optional[str] = None
    device_type_id: Optional[int] = None
    barn_id: Optional[str] = None
    mqtt_topic: Optional[str] = None
    alert_offline: Optional[bool] = None


class DeviceTypeCreateRequest(BaseModel):
    code: str
    name: str
    channel_count: int = 0
    description: Optional[str] = None


class DeviceTypeUpdateRequest(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    channel_count: Optional[int] = None
    description: Optional[str] = None


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


@router.get("/types/{type_id}")
async def get_device_type(type_id: int):
    """Get a single device type."""
    dt = await device_service.get_type(type_id)
    if not dt:
        raise HTTPException(status_code=404, detail="Device type not found")
    return dt


@router.post("/types")
async def create_device_type(req: DeviceTypeCreateRequest):
    """Create a new device type."""
    return await device_service.create_type(req.model_dump())


@router.put("/types/{type_id}")
async def update_device_type(type_id: int, req: DeviceTypeUpdateRequest):
    """Update a device type."""
    dt = await device_service.get_type(type_id)
    if not dt:
        raise HTTPException(status_code=404, detail="Device type not found")
    await device_service.update_type(type_id, req.model_dump(exclude_none=True))
    return await device_service.get_type(type_id)


@router.delete("/types/{type_id}")
async def delete_device_type(type_id: int):
    """Delete a device type (fails if devices still use it)."""
    deleted = await device_service.delete_type(type_id)
    if not deleted:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete: device type is in use or not found"
        )
    return {"ok": True}


@router.post("")
async def create_device(req: DeviceCreateRequest):
    """Register a new IoT device."""
    result = await device_service.create(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    # Sync to cloud for remote device control
    if sync_service.config.get("cloud_url"):
        asyncio.create_task(sync_service.sync_barns_and_devices())
        asyncio.create_task(sync_service.send_notification_to_cloud(
            alert_type="SYSTEM_DEVICE_CREATED",
            title="🖥️ Thiết bị mới",
            body=f"Thiết bị '{req.name}' đã được thêm vào hệ thống",
            url="/devices"
        ))
    # Send local push notification
    asyncio.create_task(_send_local_notification(
        "info",
        "Thiết bị mới",
        f"Thiết bị '{req.name}' đã được thêm vào hệ thống"
    ))
    return result["device"]


async def _send_local_notification(severity: str, title: str, message: str):
    """Send notification to local subscribers."""
    try:
        from src.iot.notification_service import notification_service
        await notification_service.send_alert(severity, f"{title}: {message}")
    except Exception as e:
        logger = __import__('logging').getLogger(__name__)
        logger.debug(f"Local notification skipped: {e}")


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
    result = await device_service.update(device_id, req.model_dump(exclude_none=True))
    # Sync to cloud for remote device control
    if sync_service.config.get("cloud_url"):
        asyncio.create_task(sync_service.sync_barns_and_devices())
    return result


@router.delete("/{device_id}")
async def delete_device(device_id: int):
    """Delete a device."""
    deleted = await device_service.delete(device_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Device not found")
    # Sync to cloud for remote device control
    if sync_service.config.get("cloud_url"):
        asyncio.create_task(sync_service.sync_barns_and_devices())
    return {"ok": True}


# ── Test Command ───────────────────────────────────

@router.post("/{device_id}/test")
async def test_device(device_id: int):
    """Send test/ping command to device via MQTT."""
    result = await device_service.send_test(device_id)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/ping/{device_code}")
async def ping_device(device_code: str):
    """Send ping command to device by device_code."""
    device = await device_service.get_by_code(device_code)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    result = await device_service.send_test(device["id"])
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


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
