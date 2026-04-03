"""Sensor data API routes."""

from fastapi import APIRouter
from typing import Optional

from src.iot.sensor_service import sensor_service

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


@router.get("/latest")
async def get_latest(device_id: int = None, barn_id: str = None,
                     sensor_type: str = None):
    """Get latest sensor readings. Filter by device, barn, or sensor type."""
    return await sensor_service.get_latest(device_id, barn_id, sensor_type)


@router.get("/history/{device_id}/{sensor_type}")
async def get_history(device_id: int, sensor_type: str,
                      hours: int = 24, limit: int = 500):
    """Get raw sensor history for a device."""
    return await sensor_service.get_history(device_id, sensor_type, hours, limit)


@router.get("/hourly/{device_id}/{sensor_type}")
async def get_hourly(device_id: int, sensor_type: str, hours: int = 168):
    """Get hourly aggregated sensor data (7 days default)."""
    return await sensor_service.get_hourly(device_id, sensor_type, hours)


@router.get("/barn/{barn_id}")
async def get_barn_summary(barn_id: str):
    """Get latest sensor summary for a barn."""
    return await sensor_service.get_barn_summary(barn_id)
