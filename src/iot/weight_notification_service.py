"""Weight Notification Service - Periodic check for weight sampling reminders."""

import asyncio
import logging
from datetime import date, datetime, timezone, timedelta

from src.services.database.db import db

logger = logging.getLogger(__name__)

# VN timezone (UTC+7)
VN_TZ = timezone(timedelta(hours=7))


class WeightNotificationService:
    """Checks for due weight reminders and sends push notifications.

    Weight frequency rules based on day age (days from cycle start_date):
      - Days 0-5:  No notification (no weighing needed yet)
      - Days 6-30: Every 4 days  → RED weight reminder
      - Days 31-85: Every 5 days → RED weight reminder
      - Days 86+:  Every 7 days → RED weight reminder

    After sending notification, updates next_remind_date by the interval.
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._check_interval = 3600  # 1 hour in production (check frequently for due reminders)

    async def start(self):
        """Start weight notification loop."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("WeightNotificationService started (check every hour)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                now_vn = datetime.now(VN_TZ)
                logger.debug(f"WeightNotificationService check at {now_vn.strftime('%H:%M VN')}")
                await self._check_and_notify()
            except Exception as e:
                logger.error(f"Weight notification check error: {e}")
            await asyncio.sleep(self._check_interval)

    async def _check_and_notify(self):
        """Check for due weight reminders and send notifications."""
        enabled = await self._get_setting("weight_notifications_enabled", "true")
        if enabled.lower() != "true":
            logger.debug("Weight notifications disabled, skipping")
            return

        today = date.today()

        # Get all active cycles with their weight reminders where next_remind_date <= today
        rows = await db.fetch(
            """SELECT wr.id as reminder_id, wr.cycle_id, wr.remind_every_days,
                      wr.next_remind_date, c.name as cycle_name, c.barn_id,
                      c.start_date, b.name as barn_name
               FROM weight_reminders wr
               JOIN cycles c ON wr.cycle_id = c.id
               JOIN barns b ON c.barn_id = b.id
               WHERE c.status = 'active'
                 AND wr.enabled = TRUE
                 AND wr.next_remind_date <= $1
               ORDER BY wr.next_remind_date""",
            today,
        )

        if not rows:
            logger.debug("No weight reminders due today")
            return

        logger.info(f"Found {len(rows)} weight reminders due")

        for row in rows:
            reminder_id = row["reminder_id"]
            cycle_id = row["cycle_id"]
            start_date = row["start_date"]
            remind_every_days = row["remind_every_days"]
            barn_name = row["barn_name"]
            cycle_name = row["cycle_name"]

            # Calculate current day age
            day_age = (today - start_date).days

            # Apply frequency rules based on day age
            interval = self._get_interval_for_day_age(day_age, remind_every_days)

            if interval == 0:
                # Days 0-5: skip, no weighing needed
                logger.debug(
                    f"Cycle {cycle_id} day {day_age}: skip weight reminder (too young)"
                )
                # Still update next_remind_date so we don't re-check every hour
                next_date = today + timedelta(days=4)  # check again in 4 days
                await db.execute(
                    "UPDATE weight_reminders SET next_remind_date = $1 WHERE id = $2",
                    next_date, reminder_id,
                )
                continue

            # Send weight reminder
            await self._send_weight_reminder(row, day_age)

            # Update next_remind_date
            next_date = today + timedelta(days=interval)
            await db.execute(
                "UPDATE weight_reminders SET next_remind_date = $1 WHERE id = $2",
                next_date, reminder_id,
            )
            logger.info(
                f"Weight reminder sent for cycle {cycle_id} (day {day_age}). "
                f"Next reminder in {interval} days ({next_date})"
            )

    def _get_interval_for_day_age(self, day_age: int, default_interval: int) -> int:
        """Return the weight checking interval based on day age.

        Rules:
          - Days 0-5: skip (return 0)
          - Days 6-30: every 4 days
          - Days 31-85: every 5 days
          - Days 86+: every 7 days
        """
        if day_age <= 5:
            return 0  # Skip
        elif day_age <= 30:
            return 4
        elif day_age <= 85:
            return 5
        else:
            return 7

    async def _send_weight_reminder(self, cycle: dict, day_age: int):
        """Send RED weight reminder."""
        try:
            from src.iot.notification_service import notification_service

            barn = cycle.get("barn_name", "") or ""
            cname = cycle.get("cycle_name", "") or ""
            title = "⚖️ Nhắc nhở cân gà"
            body = f"Chuồng {barn} ({cname}): Đã đến ngày cân gà! (Ngày tuổi: {day_age})"
            if len(body) > 200:
                body = body[:197] + "..."
            if len(title) > 200:
                title = title[:197] + "..."

            await notification_service.send_to_all(
                title=title,
                body=body,
                data={
                    "type": "care",
                    "action": "weight",
                    "cycle_id": cycle["cycle_id"],
                    "url": f"/?tab=care&cycle={cycle['cycle_id']}&highlight=weight",
                },
                notification_type="WEIGHT_REMINDER",
            )

            # Also push to cloud for remote notifications
            try:
                from src.sync.sync_service import sync_service
                await sync_service.send_notification_to_cloud(
                    alert_type="WEIGHT_REMINDER",
                    title=title,
                    body=body,
                    cycle_id=cycle["cycle_id"],
                    url=f"/?tab=care&cycle={cycle['cycle_id']}&highlight=weight"
                )
            except Exception as cloud_err:
                logger.debug(f"Weight cloud notification skipped: {cloud_err}")

        except Exception as e:
            logger.error(f"Failed to send weight reminder: {e}")

    async def _get_setting(self, key: str, default: str = None) -> str:
        """Get a notification setting value."""
        try:
            row = await db.fetchrow(
                "SELECT value FROM notification_settings WHERE key = $1", key
            )
            return row["value"] if row else (default or "")
        except Exception:
            return default or ""


weight_notification_service = WeightNotificationService()
