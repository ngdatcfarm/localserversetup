"""Extended farm routes - feeds, medications, vaccines, suppliers, health."""

from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from src.farm.feed_service import feed_service
from src.farm.medication_service import medication_service
from src.farm.vaccine_service import vaccine_service
from src.farm.supplier_service import supplier_service
from src.farm.health_service import health_service

router = APIRouter(prefix="/api/farm", tags=["farm-extended"])


# ── Request Models ──────────────────────────────────

class FeedBrandRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    kg_per_bag: Optional[float] = Field(None, gt=0)
    note: Optional[str] = Field(None, max_length=500)
    status: str = Field(default="active", max_length=20)

class FeedTypeRequest(BaseModel):
    feed_brand_id: Optional[int] = Field(None, gt=0)
    code: Optional[str] = Field(None, max_length=50)
    price_per_bag: Optional[float] = Field(None, ge=0)
    name: str = Field(..., min_length=1, max_length=200)
    suggested_stage: Optional[str] = Field(None, max_length=100)
    note: Optional[str] = Field(None, max_length=500)
    status: str = Field(default="active", max_length=20)

class MedicationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    unit: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    price_per_unit: Optional[float] = Field(None, ge=0)
    recommended_dose: Optional[str] = Field(None, max_length=200)
    note: Optional[str] = Field(None, max_length=500)
    status: str = Field(default="active", max_length=20)

class SupplierRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=500)
    note: Optional[str] = Field(None, max_length=500)
    status: str = Field(default="active", max_length=20)

class VaccineProgramRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(None, max_length=500)
    active: bool = True

class VaccineProgramItemRequest(BaseModel):
    vaccine_name: str = Field(..., min_length=1, max_length=200)
    day_age: int = Field(..., ge=0)
    method: Optional[str] = Field(None, max_length=100)
    remind_days: int = Field(default=1, ge=0)
    sort_order: int = Field(default=0, ge=0)
    vaccine_brand_id: Optional[int] = Field(None, gt=0)

class VaccineScheduleRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    vaccine_name: str = Field(..., min_length=1, max_length=200)
    scheduled_date: Optional[date] = None
    day_age_target: Optional[int] = Field(None, ge=0)
    method: Optional[str] = Field(None, max_length=100)
    dosage: Optional[str] = Field(None, max_length=100)
    remind_days: int = Field(default=1, ge=0)
    vaccine_brand_id: Optional[int] = Field(None, gt=0)
    program_item_id: Optional[int] = Field(None, gt=0)

class ApplyProgramRequest(BaseModel):
    program_id: int = Field(..., gt=0)

class HealthNoteRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    recorded_at: Optional[date] = None
    severity: str = Field(default="low", max_length=20)
    symptoms: Optional[str] = Field(None, max_length=1000)
    image_path: Optional[str] = Field(None, max_length=500)

class WeightSessionRequest(BaseModel):
    cycle_id: int = Field(..., gt=0)
    weighed_at: Optional[date] = None
    sample_count: int = Field(default=0, ge=0)
    avg_weight_g: Optional[float] = Field(None, gt=0)
    note: Optional[str] = Field(None, max_length=500)
    details: Optional[list] = None


# ══════════════════════════════════════════════════════
# FEED BRANDS
# ══════════════════════════════════════════════════════

@router.get("/feed-brands")
async def list_feed_brands(status: str = None):
    return await feed_service.list_brands(status)

@router.post("/feed-brands")
async def create_feed_brand(req: FeedBrandRequest):
    result = await feed_service.create_brand(req.model_dump())
    return result["brand"]

@router.get("/feed-brands/{brand_id}")
async def get_feed_brand(brand_id: int):
    brand = await feed_service.get_brand(brand_id)
    if not brand:
        raise HTTPException(404, "Brand not found")
    return brand

@router.put("/feed-brands/{brand_id}")
async def update_feed_brand(brand_id: int, req: FeedBrandRequest):
    result = await feed_service.update_brand(brand_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["brand"]

@router.delete("/feed-brands/{brand_id}")
async def delete_feed_brand(brand_id: int):
    result = await feed_service.delete_brand(brand_id)
    if not result["ok"]:
        raise HTTPException(400, result["message"])
    return result


# ══════════════════════════════════════════════════════
# FEED TYPES
# ══════════════════════════════════════════════════════

@router.get("/feed-types")
async def list_feed_types(brand_id: int = None, status: str = None):
    return await feed_service.list_types(brand_id, status)

@router.post("/feed-types")
async def create_feed_type(req: FeedTypeRequest):
    result = await feed_service.create_type(req.model_dump())
    return result["feed_type"]

@router.get("/feed-types/{type_id}")
async def get_feed_type(type_id: int):
    ft = await feed_service.get_type(type_id)
    if not ft:
        raise HTTPException(404, "Feed type not found")
    return ft

@router.put("/feed-types/{type_id}")
async def update_feed_type(type_id: int, req: FeedTypeRequest):
    result = await feed_service.update_type(type_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["feed_type"]

@router.delete("/feed-types/{type_id}")
async def delete_feed_type(type_id: int):
    result = await feed_service.delete_type(type_id)
    if not result["ok"]:
        raise HTTPException(400, result["message"])
    return result


# ══════════════════════════════════════════════════════
# MEDICATIONS
# ══════════════════════════════════════════════════════

@router.get("/medications")
async def list_medications(category: str = None, status: str = None):
    return await medication_service.list_all(category, status)

@router.post("/medications")
async def create_medication(req: MedicationRequest):
    result = await medication_service.create(req.model_dump())
    return result["medication"]

@router.get("/medications/{med_id}")
async def get_medication(med_id: int):
    med = await medication_service.get(med_id)
    if not med:
        raise HTTPException(404, "Medication not found")
    return med

@router.put("/medications/{med_id}")
async def update_medication(med_id: int, req: MedicationRequest):
    result = await medication_service.update(med_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["medication"]

@router.delete("/medications/{med_id}")
async def delete_medication(med_id: int):
    result = await medication_service.delete(med_id)
    if not result["ok"]:
        raise HTTPException(400, result["message"])
    return result


# ══════════════════════════════════════════════════════
# SUPPLIERS
# ══════════════════════════════════════════════════════

@router.get("/suppliers")
async def list_suppliers(status: str = None):
    return await supplier_service.list_all(status)

@router.post("/suppliers")
async def create_supplier(req: SupplierRequest):
    result = await supplier_service.create(req.model_dump())
    return result["supplier"]

@router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: int):
    s = await supplier_service.get(supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: int, req: SupplierRequest):
    result = await supplier_service.update(supplier_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["supplier"]

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: int):
    result = await supplier_service.delete(supplier_id)
    if not result["ok"]:
        raise HTTPException(400, result["message"])
    return result


# ══════════════════════════════════════════════════════
# VACCINE PROGRAMS
# ══════════════════════════════════════════════════════

@router.get("/vaccine-programs")
async def list_vaccine_programs(active_only: bool = True):
    return await vaccine_service.list_programs(active_only)

@router.post("/vaccine-programs")
async def create_vaccine_program(req: VaccineProgramRequest):
    result = await vaccine_service.create_program(req.model_dump())
    return result["program"]

@router.get("/vaccine-programs/{program_id}")
async def get_vaccine_program(program_id: int):
    p = await vaccine_service.get_program(program_id)
    if not p:
        raise HTTPException(404, "Program not found")
    return p

@router.put("/vaccine-programs/{program_id}")
async def update_vaccine_program(program_id: int, req: VaccineProgramRequest):
    result = await vaccine_service.update_program(program_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["program"]

@router.delete("/vaccine-programs/{program_id}")
async def delete_vaccine_program(program_id: int):
    return await vaccine_service.delete_program(program_id)

# ── Program Items ────

@router.post("/vaccine-programs/{program_id}/items")
async def add_program_item(program_id: int, req: VaccineProgramItemRequest):
    result = await vaccine_service.add_program_item(program_id, req.model_dump())
    return result["item"]

@router.put("/vaccine-programs/items/{item_id}")
async def update_program_item(item_id: int, req: VaccineProgramItemRequest):
    result = await vaccine_service.update_program_item(item_id, req.model_dump(exclude_none=True))
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["item"]

@router.delete("/vaccine-programs/items/{item_id}")
async def delete_program_item(item_id: int):
    return await vaccine_service.delete_program_item(item_id)


# ══════════════════════════════════════════════════════
# VACCINE SCHEDULES
# ══════════════════════════════════════════════════════

@router.get("/vaccine-schedules")
async def list_vaccine_schedules(cycle_id: int):
    return await vaccine_service.list_schedules(cycle_id)

@router.get("/vaccine-schedules/upcoming")
async def get_upcoming_vaccines(days: int = 7):
    return await vaccine_service.get_upcoming(days)

@router.post("/vaccine-schedules")
async def create_vaccine_schedule(req: VaccineScheduleRequest):
    result = await vaccine_service.create_schedule(req.model_dump())
    return result["schedule"]

@router.post("/vaccine-schedules/apply-program")
async def apply_program(cycle_id: int, req: ApplyProgramRequest):
    result = await vaccine_service.apply_program_to_cycle(cycle_id, req.program_id)
    if not result["ok"]:
        raise HTTPException(400, result["message"])
    return result

@router.post("/vaccine-schedules/{schedule_id}/done")
async def mark_vaccine_done(schedule_id: int, notes: str = None):
    result = await vaccine_service.mark_done(schedule_id, notes)
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["schedule"]

@router.post("/vaccine-schedules/{schedule_id}/skip")
async def skip_vaccine(schedule_id: int, reason: str = None):
    result = await vaccine_service.mark_skipped(schedule_id, reason)
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["schedule"]

@router.delete("/vaccine-schedules/{schedule_id}")
async def delete_vaccine_schedule(schedule_id: int):
    return await vaccine_service.delete_schedule(schedule_id)


# ══════════════════════════════════════════════════════
# HEALTH NOTES
# ══════════════════════════════════════════════════════

@router.get("/health-notes")
async def list_health_notes(cycle_id: int):
    return await health_service.list_notes(cycle_id)

@router.post("/health-notes")
async def create_health_note(req: HealthNoteRequest):
    result = await health_service.create_note(req.model_dump())
    return result["note"]

@router.post("/health-notes/{note_id}/resolve")
async def resolve_health_note(note_id: int):
    result = await health_service.resolve_note(note_id)
    if not result["ok"]:
        raise HTTPException(404, result["message"])
    return result["note"]

@router.delete("/health-notes/{note_id}")
async def delete_health_note(note_id: int):
    return await health_service.delete_note(note_id)


# ══════════════════════════════════════════════════════
# WEIGHT SESSIONS
# ══════════════════════════════════════════════════════

@router.get("/weight-sessions")
async def list_weight_sessions(cycle_id: int):
    return await health_service.list_weight_sessions(cycle_id)

@router.post("/weight-sessions")
async def create_weight_session(req: WeightSessionRequest):
    result = await health_service.create_weight_session(req.model_dump())
    return result["session"]

@router.get("/weight-sessions/{session_id}")
async def get_weight_session(session_id: int):
    s = await health_service.get_weight_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s

@router.delete("/weight-sessions/{session_id}")
async def delete_weight_session(session_id: int):
    return await health_service.delete_weight_session(session_id)
