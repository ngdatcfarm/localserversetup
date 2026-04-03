"""MQTT Listener - Processes incoming ESP32 messages and stores to database."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)


class MqttListener:
    """Listens to MQTT topics and processes ESP32 device messages."""

    def __init__(self):
        self._device_cache: dict[str, int] = {}  # mqtt_topic -> device_id
        self._queue: asyncio.Queue[tuple[str, dict, dict]] = asyncio.Queue()
        self._started = False
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self):
        """Register all MQTT topic handlers."""
        mqtt_client.subscribe("cfarm/+/heartbeat", self._handle_heartbeat)
        mqtt_client.subscribe("cfarm/+/status", self._handle_status)
        mqtt_client.subscribe("cfarm/+/data", self._handle_sensor_data)
        mqtt_client.subscribe("cfarm/+/sensor", self._handle_sensor_data)
        logger.info("MqttListener: Registered handlers for heartbeat, status, sensor data")

    def _queue_work(self, handler_name: str, device_topic: str, payload: dict):
        """Queue work to be processed by the asyncio event loop."""
        if self._loop is None:
            logger.warning(f"MqttListener: No event loop stored for {handler_name}")
            return
        # Put work in queue - this is thread-safe
        self._loop.call_soon_threadsafe(
            lambda: self._queue.put_nowait((handler_name, device_topic, payload))
        )

    async def _process_queue(self):
        """Process queued work from the MQTT callback thread."""
        while True:
            try:
                handler_name, device_topic, payload = await self._queue.get()
                if handler_name == "_store_heartbeat":
                    await self._store_heartbeat(device_topic, payload)
                elif handler_name == "_store_status":
                    await self._store_status(device_topic, payload)
                elif handler_name == "_store_sensor_data":
                    await self._store_sensor_data(device_topic, payload)
            except Exception as e:
                logger.error(f"MqttListener: Error processing queue: {e}")

    def start_queue_processor(self):
        """Start the queue processor task (must be called from asyncio context)."""
        if not self._started:
            self._loop = asyncio.get_running_loop()
            asyncio.create_task(self._process_queue())
            self._started = True

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

        logger.info(f"MqttListener: Queuing heartbeat from {device_topic}")
        self._queue_work("_store_heartbeat", device_topic, payload)

    async def _store_heartbeat(self, device_topic: str, payload: dict):
        """Store heartbeat data to database. Auto-creates device if not exists (MQTT auto-discovery)."""
        if not db.pool:
            logger.warning("MqttListener: db.pool is None, returning early")
            return

        logger.info(f"MqttListener: Processing heartbeat from {device_topic} with payload {payload}")

        now = datetime.now(timezone.utc)
        wifi_rssi = payload.get("rssi") or payload.get("wifi_rssi")
        ip_address = payload.get("ip") or payload.get("ip_address")
        uptime = payload.get("uptime") or payload.get("uptime_seconds")
        free_heap = payload.get("heap") or payload.get("free_heap_bytes")
        firmware = payload.get("firmware") or payload.get("firmware_version")
        device_code = payload.get("device_code") or payload.get("code") or device_topic.split("/")[-1]
        device_name = payload.get("name") or device_code
        device_type = payload.get("device_type") or payload.get("type") or "mixed"

        # Try UPDATE first, then INSERT if no rows affected (upsert with auto-discovery)
        result = await db.execute(
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

        # If device doesn't exist, auto-create it (MQTT auto-discovery)
        if result == "UPDATE 0":
            # Try to determine device type
            type_mapping = {
                "relay": 1,      # Relay 4 Channel
                "relay_4ch": 1,
                "relay_8ch": 2,
                "sensor": 3,     # Sensor Only
                "mixed": 4,       # Mixed Relay + Sensor
            }
            device_type_id = type_mapping.get(device_type.lower() if isinstance(device_type, str) else "mixed", 4)

            # Extract barn_id from device_topic if possible (e.g., cfarm/barn1 -> barn1)
            barn_id = None
            if "/" in device_topic:
                parts = device_topic.split("/")
                if len(parts) >= 2:
                    potential_barn = parts[1]
                    # Check if this barn exists
                    barn_exists = await db.fetchval(
                        "SELECT 1 FROM barns WHERE id = $1", potential_barn
                    )
                    if barn_exists:
                        barn_id = potential_barn

            try:
                await db.execute(
                    """INSERT INTO devices (device_code, name, device_type_id, barn_id, mqtt_topic, is_online,
                        last_heartbeat_at, wifi_rssi, ip_address, uptime_seconds, free_heap_bytes,
                        firmware_version, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $6, $6)""",
                    device_code, device_name, device_type_id, barn_id, device_topic,
                    now, wifi_rssi, ip_address, uptime, free_heap, firmware,
                )
                logger.info(f"Auto-discovered new device via MQTT: {device_topic} ({device_code})")
            except Exception as e:
                # Race condition - another request might have created it first
                if "duplicate key" not in str(e).lower():
                    logger.error(f"Failed to auto-create device {device_topic}: {e}")

        logger.debug(f"Heartbeat: {device_topic} rssi={wifi_rssi} ip={ip_address}")

    def _handle_status(self, topic: str, payload: dict):
        """Process device status update (relay state changes)."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            return

        self._queue_work("_store_status", device_topic, payload)

    async def _store_status(self, device_topic: str, payload: dict):
        """Store device state change to database. Auto-creates device if not exists."""
        if not db.pool:
            return

        now = datetime.now(timezone.utc)

        # Get device_id from cache or DB
        device_id = await self._get_device_id(device_topic)
        if not device_id:
            logger.warning(f"Status: Unknown device {device_topic}, triggering auto-discovery")
            # Try to get device_id again after potential auto-creation from heartbeat
            device_id = await self._get_device_id(device_topic)
            if not device_id:
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

        # Handle acknowledgment if sequence number provided
        seq = payload.get("seq")
        if seq is not None:
            await db.execute(
                """UPDATE device_commands
                SET status = 'acknowledged', acknowledged_at = NOW()
                WHERE device_id = $1 AND sequence_number = $2 AND status = 'pending'""",
                device_id, seq,
            )
            logger.debug(f"Ack: device={device_topic} seq={seq}")

        logger.debug(f"Status: {device_topic} ch{channel}={state}")

    def _handle_sensor_data(self, topic: str, payload: dict):
        """Process sensor data (temperature, humidity, etc.)."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            return

        self._queue_work("_store_sensor_data", device_topic, payload)

    async def _store_sensor_data(self, device_topic: str, payload: dict):
        """Store sensor reading to TimescaleDB. Auto-creates device if not exists."""
        if not db.pool:
            return

        now = datetime.now(timezone.utc)
        device_id = await self._get_device_id(device_topic)
        if not device_id:
            logger.warning(f"Sensor: Unknown device {device_topic}, triggering auto-discovery")
            # Trigger heartbeat check to auto-create device
            device_id = await self._get_device_id(device_topic)
            if not device_id:
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
