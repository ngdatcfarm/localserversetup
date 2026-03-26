"""Firmware Service - OTA firmware management for ESP32 devices."""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)

FIRMWARE_DIR = Path("data/firmwares")


class FirmwareService:
    """Manage firmware versions and trigger OTA updates."""

    def __init__(self):
        FIRMWARE_DIR.mkdir(parents=True, exist_ok=True)

    async def list_firmwares(self, device_type_code: str = None) -> list[dict]:
        if device_type_code:
            rows = await db.fetch(
                """SELECT * FROM firmwares WHERE device_type_code = $1
                ORDER BY created_at DESC""",
                device_type_code,
            )
        else:
            rows = await db.fetch("SELECT * FROM firmwares ORDER BY created_at DESC")
        return [dict(r) for r in rows]

    async def get_latest(self, device_type_code: str) -> Optional[dict]:
        """Get latest firmware for a device type."""
        row = await db.fetchrow(
            """SELECT * FROM firmwares
            WHERE device_type_code = $1 AND is_latest = TRUE""",
            device_type_code,
        )
        return dict(row) if row else None

    async def upload(self, device_type_code: str, version: str,
                     file_content: bytes, filename: str,
                     changelog: str = "") -> dict:
        """Upload a new firmware binary."""
        # Calculate checksum
        checksum = hashlib.sha256(file_content).hexdigest()

        # Save file
        safe_name = f"{device_type_code}_{version}_{filename}"
        filepath = FIRMWARE_DIR / safe_name
        filepath.write_bytes(file_content)

        # Unmark previous latest
        await db.execute(
            """UPDATE firmwares SET is_latest = FALSE
            WHERE device_type_code = $1 AND is_latest = TRUE""",
            device_type_code,
        )

        # Insert new firmware
        row = await db.fetchrow(
            """INSERT INTO firmwares
            (device_type_code, version, filename, file_size, checksum, changelog, is_latest)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            RETURNING *""",
            device_type_code, version, safe_name,
            len(file_content), checksum, changelog,
        )

        logger.info(f"Firmware uploaded: {device_type_code} v{version} ({len(file_content)} bytes)")
        return {"ok": True, "firmware": dict(row)}

    def get_file_path(self, filename: str) -> Optional[Path]:
        """Get firmware file path for download."""
        filepath = FIRMWARE_DIR / filename
        if filepath.exists():
            return filepath
        return None

    async def trigger_ota(self, device_id: int) -> dict:
        """Send OTA update command to a device."""
        device = await db.fetchrow(
            """SELECT d.*, dt.code as type_code
            FROM devices d
            LEFT JOIN device_types dt ON d.device_type_id = dt.id
            WHERE d.id = $1""",
            device_id,
        )
        if not device:
            return {"ok": False, "message": "Device not found"}

        type_code = device["type_code"]
        if not type_code:
            return {"ok": False, "message": "Device has no type assigned"}

        firmware = await self.get_latest(type_code)
        if not firmware:
            return {"ok": False, "message": f"No firmware available for {type_code}"}

        # Send OTA command via MQTT
        topic = f"{device['mqtt_topic']}/ota"
        sent = mqtt_client.publish(topic, {
            "action": "ota",
            "version": firmware["version"],
            "url": f"/api/firmware/download/{firmware['id']}",
            "checksum": firmware["checksum"],
            "size": firmware["file_size"],
        })

        if not sent:
            return {"ok": False, "message": "MQTT send failed"}

        # Log command
        import json
        await db.execute(
            """INSERT INTO device_commands (device_id, command_type, payload, source, status)
            VALUES ($1, 'ota', $2, 'manual', 'sent')""",
            device_id,
            json.dumps({"version": firmware["version"], "firmware_id": firmware["id"]}),
        )

        logger.info(f"OTA triggered: device {device['device_code']} → v{firmware['version']}")
        return {
            "ok": True,
            "device": device["device_code"],
            "firmware_version": firmware["version"],
        }

    async def delete(self, firmware_id: int) -> bool:
        """Delete a firmware version."""
        row = await db.fetchrow(
            "SELECT filename FROM firmwares WHERE id = $1", firmware_id
        )
        if not row:
            return False

        # Delete file
        filepath = FIRMWARE_DIR / row["filename"]
        if filepath.exists():
            filepath.unlink()

        await db.execute("DELETE FROM firmwares WHERE id = $1", firmware_id)
        return True


firmware_service = FirmwareService()
