"""Sensor data API routes."""

from fastapi import APIRouter, Depends
from typing import Optional

from src.iot.sensor_service import sensor_service
from src.server.auth import require_auth

router = APIRouter(prefix="/api/sensors", tags=["sensors"], dependencies=[Depends(require_auth)])


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


@router.get("/barns-temperature")
async def get_barns_temperature():
    """
    Get latest temperature and humidity for all barns.
    Optimized for dashboard quick-view - returns minimal data.
    """
    return await sensor_service.get_barns_temperature_summary()


@router.get("/series")
async def get_series_aggregate(sensor_type: str, range: str = 'day',
                                barn_id: str = None):
    """Time-bucketed series aggregated across devices for one sensor type.

    Drives the chart on the sensors page. range picks the bucket size:
    day | week | month | year. barn_id is optional; pass 'all' or omit to
    aggregate across every device.
    """
    return await sensor_service.get_series_aggregate(sensor_type, range, barn_id)
