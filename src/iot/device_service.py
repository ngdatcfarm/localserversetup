"""Device Service - CRUD operations for IoT devices stored in PostgreSQL."""

import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


class DeviceService:
    """Manages IoT device registration, status, and queries."""

    # ── CRUD ──────────────────────────────────────────

    async def create(self, data: dict) -> dict:
        """Register a new device.

        Firmware is auto-assigned by DB trigger (trg_devices_auto_firmware).
        It prefers is_mother firmware, falls back to is_latest.

        If device_code is not provided, auto-generates esp-XXXXX (5-digit random).
        If mqtt_topic is not provided, auto-generates from device_code.
        """
        # Auto-generate device_code if not provided
        device_code = data.get("device_code")
        if not device_code:
            device_code = f"esp-{random.randint(10000, 99999)}"
            logger.info(f"Auto-generated device_code: {device_code}")

        # Auto-generate mqtt_topic from device_code if not provided
        mqtt_topic = data.get("mqtt_topic")
        if not mqtt_topic:
            mqtt_topic = f"cfarm/{device_code}"
            logger.info(f"Auto-generated mqtt_topic: {mqtt_topic}")

        row = await db.fetchrow(
            """INSERT INTO devices (device_code, name, device_type_id, barn_id, mqtt_topic, cycle_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, device_code, name, device_type_id, barn_id, mqtt_topic,
                      firmware_id, cycle_id, is_online, created_at""",
            device_code, data.get("name"),
            data.get("device_type_id"), data.get("barn_id"),
            mqtt_topic, data.get("cycle_id"),
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
        if not row:
            return None
        device = dict(row)
        await self._attach_health_flags([device])
        return device

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
                """SELECT d.*, dt.code as type_code, dt.name as type_name, dt.channel_count
                FROM devices d
                LEFT JOIN device_types dt ON d.device_type_id = dt.id
                WHERE d.barn_id = $1
                ORDER BY d.name""",
                barn_id,
            )
        else:
            rows = await db.fetch(
                """SELECT d.*, dt.code as type_code, dt.name as type_name, dt.channel_count
                FROM devices d
                LEFT JOIN device_types dt ON d.device_type_id = dt.id
                ORDER BY d.name""",
            )
        devices = [dict(r) for r in rows]
        await self._attach_health_flags(devices)
        return devices

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

    async def get_type(self, type_id: int) -> Optional[dict]:
        """Get a single device type."""
        row = await db.fetchrow("SELECT * FROM device_types WHERE id = $1", type_id)
        return dict(row) if row else None

    async def create_type(self, data: dict) -> dict:
        """Create a new device type."""
        row = await db.fetchrow(
            """INSERT INTO device_types (code, name, channel_count, description)
            VALUES ($1, $2, $3, $4)
            RETURNING id, code, name, channel_count, description""",
            data["code"], data["name"],
            data.get("channel_count", 0), data.get("description"),
        )
        return dict(row)

    async def update_type(self, type_id: int, data: dict) -> dict:
        """Update a device type."""
        await db.execute(
            """UPDATE device_types SET
                code = COALESCE($1, code),
                name = COALESCE($2, name),
                channel_count = COALESCE($3, channel_count),
                description = COALESCE($4, description)
            WHERE id = $5""",
            data.get("code"), data.get("name"),
            data.get("channel_count"), data.get("description"),
            type_id,
        )
        return {"ok": True}

    async def delete_type(self, type_id: int) -> bool:
        """Delete a device type (only if no devices use it)."""
        in_use = await db.fetchval(
            "SELECT COUNT(*) FROM devices WHERE device_type_id = $1", type_id
        )
        if in_use:
            return False
        result = await db.execute("DELETE FROM device_types WHERE id = $1", type_id)
        return result == "DELETE 1"

    # ── Test Command ───────────────────────────────────

    async def send_test(self, device_id: int) -> dict:
        """Send a test/ping command to device via MQTT."""
        from src.iot.mqtt_client import mqtt_client

        device = await self.get(device_id)
        if not device:
            return {"ok": False, "message": "Device not found"}

        topic = device["mqtt_topic"]
        sent = mqtt_client.publish(f"{topic}/cmd", {"action": "test", "ping": True})
        if not sent:
            return {"ok": False, "message": "MQTT send failed"}

        # Log command
        await db.execute(
            """INSERT INTO device_commands (device_id, command_type, payload, source, status)
            VALUES ($1, 'test', '{"action":"test"}', 'manual', 'sent')""",
            device_id,
        )
        return {"ok": True, "device_code": device["device_code"], "topic": topic}

    # ── Health flags (computed from MQ telemetry) ─────

    async def _attach_health_flags(self, devices: list[dict]) -> None:
        """Compute `needs_check` + `check_reasons` for Sensor-Only devices in place.

        Rules per (device, sensor_type in {mq135_raw, mq137_raw}):
          1. Sensor dead:    raw_min <= 1 AND raw_avg < 30  (24h window)
          2. Low variation:  stddev(rs_r0_ratio) < 0.05 with n >= 100
          3. Never tared:    no completed calibration AND online >= 24h
        Non-sensor devices always get needs_check=False.
        """
        SENSOR_TYPE_ID = 3
        sensor_ids = [d["id"] for d in devices if d.get("device_type_id") == SENSOR_TYPE_ID]
        if not sensor_ids:
            for d in devices:
                d.setdefault("needs_check", False)
                d.setdefault("check_reasons", [])
            return

        # 24h MQ health summary (one row per device+sensor)
        health_rows = await db.fetch(
            """SELECT device_id, sensor_type,
                      COUNT(*)             AS n,
                      MIN(raw_adc)         AS raw_min,
                      AVG(raw_adc)::float  AS raw_avg,
                      STDDEV_POP(rs_r0_ratio)::float AS ratio_stddev
                 FROM mq_ratio_samples
                WHERE device_id = ANY($1)
                  AND time > NOW() - INTERVAL '24 hours'
                GROUP BY device_id, sensor_type""",
            sensor_ids,
        )
        health_map: dict[tuple[int, str], dict] = {
            (r["device_id"], r["sensor_type"]): dict(r) for r in health_rows
        }

        # Calibration status
        cal_rows = await db.fetch(
            """SELECT device_id, sensor_type, MAX(completed_at) AS last_completed
                 FROM mq_calibrations
                WHERE device_id = ANY($1) AND status = 'completed'
                GROUP BY device_id, sensor_type""",
            sensor_ids,
        )
        cal_map: dict[tuple[int, str], "datetime"] = {
            (r["device_id"], r["sensor_type"]): r["last_completed"] for r in cal_rows
        }

        now_utc = datetime.now(timezone.utc)
        for d in devices:
            if d.get("device_type_id") != SENSOR_TYPE_ID:
                d["needs_check"] = False
                d["check_reasons"] = []
                continue

            reasons: list[str] = []
            for stype in ("mq135_raw", "mq137_raw"):
                short = "MQ135" if stype == "mq135_raw" else "MQ137"
                h = health_map.get((d["id"], stype))
                if h is None:
                    # No recent samples — only flag if online and old enough
                    fb = d.get("first_heartbeat_at") or d.get("created_at")
                    if fb and (now_utc - fb.replace(tzinfo=timezone.utc)).total_seconds() >= 24 * 3600:
                        reasons.append(f"{short}: Không có dữ liệu 24h gần nhất")
                    continue

                n = h["n"]
                raw_min = float(h["raw_min"] or 0)
                raw_avg = float(h["raw_avg"] or 0)
                ratio_stddev = float(h["ratio_stddev"] or 0)

                # Rule 1: sensor dead
                if raw_min <= 1 and raw_avg < 30:
                    reasons.append(
                        f"{short}: Sensor chết — raw ADC={int(raw_min)} (avg {raw_avg:.0f})"
                    )
                    continue  # No point checking variation if it's dead

                # Rule 2: low variation (suspected stuck/dirty)
                if n >= 100 and ratio_stddev < 0.05:
                    reasons.append(
                        f"{short}: Biến thiên thấp (σ={ratio_stddev:.3f}) — kiểm tra sensor"
                    )

            # Rule 3: never tared (any sensor type)
            for stype in ("mq135_raw", "mq137_raw"):
                short = "MQ135" if stype == "mq135_raw" else "MQ137"
                if (d["id"], stype) not in cal_map:
                    fb = d.get("first_heartbeat_at") or d.get("created_at")
                    if fb:
                        age_h = (now_utc - fb.replace(tzinfo=timezone.utc)).total_seconds() / 3600
                        if age_h >= 24:
                            reasons.append(
                                f"{short}: Chưa tare (online {age_h:.0f}h)"
                            )

            d["needs_check"] = bool(reasons)
            d["check_reasons"] = reasons

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
