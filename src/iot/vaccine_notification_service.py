"""Vaccine Notification Service - Periodic check for vaccine reminders."""

import asyncio
import logging
from datetime import datetime, timezone

from src.services.database.db import db
from src.farm.vaccine_service import vaccine_service

logger = logging.getLogger(__name__)


class VaccineNotificationService:
    """Checks for upcoming vaccines and sends push notifications."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._check_interval = 3600  # Check every hour (in production, could be longer)

    async def start(self):
        """Start vaccine notification loop."""
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("VaccineNotificationService started (check every hour)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self._running:
            try:
                await self._check_vaccines()
            except Exception as e:
                logger.error(f"Vaccine notification check error: {e}")
            await asyncio.sleep(self._check_interval)

    async def _check_vaccines(self):
        """Check for vaccines due and send notifications."""
        if not db.pool:
            return

        # Check if notifications are enabled (global setting in notification_settings)
        enabled = await self._is_notification_enabled()
        if not enabled:
            logger.debug("Vaccine notifications disabled, skipping")
            return

        # Get vaccines due for notification
        vaccines = await vaccine_service.get_vaccines_due_for_notification()
        if not vaccines:
            logger.debug("No vaccines due for notification")
            return

        logger.info(f"Found {len(vaccines)} vaccines due for notification")

        # Build notification body
        vaccine_list = "\n".join(
            f"- {v['vaccine_name']} ({v['cycle_code']}, {v['barn_name'] or 'No barn'})"
            for v in vaccines[:10]  # Limit to 10 in notification
        )
        more = f"\n...and {len(vaccines) - 10} more" if len(vaccines) > 10 else ""

        body = f"Số疫苗 sắp đến lịch:\n{vaccine_list}{more}"

        # Send push notification
        try:
            from src.iot.notification_service import notification_service
            body_local = f"Số vaccine sắp đến lịch:\n{vaccine_list}{more}"
            title = "💉 Nhắc nhở Vaccine"
            if len(body_local) > 200:
                body_local = body_local[:197] + "..."
            if len(title) > 200:
                title = title[:197] + "..."
            await notification_service.send_to_all(
                title=title,
                body=body_local,
                data={"type": "vaccine", "count": len(vaccines)},
                notification_type="VACCINE_REMINDER",
            )

            # Also push to cloud for remote notifications
            try:
                from src.sync.sync_service import sync_service
                body_cloud = f"Có {len(vaccines)} vaccine cần thực hiện trong những ngày tới"
                if len(body_cloud) > 200:
                    body_cloud = body_cloud[:197] + "..."
                await sync_service.send_notification_to_cloud(
                    alert_type="VACCINE_REMINDER",
                    title=title,
                    body=body_cloud,
                    cycle_id=vaccines[0]["cycle_id"] if vaccines else None,
                    url="/vaccines"
                )
            except Exception as cloud_err:
                logger.debug(f"Vaccine cloud notification skipped: {cloud_err}")

            # Mark all as notified
            for v in vaccines:
                await vaccine_service.mark_notified(v["id"])
                logger.info(f"Marked vaccine {v['id']} ({v['vaccine_name']}) as notified")

        except Exception as e:
            logger.error(f"Failed to send vaccine notification: {e}")

    async def _is_notification_enabled(self) -> bool:
        """Check if vaccine notifications are enabled (global setting)."""
        try:
            # Check for a global vaccine notification setting
            row = await db.fetchrow(
                "SELECT value FROM notification_settings WHERE key = 'vaccine_notifications_enabled'"
            )
            return row["value"].lower() == "true" if row else True  # Default enabled
        except Exception:
            # If settings table doesn't exist or other error, default to enabled
            return True


vaccine_notification_service = VaccineNotificationService()
