"""Automation Service - Schedule and condition-based relay control."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from croniter import croniter

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)


class AutomationService:
    """Evaluates automation rules: cron schedules and sensor conditions."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._timed_relays: dict[str, asyncio.Task] = {}  # key -> cancel task

    # ── Background Loop ───────────────────────────────

    async def start(self):
        """Start the automation evaluation loop (every 30s)."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("AutomationService started (eval every 30s)")

    async def stop(self):
        """Stop the automation loop."""
        self._running = False
        if self._task:
            self._task.cancel()
        for task in self._timed_relays.values():
            task.cancel()
        self._timed_relays.clear()

    async def _loop(self):
        while self._running:
            try:
                await self._evaluate_schedules()
                await self._evaluate_conditions()
            except Exception as e:
                logger.error(f"Automation loop error: {e}")
            await asyncio.sleep(30)

    # ── Schedule Rules ────────────────────────────────

    async def _evaluate_schedules(self):
        """Check cron-based rules and fire if due."""
        if not db.pool:
            return

        rules = await db.fetch(
            """SELECT ar.*, d.mqtt_topic
            FROM automation_rules ar
            JOIN devices d ON ar.device_id = d.id
            WHERE ar.enabled = TRUE AND ar.rule_type = 'schedule'
            AND ar.cron_expression IS NOT NULL"""
        )

        now = datetime.now(timezone.utc)

        for rule in rules:
            try:
                cron = croniter(rule["cron_expression"], now)
                prev_fire = cron.get_prev(datetime)
                # Fire if last trigger was before the previous cron time
                last = rule["last_triggered_at"]
                if last is None or last < prev_fire:
                    seconds_since = (now - prev_fire).total_seconds()
                    if seconds_since < 60:  # within the current minute window
                        await self._fire_schedule(rule)
            except Exception as e:
                logger.error(f"Schedule rule {rule['id']} error: {e}")

    async def _fire_schedule(self, rule):
        """Execute a scheduled automation rule."""
        topic = rule["mqtt_topic"]
        channel = rule["channel_number"]
        state = rule["action_state"] or "on"
        duration = rule["duration_seconds"]

        logger.info(
            f"Automation #{rule['id']} '{rule['name']}': "
            f"{topic} ch{channel}={state}"
            f"{f' for {duration}s' if duration else ''}"
        )

        # Send relay command
        sent = mqtt_client.send_relay_command(topic, channel, state)

        # Log command
        if db.pool:
            import json
            await db.execute(
                """INSERT INTO device_commands (device_id, command_type, payload, source, status)
                VALUES ($1, 'relay', $2, 'automation', $3)""",
                rule["device_id"],
                json.dumps({"channel": channel, "state": state, "rule_id": rule["id"]}),
                "sent" if sent else "failed",
            )

        # Update last_triggered_at
        await db.execute(
            "UPDATE automation_rules SET last_triggered_at = NOW() WHERE id = $1",
            rule["id"],
        )

        # Schedule auto-off if duration is set
        if duration and state == "on":
            await self.send_timed_relay(
                topic, channel, duration, rule["device_id"],
                source=f"automation#{rule['id']}"
            )

    # ── Condition Rules ───────────────────────────────

    async def _evaluate_conditions(self):
        """Check sensor-condition rules and fire if threshold crossed."""
        if not db.pool:
            return

        rules = await db.fetch(
            """SELECT ar.*, d.mqtt_topic
            FROM automation_rules ar
            JOIN devices d ON ar.device_id = d.id
            WHERE ar.enabled = TRUE AND ar.rule_type = 'condition'
            AND ar.sensor_type IS NOT NULL"""
        )

        now = datetime.now(timezone.utc)

        for rule in rules:
            try:
                # Check cooldown
                last = rule["last_triggered_at"]
                cooldown = rule["cooldown_seconds"] or 300
                if last and (now - last).total_seconds() < cooldown:
                    continue

                # Get latest sensor reading
                reading = await db.fetchrow(
                    """SELECT value FROM sensor_data
                    WHERE device_id = $1 AND sensor_type = $2
                    ORDER BY time DESC LIMIT 1""",
                    rule["sensor_device_id"], rule["sensor_type"],
                )
                if not reading:
                    continue

                value = reading["value"]
                threshold = rule["threshold"]
                op = rule["operator"]

                triggered = False
                if op == ">" and value > threshold:
                    triggered = True
                elif op == "<" and value < threshold:
                    triggered = True
                elif op == ">=" and value >= threshold:
                    triggered = True
                elif op == "<=" and value <= threshold:
                    triggered = True
                elif op == "==" and value == threshold:
                    triggered = True

                if triggered:
                    await self._fire_condition(rule, value)

            except Exception as e:
                logger.error(f"Condition rule {rule['id']} error: {e}")

    async def _fire_condition(self, rule, sensor_value: float):
        """Execute a condition-triggered rule."""
        topic = rule["mqtt_topic"]
        channel = rule["channel_number"]
        state = rule["condition_action"] or "on"

        logger.info(
            f"Automation #{rule['id']} '{rule['name']}' triggered: "
            f"{rule['sensor_type']}={sensor_value} {rule['operator']} {rule['threshold']} → "
            f"{topic} ch{channel}={state}"
        )

        sent = mqtt_client.send_relay_command(topic, channel, state)

        if db.pool:
            import json
            await db.execute(
                """INSERT INTO device_commands (device_id, command_type, payload, source, status)
                VALUES ($1, 'relay', $2, 'automation', $3)""",
                rule["device_id"],
                json.dumps({
                    "channel": channel, "state": state, "rule_id": rule["id"],
                    "trigger": f"{rule['sensor_type']}={sensor_value}",
                }),
                "sent" if sent else "failed",
            )

        await db.execute(
            "UPDATE automation_rules SET last_triggered_at = NOW() WHERE id = $1",
            rule["id"],
        )

    # ── Timed Relay (on for X seconds) ────────────────

    async def send_timed_relay(self, mqtt_topic: str, channel: int,
                               duration_seconds: int, device_id: int = None,
                               source: str = "manual") -> dict:
        """Turn relay ON for a duration, then auto-OFF."""
        key = f"{mqtt_topic}:{channel}"

        # Cancel existing timer for this channel
        existing = self._timed_relays.pop(key, None)
        if existing:
            existing.cancel()

        # Turn ON
        sent = mqtt_client.send_relay_command(mqtt_topic, channel, "on")
        if not sent:
            return {"ok": False, "message": "MQTT send failed"}

        # Log ON command
        if db.pool and device_id:
            import json
            await db.execute(
                """INSERT INTO device_commands (device_id, command_type, payload, source, status)
                VALUES ($1, 'relay', $2, $3, 'sent')""",
                device_id,
                json.dumps({"channel": channel, "state": "on", "duration": duration_seconds}),
                source,
            )

        # Schedule OFF
        async def _auto_off():
            await asyncio.sleep(duration_seconds)
            mqtt_client.send_relay_command(mqtt_topic, channel, "off")
            logger.info(f"Timed relay OFF: {mqtt_topic} ch{channel} after {duration_seconds}s")
            if db.pool and device_id:
                import json
                await db.execute(
                    """INSERT INTO device_commands (device_id, command_type, payload, source, status)
                    VALUES ($1, 'relay', $2, $3, 'sent')""",
                    device_id,
                    json.dumps({"channel": channel, "state": "off", "auto": True}),
                    source,
                )
            self._timed_relays.pop(key, None)

        self._timed_relays[key] = asyncio.create_task(_auto_off())

        return {
            "ok": True,
            "topic": mqtt_topic,
            "channel": channel,
            "state": "on",
            "duration": duration_seconds,
            "auto_off_at": datetime.now(timezone.utc).timestamp() + duration_seconds,
        }

    # ── CRUD ──────────────────────────────────────────

    async def list_rules(self, device_id: int = None) -> list[dict]:
        if device_id:
            rows = await db.fetch(
                "SELECT * FROM automation_rules WHERE device_id = $1 ORDER BY name",
                device_id,
            )
        else:
            rows = await db.fetch("SELECT * FROM automation_rules ORDER BY name")
        return [dict(r) for r in rows]

    async def get_rule(self, rule_id: int) -> Optional[dict]:
        row = await db.fetchrow("SELECT * FROM automation_rules WHERE id = $1", rule_id)
        return dict(row) if row else None

    async def create_rule(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO automation_rules
            (name, device_id, channel_number, rule_type, enabled,
             cron_expression, action_state, duration_seconds,
             sensor_device_id, sensor_type, operator, threshold,
             condition_action, cooldown_seconds)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING *""",
            data["name"], data["device_id"], data["channel_number"],
            data["rule_type"], data.get("enabled", True),
            data.get("cron_expression"), data.get("action_state"),
            data.get("duration_seconds"),
            data.get("sensor_device_id"), data.get("sensor_type"),
            data.get("operator"), data.get("threshold"),
            data.get("condition_action"), data.get("cooldown_seconds", 300),
        )
        return {"ok": True, "rule": dict(row)}

    async def update_rule(self, rule_id: int, data: dict) -> dict:
        await db.execute(
            """UPDATE automation_rules SET
                name = COALESCE($1, name),
                enabled = COALESCE($2, enabled),
                cron_expression = COALESCE($3, cron_expression),
                action_state = COALESCE($4, action_state),
                duration_seconds = COALESCE($5, duration_seconds),
                sensor_device_id = COALESCE($6, sensor_device_id),
                sensor_type = COALESCE($7, sensor_type),
                operator = COALESCE($8, operator),
                threshold = COALESCE($9, threshold),
                condition_action = COALESCE($10, condition_action),
                cooldown_seconds = COALESCE($11, cooldown_seconds),
                updated_at = NOW()
            WHERE id = $12""",
            data.get("name"), data.get("enabled"),
            data.get("cron_expression"), data.get("action_state"),
            data.get("duration_seconds"),
            data.get("sensor_device_id"), data.get("sensor_type"),
            data.get("operator"), data.get("threshold"),
            data.get("condition_action"), data.get("cooldown_seconds"),
            rule_id,
        )
        return {"ok": True}

    async def delete_rule(self, rule_id: int) -> bool:
        result = await db.execute("DELETE FROM automation_rules WHERE id = $1", rule_id)
        return result == "DELETE 1"

    async def toggle_rule(self, rule_id: int, enabled: bool) -> dict:
        await db.execute(
            "UPDATE automation_rules SET enabled = $1, updated_at = NOW() WHERE id = $2",
            enabled, rule_id,
        )
        return {"ok": True, "enabled": enabled}


automation_service = AutomationService()
