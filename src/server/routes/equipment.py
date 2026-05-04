"""Equipment API routes - CRUD for equipment types and equipment instances."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.equipment_service import equipment_service

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


# ── Request Models ──────────────────────────────────

class EquipmentTypeCreate(BaseModel):
    code: str
    name: str
    product_id: Optional[int] = None
    power_watts: Optional[int] = None
    voltage_v: Optional[int] = None
    current_amp: Optional[float] = None
    mqtt_protocol: Optional[dict] = None
    description: Optional[str] = None


class EquipmentTypeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    product_id: Optional[int] = None
    power_watts: Optional[int] = None
    voltage_v: Optional[int] = None
    current_amp: Optional[float] = None
    mqtt_protocol: Optional[dict] = None
    description: Optional[str] = None


class EquipmentCreate(BaseModel):
    barn_id: Optional[str] = None
    equipment_type_id: Optional[int] = None
    name: str
    equipment_type: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    power_watts: Optional[int] = None
    status: Optional[str] = 'active'
    install_date: Optional[str] = None
    warranty_until: Optional[str] = None
    purchase_price: Optional[float] = None
    maintenance_interval_days: Optional[int] = None
    notes: Optional[str] = None


class EquipmentUpdate(BaseModel):
    barn_id: Optional[str] = None
    equipment_type_id: Optional[int] = None
    name: Optional[str] = None
    equipment_type: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    power_watts: Optional[int] = None
    status: Optional[str] = None
    install_date: Optional[str] = None
    warranty_until: Optional[str] = None
    purchase_price: Optional[float] = None
    maintenance_interval_days: Optional[int] = None
    notes: Optional[str] = None


class ChannelAssignRequest(BaseModel):
    device_id: int
    channel_number: int
    changed_by: Optional[str] = "system"


# ── Equipment Types ─────────────────────────────────

@router.get("/types")
async def list_equipment_types():
    """Get all equipment types."""
    return await equipment_service.list_equipment_types()


@router.post("/types")
async def create_equipment_type(data: EquipmentTypeCreate):
    """Create new equipment type."""
    result = await equipment_service.create_equipment_type(data.model_dump())
    return result


@router.get("/types/{type_id}")
async def get_equipment_type(type_id: int):
    """Get single equipment type."""
    equip_type = await equipment_service.get_equipment_type(type_id)
    if not equip_type:
        raise HTTPException(status_code=404, detail="Equipment type not found")
    return equip_type


@router.put("/types/{type_id}")
async def update_equipment_type(type_id: int, data: EquipmentTypeUpdate):
    """Update equipment type."""
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        return {"ok": False, "message": "No fields to update"}
    result = await equipment_service.update_equipment_type(type_id, update_data)
    return result


@router.delete("/types/{type_id}")
async def delete_equipment_type(type_id: int):
    """Delete equipment type (check for existing equipment)."""
    result = await equipment_service.delete_equipment_type(type_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Equipment ───────────────────────────────────────

@router.get("")
async def list_equipment(barn_id: Optional[str] = None,
                         equipment_type_id: Optional[int] = None):
    """Get equipment list with optional filters."""
    return await equipment_service.list_equipment(barn_id, equipment_type_id)


@router.post("")
async def create_equipment(data: EquipmentCreate):
    """Create new equipment instance."""
    result = await equipment_service.create_equipment(data.model_dump())
    return result


@router.get("/{equipment_id}")
async def get_equipment(equipment_id: int):
    """Get single equipment with details."""
    equip = await equipment_service.get_equipment(equipment_id)
    if not equip:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return equip


@router.put("/{equipment_id}")
async def update_equipment(equipment_id: int, data: EquipmentUpdate):
    """Update equipment instance."""
    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        return {"ok": False, "message": "No fields to update"}
    result = await equipment_service.update_equipment(equipment_id, update_data)
    return result


@router.delete("/{equipment_id}")
async def delete_equipment(equipment_id: int):
    """Delete equipment (check for active channel assignment)."""
    result = await equipment_service.delete_equipment(equipment_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Channel Assignment ──────────────────────────────

@router.post("/{equipment_id}/assign")
async def assign_channel(equipment_id: int, data: ChannelAssignRequest):
    """Assign equipment to a device relay channel."""
    result = await equipment_service.assign_channel(
        equipment_id, data.device_id, data.channel_number, data.changed_by
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/{equipment_id}/unassign")
async def unassign_channel(equipment_id: int, changed_by: str = "system"):
    """Remove equipment from device channel."""
    result = await equipment_service.unassign_channel(equipment_id, changed_by)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/{equipment_id}/logs")
async def get_assignment_logs(equipment_id: int, limit: int = 50):
    """Get assignment history for equipment."""
    return await equipment_service.get_assignment_logs(equipment_id, limit)


@router.get("/{equipment_id}/commands")
async def get_command_logs(equipment_id: int, limit: int = 50):
    """Get command history for equipment."""
    return await equipment_service.get_command_logs(equipment_id, limit)