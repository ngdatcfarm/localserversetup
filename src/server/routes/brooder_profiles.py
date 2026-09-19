"""Brooder Profile Management REST API.

Endpoints (all auth-required via require_auth):
    Phase 1 + 2 — full CRUD + safety-validated stage editor + time-boxed
    test overrides.

    GET    /api/brooder/profiles/profiles                   — list (?active_only=true)
    POST   /api/brooder/profiles/profiles                   — create
    GET    /api/brooder/profiles/profiles/{id}              — get + nested schedules
    PUT    /api/brooder/profiles/profiles/{id}              — update (replace schedules if provided)
    DELETE /api/brooder/profiles/profiles/{id}              — soft-delete (?hard=true for hard)
    POST   /api/brooder/profiles/profiles/{id}/schedules    — add single stage
    PUT    /api/brooder/profiles/profiles/{id}/schedules/{sid}  — update stage
    DELETE /api/brooder/profiles/profiles/{id}/schedules/{sid}  — delete stage
    GET    /api/brooder/profiles/profiles/{id}/stages-resolved  — preview (?day_age=N&night=true)
    POST   /api/brooder/profiles/profiles/{id}/apply-test   — apply test to a cycle
    GET    /api/brooder/profiles/profiles/test/{cycle_id}    — get active test
    DELETE /api/brooder/profiles/profiles/test/{cycle_id}    — clear test

The actual integration (resolving profile to setpoint, sweeper, MQTT
extension) lives in `src.iot.brooder_service.{BrooderController,
ZoneController}`.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator

from src.services.database.db import db
from src.server.auth import require_auth
from src.iot.brooder_service import (
    brooder_controller,
    zone_controller,
    MAX_SAFE_TEMPERATURE,
)

logger = logging.getLogger(__name__)

# Firmware constants (mirror esp32_brooder.ino).
# EMERGENCY_LATCH_C — firmware latch cutoff. A profile's heater_zone_limit
# may NEVER exceed this, otherwise the firmware will clamp and the value
# in the seed/SPA is misleading.
FIRMWARE_EMERGENCY_LATCH_C = 35.1

router = APIRouter(
    prefix="/api/brooder/profiles",
    tags=["brooder-profiles"],
    dependencies=[Depends(require_auth)],
)


# ============================================================
# Pydantic models
# ============================================================


class SafetyLimits(BaseModel):
    """Safety envelope — mirrors firmware constants. Validated as a unit
    so release < cutoff always holds, and cutoff is capped at the firmware
    EMERGENCY_LATCH_C value (35.1)."""
    emergency_cutoff_temp: float = Field(
        35.1, ge=10.0, le=FIRMWARE_EMERGENCY_LATCH_C,
        description="°C; firmware latch cutoff. Must be ≤ firmware cap (35.1).",
    )
    emergency_release_temp: float = Field(
        34.6, ge=10.0, le=FIRMWARE_EMERGENCY_LATCH_C,
        description="°C; firmware release temp. Must be < cutoff.",
    )
    min_ambient_temp: float = Field(
        5.0, ge=-10.0, le=30.0,
        description="°C; below this, heating is forced regardless of profile.",
    )

    @validator("emergency_release_temp")
    def release_below_cutoff(cls, v, values):
        cutoff = values.get("emergency_cutoff_temp")
        if cutoff is not None and v >= cutoff:
            raise ValueError(
                f"emergency_release_temp ({v}) must be < emergency_cutoff_temp ({cutoff})"
            )
        return v


class ScheduleStage(BaseModel):
    """One day-age stage in a profile. Validated against firmware caps
    (setpoint ≤ MAX_SAFE_TEMPERATURE; heater_zone_limit ≤ 35.1)."""
    stage_order: int = Field(..., ge=1, le=20)
    day_range_start: int = Field(..., ge=1, le=365)
    day_range_end: int = Field(..., ge=1, le=999)
    setpoint_target: float = Field(..., ge=15.0, le=MAX_SAFE_TEMPERATURE,
        description="°C target; capped at MAX_SAFE_TEMPERATURE (34.6)")
    heater_zone_limit: float = Field(..., ge=15.0, le=FIRMWARE_EMERGENCY_LATCH_C,
        description="°C; firmware clamp is 35.1, must not exceed.")
    humidity_min_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    humidity_max_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    night_boost_offset: float = Field(0.0, ge=0.0, le=2.0)
    notes: Optional[str] = Field(None, max_length=500)

    @validator("day_range_end")
    def end_after_start(cls, v, values):
        start = values.get("day_range_start")
        if start is not None and v < start:
            raise ValueError(
                f"day_range_end ({v}) must be >= day_range_start ({start})"
            )
        return v

    @validator("humidity_max_pct")
    def humidity_max_above_min(cls, v, values):
        minv = values.get("humidity_min_pct")
        if v is not None and minv is not None and v < minv:
            raise ValueError(
                f"humidity_max_pct ({v}) must be >= humidity_min_pct ({minv})"
            )
        return v


class ProfileCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64,
        description="Unique handle, e.g. 'hill_chicken_standard'")
    name: str = Field(..., min_length=1, max_length=128)
    species: Optional[str] = Field(None, max_length=64)
    description: Optional[str] = Field(None, max_length=2000)
    safety: SafetyLimits = Field(default_factory=SafetyLimits)
    schedules: List[ScheduleStage] = Field(default_factory=list)
    is_active: bool = True


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    species: Optional[str] = Field(None, max_length=64)
    description: Optional[str] = Field(None, max_length=2000)
    safety: Optional[SafetyLimits] = None
    schedules: Optional[List[ScheduleStage]] = None
    is_active: Optional[bool] = None


class ProfileOut(BaseModel):
    id: int
    code: str
    name: str
    species: Optional[str]
    description: Optional[str]
    safety: SafetyLimits
    is_active: bool
    created_at: datetime
    updated_at: datetime
    schedules: List[ScheduleStage] = Field(default_factory=list)


class ScheduleCreate(BaseModel):
    """Single stage add — same shape as ScheduleStage."""
    stage_order: int = Field(..., ge=1, le=20)
    day_range_start: int = Field(..., ge=1, le=365)
    day_range_end: int = Field(..., ge=1, le=999)
    setpoint_target: float = Field(..., ge=15.0, le=MAX_SAFE_TEMPERATURE)
    heater_zone_limit: float = Field(..., ge=15.0, le=FIRMWARE_EMERGENCY_LATCH_C)
    humidity_min_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    humidity_max_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    night_boost_offset: float = Field(0.0, ge=0.0, le=2.0)
    notes: Optional[str] = Field(None, max_length=500)

    @validator("day_range_end")
    def end_after_start(cls, v, values):
        start = values.get("day_range_start")
        if start is not None and v < start:
            raise ValueError(f"day_range_end ({v}) must be >= day_range_start ({start})")
        return v

    @validator("humidity_max_pct")
    def humidity_max_above_min(cls, v, values):
        minv = values.get("humidity_min_pct")
        if v is not None and minv is not None and v < minv:
            raise ValueError(f"humidity_max_pct ({v}) must be >= humidity_min_pct ({minv})")
        return v


class ScheduleUpdate(BaseModel):
    stage_order: Optional[int] = Field(None, ge=1, le=20)
    day_range_start: Optional[int] = Field(None, ge=1, le=365)
    day_range_end: Optional[int] = Field(None, ge=1, le=999)
    setpoint_target: Optional[float] = Field(None, ge=15.0, le=MAX_SAFE_TEMPERATURE)
    heater_zone_limit: Optional[float] = Field(None, ge=15.0, le=FIRMWARE_EMERGENCY_LATCH_C)
    humidity_min_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    humidity_max_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    night_boost_offset: Optional[float] = Field(None, ge=0.0, le=2.0)
    notes: Optional[str] = Field(None, max_length=500)


class TestApplyRequest(BaseModel):
    cycle_id: int = Field(..., ge=1)
    hours: int = Field(2, ge=1, le=168,
        description="Hours until auto-expiry (1h-7d, default 2h).")
    note: Optional[str] = Field(None, max_length=500)


class TestAssignmentOut(BaseModel):
    id: int
    cycle_id: int
    profile_id: int
    profile_code: Optional[str] = None
    expires_at: datetime
    started_at: datetime
    cleared_at: Optional[datetime] = None
    cleared_reason: Optional[str] = None
    note: Optional[str] = None


# ============================================================
# Pure-Python validator (cross-stage)
# ============================================================

def _validate_stages(stages: List[ScheduleStage]) -> None:
    """Run after the per-stage Pydantic validators.

    Rules:
      1. No overlaps in day_range across stages.
      2. Setpoint descending across stages (later stage ≤ earlier).

    Raises HTTPException(400) on violation.
    """
    if not stages:
        return  # an empty profile is allowed (no schedules yet)

    sorted_stages = sorted(stages, key=lambda s: s.day_range_start)
    # Overlap check
    for i in range(len(sorted_stages) - 1):
        a = sorted_stages[i]
        b = sorted_stages[i + 1]
        # a.end >= b.start → overlap
        if a.day_range_end >= b.day_range_start:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Giai đoạn {a.stage_order} (ngày {a.day_range_start}-{a.day_range_end}) "
                    f"bị trùng với giai đoạn {b.stage_order} (ngày {b.day_range_start}-{b.day_range_end})."
                ),
            )
    # Setpoint descending (within ±0.01 tolerance for floating point).
    # We check using stage_order rather than day_range — admin's chosen
    # ordering is the source of truth.
    by_order = sorted(stages, key=lambda s: s.stage_order)
    for i in range(len(by_order) - 1):
        prev_sp = by_order[i].setpoint_target
        cur_sp = by_order[i + 1].setpoint_target
        if cur_sp - prev_sp > 0.01:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Setpoint giai đoạn {by_order[i + 1].stage_order} ({cur_sp}°C) "
                    f"phải nhỏ hơn hoặc bằng giai đoạn {by_order[i].stage_order} ({prev_sp}°C)."
                ),
            )


# ============================================================
# Helpers
# ============================================================

def _invalidate_caches() -> None:
    """Notify both controllers that profile state may have changed."""
    try:
        brooder_controller.invalidate_profile_cache()
    except Exception as e:
        logger.debug(f"invalidate_profile_cache (brooder) failed: {e}")
    try:
        zone_controller.invalidate_profile_cache()
    except Exception as e:
        logger.debug(f"invalidate_profile_cache (zone) failed: {e}")


def _row_to_safety(r: dict) -> SafetyLimits:
    return SafetyLimits(
        emergency_cutoff_temp=float(r.get("emergency_cutoff_temp", 35.1)),
        emergency_release_temp=float(r.get("emergency_release_temp", 34.6)),
        min_ambient_temp=float(r.get("min_ambient_temp", 5.0)),
    )


def _row_to_stage(r: dict) -> ScheduleStage:
    """Build a ScheduleStage from a DB row WITHOUT running validators.

    We use ``model_construct`` because the seed row (and any future
    grandfathered data imported before the firmware cap was tightened)
    may carry a ``heater_zone_limit`` value that exceeds today's
    ``FIRMWARE_EMERGENCY_LATCH_C`` ceiling. The API still rejects NEW
    edits above the ceiling (see ``ScheduleStage`` / ``ScheduleCreate``
    validators); reads must not.
    """
    return ScheduleStage.model_construct(
        stage_order=int(r["stage_order"]),
        day_range_start=int(r["day_range_start"]),
        day_range_end=int(r["day_range_end"]),
        setpoint_target=float(r["setpoint_target"]),
        heater_zone_limit=float(r["heater_zone_limit"]),
        humidity_min_pct=(float(r["humidity_min_pct"])
                          if r.get("humidity_min_pct") is not None else None),
        humidity_max_pct=(float(r["humidity_max_pct"])
                          if r.get("humidity_max_pct") is not None else None),
        night_boost_offset=float(r.get("night_boost_offset", 0.0)),
        notes=r.get("notes"),
    )


def _row_to_profile_out(r: dict, schedules: List[ScheduleStage]) -> ProfileOut:
    return ProfileOut(
        id=int(r["id"]),
        code=r["code"],
        name=r["name"],
        species=r.get("species"),
        description=r.get("description"),
        safety=_row_to_safety(r),
        is_active=bool(r.get("is_active", True)),
        created_at=r["created_at"],
        updated_at=r["updated_at"],
        schedules=schedules,
    )


async def _load_profile_full(profile_id: int) -> ProfileOut:
    row = await db.fetchrow(
        "SELECT * FROM brooder_profiles WHERE id = $1", profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    sched_rows = await db.fetch(
        "SELECT * FROM brooder_profile_schedules WHERE profile_id = $1 "
        "ORDER BY stage_order",
        profile_id,
    )
    stages = [_row_to_stage(dict(r)) for r in sched_rows]
    return _row_to_profile_out(dict(row), stages)


# ============================================================
# Endpoints
# ============================================================

@router.get("/profiles", response_model=List[ProfileOut])
async def list_profiles(active_only: bool = Query(False)):
    """List all profiles (optionally only active)."""
    where = "WHERE is_active = TRUE" if active_only else ""
    rows = await db.fetch(
        f"SELECT * FROM brooder_profiles {where} ORDER BY code"
    )
    if not rows:
        return []
    # Bulk-load schedules for all profiles to avoid N+1
    ids = [r["id"] for r in rows]
    sched_rows = await db.fetch(
        "SELECT * FROM brooder_profile_schedules WHERE profile_id = ANY($1::int[]) "
        "ORDER BY profile_id, stage_order",
        ids,
    )
    sched_by: dict = {}
    for sr in sched_rows:
        sched_by.setdefault(sr["profile_id"], []).append(_row_to_stage(dict(sr)))
    return [_row_to_profile_out(dict(r), sched_by.get(r["id"], [])) for r in rows]


@router.post("/profiles", response_model=ProfileOut, status_code=201)
async def create_profile(data: ProfileCreate):
    """Create a new profile + nested schedules atomically."""
    # Code uniqueness (belt + suspenders with the UNIQUE constraint)
    existing = await db.fetchrow(
        "SELECT id FROM brooder_profiles WHERE code = $1", data.code
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Mã hồ sơ '{data.code}' đã tồn tại",
        )
    _validate_stages(data.schedules)
    async with db.transaction() as tx:
        row = await tx.fetchrow(
            """
            INSERT INTO brooder_profiles (
                code, name, species, description,
                emergency_cutoff_temp, emergency_release_temp, min_ambient_temp,
                temperature_unit, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'celsius', $8)
            RETURNING *
            """,
            data.code, data.name, data.species, data.description,
            data.safety.emergency_cutoff_temp,
            data.safety.emergency_release_temp,
            data.safety.min_ambient_temp,
            data.is_active,
        )
        new_id = row["id"]
        for s in data.schedules:
            await tx.execute(
                """
                INSERT INTO brooder_profile_schedules (
                    profile_id, stage_order, day_range_start, day_range_end,
                    setpoint_target, heater_zone_limit,
                    humidity_min_pct, humidity_max_pct,
                    night_boost_offset, notes
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                new_id, s.stage_order, s.day_range_start, s.day_range_end,
                s.setpoint_target, s.heater_zone_limit,
                s.humidity_min_pct, s.humidity_max_pct,
                s.night_boost_offset, s.notes,
            )
    _invalidate_caches()
    return await _load_profile_full(new_id)


@router.get("/profiles/{profile_id}", response_model=ProfileOut)
async def get_profile(profile_id: int):
    return await _load_profile_full(profile_id)


@router.put("/profiles/{profile_id}", response_model=ProfileOut)
async def update_profile(profile_id: int, data: ProfileUpdate):
    """Update mutable fields. If `schedules` is provided, REPLACE all stages
    atomically (admin-driven bulk edit)."""
    row = await db.fetchrow(
        "SELECT id FROM brooder_profiles WHERE id = $1", profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")

    if data.schedules is not None:
        _validate_stages(data.schedules)

    async with db.transaction() as tx:
        sets, vals = [], []
        if data.name is not None:
            sets.append(f"name = ${len(vals)+1}")
            vals.append(data.name)
        if data.species is not None:
            sets.append(f"species = ${len(vals)+1}")
            vals.append(data.species)
        if data.description is not None:
            sets.append(f"description = ${len(vals)+1}")
            vals.append(data.description)
        if data.safety is not None:
            sets.append(f"emergency_cutoff_temp = ${len(vals)+1}")
            vals.append(data.safety.emergency_cutoff_temp)
            sets.append(f"emergency_release_temp = ${len(vals)+1}")
            vals.append(data.safety.emergency_release_temp)
            sets.append(f"min_ambient_temp = ${len(vals)+1}")
            vals.append(data.safety.min_ambient_temp)
        if data.is_active is not None:
            sets.append(f"is_active = ${len(vals)+1}")
            vals.append(data.is_active)
        if sets:
            vals.append(profile_id)
            sql = f"UPDATE brooder_profiles SET {', '.join(sets)} WHERE id = ${len(vals)}"
            await tx.execute(sql, *vals)

        if data.schedules is not None:
            # Replace-all semantics
            await tx.execute(
                "DELETE FROM brooder_profile_schedules WHERE profile_id = $1",
                profile_id,
            )
            for s in data.schedules:
                await tx.execute(
                    """
                    INSERT INTO brooder_profile_schedules (
                        profile_id, stage_order, day_range_start, day_range_end,
                        setpoint_target, heater_zone_limit,
                        humidity_min_pct, humidity_max_pct,
                        night_boost_offset, notes
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    """,
                    profile_id, s.stage_order, s.day_range_start, s.day_range_end,
                    s.setpoint_target, s.heater_zone_limit,
                    s.humidity_min_pct, s.humidity_max_pct,
                    s.night_boost_offset, s.notes,
                )
    _invalidate_caches()
    return await _load_profile_full(profile_id)


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: int, hard: bool = Query(False)):
    """Soft-delete by default (sets is_active=FALSE). Hard delete cascades
    to schedules and removes any test assignments (FK ON DELETE CASCADE)."""
    row = await db.fetchrow(
        "SELECT id, code FROM brooder_profiles WHERE id = $1", profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    if hard:
        await db.execute("DELETE FROM brooder_profiles WHERE id = $1", profile_id)
    else:
        await db.execute(
            "UPDATE brooder_profiles SET is_active = FALSE WHERE id = $1",
            profile_id,
        )
    _invalidate_caches()
    return {"ok": True, "id": profile_id, "hard": hard}


# ── Stage CRUD (single-stage edit) ──────────────────────────

@router.post("/profiles/{profile_id}/schedules", status_code=201)
async def add_stage(profile_id: int, data: ScheduleCreate):
    row = await db.fetchrow(
        "SELECT id FROM brooder_profiles WHERE id = $1", profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    # Load existing stages and run cross-stage validator on the merged set
    existing_rows = await db.fetch(
        "SELECT * FROM brooder_profile_schedules WHERE profile_id = $1 "
        "ORDER BY stage_order",
        profile_id,
    )
    existing = [_row_to_stage(dict(r)) for r in existing_rows]
    _validate_stages(existing + [data])
    new_id = await db.fetchval(
        """
        INSERT INTO brooder_profile_schedules (
            profile_id, stage_order, day_range_start, day_range_end,
            setpoint_target, heater_zone_limit,
            humidity_min_pct, humidity_max_pct,
            night_boost_offset, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
        """,
        profile_id, data.stage_order, data.day_range_start, data.day_range_end,
        data.setpoint_target, data.heater_zone_limit,
        data.humidity_min_pct, data.humidity_max_pct,
        data.night_boost_offset, data.notes,
    )
    _invalidate_caches()
    return {"id": new_id}


@router.put("/profiles/{profile_id}/schedules/{stage_id}")
async def update_stage(profile_id: int, stage_id: int, data: ScheduleUpdate):
    row = await db.fetchrow(
        "SELECT id FROM brooder_profile_schedules WHERE id = $1 AND profile_id = $2",
        stage_id, profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Stage {stage_id} not found")
    # Build the merged stage for validation against siblings
    current = await db.fetchrow(
        "SELECT * FROM brooder_profile_schedules WHERE id = $1", stage_id,
    )
    cur = _row_to_stage(dict(current))
    merged = ScheduleStage(
        stage_order=data.stage_order if data.stage_order is not None else cur.stage_order,
        day_range_start=(data.day_range_start
                         if data.day_range_start is not None else cur.day_range_start),
        day_range_end=(data.day_range_end
                       if data.day_range_end is not None else cur.day_range_end),
        setpoint_target=(data.setpoint_target
                         if data.setpoint_target is not None else cur.setpoint_target),
        heater_zone_limit=(data.heater_zone_limit
                           if data.heater_zone_limit is not None else cur.heater_zone_limit),
        humidity_min_pct=(data.humidity_min_pct
                          if data.humidity_min_pct is not None else cur.humidity_min_pct),
        humidity_max_pct=(data.humidity_max_pct
                          if data.humidity_max_pct is not None else cur.humidity_max_pct),
        night_boost_offset=(data.night_boost_offset
                            if data.night_boost_offset is not None
                            else cur.night_boost_offset),
        notes=data.notes if data.notes is not None else cur.notes,
    )
    siblings = [
        _row_to_stage(dict(r))
        for r in await db.fetch(
            "SELECT * FROM brooder_profile_schedules "
            "WHERE profile_id = $1 AND id != $2",
            profile_id, stage_id,
        )
    ]
    _validate_stages(siblings + [merged])

    sets, vals = [], []
    if data.stage_order is not None:
        sets.append(f"stage_order = ${len(vals)+1}")
        vals.append(data.stage_order)
    if data.day_range_start is not None:
        sets.append(f"day_range_start = ${len(vals)+1}")
        vals.append(data.day_range_start)
    if data.day_range_end is not None:
        sets.append(f"day_range_end = ${len(vals)+1}")
        vals.append(data.day_range_end)
    if data.setpoint_target is not None:
        sets.append(f"setpoint_target = ${len(vals)+1}")
        vals.append(data.setpoint_target)
    if data.heater_zone_limit is not None:
        sets.append(f"heater_zone_limit = ${len(vals)+1}")
        vals.append(data.heater_zone_limit)
    if data.humidity_min_pct is not None:
        sets.append(f"humidity_min_pct = ${len(vals)+1}")
        vals.append(data.humidity_min_pct)
    if data.humidity_max_pct is not None:
        sets.append(f"humidity_max_pct = ${len(vals)+1}")
        vals.append(data.humidity_max_pct)
    if data.night_boost_offset is not None:
        sets.append(f"night_boost_offset = ${len(vals)+1}")
        vals.append(data.night_boost_offset)
    if data.notes is not None:
        sets.append(f"notes = ${len(vals)+1}")
        vals.append(data.notes)
    if not sets:
        return {"ok": False, "message": "No fields to update"}
    vals.append(stage_id)
    sql = f"UPDATE brooder_profile_schedules SET {', '.join(sets)} WHERE id = ${len(vals)}"
    await db.execute(sql, *vals)
    _invalidate_caches()
    return {"ok": True, "id": stage_id}


@router.delete("/profiles/{profile_id}/schedules/{stage_id}")
async def delete_stage(profile_id: int, stage_id: int):
    row = await db.fetchrow(
        "SELECT id FROM brooder_profile_schedules WHERE id = $1 AND profile_id = $2",
        stage_id, profile_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Stage {stage_id} not found")
    await db.execute(
        "DELETE FROM brooder_profile_schedules WHERE id = $1", stage_id,
    )
    _invalidate_caches()
    return {"ok": True, "id": stage_id}


# ── Preview endpoint ─────────────────────────────────────────

@router.get("/profiles/{profile_id}/stages-resolved")
async def stages_resolved(profile_id: int,
                          day_age: int = Query(1, ge=1, le=999),
                          night: bool = Query(False)):
    """Resolve the setpoint/limit for a given day_age + night flag.

    Used by the simulator UI to plot the setpoint curve across day 1..N.
    Returns null setpoint_target if no stage covers that day_age.
    """
    row = await db.fetchrow(
        """
        SELECT s.setpoint_target, s.heater_zone_limit, s.night_boost_offset,
               s.humidity_min_pct, s.humidity_max_pct,
               s.day_range_start, s.day_range_end, s.stage_order
        FROM brooder_profile_schedules s
        WHERE s.profile_id = $1
          AND s.day_range_start <= $2
          AND s.day_range_end   >= $2
        LIMIT 1
        """,
        profile_id, day_age,
    )
    if not row:
        return {
            "profile_id":   profile_id,
            "day_age":      day_age,
            "night":        night,
            "setpoint":     None,
            "heater_limit": None,
            "stage":        None,
        }
    r = dict(row)
    sp = float(r["setpoint_target"])
    if night:
        sp += float(r["night_boost_offset"])
    return {
        "profile_id":   profile_id,
        "day_age":      day_age,
        "night":        night,
        "setpoint":     round(min(sp, MAX_SAFE_TEMPERATURE), 2),
        "heater_limit": float(r["heater_zone_limit"]),
        "night_boost":  float(r["night_boost_offset"]),
        "humidity":     [r["humidity_min_pct"], r["humidity_max_pct"]],
        "stage": {
            "order":           int(r["stage_order"]),
            "day_range_start": int(r["day_range_start"]),
            "day_range_end":   int(r["day_range_end"]),
        },
    }


# ── Test assignment endpoints ─────────────────────────────────────

@router.post("/profiles/{profile_id}/apply-test", response_model=TestAssignmentOut)
async def apply_test(profile_id: int, data: TestApplyRequest):
    """Apply this profile as a TIME-BOXED TEST to the given cycle.

    Replaces any existing active test on the cycle (cleared_reason='replaced').
    The brooder_service sweeper auto-clears the assignment at expires_at.
    """
    # Profile must exist + be active
    prof = await db.fetchrow(
        "SELECT id, code, is_active FROM brooder_profiles WHERE id = $1",
        profile_id,
    )
    if not prof:
        raise HTTPException(status_code=404, detail=f"Profile {profile_id} not found")
    if not prof["is_active"]:
        raise HTTPException(
            status_code=400,
            detail=f"Profile '{prof['code']}' is inactive; cannot apply test",
        )
    # Cycle must exist
    cyc = await db.fetchrow(
        "SELECT id FROM cycles WHERE id = $1", data.cycle_id,
    )
    if not cyc:
        raise HTTPException(
            status_code=404, detail=f"Cycle {data.cycle_id} not found",
        )
    expires_at = datetime.now(timezone.utc) + timedelta(hours=data.hours)
    async with db.transaction() as tx:
        await tx.execute(
            """
            UPDATE brooder_profile_test_assignments
            SET cleared_at = NOW(), cleared_reason = 'replaced'
            WHERE cycle_id = $1 AND cleared_at IS NULL
            """,
            data.cycle_id,
        )
        row = await tx.fetchrow(
            """
            INSERT INTO brooder_profile_test_assignments
                (cycle_id, profile_id, expires_at, note)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            data.cycle_id, profile_id, expires_at, data.note,
        )
    _invalidate_caches()
    out = dict(row)
    out["profile_code"] = prof["code"]
    return TestAssignmentOut(**out)


@router.get("/profiles/test/{cycle_id}", response_model=Optional[TestAssignmentOut])
async def get_test(cycle_id: int):
    """Get the currently active (unexpired, uncleared) test for a cycle."""
    row = await db.fetchrow(
        """
        SELECT t.*, p.code AS profile_code
        FROM brooder_profile_test_assignments t
        JOIN brooder_profiles p ON p.id = t.profile_id
        WHERE t.cycle_id = $1 AND t.cleared_at IS NULL AND t.expires_at > NOW()
        ORDER BY t.started_at DESC
        LIMIT 1
        """,
        cycle_id,
    )
    if not row:
        return None
    return TestAssignmentOut(**dict(row))


@router.delete("/profiles/test/{cycle_id}")
async def clear_test(cycle_id: int):
    """Manual clear — sets cleared_at + cleared_reason='manual_clear'."""
    row = await db.fetchrow(
        """
        UPDATE brooder_profile_test_assignments
        SET cleared_at = NOW(), cleared_reason = 'manual_clear'
        WHERE cycle_id = $1 AND cleared_at IS NULL
        RETURNING id
        """,
        cycle_id,
    )
    _invalidate_caches()
    return {"ok": True, "cleared": bool(row), "cycle_id": cycle_id}