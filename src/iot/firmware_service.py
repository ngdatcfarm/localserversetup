"""Firmware Service - OTA firmware management for ESP32 devices."""

import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Optional

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)

FIRMWARE_DIR = Path("data/firmwares")
FIRMWARE_SOURCE_DIR = Path("firmware")  # Mother firmware source code


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

    async def get_mother(self, device_type_code: str) -> Optional[dict]:
        """Get mother (default) firmware for a device type."""
        row = await db.fetchrow(
            """SELECT * FROM firmwares
            WHERE device_type_code = $1 AND is_mother = TRUE""",
            device_type_code,
        )
        return dict(row) if row else None

    async def get_default(self, device_type_code: str) -> Optional[dict]:
        """Get default firmware for a device type: prefers mother, falls back to latest."""
        # Try mother first
        row = await self.get_mother(device_type_code)
        if row:
            return row
        # Fallback to latest
        return await self.get_latest(device_type_code)

    def _get_source_file(self, device_type_code: str) -> Optional[Path]:
        """Find the mother firmware source (.ino) file for a device type."""
        # Map device_type_code to folder name
        type_to_folder = {
            "relay_4ch": "esp32_relay_4ch_hybrid",
            "relay_8ch": "esp32_relay_8ch_hybrid",
        }
        folder = type_to_folder.get(device_type_code)
        if not folder:
            return None

        source_dir = FIRMWARE_SOURCE_DIR / folder
        if not source_dir.exists():
            return None

        # Find the .ino file (main sketch file)
        for f in source_dir.glob("*.ino"):
            return f
        return None

    async def generate_child_firmware(self, device: dict) -> Optional[dict]:
        """Generate customized firmware for a device from mother firmware.

        Reads the mother firmware source (.ino), substitutes device-specific
        variables (DEVICE_CODE, MQTT_TOPIC, etc.), and returns the customized code.

        Args:
            device: device dict with device_code, name, mqtt_topic, type_code, etc.

        Returns:
            dict with ok=True, code (the customized source code), and metadata
        """
        device_type_code = device.get("type_code") or device.get("device_type_code")
        if not device_type_code:
            return {"ok": False, "message": "Device has no type assigned"}

        source_file = self._get_source_file(device_type_code)
        if not source_file:
            return {"ok": False, "message": f"No mother firmware source found for type: {device_type_code}"}

        try:
            source_code = source_file.read_text(encoding="utf-8")
        except Exception as e:
            return {"ok": False, "message": f"Failed to read source file: {e}"}

        # Device-specific substitutions
        device_code = device["device_code"]
        mqtt_topic = device["mqtt_topic"]  # e.g., "cfarm/esp-001"

        # Substitutions map
        # Format: "const char* VAR_NAME = \"...\";" → "const char* VAR_NAME = \"VALUE...\";"
        replacements = {
            # Device identity
            'const char* DEVICE_CODE = "': f'const char* DEVICE_CODE = "{device_code}"',
            'const char* DEVICE_TYPE = "': f'const char* DEVICE_TYPE = "{device_type_code}"',
            # MQTT topic (extract base from mqtt_topic, e.g. "cfarm/esp-001" → "cfarm/{device_code}")
            'snprintf(LOCAL_CMD_TOPIC': f'// snprintf(LOCAL_CMD_TOPIC (auto: {mqtt_topic})',
            'snprintf(LOCAL_HEARTBEAT_TOPIC': f'// snprintf(LOCAL_HEARTBEAT_TOPIC (auto)',
            'snprintf(LOCAL_ACK_TOPIC': f'// snprintf(LOCAL_ACK_TOPIC (auto)',
            'snprintf(CLOUD_CMD_TOPIC': f'// snprintf(CLOUD_CMD_TOPIC (auto)',
            'snprintf(CLOUD_HEARTBEAT_TOPIC': f'// snprintf(CLOUD_HEARTBEAT_TOPIC (auto)',
            'snprintf(CLOUD_ACK_TOPIC': f'// snprintf(CLOUD_ACK_TOPIC (auto)',
        }

        # Also substitute hardcoded DEVICE_CODE in other places
        source_code = re.sub(
            r'const char\* DEVICE_CODE = "[^"]*"',
            f'const char* DEVICE_CODE = "{device_code}"',
            source_code
        )
        source_code = re.sub(
            r'const char\* DEVICE_TYPE = "[^"]*"',
            f'const char* DEVICE_TYPE = "{device_type_code}"',
            source_code
        )

        # Substitute in buildTopics() function - the mqtt_topic
        source_code = re.sub(
            r'snprintf\(LOCAL_CMD_TOPIC,.*?"cfarm/%s/cmd", DEVICE_CODE\)',
            f'snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE)',
            source_code
        )
        source_code = re.sub(
            r'snprintf\(LOCAL_HEARTBEAT_TOPIC,.*?"cfarm/%s/heartbeat", DEVICE_CODE\)',
            f'snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE)',
            source_code
        )
        source_code = re.sub(
            r'snprintf\(LOCAL_ACK_TOPIC,.*?"cfarm/%s/ack", DEVICE_CODE\)',
            f'snprintf(LOCAL_ACK_TOPIC, sizeof(LOCAL_ACK_TOPIC), "cfarm/%s/ack", DEVICE_CODE)',
            source_code
        )
        source_code = re.sub(
            r'snprintf\(CLOUD_CMD_TOPIC,.*?"cfarm\.vn/%s/cmd", DEVICE_CODE\)',
            f'snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC), "cfarm.vn/%s/cmd", DEVICE_CODE)',
            source_code
        )
        source_code = re.sub(
            r'snprintf\(CLOUD_HEARTBEAT_TOPIC,.*?"cfarm\.vn/%s/heartbeat", DEVICE_CODE\)',
            f'snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC), "cfarm.vn/%s/heartbeat", DEVICE_CODE)',
            source_code
        )
        source_code = re.sub(
            r'snprintf\(CLOUD_ACK_TOPIC,.*?"cfarm\.vn/%s/ack", DEVICE_CODE\)',
            f'snprintf(CLOUD_ACK_TOPIC, sizeof(CLOUD_ACK_TOPIC), "cfarm.vn/%s/ack", DEVICE_CODE)',
            source_code
        )

        return {
            "ok": True,
            "device_code": device_code,
            "device_type": device_type_code,
            "mqtt_topic": mqtt_topic,
            "firmware_name": source_file.name,
            "code": source_code,
        }

    async def set_mother(self, firmware_id: int) -> dict:
        """Set a firmware as mother (default) for its device type."""
        # Get the firmware to find its type
        fw = await db.fetchrow("SELECT device_type_code FROM firmwares WHERE id = $1", firmware_id)
        if not fw:
            return {"ok": False, "message": "Firmware not found"}

        # Unmark current mother for this type
        await db.execute(
            """UPDATE firmwares SET is_mother = FALSE
            WHERE device_type_code = $1 AND is_mother = TRUE""",
            fw["device_type_code"],
        )

        # Set new mother
        await db.execute(
            "UPDATE firmwares SET is_mother = TRUE WHERE id = $1",
            firmware_id,
        )

        return {"ok": True, "message": f"Firmware {firmware_id} is now mother for {fw['device_type_code']}"}

    async def upload(self, device_type_code: str, version: str,
                     file_content: bytes, filename: str,
                     changelog: str = "", is_mother: bool = False) -> dict:
        """Upload a new firmware binary.

        If is_mother=True, sets this as the default firmware for the type.
        If this is the first firmware for the type, it's automatically set as mother.
        """
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

        # Check if this is first firmware for type
        existing = await db.fetchval(
            "SELECT COUNT(*) FROM firmwares WHERE device_type_code = $1",
            device_type_code,
        )
        is_first = existing == 0

        # If is_mother=True or this is the first firmware, unset current mother
        if is_mother or is_first:
            await db.execute(
                """UPDATE firmwares SET is_mother = FALSE
                WHERE device_type_code = $1 AND is_mother = TRUE""",
                device_type_code,
            )

        # Insert new firmware
        row = await db.fetchrow(
            """INSERT INTO firmwares
            (device_type_code, version, filename, file_size, checksum, changelog, is_latest, is_mother)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
            RETURNING *""",
            device_type_code, version, safe_name,
            len(file_content), checksum, changelog,
            is_mother or is_first,  # true if first firmware or explicitly set
        )

        logger.info(f"Firmware uploaded: {device_type_code} v{version} ({len(file_content)} bytes, mother={is_mother or is_first})")
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

        firmware = await self.get_default(type_code)
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
