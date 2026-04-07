"""Farm management API routes - barns, cycles, inventory, care operations."""

from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

from src.farm.farm_service import farm_service
from src.farm.barn_service import barn_service
from src.farm.cycle_service import cycle_service
from src.farm.inventory_service import inventory_service
from src.farm.care_service import care_service

router = APIRouter(prefix="/api/farm", tags=["farm"])


# ── Enums ──────────────────────────────────────────

class WarehouseType(str, Enum):
    FEED = "feed"
    MEDICATION = "medication"
    EQUIPMENT = "equipment"
    CONSUMABLE = "consumable"
    MIXED = "mixed"

class ProductType(str, Enum):
    FEED = "feed"
    MEDICINE = "medicine"

class FeedMeal(str, Enum):
    SANG = "sang"
    TRUA = "trua"
    CHIEU = "chieu"
    TOI = "toi"
    ALL_DAY = "all_day"

class DeathCause(str, Enum):
    DISEASE = "disease"
    PREDATOR = "predator"
    HEAT = "heat"
    COLD = "cold"
    OTHER = "other"

class MedType(str, Enum):
    VACCINE = "vaccine"
    MEDICINE = "medicine"
    ANTIBIOTIC = "antibiotic"
    VITAMIN = "vitamin"
    PROBIOTIC = "probiotic"

class SaleType(str, Enum):
    SALE = "sale"
    CULL = "cull"


# ── Request Models ──────────────────────────────────

class FarmRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    name: str = Field(..., min_length=1, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    contact_name: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    contact_email: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    active: bool = True


class BarnRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    name: str = Field(..., min_length=1, max_length=200)
    farm_id: str = Field(default="farm-01", max_length=50)
    capacity: Optional[int] = Field(None, gt=0)
    area_sqm: Optional[float] = Field(None, gt=0)
    description: Optional[str] = Field(None, max_length=1000)
    active: Optional[bool] = True


class CycleRequest(BaseModel):
    barn_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    breed: Optional[str] = Field(None, max_length=100)
    initial_count: int = Field(..., gt=0)
    start_date: date
    expected_end_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)
    weight_remind_days: int = Field(default=7, ge=1, le=30)


class WarehouseRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    warehouse_type: WarehouseType = Field(default=WarehouseType.MIXED)
    barn_id: Optional[str] = Field(None, max_length=50)
    farm_id: Optional[str] = Field(default="farm-01", max_length=50)
    description: Optional[str] = Field(None, max_length=1000)
    is_central: bool = False
    active: bool = True


class ProductRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    product_type: ProductType
    unit: str = Field(default="kg", max_length=20)
    description: Optional[str] = Field(None, max_length=1000)


class ImportStockRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)
    supplier: Optional[str] = Field(None, max_length=200)
    unit_price: Optional[float] = Field(None, ge=0)
    batch_number: Optional[str] = Field(None, max_length=100)
    expiry_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class ExportStockRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)
    notes: Optional[str] = Field(None, max_length=500)


class TransferStockRequest(BaseModel):
    from_warehouse_id: int = Field(..., gt=0)
    to_warehouse_id: int = Field(..., gt=0)
    product_id: int = Field(..., gt=0)
    quantity: float = Field(..., gt=0)
    notes: Optional[str] = Field(None, max_length=500)


class FeedLogRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1, max_length=50)
    feed_date: date
    meal: FeedMeal = Field(default=FeedMeal.ALL_DAY)
    product_id: Optional[int] = Field(None, gt=0)
    quantity: float = Field(..., gt=0)
    remaining: Optional[float] = Field(None, ge=0)
    warehouse_id: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=500)


class DeathLogRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1, max_length=50)
    death_date: date
    count: int = Field(..., gt=0)
    cause: Optional[DeathCause] = None
    symptoms: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=500)


class MedicationLogRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1, max_length=50)
    med_date: date
    med_type: MedType
    product_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[float] = Field(None, gt=0)
    method: Optional[str] = Field(None, max_length=50)
    warehouse_id: Optional[int] = Field(None, gt=0)
    purpose: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)


class WeightLogRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1, max_length=50)
    weigh_date: date
    sample_count: int = Field(..., gt=0)
    total_weight: float = Field(..., gt=0)
    min_weight: Optional[float] = Field(None, ge=0)
    max_weight: Optional[float] = Field(None, ge=0)
    uniformity: Optional[float] = Field(None, ge=0, le=100)
    notes: Optional[str] = Field(None, max_length=500)


class SaleLogRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    barn_id: str = Field(..., min_length=1, max_length=50)
    sale_date: date
    count: int = Field(..., gt=0)
    total_weight: Optional[float] = Field(None, gt=0)
    avg_weight: Optional[float] = Field(None, gt=0)
    unit_price: Optional[float] = Field(None, ge=0)
    total_amount: Optional[float] = Field(None, ge=0)
    buyer: Optional[str] = Field(None, max_length=200)
    sale_type: SaleType = Field(default=SaleType.SALE)
    notes: Optional[str] = Field(None, max_length=500)


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
async def close_cycle(cycle_id: int, notes: str = None, force: bool = False):
    """Close a cycle. Validates feeds recorded unless force=true."""
    result = await cycle_service.close(cycle_id, notes, force)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


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


@router.delete("/care/feed/{feed_id}")
async def delete_feed(feed_id: int):
    """Delete a feed log and restore inventory."""
    result = await care_service.delete_feed(feed_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


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


@router.delete("/care/death/{death_id}")
async def delete_death(death_id: int):
    """Delete a death log and restore cycle count."""
    result = await care_service.delete_death(death_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


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


@router.delete("/care/medication/{med_id}")
async def delete_medication(med_id: int):
    """Delete a medication log and restore inventory."""
    result = await care_service.delete_medication(med_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


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


@router.delete("/care/weight/{weight_id}")
async def delete_weight(weight_id: int):
    """Delete a weight log."""
    result = await care_service.delete_weight(weight_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


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


@router.delete("/care/sale/{sale_id}")
async def delete_sale(sale_id: int):
    """Delete a sale log and restore cycle count."""
    result = await care_service.delete_sale(sale_id)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result
