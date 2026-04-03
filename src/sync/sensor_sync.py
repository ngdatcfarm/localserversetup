"""Sensor Data Sync - Push sensor readings from local to cloud in batches."""

import asyncio
import logging
from datetime import datetime, timezone

from src.services.database.db import db
from src.sync.sync_service import sync_service

logger = logging.getLogger(__name__)


def _parse_timestamp(val):
    """Convert string timestamp to datetime for DB queries."""
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        # Try parsing ISO format
        for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%dT%H:%M:%S'):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
        # Fallback
        return datetime(2000, 1, 1, tzinfo=timezone.utc)
    return datetime(2000, 1, 1, tzinfo=timezone.utc)


class SensorSync:
    """Handles pushing sensor data from local TimescaleDB to cloud.

    Sensor data is high-volume (every 30s per device), so we batch it
    and push summaries rather than raw data to save bandwidth.
    """

    def __init__(self):
        self._last_sensor_push = None

    async def push_sensor_summary(self) -> int:
        """Push hourly sensor summaries to cloud."""
        if not sync_service.config.get("cloud_url"):
            return 0

        try:
            # Get the last push timestamp from sync_config
            last_push = self._last_sensor_push
            if not last_push:
                row = await db.fetchrow(
                    "SELECT value FROM sync_config WHERE key = 'last_sensor_push'"
                )
                last_push = row["value"] if row else None

            last_push_dt = _parse_timestamp(last_push) if last_push else datetime(2000, 1, 1, tzinfo=timezone.utc)

            # Aggregate sensor data since last push (hourly averages)
            rows = await db.fetch(
                """SELECT
                    device_id,
                    d.device_code,
                    sensor_type,
                    date_trunc('hour', sd.time) AS hour,
                    AVG(value) AS avg_value,
                    MIN(value) AS min_value,
                    MAX(value) AS max_value,
                    COUNT(*) AS sample_count
                FROM sensor_data sd
                JOIN devices d ON d.id = sd.device_id
                WHERE sd.time > $1
                GROUP BY device_id, d.device_code, sensor_type, date_trunc('hour', sd.time)
                ORDER BY hour ASC
                LIMIT 500""",
                last_push_dt,
            )

            if not rows:
                return 0

            items = []
            for r in rows:
                items.append({
                    "device_code": r["device_code"],
                    "sensor_type": r["sensor_type"],
                    "hour": r["hour"].isoformat() if r["hour"] else None,
                    "avg_value": float(r["avg_value"]) if r["avg_value"] else None,
                    "min_value": float(r["min_value"]) if r["min_value"] else None,
                    "max_value": float(r["max_value"]) if r["max_value"] else None,
                    "sample_count": r["sample_count"],
                })

            # Push to cloud
            result = await sync_service.cloud_request("POST", "/api/sync/sensor-data", {
                "source": "local",
                "items": items,
            })

            # Update last push timestamp
            latest_hour = max(r["hour"] for r in rows if r["hour"])
            new_ts = latest_hour.isoformat()
            await sync_service.save_config("last_sensor_push", new_ts)
            self._last_sensor_push = new_ts

            logger.info(f"Pushed {len(items)} sensor summaries to cloud")
            return len(items)

        except Exception as e:
            logger.error(f"Sensor push failed: {e}")
            return 0

    async def push_device_states(self) -> int:
        """Push current device online/offline states to cloud."""
        if not sync_service.config.get("cloud_url"):
            return 0

        try:
            rows = await db.fetch(
                """SELECT device_code, name, device_type_id, is_online,
                    firmware_version, ip_address, last_heartbeat_at
                FROM devices"""
            )
            if not rows:
                return 0

            items = [{
                "device_code": r["device_code"],
                "name": r["name"],
                "device_type_id": r["device_type_id"],
                "is_online": r["is_online"],
                "firmware_version": r["firmware_version"],
                "ip_address": r["ip_address"],
                "last_seen": r["last_heartbeat_at"].isoformat() if r["last_heartbeat_at"] else None,
            } for r in rows]

            result = await sync_service.cloud_request("POST", "/api/sync/device-states", {
                "source": "local",
                "items": items,
            })

            logger.info(f"Pushed {len(items)} device states to cloud")
            return len(items)

        except Exception as e:
            logger.error(f"Device state push failed: {e}")
            return 0


sensor_sync = SensorSync()
