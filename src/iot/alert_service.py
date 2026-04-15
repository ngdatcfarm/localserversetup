"""Alert Service - Environmental monitoring and threshold alerts."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


class AlertService:
    """Monitors sensor data and triggers alerts when thresholds are crossed."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start alert monitoring loop (every 30s)."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("AlertService started (check every 30s)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                await self._check_alerts()
            except Exception as e:
                logger.error(f"Alert check error: {e}")
            await asyncio.sleep(30)

    async def _check_alerts(self):
        """Evaluate all alert rules against latest sensor data."""
        if not db.pool:
            return

        rules = await db.fetch(
            "SELECT * FROM alert_rules WHERE enabled = TRUE"
        )

        now = datetime.now(timezone.utc)

        for rule in rules:
            try:
                # Check cooldown
                last = rule["last_alerted_at"]
                cooldown = timedelta(minutes=rule["cooldown_minutes"] or 15)
                if last and (now - last) < cooldown:
                    continue

                # Get latest readings for this sensor type
                conditions = ["sensor_type = $1"]
                params = [rule["sensor_type"]]
                idx = 2

                if rule["barn_id"]:
                    conditions.append(f"barn_id = ${idx}")
                    params.append(rule["barn_id"])
                    idx += 1

                # Only check readings from last 5 minutes
                conditions.append(f"time > ${idx}")
                params.append(now - timedelta(minutes=5))

                where = " AND ".join(conditions)
                readings = await db.fetch(
                    f"""SELECT device_id, value, time
                    FROM sensor_data
                    WHERE {where}
                    ORDER BY time DESC""",
                    *params,
                )

                for reading in readings:
                    value = reading["value"]
                    triggered = False
                    direction = ""
                    threshold = 0.0

                    if rule["min_value"] is not None and value < rule["min_value"]:
                        triggered = True
                        direction = "below"
                        threshold = rule["min_value"]

                    if rule["max_value"] is not None and value > rule["max_value"]:
                        triggered = True
                        direction = "above"
                        threshold = rule["max_value"]

                    if triggered:
                        await self._create_alert(rule, reading, direction, threshold)
                        # Only alert once per rule per check cycle
                        break

            except Exception as e:
                logger.error(f"Alert rule {rule['id']} error: {e}")

    async def _create_alert(self, rule, reading, direction: str, threshold: float):
        """Create an alert record."""
        device_name = await db.fetchval(
            "SELECT name FROM devices WHERE id = $1", reading["device_id"]
        )
        message = (
            f"{rule['name']}: {rule['sensor_type']} = {reading['value']} "
            f"({direction} {threshold}) "
            f"- Device: {device_name or reading['device_id']}"
        )

        await db.execute(
            """INSERT INTO alerts
            (alert_rule_id, device_id, barn_id, sensor_type, value, threshold,
             direction, severity, message)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
            rule["id"], reading["device_id"], rule["barn_id"],
            rule["sensor_type"], reading["value"], threshold,
            direction, rule["severity"], message,
        )

        # Update cooldown timestamp
        await db.execute(
            "UPDATE alert_rules SET last_alerted_at = NOW() WHERE id = $1",
            rule["id"],
        )

        logger.warning(f"ALERT [{rule['severity']}]: {message}")

        # Send push notification to local subscribers
        try:
            from src.iot.notification_service import notification_service
            await notification_service.send_alert(rule["severity"], message)
        except Exception as e:
            logger.debug(f"Push notification skipped: {e}")

        # Send push notification to cloud for iPhone subscribers
        try:
            from src.sync.sync_service import sync_service
            icon = {"danger": "🔴", "warning": "🟡", "info": "🔵"}.get(rule["severity"], "⚪")
            await sync_service.send_notification_to_cloud(
                alert_type=f"ALERT_{rule['severity'].upper()}",
                title=f"{icon} CFarm Alert",
                body=message,
                cycle_id=None,
                url="/alerts"
            )
        except Exception as e:
            logger.debug(f"Cloud notification skipped: {e}")

    # ── CRUD: Alert Rules ─────────────────────────────

    async def list_rules(self, barn_id: str = None) -> list[dict]:
        if barn_id:
            rows = await db.fetch(
                "SELECT * FROM alert_rules WHERE barn_id = $1 ORDER BY name", barn_id
            )
        else:
            rows = await db.fetch("SELECT * FROM alert_rules ORDER BY name")
        return [dict(r) for r in rows]

    async def create_rule(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO alert_rules
            (name, barn_id, sensor_type, min_value, max_value, severity,
             enabled, cooldown_minutes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *""",
            data["name"], data.get("barn_id"), data["sensor_type"],
            data.get("min_value"), data.get("max_value"),
            data.get("severity", "warning"),
            data.get("enabled", True), data.get("cooldown_minutes", 15),
        )
        return {"ok": True, "rule": dict(row)}

    async def update_rule(self, rule_id: int, data: dict) -> dict:
        await db.execute(
            """UPDATE alert_rules SET
                name = COALESCE($1, name),
                min_value = $2, max_value = $3,
                severity = COALESCE($4, severity),
                enabled = COALESCE($5, enabled),
                cooldown_minutes = COALESCE($6, cooldown_minutes)
            WHERE id = $7""",
            data.get("name"), data.get("min_value"), data.get("max_value"),
            data.get("severity"), data.get("enabled"),
            data.get("cooldown_minutes"), rule_id,
        )
        return {"ok": True}

    async def delete_rule(self, rule_id: int) -> bool:
        result = await db.execute("DELETE FROM alert_rules WHERE id = $1", rule_id)
        return result == "DELETE 1"

    # ── CRUD: Alerts ──────────────────────────────────

    async def list_alerts(self, acknowledged: bool = None,
                          barn_id: str = None, limit: int = 50) -> list[dict]:
        conditions = []
        params = []
        idx = 1

        if acknowledged is not None:
            conditions.append(f"acknowledged = ${idx}")
            params.append(acknowledged)
            idx += 1
        if barn_id:
            conditions.append(f"barn_id = ${idx}")
            params.append(barn_id)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)

        rows = await db.fetch(
            f"""SELECT * FROM alerts {where}
            ORDER BY created_at DESC LIMIT ${idx}""",
            *params,
        )
        return [dict(r) for r in rows]

    async def acknowledge(self, alert_id: int) -> dict:
        await db.execute(
            """UPDATE alerts SET acknowledged = TRUE, acknowledged_at = NOW()
            WHERE id = $1""",
            alert_id,
        )
        return {"ok": True}

    async def acknowledge_all(self, barn_id: str = None) -> dict:
        if barn_id:
            await db.execute(
                """UPDATE alerts SET acknowledged = TRUE, acknowledged_at = NOW()
                WHERE acknowledged = FALSE AND barn_id = $1""",
                barn_id,
            )
        else:
            await db.execute(
                """UPDATE alerts SET acknowledged = TRUE, acknowledged_at = NOW()
                WHERE acknowledged = FALSE"""
            )
        return {"ok": True}


alert_service = AlertService()
