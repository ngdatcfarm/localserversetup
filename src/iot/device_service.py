"""Device Service - CRUD operations for IoT devices stored in PostgreSQL."""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


class DeviceService:
    """Manages IoT device registration, status, and queries."""

    # ── CRUD ──────────────────────────────────────────

    async def create(self, data: dict) -> dict:
        """Register a new device."""
        row = await db.fetchrow(
            """INSERT INTO devices (device_code, name, device_type_id, barn_id, mqtt_topic)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, device_code, name, device_type_id, barn_id, mqtt_topic,
                      is_online, created_at""",
            data["device_code"], data["name"],
            data.get("device_type_id"), data.get("barn_id"),
            data["mqtt_topic"],
        )
        if not row:
            return {"ok": False, "message": "Failed to create device"}
        return {"ok": True, "device": dict(row)}

    async def get(self, device_id: int) -> Optional[dict]:
        """Get single device with type info."""
        row = await db.fetchrow(
            """SELECT d.*, dt.code as type_code, dt.name as type_name, dt.channel_count
            FROM devices d
            LEFT JOIN device_types dt ON d.device_type_id = dt.id
            WHERE d.id = $1""",
            device_id,
        )
        return dict(row) if row else None

    async def get_by_code(self, device_code: str) -> Optional[dict]:
        """Get device by device_code."""
        row = await db.fetchrow(
            "SELECT * FROM devices WHERE device_code = $1", device_code
        )
        return dict(row) if row else None

    async def list_all(self, barn_id: str = None) -> list[dict]:
        """List all devices, optionally filtered by barn."""
        if barn_id:
            rows = await db.fetch(
                """SELECT d.*, dt.code as type_code, dt.name as type_name
                FROM devices d
                LEFT JOIN device_types dt ON d.device_type_id = dt.id
                WHERE d.barn_id = $1
                ORDER BY d.name""",
                barn_id,
            )
        else:
            rows = await db.fetch(
                """SELECT d.*, dt.code as type_code, dt.name as type_name
                FROM devices d
                LEFT JOIN device_types dt ON d.device_type_id = dt.id
                ORDER BY d.name""",
            )
        return [dict(r) for r in rows]

    async def update(self, device_id: int, data: dict) -> dict:
        """Update device info."""
        result = await db.execute(
            """UPDATE devices SET
                name = COALESCE($1, name),
                device_type_id = COALESCE($2, device_type_id),
                barn_id = COALESCE($3, barn_id),
                mqtt_topic = COALESCE($4, mqtt_topic),
                alert_offline = COALESCE($5, alert_offline),
                updated_at = NOW()
            WHERE id = $6""",
            data.get("name"), data.get("device_type_id"),
            data.get("barn_id"), data.get("mqtt_topic"),
            data.get("alert_offline"), device_id,
        )
        return {"ok": True}

    async def delete(self, device_id: int) -> bool:
        """Delete a device and its related data."""
        result = await db.execute("DELETE FROM devices WHERE id = $1", device_id)
        return result == "DELETE 1"

    # ── Device Types ──────────────────────────────────

    async def list_types(self) -> list[dict]:
        """List all device types."""
        rows = await db.fetch("SELECT * FROM device_types ORDER BY name")
        return [dict(r) for r in rows]

    # ── Channels ──────────────────────────────────────

    async def get_channels(self, device_id: int) -> list[dict]:
        """Get all channels for a device."""
        rows = await db.fetch(
            """SELECT * FROM device_channels
            WHERE device_id = $1 ORDER BY channel_number""",
            device_id,
        )
        return [dict(r) for r in rows]

    async def set_channels(self, device_id: int, channels: list[dict]) -> dict:
        """Set channels for a device (replace all)."""
        await db.execute(
            "DELETE FROM device_channels WHERE device_id = $1", device_id
        )
        for ch in channels:
            await db.execute(
                """INSERT INTO device_channels (device_id, channel_number, function, name, gpio_pin)
                VALUES ($1, $2, $3, $4, $5)""",
                device_id, ch["channel_number"],
                ch.get("function"), ch.get("name"), ch.get("gpio_pin"),
            )
        return {"ok": True}

    # ── Device States ─────────────────────────────────

    async def get_states(self, device_id: int) -> list[dict]:
        """Get current states for all channels of a device."""
        rows = await db.fetch(
            """SELECT ds.*, dc.function, dc.name as channel_name
            FROM device_states ds
            LEFT JOIN device_channels dc
                ON ds.device_id = dc.device_id AND ds.channel_number = dc.channel_number
            WHERE ds.device_id = $1
            ORDER BY ds.channel_number""",
            device_id,
        )
        return [dict(r) for r in rows]

    # ── Offline Detection ─────────────────────────────

    async def check_offline(self, timeout_seconds: int = 90) -> list[dict]:
        """Mark devices offline if no heartbeat within timeout. Returns newly offline devices."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)

        # Find devices that were online but heartbeat expired
        rows = await db.fetch(
            """UPDATE devices SET is_online = FALSE, updated_at = NOW()
            WHERE is_online = TRUE
            AND (last_heartbeat_at IS NULL OR last_heartbeat_at < $1)
            RETURNING id, device_code, name, barn_id, last_heartbeat_at""",
            cutoff,
        )
        newly_offline = [dict(r) for r in rows]
        if newly_offline:
            logger.warning(
                f"Devices went offline: {[d['device_code'] for d in newly_offline]}"
            )
        return newly_offline


device_service = DeviceService()
