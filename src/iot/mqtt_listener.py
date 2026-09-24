"""MQTT Listener - Processes incoming ESP32 messages and stores to database."""

import asyncio
import json
import logging
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from src.iot.device_state import EXPECTED_RESET_REASONS, DeviceStateCounters, extract_device_state
from src.iot.mqtt_client import mqtt_client
from src.iot.mq_tare_service import mq_tare_service, MQ_SENSOR_TYPES
from src.services.database.db import db

logger = logging.getLogger(__name__)


class MqttListener:
    """Listens to MQTT topics and processes ESP32 device messages."""

    def __init__(self):
        self._device_cache: dict[str, int] = {}  # mqtt_topic -> device_id
        self._queue: asyncio.Queue[tuple[str, dict, dict]] = asyncio.Queue()
        self._started = False
        self._loop: asyncio.AbstractEventLoop | None = None
        # Per-device throttle for the sensor-driven heartbeat fallback.
        # Updated whenever _store_sensor_data bumps last_heartbeat_at, so
        # we don't write on every single sensor packet (dual-SHT40 sends
        # ~6/min). 30s window keeps the UPDATE out of the hypertable hot
        # path while still refreshing the freshness timestamp frequently
        # enough to stay ahead of the 180s staleness sweep.
        self._last_heartbeat_bump: dict[str, float] = {}

    def start(self):
        """Register all MQTT topic handlers."""
        mqtt_client.subscribe("cfarm/+/heartbeat", self._handle_heartbeat)
        mqtt_client.subscribe("cfarm/+/status", self._handle_status)
        mqtt_client.subscribe("cfarm/+/data", self._handle_sensor_data)
        mqtt_client.subscribe("cfarm/+/sensor", self._handle_sensor_data)
        mqtt_client.subscribe("cfarm/+/sensor/+", self._handle_sensor_data)  # sub-sensor variants (a/b)
        # LWT — broker auto-publishes on cfarm/{code}/lwt when the device's
        # MQTT session ends (WiFi drop, power loss, watchdog reset). Gives
        # a sub-second offline signal so the UI doesn't have to wait for
        # the 180s heartbeat-staleness sweep in device_service.check_offline.
        mqtt_client.subscribe("cfarm/+/lwt", self._handle_lwt)
        # v1.4.6: event-driven diagnostic notifications from firmware.
        # Topic: cfarm/{code}/diagnostic (QoS 1, not retained). Payload
        # schema: {device_code, device_type, event_type, uptime_s,
        # reset_reason, boot_count, sensor_state, details}. Common
        # event_types: "boot", "sensor_state_change", "i2c_recovery",
        # "mode_transition", "heap_low". Stored as last_diagnostic_event
        # (JSONB) on the device row + a warning log on abnormal boots.
        mqtt_client.subscribe("cfarm/+/diagnostic", self._handle_diagnostic)
        logger.info("MqttListener: Registered handlers for heartbeat, status, sensor data, lwt, diagnostic")

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
                elif handler_name == "_store_lwt":
                    await self._store_lwt(device_topic, payload)
                elif handler_name == "_store_diagnostic":
                    await self._store_diagnostic(device_topic, payload)
                elif handler_name == "_store_heartbeat_minimal":
                    await self._store_heartbeat_minimal(device_topic)
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
             'cfarm/barn1/sensor/a'  -> 'cfarm/barn1'   (sub-sensor dropped here)
        """
        parts = topic.split("/")
        if len(parts) >= 3:
            return "/".join(parts[:2])
        return topic

    def _extract_sub_sensor(self, topic: str) -> str | None:
        """Return sub-sensor code ('a'/'b') for `cfarm/{code}/sensor/{sub}`,
        or None for legacy `cfarm/{code}/sensor` (defaults to 'a' downstream)."""
        parts = topic.split("/")
        if len(parts) == 4 and parts[0] == "cfarm" and parts[2] == "sensor":
            return parts[3]
        return None

    def _device_code_from_payload(self, device_topic: str, payload: dict) -> str:
        """Resolve device_code from payload (firmware-authored, authoritative)
        with topic-last-segment fallback for legacy raw-string payloads.

        Also checks the legacy `payload.get("code")` alias used by older
        firmware in heartbeat payloads (predates v1.4.6 `device_code`).
        """
        return (
            payload.get("device_code")
            or payload.get("code")
            or device_topic.split("/")[-1]
        )

    def _handle_heartbeat(self, topic: str, payload):
        """Process device heartbeat - update online status and telemetry.

        `payload` is normally a dict (JSON-decoded by mqtt_client._on_message).
        v1.4.7 firmware on some devices has a buffer-overflow bug in
        publishHeartbeat() that produces non-UTF-8 garbage bytes instead of
        a JSON object. mqtt_client now keeps raw bytes instead of raising,
        so this handler receives bytes/str. Fallback: mark the device as
        alive (is_online=TRUE + last_heartbeat_at=NOW) so the dashboard
        doesn't flap, and log a warning so the operator sees the bug.
        """
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            # Garbage payload — likely a known firmware bug. Treat as
            # presence-only heartbeat. We can't extract firmware/RSSI/etc
            # but we CAN mark the device online.
            logger.warning(
                f"MqttListener: Non-dict heartbeat from {topic} "
                f"({type(payload).__name__}, len={len(payload) if payload else 0}). "
                "Treating as presence-only — device appears alive but "
                "firmware may be sending corrupted payload (reflash recommended)."
            )
            self._queue_work("_store_heartbeat_minimal", device_topic, None)
            return

        logger.debug(f"MqttListener: >>> HEARTBEAT RECEIVED from {device_topic}, payload={payload}")
        self._queue_work("_store_heartbeat", device_topic, payload)

    def _handle_lwt(self, topic: str, payload: dict):
        """Process LWT (Last-Will-and-Testament) — fired by the broker when
        the device's MQTT session ends unexpectedly (WiFi drop, power loss,
        watchdog reset). Payload is normally a JSON dict like
        `{"status":"offline","device_code":"esp32-XXXX"}` but some legacy
        firmware may publish a raw string, so coerce defensively.
        """
        device_topic = self._extract_device_topic(topic)
        if not isinstance(payload, dict):
            # mqtt_client._on_message tries json.loads first; if that failed
            # we got the raw string back. Best-effort parse, else treat as
            # opaque "offline" signal.
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {"status": "offline", "_raw": payload[:120]}
            else:
                logger.warning(f"MqttListener: Invalid LWT payload from {topic}: {payload!r}")
                return
        self._queue_work("_store_lwt", device_topic, payload)

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
        device_code = self._device_code_from_payload(device_topic, payload)
        device_name = payload.get("name") or device_code
        device_type = payload.get("device_type") or payload.get("type") or "mixed"

        # ── Sub-sensor health (dual_sht40 firmware v1.0.0+) ──────────────
        # The firmware publishes a sub-sensor health snapshot in every heartbeat
        # so the server can flag degraded sub-sensors before they fail outright.
        # We extract the fields, normalise the per-sub state, and manage
        # _bad_since transitions (set on entry to BAD, clear on exit).
        sub_sensor_health_raw = payload.get("sub_sensor_health") or {}
        if not isinstance(sub_sensor_health_raw, dict):
            sub_sensor_health_raw = {}
        # asyncpg encodes JSONB as a string — must pre-serialise the dict
        # here, otherwise the JSONB parameter fails with "expected str, got dict".
        sub_sensor_health_json = json.dumps(sub_sensor_health_raw) if sub_sensor_health_raw else None
        sub_a_state_in = str(sub_sensor_health_raw.get("a") or "UNKNOWN").upper()
        sub_b_state_in = str(sub_sensor_health_raw.get("b") or "UNKNOWN").upper()
        # Clamp to allowed values (defensive against firmware bugs)
        allowed = {"UNKNOWN", "GOOD", "DEGRADED", "BAD"}
        sub_a_state = sub_a_state_in if sub_a_state_in in allowed else "UNKNOWN"
        sub_b_state = sub_b_state_in if sub_b_state_in in allowed else "UNKNOWN"
        sub_present_bitmask = int(payload.get("sub_sensors_present") or 0)
        sub_total_fails = payload.get("sub_sensor_total_fails") or {}
        if not isinstance(sub_total_fails, dict):
            sub_total_fails = {}
        sub_a_fails = int(sub_total_fails.get("a") or 0)
        sub_b_fails = int(sub_total_fails.get("b") or 0)

        # Fetch previous state to manage BAD→non-BAD and non-BAD→BAD transitions.
        prev = await db.fetchrow(
            """SELECT sub_sensor_a_state, sub_sensor_b_state
            FROM devices WHERE mqtt_topic = $1""",
            device_topic,
        )
        prev_a_state = prev["sub_sensor_a_state"] if prev else "UNKNOWN"
        prev_b_state = prev["sub_sensor_b_state"] if prev else "UNKNOWN"

        # v1.4.6: extract device-state counters into a single dataclass so
        # _apply_heartbeat_update + the auto-discovery INSERT stay in sync
        # via the same field set (see DeviceStateCounters docstring).
        device_state = extract_device_state(payload)

        # Set _bad_since ONLY on transition into BAD (preserve existing timestamp
        # while still BAD; clear on exit to GOOD/DEGRADED/UNKNOWN).
        # Use a sentinel string + COALESCE in SQL so we can keep the existing
        # value when the device was already BAD and is still BAD.
        if sub_a_state == "BAD" and prev_a_state != "BAD":
            a_bad_since = now
        elif sub_a_state != "BAD":
            a_bad_since = None  # cleared; SQL will set NULL
        else:
            a_bad_since = None  # already BAD; sentinel → keep existing via COALESCE
        if sub_b_state == "BAD" and prev_b_state != "BAD":
            b_bad_since = now
        elif sub_b_state != "BAD":
            b_bad_since = None
        else:
            b_bad_since = None  # sentinel → keep existing via COALESCE

        # Try UPDATE first, then INSERT if no rows affected (upsert with auto-discovery)
        result = await self._apply_heartbeat_update(
            device_topic=device_topic,
            now=now,
            wifi_rssi=wifi_rssi, ip_address=ip_address,
            uptime=uptime, free_heap=free_heap, firmware=firmware,
            sub_sensor_health_json=sub_sensor_health_json,
            sub_present_bitmask=sub_present_bitmask,
            sub_a_state=sub_a_state, sub_b_state=sub_b_state,
            a_transition=(sub_a_state == "BAD" and prev_a_state != "BAD"),
            b_transition=(sub_b_state == "BAD" and prev_b_state != "BAD"),
            sub_a_fails=sub_a_fails, sub_b_fails=sub_b_fails,
            device_state=device_state,
        )

        # If device doesn't exist, auto-create it (MQTT auto-discovery)
        if result == "UPDATE 0":
            # First, check if a row exists with the same device_code but a
            # different (stale) mqtt_topic. This happens when an operator
            # pre-creates a row before the firmware comes online and types
            # the topic without the device-type prefix — e.g. they type
            # `cfarm/esp32-2588/control` but the firmware publishes on
            # `cfarm/brooder-esp32-2588/heartbeat`. The heartbeat UPDATE
            # fails on mqtt_topic match, the INSERT fails on device_code
            # UNIQUE, and the device silently never comes online.
            #
            # Fix: auto-derive the firmware-reported topic onto the
            # pre-created row, then retry the heartbeat UPDATE.
            existing = await db.fetchrow(
                "SELECT id, mqtt_topic FROM devices WHERE device_code = $1 LIMIT 1",
                device_code,
            )
            if existing and existing["mqtt_topic"] != device_topic:
                old_topic = existing["mqtt_topic"]
                logger.warning(
                    f"Auto-deriving mqtt_topic for {device_code}: "
                    f"'{old_topic}' -> '{device_topic}' (firmware-reported topic)"
                )
                await db.execute(
                    "UPDATE devices SET mqtt_topic = $1, updated_at = NOW() WHERE id = $2",
                    device_topic, existing["id"],
                )
                # Keep _device_cache consistent: handlers in this process
                # (status/sensor) look up device_id by mqtt_topic. Without
                # this swap, the first status/sensor message after the fix
                # would still hit the stale entry and miss the row.
                self._device_cache[device_topic] = existing["id"]
                self._device_cache.pop(old_topic, None)
                # Retry the heartbeat UPDATE — it should now match.
                # Sub-sensor transition logic is best-effort on this retry
                # (prev was fetched before the topic swap); the next 60s
                # heartbeat will use the correct prev state.
                result = await self._apply_heartbeat_update(
                    device_topic=device_topic,
                    now=now,
                    wifi_rssi=wifi_rssi, ip_address=ip_address,
                    uptime=uptime, free_heap=free_heap, firmware=firmware,
                    sub_sensor_health_json=sub_sensor_health_json,
                    sub_present_bitmask=sub_present_bitmask,
                    sub_a_state=sub_a_state, sub_b_state=sub_b_state,
                    a_transition=(sub_a_state == "BAD" and prev_a_state != "BAD"),
                    b_transition=(sub_b_state == "BAD" and prev_b_state != "BAD"),
                    sub_a_fails=sub_a_fails, sub_b_fails=sub_b_fails,
                    device_state=device_state,
                )

        if result == "UPDATE 0":
            # Try to determine device type. Legacy IDs (1-4) are hardcoded
            # for fast-path on hot heartbeats. New types added via migration
            # (e.g. dual_sht40 via 073) get a DB lookup by code — the actual
            # id depends on what other types the operator has added.
            type_mapping = {
                "relay": 1,        # Relay 4 Channel
                "relay_4ch": 1,
                "relay_8ch": 2,
                "sensor": 3,       # Sensor Only (1× SHT40 + 2× MQ)
                "mixed": 4,        # Mixed Relay + Sensor
            }
            if isinstance(device_type, str):
                key = device_type.lower()
                mapped = type_mapping.get(key)
                if mapped is not None:
                    device_type_id = mapped
                else:
                    # Unknown code (e.g. dual_sht40) — look up by code.
                    row = await db.fetchrow(
                        "SELECT id FROM device_types WHERE code = $1 LIMIT 1",
                        key,
                    )
                    device_type_id = row["id"] if row else 4  # mixed fallback
            else:
                device_type_id = 4

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

            # First-heartbeat for a brand-new dual_sht40 device: populate the
            # sub-sensor health columns immediately rather than leaving the
            # defaults (UNKNOWN/NULL/0). If a sub-sensor is already BAD at
            # first contact, seed `_bad_since = now` so the > 1h alert rule
            # has a non-NULL timestamp to compare against.
            a_bad_since_initial = now if sub_a_state == "BAD" else None
            b_bad_since_initial = now if sub_b_state == "BAD" else None

            try:
                # v1.4.6: spread the dataclass into the parameter list so the
                # INSERT column order stays in lockstep with the UPDATE path
                # and DeviceStateCounters. asdict() preserves field order.
                ds = asdict(device_state)
                await db.execute(
                    """INSERT INTO devices (device_code, name, device_type_id, barn_id, mqtt_topic, is_online,
                        last_heartbeat_at, first_heartbeat_at, wifi_rssi, ip_address, uptime_seconds, free_heap_bytes,
                        firmware_version,
                        sub_sensor_health, sub_sensors_present,
                        sub_sensor_a_state, sub_sensor_b_state,
                        sub_sensor_a_bad_since, sub_sensor_b_bad_since,
                        sub_sensor_a_fails, sub_sensor_b_fails,
                        reset_reason, boot_count, wdt_reset_count, brownout_count, panic_count,
                        max_uptime_s, i2c_error_count, i2c_recovery_count,
                        wifi_disconnect_count, mqtt_disconnect_count,
                        sensor_state, heap_min,
                        created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, TRUE, $6, $6, $7, $8, $9, $10, $11,
                            $12::jsonb, $13,
                            $14, $15,
                            $16, $17,
                            $18, $19,
                            $20, $21, $22, $23, $24,
                            $25, $26, $27,
                            $28, $29,
                            $30, $31,
                            $6, $6)""",
                    device_code, device_name, device_type_id, barn_id, device_topic,
                    now, wifi_rssi, ip_address, uptime, free_heap, firmware,
                    sub_sensor_health_json, sub_present_bitmask,
                    sub_a_state, sub_b_state,
                    a_bad_since_initial, b_bad_since_initial,
                    sub_a_fails, sub_b_fails,
                    # v1.4.6 state counters (mirrors DeviceStateCounters order)
                    ds["reset_reason"],
                    ds["boot_count"], ds["wdt_reset_count"],
                    ds["brownout_count"], ds["panic_count"], ds["max_uptime_s"],
                    ds["i2c_error_count"], ds["i2c_recovery_count"],
                    ds["wifi_disconnect_count"], ds["mqtt_disconnect_count"],
                    ds["sensor_state"], ds["heap_min"],
                )
                logger.info(f"Auto-discovered new device via MQTT: {device_topic} ({device_code})")
            except Exception as e:
                # Race condition - another request might have created it first.
                # Most common cause: pre-created row has different mqtt_topic
                # than what the firmware actually publishes on — UPDATE fails
                # on mqtt_topic match, INSERT fails on device_code UNIQUE.
                # Log a WARNING (not error) so the mismatch surfaces in logs.
                if "duplicate key" in str(e).lower():
                    logger.warning(
                        f"Auto-create collision for {device_topic} "
                        f"(device_code already exists with different mqtt_topic "
                        f"— likely manual row creation): {e}"
                    )
                else:
                    logger.error(f"Failed to auto-create device {device_topic}: {e}")

        logger.debug(f"Heartbeat: {device_topic} rssi={wifi_rssi} ip={ip_address}")

    async def _store_heartbeat_minimal(self, device_topic: str):
        """Presence-only heartbeat update for corrupted payloads.

        Used when _handle_heartbeat receives a non-dict (raw bytes / string)
        — the firmware is alive (the broker delivered the message) but the
        payload is unparseable (typically v1.4.7 buffer-overflow on
        esp32_brooder firmware). We can't extract RSSI / firmware / heap
        fields but we CAN mark the device as online so the dashboard
        doesn't flap. Full data updates resume once the device is
        reflashed with v1.4.8.

        Falls through silently if the row doesn't exist (auto-discovery
        only runs on valid payloads — we don't want to create a row for
        garbage that lacks a device_code either).
        """
        if not db.pool:
            return
        try:
            result = await db.execute(
                """UPDATE devices
                      SET is_online = TRUE,
                          last_heartbeat_at = NOW(),
                          updated_at = NOW()
                    WHERE mqtt_topic = $1""",
                device_topic,
            )
            if result == "UPDATE 0":
                logger.debug(
                    f"Heartbeat-minimal: no row for {device_topic} (no auto-create on garbage payload)"
                )
            else:
                logger.info(
                    f"Heartbeat-minimal: marked {device_topic} online (corrupted payload)"
                )
        except Exception as e:
            logger.error(f"Heartbeat-minimal: failed for {device_topic}: {e}")

    async def _apply_heartbeat_update(
        self,
        device_topic: str,
        now,
        wifi_rssi, ip_address, uptime, free_heap, firmware,
        sub_sensor_health_json,
        sub_present_bitmask: int,
        sub_a_state: str, sub_b_state: str,
        a_transition: bool, b_transition: bool,
        sub_a_fails: int, sub_b_fails: int,
        device_state: DeviceStateCounters,
    ) -> str:
        """Run the heartbeat UPDATE on devices WHERE mqtt_topic = $device_topic.

        Returned string is the asyncpg result tag ("UPDATE N"). Callers
        branch on "UPDATE 0" to detect unknown-topic devices and either
        retry after auto-deriving mqtt_topic, or fall through to the
        auto-discovery INSERT path. Extracted as a helper so the initial
        attempt and the post-derive retry share a single SQL definition —
        any future column/parameter change touches one place.

        v1.4.6: `device_state` carries the firmware-reported counters in a
        single dataclass (see DeviceStateCounters docstring). Persistent
        counters use GREATEST() so out-of-order packets don't decrease
        the value; runtime counters are direct assignments because they
        reset on power-cycle — a value going DOWN is legitimate.
        """
        # Spread the dataclass into the parameter list. Order MUST match the
        # $16..$27 placeholders in the SQL below. Keep this in sync with
        # DeviceStateCounters and the auto-discovery INSERT.
        state = device_state
        return await db.execute(
            """UPDATE devices SET
                is_online = TRUE,
                last_heartbeat_at = $1,
                first_heartbeat_at = COALESCE(first_heartbeat_at, $1),
                wifi_rssi = COALESCE($2, wifi_rssi),
                ip_address = COALESCE($3, ip_address),
                uptime_seconds = COALESCE($4, uptime_seconds),
                free_heap_bytes = COALESCE($5, free_heap_bytes),
                firmware_version = COALESCE($6, firmware_version),
                sub_sensor_health = $8::jsonb,
                sub_sensors_present = $9,
                sub_sensor_a_state = $10::character varying,
                sub_sensor_b_state = $11::character varying,
                sub_sensor_a_bad_since = CASE
                    WHEN $12::boolean THEN $1
                    WHEN NOT $12::boolean AND $10::text != 'BAD' THEN NULL
                    ELSE sub_sensor_a_bad_since
                END,
                sub_sensor_b_bad_since = CASE
                    WHEN $13::boolean THEN $1
                    WHEN NOT $13::boolean AND $11::text != 'BAD' THEN NULL
                    ELSE sub_sensor_b_bad_since
                END,
                sub_sensor_a_fails = $14,
                sub_sensor_b_fails = $15,
                -- v1.4.6: device-state counters (see migration 084).
                -- COALESCE on reset_reason/sensor_state/heap_min keeps the
                -- existing column value when older firmware omits the field.
                reset_reason           = COALESCE($16, reset_reason),
                boot_count             = GREATEST(boot_count, $17),
                wdt_reset_count        = GREATEST(wdt_reset_count, $18),
                brownout_count         = GREATEST(brownout_count, $19),
                panic_count            = GREATEST(panic_count, $20),
                max_uptime_s           = GREATEST(max_uptime_s, $21),
                i2c_error_count        = $22,
                i2c_recovery_count     = $23,
                wifi_disconnect_count  = $24,
                mqtt_disconnect_count  = $25,
                sensor_state           = COALESCE($26, sensor_state),
                heap_min               = COALESCE($27, heap_min),
                updated_at = $1
            WHERE mqtt_topic = $7""",
            now, wifi_rssi, ip_address, uptime, free_heap, firmware, device_topic,
            sub_sensor_health_json, sub_present_bitmask,
            sub_a_state, sub_b_state,
            # booleans: True → set timestamp; False → conditional clear
            a_transition, b_transition,
            sub_a_fails, sub_b_fails,
            # v1.4.6 state counters (mirrors DeviceStateCounters field order)
            state.reset_reason,
            state.boot_count, state.wdt_reset_count,
            state.brownout_count, state.panic_count, state.max_uptime_s,
            state.i2c_error_count, state.i2c_recovery_count,
            state.wifi_disconnect_count, state.mqtt_disconnect_count,
            state.sensor_state, state.heap_min,
        )

    async def _store_lwt(self, device_topic: str, payload: dict):
        """Mark the device OFFLINE on LWT receipt.

        The broker auto-publishes the will payload when the ESP's MQTT
        session ends unexpectedly (WiFi drop, power loss, watchdog reset).
        Topic is `cfarm/{code}/lwt` and payload is normally
        `{"status":"offline","device_code":"esp32-XXXX"}`.

        Why we act here instead of waiting for the 180s heartbeat sweep in
        device_service.check_offline:
        - The UI / dashboards see a stale "online" badge for up to 3min on
          a true offline event otherwise.
        - ESP32s with `setKeepAlive(60)` (broker timeout = 90s) fire LWT
          within ~30s of a WiFi drop. Capturing it directly shortens the
          gap for alerts.

        LWW (last-write-wins) hysteresis: ONLY flip is_online=FALSE when the
        last_heartbeat_at is older than LWT_HYSTERESIS_SECONDS. Why:
        - With keepalive=60s and heartbeats every 60s, broker timeout
          (1.5 × 60 = 90s) fires after a single dropped heartbeat. ESP32
          reconnects within ~10-15s and publishes a fresh heartbeat.
          Naively trusting every LWT would flap is_online every ~90s even
          though the device is alive. Live measurement on esp32-1168
          showed LWTs at exactly 89-92s intervals.
        - A real offline event still trips this guard: if the device is
          truly gone, the next heartbeat never lands, check_offline (180s
          sweep) catches it within ~3min anyway. The hysteresis just
          suppresses false-positive flips from brief packet drops.
        - The hysteresis window (30s) is below the firmware heartbeat
          interval (60s pre-fix, 30s post-fix) so a single missed
          heartbeat will cross the threshold and let a real LWT through.
        """
        if not db.pool:
            return
        # Prefer device_code from payload (firmware-authored, authoritative);
        # fall back to device_topic last part if older ESP sends only raw.
        device_code = self._device_code_from_payload(device_topic, payload)
        # UPDATE by both keys so legacy rows with topic-prefix mismatches still match.
        # Hysteresis guard: skip the flip if last_heartbeat_at is fresh —
        # the device was actively heartbeating when this LWT fired, so it's
        # almost certainly a broker-side false positive (session timeout
        # after a single dropped packet), not a real disconnect.
        LWT_HYSTERESIS_SECONDS = 30
        result = await db.execute(
            f"""UPDATE devices
                  SET is_online = FALSE,
                      updated_at = NOW()
                WHERE (mqtt_topic = $1 OR device_code = $2)
                  AND (last_heartbeat_at IS NULL
                       OR last_heartbeat_at < NOW() - make_interval(secs => {LWT_HYSTERESIS_SECONDS}))""",
            device_topic, device_code,
        )
        # Drop cache so next sensor/heartbeat re-reads the row id cleanly.
        self._device_cache.pop(device_topic, None)
        if result == "UPDATE 1":
            logger.info(
                f"LWT: marked {device_code} OFFLINE (topic={device_topic}, "
                f"hysteresis={LWT_HYSTERESIS_SECONDS}s, payload={payload})"
            )
        elif result == "UPDATE 0":
            # Two valid reasons for UPDATE 0:
            #  1. No matching device row (first-boot before first heartbeat).
            #  2. Device is currently heartbeating — LWT ignored due to
            #     hysteresis. Log at DEBUG (this is the common case under
            #     flaky WiFi + keepalive=60s).
            row = await db.fetchrow(
                """SELECT last_heartbeat_at,
                          EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at))::int AS hb_ago_s
                     FROM devices
                    WHERE mqtt_topic = $1 OR device_code = $2
                    LIMIT 1""",
                device_topic, device_code,
            )
            if row is None:
                logger.debug(
                    f"LWT: no device matched topic={device_topic} code={device_code} "
                    f"(likely first-boot before first heartbeat)"
                )
            else:
                logger.debug(
                    f"LWT: IGNORED (heartbeat {row['hb_ago_s']}s ago < {LWT_HYSTERESIS_SECONDS}s "
                    f"hysteresis) for {device_code} — broker-side false positive, "
                    f"device is actively heartbeating"
                )

    def _handle_status(self, topic: str, payload: dict):
        """Process device status update (relay state changes)."""
        device_topic = self._extract_device_topic(topic)

        if not isinstance(payload, dict):
            # Corrupted/garbage status payload — same handling as heartbeat:
            # queue a presence-only bump so the device doesn't go offline
            # purely because its JSON is malformed.
            logger.warning(
                "MqttListener: Non-dict status payload from %s (%d bytes) — "
                "marking online only",
                topic, len(payload) if isinstance(payload, (bytes, bytearray, str)) else 0,
            )
            self._queue_work("_store_heartbeat_minimal", device_topic)
            return

        self._queue_work("_store_status", device_topic, payload)

    def _handle_diagnostic(self, topic: str, payload: dict):
        """Process event-driven diagnostic notification from firmware (v1.4.6+).

        Topic: cfarm/{code}/diagnostic
        Payload schema: {
            device_code, device_type, event_type, uptime_s,
            reset_reason, boot_count, sensor_state, details: {...}
        }

        Common event_types: "boot", "sensor_state_change", "i2c_recovery",
        "mode_transition", "heap_low". Each event is persisted to the
        device row's last_diagnostic_event (JSONB) + last_diagnostic_at
        timestamp. Abnormal boot events ("boot" with non-power_on reason)
        additionally surface a WARNING log line so operators see them in
        /app_8002.stderr.log without needing to query the DB.
        """
        device_topic = self._extract_device_topic(topic)
        if not isinstance(payload, dict):
            # mqtt_client._on_message tries json.loads first; if that failed
            # we got the raw string back. Best-effort parse, else treat as
            # opaque diagnostic event so we don't drop it entirely.
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {"event_type": "unknown", "_raw": payload[:120]}
            else:
                logger.warning(f"MqttListener: Invalid diagnostic payload from {topic}: {payload!r}")
                return

        self._queue_work("_store_diagnostic", device_topic, payload)

    async def _store_diagnostic(self, device_topic: str, payload: dict):
        """Persist the diagnostic event to the device row.

        Behavior:
        1. UPDATE devices SET last_diagnostic_at = NOW(), last_diagnostic_event = $2,
           reset_reason = COALESCE($3, reset_reason), sensor_state = COALESCE($4, ...).
           Matching by mqtt_topic OR device_code handles pre-created rows where
           the operator set a stale mqtt_topic (mirrors the heartbeat path's
           auto-derive logic, but no auto-create here — diagnostics from an
           unknown device would already imply that earlier heartbeats were
           either dropped or the device is misconfigured).
        2. If event_type=boot AND reset_reason is abnormal (not power_on,
           external, software), log a WARNING so the operator sees the
           abnormal reboot in the running log without needing to query DB.
        """
        if not db.pool:
            return

        device_code = self._device_code_from_payload(device_topic, payload)
        event_type = payload.get("event_type") or "unknown"
        reset_reason = payload.get("reset_reason")
        sensor_state = payload.get("sensor_state")

        # Persist event. We don't try to bump counters here because the
        # heartbeat (≤30s later) will do that — diagnostic topic is for
        # *event-driven* state transitions, not duplicate counter writes.
        try:
            await db.execute(
                """UPDATE devices
                      SET last_diagnostic_at    = NOW(),
                          last_diagnostic_event = $1::jsonb,
                          reset_reason          = COALESCE($2, reset_reason),
                          sensor_state          = COALESCE($3, sensor_state),
                          updated_at            = NOW()
                    WHERE mqtt_topic = $4 OR device_code = $5""",
                json.dumps(payload),
                reset_reason,
                sensor_state,
                device_topic,
                device_code,
            )
        except Exception as e:
            logger.error(f"Diagnostic: failed to persist event for {device_code}: {e}")
            return

        # Surface abnormal boots in the log. EXPECTED_RESET_REASONS mirrors
        # the firmware's "benign" classification (firmware doesn't bump a
        # counter for power_on/software/external); anything else means the
        # device rebooted for a reason the operator should investigate.
        if event_type == "boot" and reset_reason not in EXPECTED_RESET_REASONS:
            logger.warning(
                "Device %s booted with abnormal reset_reason=%s (boot #%s, "
                "uptime_s=%s). Check dashboard /devices for full state.",
                device_code,
                reset_reason,
                payload.get("boot_count"),
                payload.get("uptime_s"),
            )
        else:
            logger.info(
                "Diagnostic event: device=%s event=%s reset_reason=%s "
                "sensor_state=%s uptime_s=%s",
                device_code, event_type, reset_reason, sensor_state,
                payload.get("uptime_s"),
            )

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
        sub_sensor = self._extract_sub_sensor(topic)

        if not isinstance(payload, dict):
            # Corrupted sensor payload — same handling as heartbeat:
            # mark the device online (presence-only) so the dashboard
            # reflects that the device is alive even if we can't parse
            # its sensor fields.
            logger.warning(
                "MqttListener: Non-dict sensor payload from %s (%d bytes) — "
                "marking online only",
                topic, len(payload) if isinstance(payload, (bytes, bytearray, str)) else 0,
            )
            self._queue_work("_store_heartbeat_minimal", device_topic)
            return

        # Stash sub-sensor in payload (underscore-prefixed = metadata, not a sensor key).
        if sub_sensor:
            payload["_sub_sensor"] = sub_sensor

        self._queue_work("_store_sensor_data", device_topic, payload)

    async def _maybe_handle_mq_tare(self, device_id: int, stype: str, value, ts) -> None:
        """Single hook for mq_tare on both sensor-list and flat payloads.

        `mq_tare_service.on_sensor_reading` is internally exception-safe,
        so we don't need a defensive try/except here.
        """
        if stype in MQ_SENSOR_TYPES and isinstance(value, (int, float)):
            await mq_tare_service.on_sensor_reading(device_id, stype, int(value), ts)

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

        # ── Heartbeat fallback ───────────────────────────────────────────
        # Some ESP32 firmwares ship telemetry more often than heartbeats
        # (e.g. dual-SHT40 sends /sensor every 10s but /heartbeat only every
        # 60s). If the heartbeat is dropped (queue contention, network
        # blip), the 180s staleness sweep in device_service.check_offline
        # would flip is_online=FALSE while the device is still happily
        # reporting temperatures.
        #
        # Bump last_heartbeat_at here as a fallback freshness signal,
        # throttled to 30s per device so the extra UPDATE doesn't add to
        # the hypertable write contention.
        last_bump = self._last_heartbeat_bump.get(device_topic, 0.0)
        if (now.timestamp() - last_bump) >= 30.0:
            self._last_heartbeat_bump[device_topic] = now.timestamp()
            try:
                await db.execute(
                    "UPDATE devices SET last_heartbeat_at = $1, "
                    "                       updated_at = $1 "
                    "                  WHERE id = $2",
                    now, device_id,
                )
            except Exception as e:
                # Non-fatal — the next /heartbeat will repair this.
                logger.debug(f"sensor-fallback heartbeat bump failed for "
                             f"{device_topic}: {e}")

        # Get barn_id for this device
        barn_id = await db.fetchval(
            "SELECT barn_id FROM devices WHERE id = $1", device_id
        )

        # Sub-sensor identity (a/b for dual-SHT40 nodes). Default 'a' for
        # legacy single-sensor devices and unknown topics.
        sub_sensor = payload.get("_sub_sensor") or "a"

        # Support multiple sensor readings in one message
        # Format: {"temperature": 28.5, "humidity": 65.2}
        # Or: {"sensors": [{"type": "temperature", "value": 28.5, "unit": "°C"}]}
        sensors = payload.get("sensors")
        if sensors and isinstance(sensors, list):
            for s in sensors:
                stype = s.get("type", "unknown")
                sval = s.get("value", 0)
                await self._insert_sensor_reading(
                    now, device_id, stype,
                    sval, s.get("unit", ""),
                    barn_id, payload.get("cycle_id"),
                    sub_sensor,
                )
                await self._maybe_handle_mq_tare(device_id, stype, sval, now)
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
                "mq135_raw": "ADC",
                "mq137_raw": "ADC",
            }
            for key, unit in sensor_map.items():
                if key in payload:
                    value = payload[key]
                    if isinstance(value, (int, float)):
                        await self._insert_sensor_reading(
                            now, device_id, key, value, unit,
                            barn_id, payload.get("cycle_id"),
                            sub_sensor,
                        )
                        await self._maybe_handle_mq_tare(device_id, key, value, now)

    async def _insert_sensor_reading(
        self, time, device_id, sensor_type, value, unit, barn_id, cycle_id,
        sub_sensor: str = "a",
    ):
        """Insert a single sensor reading.

        Dual-writes to:
          - sensor_data   (hypertable; full time-series — sub_sensor NOT stored here,
                          would force re-partitioning. Whichever sub-sensor wrote
                          last is what's in the history.)
          - sensor_latest (snapshot; one row per (device_id, sensor_type, sub_sensor))
        """
        # 1. Full time-series (no sub_sensor column on hypertable).
        await db.execute(
            """INSERT INTO sensor_data (time, device_id, sensor_type, value, unit, barn_id, cycle_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            time, device_id, sensor_type, float(value), unit, barn_id, cycle_id,
        )

        # 2. Snapshot — keep separate rows per sub_sensor so the join
        #    in brooder_service.py (`sl.sub_sensor = bzs.sub_sensor`) works.
        await db.execute(
            """INSERT INTO sensor_latest (device_id, sensor_type, sub_sensor, value, unit, time, barn_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (device_id, sensor_type, sub_sensor)
            DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit,
                          time = EXCLUDED.time, barn_id = EXCLUDED.barn_id""",
            device_id, sensor_type, sub_sensor, float(value), unit, time, barn_id,
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
