"""Care Notification Service - Periodic check for feed and medication reminders."""

import asyncio
import logging
from datetime import datetime, date, timezone, timedelta

from src.services.database.db import db

logger = logging.getLogger(__name__)

# VN timezone (UTC+7)
VN_TZ = timezone(timedelta(hours=7))


class CareNotificationService:
    """Checks for missing feed logs and sends push notifications.

    Runs every 30 minutes.
    Morning check at 12:00 PM VN  - RED if no morning feed logged
    Afternoon check at 7:00 PM VN - RED if no afternoon feed logged
    At both times - AMBER medication reminder (tap opens medication form)
    """

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._check_interval = 1800  # 30 minutes in seconds

    async def start(self):
        """Start care notification loop."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("CareNotificationService started (check every 30 min)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                now_vn = datetime.now(VN_TZ)
                logger.debug(f"CareNotificationService check at {now_vn.strftime('%H:%M VN')}")

                # Check if notifications are enabled
                enabled = await self._get_setting("care_notifications_enabled", "true")
                if enabled.lower() != "true":
                    logger.debug("Care notifications disabled, skipping")
                else:
                    await self._check_and_notify(now_vn)

            except Exception as e:
                logger.error(f"Care notification check error: {e}")
            await asyncio.sleep(self._check_interval)

    async def _check_and_notify(self, now_vn: datetime):
        """Check feed compliance and send notifications."""
        today = now_vn.date()
        current_hour = now_vn.hour

        # Load thresholds
        morning_hour = int(await self._get_setting("feed_morning_alert_after_hour", "12"))
        afternoon_hour = int(await self._get_setting("feed_afternoon_alert_after_hour", "19"))

        feed_enabled = await self._get_setting("feed_notifications_enabled", "true")
        med_enabled = await self._get_setting("medication_reminder_enabled", "true")

        # Get active cycles
        cycles = await db.fetch(
            """SELECT c.id, c.name, c.barn_id, b.name as barn_name
               FROM cycles c
               JOIN barns b ON c.barn_id = b.id
               WHERE c.status = 'active'"""
        )

        if not cycles:
            logger.debug("No active cycles found")
            return

        logger.debug(f"[_check_and_notify] Found {len(cycles)} active cycles")
        for cycle in cycles:
            cycle_id = cycle["id"]
            barn_name = cycle.get("barn_name", "")
            cycle_name = cycle.get("name", "")
            today_str = today.isoformat()
            logger.debug(f"[_check] Processing cycle: id={cycle_id}, barn_name='{barn_name}', cycle_name='{cycle_name}'")

            # ── Morning check (12:00 PM VN) ──────────────────────────────
            if current_hour >= morning_hour and feed_enabled.lower() == "true":
                has_morning = await db.fetchrow(
                    """SELECT id FROM care_feeds
                    WHERE cycle_id = $1 AND feed_date = $2
                    AND meal IN ('sang', 'morning', 'all_day')
                    LIMIT 1""",
                    cycle_id, today,
                )
                if not has_morning:
                    # Check if dismissed
                    dismissed = await db.fetchrow(
                        """SELECT id FROM care_dismissals
                        WHERE cycle_id = $1 AND alert_type = 'feed_morning'
                        AND dismissed_date = $2 LIMIT 1""",
                        cycle_id, today,
                    )
                    if not dismissed:
                        logger.debug(f"[_check] Sending morning feed reminder for cycle {cycle_id}")
                        await self._send_feed_reminder(cycle, "sáng", "morning", current_hour)

            # ── Afternoon check (7:00 PM VN) ────────────────────────────
            if current_hour >= afternoon_hour and feed_enabled.lower() == "true":
                has_afternoon = await db.fetchrow(
                    """SELECT id FROM care_feeds
                    WHERE cycle_id = $1 AND feed_date = $2
                    AND meal IN ('chieu', 'evening', 'all_day')
                    LIMIT 1""",
                    cycle_id, today,
                )
                if not has_afternoon:
                    dismissed = await db.fetchrow(
                        """SELECT id FROM care_dismissals
                        WHERE cycle_id = $1 AND alert_type = 'feed_afternoon'
                        AND dismissed_date = $2 LIMIT 1""",
                        cycle_id, today,
                    )
                    if not dismissed:
                        await self._send_feed_reminder(cycle, "chiều", "afternoon", current_hour)

            # ── Medication water reminder (at morning check time) ──────
            if current_hour >= morning_hour and med_enabled.lower() == "true":
                has_med = await db.fetchrow(
                    """SELECT id FROM care_water_logs
                    WHERE cycle_id = $1 AND water_date = $2 AND medicated = TRUE
                    LIMIT 1""",
                    cycle_id, today,
                )
                if not has_med:
                    dismissed = await db.fetchrow(
                        """SELECT id FROM care_dismissals
                        WHERE cycle_id = $1 AND alert_type = 'medication'
                        AND dismissed_date = $2 LIMIT 1""",
                        cycle_id, today,
                    )
                    if not dismissed:
                        await self._send_medication_reminder(cycle, current_hour)

    async def _send_feed_reminder(self, cycle: dict, meal_label: str, meal_type: str, current_hour: int):
        """Send RED feed reminder for missing meal."""
        try:
            from src.iot.notification_service import notification_service
            from src.sync.sync_service import sync_service

            # Build message (truncate to prevent VARCHAR(100) overflow in notification_history)
            barn = cycle.get("barn_name", "") or ""
            cname = cycle.get("name", "") or ""
            body = f"Chuồng {barn} ({cname}): Chưa ghi nhận cho ăn {meal_label}!"
            if len(body) > 200:
                body = body[:197] + "..."
            title = "🔴 Nhắc nhở cho ăn"
            if len(title) > 200:
                title = title[:197] + "..."

            logger.info(f"[_send_feed_reminder] DEBUG: calling send_to_all with title='{title}', body='{body[:50]}...'")
            await notification_service.send_to_all(
                title=title,
                body=body,
                data={
                    "type": "care",
                    "action": "feed",
                    "cycle_id": cycle["id"],
                    "meal": meal_type,
                    "url": f"/?tab=care&cycle={cycle['id']}&highlight=feed",
                },
                notification_type="CARE_FEED_MISSING",
            )
            logger.info(f"[_send_feed_reminder] DEBUG: send_to_all done, calling cloud...")
            # Also push to cloud for remote notifications
            await sync_service.send_notification_to_cloud(
                alert_type="CARE_FEED_MISSING",
                title=title,
                body=body,
                cycle_id=cycle["id"],
                url=f"/?tab=care&cycle={cycle['id']}&highlight=feed"
            )
            logger.info(f"Feed reminder sent for cycle {cycle['id']} ({meal_type})")
        except Exception as e:
            logger.error(f"Failed to send feed reminder: {e}")
            import traceback
            logger.error(f"Stack: {traceback.format_exc()}")

    async def _send_medication_reminder(self, cycle: dict, current_hour: int):
        """Send AMBER medication reminder (tap opens medication form)."""
        try:
            from src.iot.notification_service import notification_service
            from src.sync.sync_service import sync_service

            barn = cycle.get("barn_name", "") or ""
            cname = cycle.get("name", "") or ""
            body = f"Chuồng {barn} ({cname}): Có cho thuốc gì vào nước không?"
            if len(body) > 200:
                body = body[:197] + "..."
            title = "💊 Nhắc nhở thuốc"
            if len(title) > 200:
                title = title[:197] + "..."

            await notification_service.send_to_all(
                title=title,
                body=body,
                data={
                    "type": "care",
                    "action": "medication",
                    "cycle_id": cycle["id"],
                    "url": f"/?tab=care&cycle={cycle['id']}&highlight=medication",
                },
                notification_type="CARE_MEDICATION_REMINDER",
            )
            # Also push to cloud for remote notifications
            await sync_service.send_notification_to_cloud(
                alert_type="CARE_MEDICATION_REMINDER",
                title=title,
                body=body,
                cycle_id=cycle["id"],
                url=f"/?tab=care&cycle={cycle['id']}&highlight=medication"
            )
            logger.info(f"Medication reminder sent for cycle {cycle['id']}")
        except Exception as e:
            logger.error(f"Failed to send medication reminder: {e}")

    async def _get_setting(self, key: str, default: str = None) -> str:
        """Get a notification setting value."""
        try:
            row = await db.fetchrow(
                "SELECT value FROM notification_settings WHERE key = $1", key
            )
            return row["value"] if row else (default or "")
        except Exception:
            return default or ""


care_notification_service = CareNotificationService()
