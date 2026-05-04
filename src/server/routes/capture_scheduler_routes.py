"""Capture Scheduler Routes - Automated dataset collection on schedule."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.server.routes.capture_scheduler import capture_scheduler

router = APIRouter(prefix="/api/ml/capture-scheduler", tags=["capture-scheduler"])


class CreateScheduleRequest(BaseModel):
    name: str = "Default Schedule"
    camera_id: str
    preset_id: int = 1
    schedule_hours: list[int] = [6, 11, 15, 19]
    shots_per_capture: int = 10
    interval_seconds: float = 2.0
    total_days: int = 3


class UpdateScheduleRequest(BaseModel):
    name: Optional[str] = None
    shots_per_capture: Optional[int] = None
    interval_seconds: Optional[float] = None
    total_days: Optional[int] = None
    enabled: Optional[bool] = None


@router.get("/schedules")
async def get_schedules():
    """Get all capture schedules."""
    schedules = await capture_scheduler.get_schedules()
    return {"schedules": [dict(s) for s in schedules]}


@router.post("/schedules")
async def create_schedule(data: CreateScheduleRequest):
    """Create a new capture schedule."""
    schedule = await capture_scheduler.create_schedule(
        name=data.name,
        camera_id=data.camera_id,
        preset_id=data.preset_id,
        schedule_hours=data.schedule_hours,
        shots_per_capture=data.shots_per_capture,
        interval_seconds=data.interval_seconds,
        total_days=data.total_days,
    )
    return {"success": True, "schedule": schedule}


@router.get("/schedules/{schedule_id}")
async def get_schedule(schedule_id: int):
    """Get a single schedule with stats."""
    stats = await capture_scheduler.get_schedule_stats(schedule_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return stats


@router.patch("/schedules/{schedule_id}")
async def update_schedule(schedule_id: int, data: UpdateScheduleRequest):
    """Update schedule settings."""
    kwargs = data.model_dump(exclude_unset=True)
    if not kwargs:
        raise HTTPException(status_code=400, detail="No fields to update")

    schedule = await capture_scheduler.update_schedule(schedule_id, **kwargs)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"success": True, "schedule": dict(schedule)}


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int):
    """Delete a capture schedule."""
    success = await capture_scheduler.delete_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"success": True}


@router.post("/schedules/{schedule_id}/start")
async def start_schedule(schedule_id: int):
    """Start a capture schedule."""
    await capture_scheduler.start_schedule(schedule_id)
    return {"success": True, "message": "Schedule started"}


@router.post("/schedules/{schedule_id}/stop")
async def stop_schedule(schedule_id: int):
    """Stop a capture schedule."""
    await capture_scheduler.stop_schedule(schedule_id)
    return {"success": True, "message": "Schedule stopped"}


@router.post("/schedules/{schedule_id}/capture-now")
async def capture_now(schedule_id: int):
    """Trigger a capture immediately."""
    result = await capture_scheduler.run_capture_now(schedule_id)
    return result