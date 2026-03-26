"""Sensor Service - Query sensor data from TimescaleDB/PostgreSQL."""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


class SensorService:
    """Read and aggregate sensor data."""

    async def get_latest(self, device_id: int = None, barn_id: str = None,
                         sensor_type: str = None) -> list[dict]:
        """Get latest reading per device+sensor_type."""
        conditions = []
        params = []
        idx = 1

        if device_id:
            conditions.append(f"s.device_id = ${idx}")
            params.append(device_id)
            idx += 1
        if barn_id:
            conditions.append(f"s.barn_id = ${idx}")
            params.append(barn_id)
            idx += 1
        if sensor_type:
            conditions.append(f"s.sensor_type = ${idx}")
            params.append(sensor_type)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = await db.fetch(
            f"""SELECT DISTINCT ON (s.device_id, s.sensor_type)
                s.device_id, d.name as device_name, d.barn_id,
                s.sensor_type, s.value, s.unit, s.time
            FROM sensor_data s
            JOIN devices d ON s.device_id = d.id
            {where}
            ORDER BY s.device_id, s.sensor_type, s.time DESC""",
            *params,
        )
        return [dict(r) for r in rows]

    async def get_history(self, device_id: int, sensor_type: str,
                          hours: int = 24, limit: int = 500) -> list[dict]:
        """Get sensor history for a device within time range."""
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        rows = await db.fetch(
            """SELECT time, value, unit
            FROM sensor_data
            WHERE device_id = $1 AND sensor_type = $2 AND time > $3
            ORDER BY time DESC
            LIMIT $4""",
            device_id, sensor_type, since, limit,
        )
        return [dict(r) for r in rows]

    async def get_hourly(self, device_id: int, sensor_type: str,
                         hours: int = 168) -> list[dict]:
        """Get hourly aggregated data. Uses continuous aggregate if available,
        falls back to manual aggregation."""
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Try continuous aggregate first (TimescaleDB)
        try:
            rows = await db.fetch(
                """SELECT bucket as time, avg_value, min_value, max_value, sample_count
                FROM sensor_hourly
                WHERE device_id = $1 AND sensor_type = $2 AND bucket > $3
                ORDER BY bucket""",
                device_id, sensor_type, since,
            )
            return [dict(r) for r in rows]
        except Exception:
            pass

        # Fallback: manual aggregation (plain PostgreSQL)
        rows = await db.fetch(
            """SELECT
                date_trunc('hour', time) as time,
                AVG(value) as avg_value,
                MIN(value) as min_value,
                MAX(value) as max_value,
                COUNT(*) as sample_count
            FROM sensor_data
            WHERE device_id = $1 AND sensor_type = $2 AND time > $3
            GROUP BY date_trunc('hour', time)
            ORDER BY time""",
            device_id, sensor_type, since,
        )
        return [dict(r) for r in rows]

    async def get_barn_summary(self, barn_id: str) -> list[dict]:
        """Get latest sensor summary for a barn (all devices, all types)."""
        return await self.get_latest(barn_id=barn_id)


sensor_service = SensorService()
