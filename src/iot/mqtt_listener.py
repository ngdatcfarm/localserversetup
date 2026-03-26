"""MQTT Listener - Processes incoming ESP32 messages and stores to database."""

import logging
import time
from datetime import datetime, timezone

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)


class MqttListener:
    """Listens to MQTT topics and processes ESP32 device messages."""

    def __init__(self):
        self._device_cache: dict[str, int] = {}  # mqtt_topic -> device_id

    def start(self):
        """Register all MQTT topic handlers."""
        mqtt_client.subscribe("cfarm/+/heartbeat", self._handle_heartbeat)
        mqtt_client.subscribe("cfarm/+/status", self._handle_status)
        mqtt_client.subscribe("cfarm/+/data", self._handle_sensor_data)
        mqtt_client.subscribe("cfarm/+/sensor", self._handle_sensor_data)
        logger.info("MqttListener: Registered handlers for heartbeat, status, sensor data")

    def _extract_device_topic(self, topic: str) -> str:
        """Extract device topic from full MQTT topic.
        e.g. 'cfarm/barn1/heartbeat' -> 'cfarm/barn1'
        """
        parts = topic.split("/")
        if len(parts) >= 3:
            return "/".join(parts[:2])
        return topic

    def _handle_heartbeat(self, topic: str, payload: dict):
        """Process device heartbeat - update online status and telemetry."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            logger.warning(f"MqttListener: Invalid heartbeat payload from {topic}")
            return

        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._store_heartbeat(device_topic, payload))
            else:
                loop.run_until_complete(self._store_heartbeat(device_topic, payload))
        except RuntimeError:
            # No event loop - create new one for background thread
            asyncio.run(self._store_heartbeat(device_topic, payload))

    async def _store_heartbeat(self, device_topic: str, payload: dict):
        """Store heartbeat data to database."""
        if not db.pool:
            return

        now = datetime.now(timezone.utc)
        wifi_rssi = payload.get("rssi") or payload.get("wifi_rssi")
        ip_address = payload.get("ip") or payload.get("ip_address")
        uptime = payload.get("uptime") or payload.get("uptime_seconds")
        free_heap = payload.get("heap") or payload.get("free_heap_bytes")
        firmware = payload.get("firmware") or payload.get("firmware_version")

        await db.execute(
            """UPDATE devices SET
                is_online = TRUE,
                last_heartbeat_at = $1,
                wifi_rssi = COALESCE($2, wifi_rssi),
                ip_address = COALESCE($3, ip_address),
                uptime_seconds = COALESCE($4, uptime_seconds),
                free_heap_bytes = COALESCE($5, free_heap_bytes),
                firmware_version = COALESCE($6, firmware_version),
                updated_at = $1
            WHERE mqtt_topic = $7""",
            now, wifi_rssi, ip_address, uptime, free_heap, firmware, device_topic,
        )
        logger.debug(f"Heartbeat: {device_topic} rssi={wifi_rssi} ip={ip_address}")

    def _handle_status(self, topic: str, payload: dict):
        """Process device status update (relay state changes)."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            return

        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._store_status(device_topic, payload))
            else:
                loop.run_until_complete(self._store_status(device_topic, payload))
        except RuntimeError:
            asyncio.run(self._store_status(device_topic, payload))

    async def _store_status(self, device_topic: str, payload: dict):
        """Store device state change to database."""
        if not db.pool:
            return

        now = datetime.now(timezone.utc)

        # Get device_id from cache or DB
        device_id = await self._get_device_id(device_topic)
        if not device_id:
            logger.warning(f"Status: Unknown device {device_topic}")
            return

        channel = payload.get("channel")
        state = payload.get("state")
        if channel is None or state is None:
            return

        # Upsert current state
        await db.execute(
            """INSERT INTO device_states (device_id, channel_number, state, updated_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (device_id, channel_number)
            DO UPDATE SET state = $3, updated_at = $4""",
            device_id, channel, state, now,
        )

        # Append to state log (time-series)
        await db.execute(
            """INSERT INTO device_state_log (time, device_id, channel_number, state, source)
            VALUES ($1, $2, $3, $4, $5)""",
            now, device_id, channel, state, payload.get("source", "device"),
        )

        logger.debug(f"Status: {device_topic} ch{channel}={state}")

    def _handle_sensor_data(self, topic: str, payload: dict):
        """Process sensor data (temperature, humidity, etc.)."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            return

        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._store_sensor_data(device_topic, payload))
            else:
                loop.run_until_complete(self._store_sensor_data(device_topic, payload))
        except RuntimeError:
            asyncio.run(self._store_sensor_data(device_topic, payload))

    async def _store_sensor_data(self, device_topic: str, payload: dict):
        """Store sensor reading to TimescaleDB."""
        if not db.pool:
            return

        now = datetime.now(timezone.utc)
        device_id = await self._get_device_id(device_topic)
        if not device_id:
            logger.warning(f"Sensor: Unknown device {device_topic}")
            return

        # Get barn_id for this device
        barn_id = await db.fetchval(
            "SELECT barn_id FROM devices WHERE id = $1", device_id
        )

        # Support multiple sensor readings in one message
        # Format: {"temperature": 28.5, "humidity": 65.2}
        # Or: {"sensors": [{"type": "temperature", "value": 28.5, "unit": "°C"}]}
        sensors = payload.get("sensors")
        if sensors and isinstance(sensors, list):
            for s in sensors:
                await self._insert_sensor_reading(
                    now, device_id, s.get("type", "unknown"),
                    s.get("value", 0), s.get("unit", ""),
                    barn_id, payload.get("cycle_id"),
                )
        else:
            # Flat format - iterate known sensor keys
            sensor_map = {
                "temperature": "°C",
                "humidity": "%",
                "light": "lux",
                "soil_moisture": "%",
                "co2": "ppm",
                "nh3": "ppm",
                "pressure": "hPa",
                "wind_speed": "m/s",
            }
            for key, unit in sensor_map.items():
                if key in payload:
                    value = payload[key]
                    if isinstance(value, (int, float)):
                        await self._insert_sensor_reading(
                            now, device_id, key, value, unit,
                            barn_id, payload.get("cycle_id"),
                        )

    async def _insert_sensor_reading(
        self, time, device_id, sensor_type, value, unit, barn_id, cycle_id
    ):
        """Insert a single sensor reading."""
        await db.execute(
            """INSERT INTO sensor_data (time, device_id, sensor_type, value, unit, barn_id, cycle_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            time, device_id, sensor_type, float(value), unit, barn_id, cycle_id,
        )

    async def _get_device_id(self, device_topic: str) -> int | None:
        """Get device ID from topic, with cache."""
        if device_topic in self._device_cache:
            return self._device_cache[device_topic]

        device_id = await db.fetchval(
            "SELECT id FROM devices WHERE mqtt_topic = $1", device_topic
        )
        if device_id:
            self._device_cache[device_topic] = device_id
        return device_id


# Module-level singleton
mqtt_listener = MqttListener()
