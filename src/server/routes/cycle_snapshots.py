"""Cycle Daily Snapshots API routes."""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional

from src.iot.cycle_snapshot_service import get_snapshot_service, run_snapshot
from src.services.database.db import db
from src.server.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cycle-snapshots", tags=["cycle-snapshots"], dependencies=[Depends(require_auth)])


class SnapshotResponse(BaseModel):
    """Response for single snapshot."""
    cycle_id: int
    snapshot_date: str
    day_age: int
    stage: Optional[str] = None
    initial_count: int
    current_count: int
    deaths_today: int
    mortality_rate_pct: float
    sensor_data: dict
    care_data: dict
    weight_data: dict
    environment_data: dict


async def _fetch_snapshots(cycle_id: int, days: int) -> list:
    """Helper to fetch snapshots from DB."""
    import json
    # Explicitly cast JSONB to text to avoid asyncpg issues
    snapshots = await db.fetch(
        """SELECT id, cycle_id, snapshot_date, day_age, stage,
           initial_count, current_count, deaths_today, mortality_rate_pct,
           sensor_data::text as sensor_data,
           care_data::text as care_data,
           weight_data::text as weight_data,
           environment_data::text as environment_data,
           metadata::text as metadata,
           created_at, updated_at
        FROM cycle_daily_snapshots
        WHERE cycle_id = $1
        AND snapshot_date >= CURRENT_DATE - INTERVAL '1 day' * $2
        ORDER BY snapshot_date DESC""",
        cycle_id, days
    )
    result = []
    for row in snapshots:
        r = dict(row)
        # Parse JSONB string fields back to dict
        for field in ["sensor_data", "care_data", "weight_data", "environment_data", "metadata"]:
            if field in r and isinstance(r[field], str):
                try:
                    r[field] = json.loads(r[field])
                except:
                    pass
        result.append(r)
    return result


@router.get("/cycles/{cycle_id}")
async def get_cycle_snapshots(
    cycle_id: int,
    days: int = Query(default=30, ge=1, le=365)
):
    """
    Get snapshots for a cycle over time period.

    Args:
        cycle_id: Cycle ID
        days: Number of days to retrieve (default 30, max 365)

    Returns:
        List of snapshots ordered by date descending
    """
    snapshots = await _fetch_snapshots(cycle_id, days)
    return {"snapshots": snapshots}


@router.get("/cycles/{cycle_id}/latest")
async def get_latest_snapshot(cycle_id: int):
    """Get the most recent snapshot for a cycle."""
    snapshots = await _fetch_snapshots(cycle_id, 1)
    if not snapshots:
        raise HTTPException(status_code=404, detail="No snapshot found")
    return snapshots[0]


@router.post("/run")
async def run_snapshots(date: Optional[str] = None):
    """
    Trigger snapshot creation for all active cycles.

    Args:
        date: Specific date (YYYY-MM-DD), defaults to today

    Returns:
        Summary of snapshot creation results
    """
    result = await run_snapshot(date)
    return result


@router.get("/trends/{cycle_id}")
async def get_cycle_trends(
    cycle_id: int,
    days: int = Query(default=7, ge=1, le=90)
):
    """
    Get trend data for a cycle over time period.
    Useful for ML features like rate of change.

    Returns:
        Trend data including:
        - gas_index_trend: % change from previous period
        - mortality_trend: % change
        - feed_trend: % change
        - temperature_trend: °C change
    """
    snapshots = await _fetch_snapshots(cycle_id, days)

    if len(snapshots) < 2:
        return {"error": "Need at least 2 snapshots for trends", "samples": len(snapshots)}

    # Calculate trends
    trends = {}

    # Gas index trend (from mq137_raw avg in sensor_data)
    gas_values = [s.get("sensor_data", {}).get("mq137_raw", {}).get("avg", 0) for s in snapshots if s.get("sensor_data")]
    if len(gas_values) >= 2 and gas_values[-1] > 0:
        trends["gas_index_trend_pct"] = round(
            ((gas_values[0] - gas_values[-1]) / gas_values[-1]) * 100, 2
        )

    # Mortality trend
    mortality_values = [s.get("mortality_rate_pct", 0) for s in snapshots]
    if len(mortality_values) >= 2:
        trends["mortality_trend_pct"] = round(mortality_values[-1] - mortality_values[0], 2)

    # Feed trend
    care_data = [s.get("care_data", {}) for s in snapshots]
    feed_values = [c.get("feed_kg", 0) for c in care_data]
    if len(feed_values) >= 2 and feed_values[-1] > 0:
        trends["feed_trend_pct"] = round(
            ((feed_values[0] - feed_values[-1]) / feed_values[-1]) * 100, 2
        )

    # Temperature trend
    sensor_data = [s.get("sensor_data", {}) for s in snapshots]
    temp_values = [s.get("temperature", {}).get("avg", 0) for s in sensor_data]
    if len(temp_values) >= 2:
        trends["temperature_trend_c"] = round(temp_values[-1] - temp_values[0], 2)

    # Day age range
    trends["day_age_start"] = snapshots[-1].get("day_age", 0)
    trends["day_age_end"] = snapshots[0].get("day_age", 0)

    return {
        "cycle_id": cycle_id,
        "days_analyzed": len(snapshots),
        "trends": trends,
    }


@router.get("/ml/export/{cycle_id}")
async def export_for_ml(
    cycle_id: int,
    days: int = Query(default=30, ge=7, le=365)
):
    """
    Export snapshots in ML-ready format for a cycle.

    Returns:
        Flattened data with all features as columns, ready for training.
    """
    snapshots = await _fetch_snapshots(cycle_id, days)

    if not snapshots:
        return {"error": "No snapshots found", "samples": 0}

    # Flatten for ML
    ml_data = []
    for s in snapshots:
        row = {
            "date": s.get("snapshot_date"),
            "day_age": s.get("day_age", 0),
            "stage": s.get("stage", "unknown"),

            # Counts
            "initial_count": s.get("initial_count", 0),
            "current_count": s.get("current_count", 0),
            "deaths_today": s.get("deaths_today", 0),
            "mortality_rate_pct": s.get("mortality_rate_pct", 0),

            # Sensor features
            "temp_avg": s.get("sensor_data", {}).get("temperature", {}).get("avg", 0),
            "temp_min": s.get("sensor_data", {}).get("temperature", {}).get("min", 0),
            "temp_max": s.get("sensor_data", {}).get("temperature", {}).get("max", 0),
            "temp_std": s.get("sensor_data", {}).get("temperature", {}).get("std", 0),

            "humidity_avg": s.get("sensor_data", {}).get("humidity", {}).get("avg", 0),
            "humidity_min": s.get("sensor_data", {}).get("humidity", {}).get("min", 0),
            "humidity_max": s.get("sensor_data", {}).get("humidity", {}).get("max", 0),

            "mq137_avg": s.get("sensor_data", {}).get("mq137_raw", {}).get("avg", 0),
            "mq137_min": s.get("sensor_data", {}).get("mq137_raw", {}).get("min", 0),
            "mq137_max": s.get("sensor_data", {}).get("mq137_raw", {}).get("max", 0),
            "mq137_std": s.get("sensor_data", {}).get("mq137_raw", {}).get("std", 0),

            "mq135_avg": s.get("sensor_data", {}).get("mq135_raw", {}).get("avg", 0),
            "mq135_min": s.get("sensor_data", {}).get("mq135_raw", {}).get("min", 0),
            "mq135_max": s.get("sensor_data", {}).get("mq135_raw", {}).get("max", 0),
            "mq135_std": s.get("sensor_data", {}).get("mq135_raw", {}).get("std", 0),

            "co2_avg": s.get("sensor_data", {}).get("co2", {}).get("avg", 0),
            "light_avg": s.get("sensor_data", {}).get("light", {}).get("avg", 0),

            # Care features
            "feed_kg": s.get("care_data", {}).get("feed_kg", 0),
            "medication_count": s.get("care_data", {}).get("medication_count", 0),
            "water_liters": s.get("care_data", {}).get("water_liters", 0),
            "sales_count": s.get("care_data", {}).get("sales_count", 0),

            # Weight features
            "weight_avg_g": s.get("weight_data", {}).get("avg_weight_g", 0),
            "weight_min_g": s.get("weight_data", {}).get("min_weight_g", 0),
            "weight_max_g": s.get("weight_data", {}).get("max_weight_g", 0),
            "weight_uniformity_pct": s.get("weight_data", {}).get("uniformity_pct", 0),
            "weight_sample_count": s.get("weight_data", {}).get("sample_count", 0),

            # Environment
            "wifi_rssi": s.get("environment_data", {}).get("wifi_rssi"),
            "curtain_state": s.get("environment_data", {}).get("curtain_state"),
        }
        ml_data.append(row)

    return {
        "cycle_id": cycle_id,
        "samples": len(ml_data),
        "features": list(ml_data[0].keys()) if ml_data else [],
        "data": ml_data
    }