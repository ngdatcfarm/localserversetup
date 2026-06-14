"""MQ Sensor Tare (R0 calibration) API routes.

Exposes 5 endpoints under /api/mq-tare:
    POST /start                - Begin a 10-minute collection window
    POST /cancel               - Cancel an in-flight session
    GET  /status/{device_id}   - Per-sensor R0 / in-progress snapshot
    GET  /history/{device_id}/{sensor_type}  - Past tare attempts
    GET  /ratio/{device_id}/{sensor_type}    - 5-min Rs/R0 aggregates
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from src.iot.mq_tare_service import mq_tare_service, MQ_SENSOR_TYPES
from src.server.auth import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mq-tare", tags=["mq-tare"], dependencies=[Depends(require_auth)])


# ── Request Models ─────────────────────────────────────────

class StartTareRequest(BaseModel):
    device_id: int
    sensor_type: str
    load_resistor: Optional[float] = 10000.0


class CancelTareRequest(BaseModel):
    device_id: int
    sensor_type: str


# ── Endpoints ──────────────────────────────────────────────

@router.post("/start")
async def start_tare(data: StartTareRequest):
    """Begin a 10-minute tare window for (device_id, sensor_type)."""
    if data.sensor_type not in MQ_SENSOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported sensor_type. Must be one of: {list(MQ_SENSOR_TYPES)}",
        )

    result = await mq_tare_service.start_tare(
        device_id=data.device_id,
        sensor_type=data.sensor_type,
        load_resistor=data.load_resistor or 10000.0,
    )

    if not result.get("ok"):
        raise HTTPException(
            status_code=result.get("status_code", 400),
            detail=result.get("message"),
        )

    return {
        "ok": True,
        "calibration_id": result["calibration_id"],
        "started_at": result["started_at"],
        "deadline": result["deadline"],
        "seconds_remaining": result["seconds_remaining"],
    }


@router.post("/cancel")
async def cancel_tare(data: CancelTareRequest):
    """Cancel an in-flight tare session."""
    if data.sensor_type not in MQ_SENSOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported sensor_type. Must be one of: {list(MQ_SENSOR_TYPES)}",
        )

    result = await mq_tare_service.cancel_tare(
        device_id=data.device_id,
        sensor_type=data.sensor_type,
    )

    if not result.get("ok"):
        raise HTTPException(
            status_code=result.get("status_code", 400),
            detail=result.get("message"),
        )

    return {"ok": True, "status": result.get("status"), "calibration_id": result.get("calibration_id")}


@router.get("/status/{device_id}")
async def get_status(device_id: int):
    """Per-sensor snapshot: in-progress flag, active R0, calibration_id."""
    return await mq_tare_service.get_status(device_id)


@router.get("/history/{device_id}/{sensor_type}")
async def get_history(device_id: int, sensor_type: str, limit: int = Query(20, ge=1, le=200)):
    """Past tare attempts for (device_id, sensor_type), newest first."""
    if sensor_type not in MQ_SENSOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported sensor_type. Must be one of: {list(MQ_SENSOR_TYPES)}",
        )
    return await mq_tare_service.get_history(device_id, sensor_type, limit)


@router.get("/ratio/{device_id}/{sensor_type}")
async def get_ratio(
    device_id: int,
    sensor_type: str,
    hours: int = Query(24, ge=1, le=168 * 4),
):
    """5-minute Rs/R0 aggregates for the last N hours."""
    if sensor_type not in MQ_SENSOR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported sensor_type. Must be one of: {list(MQ_SENSOR_TYPES)}",
        )
    return await mq_tare_service.get_ratio_series(device_id, sensor_type, hours)
