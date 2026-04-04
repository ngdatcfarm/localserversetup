"""Farm management API routes - barns, cycles, inventory, care operations."""

from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.farm.farm_service import farm_service
from src.farm.barn_service import barn_service
from src.farm.cycle_service import cycle_service
from src.farm.inventory_service import inventory_service
from src.farm.care_service import care_service

router = APIRouter(prefix="/api/farm", tags=["farm"])


# ── Request Models ──────────────────────────────────

class FarmRequest(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True


class BarnRequest(BaseModel):
    id: str
    name: str
    farm_id: str = "farm-01"  # Default to farm-01 for backward compatibility
    capacity: Optional[int] = None
    area_sqm: Optional[float] = None
    description: Optional[str] = None
    active: Optional[bool] = True


class CycleRequest(BaseModel):
    barn_id: str
    name: str
    breed: Optional[str] = None
    initial_count: int
    start_date: date
    expected_end_date: Optional[date] = None
    notes: Optional[str] = None
    weight_remind_days: int = 7


class WarehouseRequest(BaseModel):
    code: str
    name: str
    warehouse_type: Optional[str] = "mixed"  # 'feed', 'medication', 'equipment', 'consumable', 'mixed'
    barn_id: Optional[str] = None
    farm_id: str = "farm-01"
    description: Optional[str] = None
    is_central: bool = False
    active: bool = True


class ProductRequest(BaseModel):
    code: str
    name: str
    product_type: str            # 'feed' or 'medicine'
    unit: str = "kg"
    description: Optional[str] = None


class ImportStockRequest(BaseModel):
    warehouse_id: int
    product_id: int
    quantity: float
    supplier: Optional[str] = None
    unit_price: Optional[float] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class ExportStockRequest(BaseModel):
    warehouse_id: int
    product_id: int
    quantity: float
    notes: Optional[str] = None


class TransferStockRequest(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    product_id: int
    quantity: float
    notes: Optional[str] = None


class FeedLogRequest(BaseModel):
    cycle_id: int
    barn_id: str
    feed_date: date
    meal: str = "all_day"
    product_id: Optional[int] = None
    quantity: float
    remaining: Optional[float] = None
    warehouse_id: Optional[int] = None
    notes: Optional[str] = None


class DeathLogRequest(BaseModel):
    cycle_id: int
    barn_id: str
    death_date: date
    count: int
    cause: Optional[str] = None
    symptoms: Optional[str] = None
    notes: Optional[str] = None


class MedicationLogRequest(BaseModel):
    cycle_id: int
    barn_id: str
    med_date: date
    med_type: str                # 'medicine', 'vaccine', 'vitamin', 'probiotic'
    product_id: Optional[int] = None
    quantity: Optional[float] = None
    method: Optional[str] = None  # 'water', 'inject', 'spray', 'feed'
    warehouse_id: Optional[int] = None
    purpose: Optional[str] = None
    notes: Optional[str] = None


class WeightLogRequest(BaseModel):
    cycle_id: int
    barn_id: str
    weigh_date: date
    sample_count: int
    total_weight: float
    min_weight: Optional[float] = None
    max_weight: Optional[float] = None
    uniformity: Optional[float] = None
    notes: Optional[str] = None


class SaleLogRequest(BaseModel):
    cycle_id: int
    barn_id: str
    sale_date: date
    count: int
    total_weight: Optional[float] = None
    avg_weight: Optional[float] = None
    unit_price: Optional[float] = None
    total_amount: Optional[float] = None
    buyer: Optional[str] = None
    sale_type: str = "sale"       # 'sale' or 'cull'
    notes: Optional[str] = None


# ══════════════════════════════════════════════════════
# FARMS
# ══════════════════════════════════════════════════════

@router.get("/farms")
async def list_farms(active_only: bool = True):
    """List all farms."""
    return await farm_service.list_all(active_only)


@router.post("/farms")
async def create_farm(req: FarmRequest):
    """Create a new farm."""
    result = await farm_service.create(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["farm"]


@router.get("/farms/{farm_id}")
async def get_farm(farm_id: str):
    """Get farm details with barn and warehouse counts."""
    farm = await farm_service.get_summary(farm_id)
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm


@router.put("/farms/{farm_id}")
async def update_farm(farm_id: str, req: FarmRequest):
    """Update farm fields."""
    result = await farm_service.update(farm_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result["farm"]


@router.delete("/farms/{farm_id}")
async def delete_farm(farm_id: str):
    """Delete a farm. Cannot delete if farm has barns or warehouses."""
    result = await farm_service.delete(farm_id)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ══════════════════════════════════════════════════════
# BARNS
# ══════════════════════════════════════════════════════

@router.get("/barns")
async def list_barns(farm_id: str = None, active_only: bool = True):
    """List barns, optionally filtered by farm_id."""
    return await barn_service.list_all(farm_id, active_only)


@router.post("/barns")
async def create_barn(req: BarnRequest):
    result = await barn_service.create(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["barn"]


@router.get("/barns/{barn_id}")
async def get_barn(barn_id: str):
    barn = await barn_service.get_summary(barn_id)
    if not barn:
        raise HTTPException(status_code=404, detail="Barn not found")
    return barn


@router.put("/barns/{barn_id}")
async def update_barn(barn_id: str, req: BarnRequest):
    result = await barn_service.update(barn_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result["barn"]


@router.delete("/barns/{barn_id}")
async def delete_barn(barn_id: str):
    """Delete a barn. Cannot delete if barn has an active cycle."""
    result = await barn_service.delete(barn_id)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ══════════════════════════════════════════════════════
# CYCLES
# ══════════════════════════════════════════════════════

@router.get("/cycles")
async def list_cycles(barn_id: str = None, status: str = None):
    return await cycle_service.list_all(barn_id, status)


@router.post("/cycles")
async def create_cycle(req: CycleRequest):
    result = await cycle_service.create(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["cycle"]


@router.get("/cycles/{cycle_id}")
async def get_cycle(cycle_id: int):
    cycle = await cycle_service.get(cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return cycle


@router.get("/cycles/{cycle_id}/dashboard")
async def get_cycle_dashboard(cycle_id: int):
    """Get cycle overview with all KPIs."""
    data = await cycle_service.get_dashboard(cycle_id)
    if not data:
        raise HTTPException(status_code=404, detail="Cycle not found")
    return data


@router.put("/cycles/{cycle_id}")
async def update_cycle(cycle_id: int, req: CycleRequest):
    return await cycle_service.update(cycle_id, req.model_dump(exclude_none=True))


@router.post("/cycles/{cycle_id}/close")
async def close_cycle(cycle_id: int, notes: str = None):
    return await cycle_service.close(cycle_id, notes)


@router.get("/cycles/{cycle_id}/snapshots")
async def get_daily_snapshots(cycle_id: int, days: int = 30):
    return await cycle_service.get_daily_snapshots(cycle_id, days)


# ══════════════════════════════════════════════════════
# INVENTORY (Kho)
# ══════════════════════════════════════════════════════

@router.get("/warehouses")
async def list_warehouses(warehouse_type: str = None, barn_id: str = None, farm_id: str = None):
    """List warehouses with optional filters."""
    return await inventory_service.list_warehouses(warehouse_type, barn_id, farm_id)


@router.post("/warehouses")
async def create_warehouse(req: WarehouseRequest):
    result = await inventory_service.create_warehouse(req.model_dump())
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["warehouse"]


@router.get("/warehouses/{warehouse_id}")
async def get_warehouse(warehouse_id: str):
    """Get warehouse details."""
    wh = await inventory_service.get_warehouse(warehouse_id)
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return wh


@router.put("/warehouses/{warehouse_id}")
async def update_warehouse(warehouse_id: str, req: WarehouseRequest):
    """Update warehouse."""
    result = await inventory_service.update_warehouse(warehouse_id, req.model_dump(exclude_none=True))
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result["warehouse"]


@router.delete("/warehouses/{warehouse_id}")
async def delete_warehouse(warehouse_id: str):
    """Delete warehouse. Cannot delete if has inventory."""
    result = await inventory_service.delete_warehouse(warehouse_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Warehouse Zones ────────────────────────────────────

@router.get("/warehouse-zones")
async def list_warehouse_zones(warehouse_id: str = None):
    """List warehouse zones."""
    return await inventory_service.list_warehouse_zones(warehouse_id)


@router.post("/warehouse-zones")
async def create_warehouse_zone(warehouse_id: int, name: str, zone_type: str = "storage"):
    """Create a warehouse zone."""
    result = await inventory_service.create_warehouse_zone({
        "warehouse_id": warehouse_id,
        "name": name,
        "zone_type": zone_type,
    })
    return result["zone"]


@router.delete("/warehouse-zones/{zone_id}")
async def delete_warehouse_zone(zone_id: int):
    """Delete a warehouse zone."""
    result = await inventory_service.delete_warehouse_zone(zone_id)
    return result


@router.get("/products")
async def list_products(product_type: str = None):
    return await inventory_service.list_products(product_type)


@router.post("/products")
async def create_product(req: ProductRequest):
    result = await inventory_service.create_product(req.model_dump())
    return result["product"]


@router.get("/inventory")
async def get_stock(warehouse_id: int = None, product_type: str = None):
    return await inventory_service.get_stock(warehouse_id, product_type)


@router.post("/inventory/import")
async def import_stock(req: ImportStockRequest):
    result = await inventory_service.import_stock(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/inventory/export")
async def export_stock(req: ExportStockRequest):
    result = await inventory_service.export_stock(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/inventory/transfer")
async def transfer_stock(req: TransferStockRequest):
    result = await inventory_service.transfer_stock(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/inventory/transactions")
async def get_transactions(warehouse_id: int = None, product_id: int = None,
                           limit: int = 50):
    return await inventory_service.get_transactions(warehouse_id, product_id, limit)


# ══════════════════════════════════════════════════════
# CARE: FEED (Cho ăn)
# ══════════════════════════════════════════════════════

@router.post("/care/feed")
async def log_feed(req: FeedLogRequest):
    result = await care_service.log_feed(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/care/feed/{cycle_id}")
async def get_feeds(cycle_id: int, days: int = 30):
    return await care_service.get_feeds(cycle_id, days)


@router.get("/care/feed/{cycle_id}/daily")
async def get_daily_feed(cycle_id: int, days: int = 30):
    return await care_service.get_daily_feed_summary(cycle_id, days)


# ══════════════════════════════════════════════════════
# CARE: MORTALITY (Tử vong)
# ══════════════════════════════════════════════════════

@router.post("/care/death")
async def log_death(req: DeathLogRequest):
    result = await care_service.log_death(req.model_dump())
    return result


@router.get("/care/death/{cycle_id}")
async def get_deaths(cycle_id: int, days: int = 30):
    return await care_service.get_deaths(cycle_id, days)


@router.get("/care/death/{cycle_id}/daily")
async def get_daily_deaths(cycle_id: int, days: int = 30):
    return await care_service.get_daily_death_summary(cycle_id, days)


# ══════════════════════════════════════════════════════
# CARE: MEDICATION (Thuốc/Vaccine)
# ══════════════════════════════════════════════════════

@router.post("/care/medication")
async def log_medication(req: MedicationLogRequest):
    result = await care_service.log_medication(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.get("/care/medication/{cycle_id}")
async def get_medications(cycle_id: int):
    return await care_service.get_medications(cycle_id)


# ══════════════════════════════════════════════════════
# CARE: WEIGHT (Cân trọng lượng)
# ══════════════════════════════════════════════════════

@router.post("/care/weight")
async def log_weight(req: WeightLogRequest):
    result = await care_service.log_weight(req.model_dump())
    return result


@router.get("/care/weight/{cycle_id}")
async def get_weights(cycle_id: int):
    return await care_service.get_weights(cycle_id)


@router.get("/care/weight/reminders")
async def get_weight_reminders(cycle_id: int = None):
    return await care_service.get_weight_reminders(cycle_id)


@router.put("/care/weight/reminders/{cycle_id}")
async def update_weight_reminder(cycle_id: int, remind_every_days: int = None,
                                  next_remind_date: date = None,
                                  enabled: bool = None):
    return await care_service.update_weight_reminder(cycle_id, {
        "remind_every_days": remind_every_days,
        "next_remind_date": next_remind_date,
        "enabled": enabled,
    })


# ══════════════════════════════════════════════════════
# CARE: SALES (Xuất bán)
# ══════════════════════════════════════════════════════

@router.post("/care/sale")
async def log_sale(req: SaleLogRequest):
    result = await care_service.log_sale(req.model_dump())
    return result


@router.get("/care/sale/{cycle_id}")
async def get_sales(cycle_id: int):
    return await care_service.get_sales(cycle_id)
