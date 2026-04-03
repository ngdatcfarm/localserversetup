"""Notification Service - WebPush notifications for alerts and events."""

import json
import logging
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)

# Try to import pywebpush (optional dependency)
try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False
    logger.info("pywebpush not installed - push notifications disabled")


class NotificationService:
    """Manages WebPush subscriptions and sends notifications."""

    def __init__(self):
        self.vapid_private_key: Optional[str] = None
        self.vapid_public_key: Optional[str] = None
        self.vapid_claims: dict = {}

    def configure(self, config: dict):
        """Configure VAPID keys from config."""
        self.vapid_private_key = config.get("vapid_private_key")
        self.vapid_public_key = config.get("vapid_public_key")
        self.vapid_claims = {"sub": config.get("vapid_subject", "mailto:admin@cfarm.vn")}

    def is_ready(self) -> bool:
        """Check if push notifications are configured and available."""
        return HAS_WEBPUSH and bool(self.vapid_private_key)

    # ── Subscriptions ──────────────────────────────────

    async def subscribe(self, subscription: dict, user_label: str = None) -> dict:
        """Save a push subscription."""
        endpoint = subscription["endpoint"]
        keys = subscription.get("keys", {})

        await db.execute(
            """INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_label)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (endpoint)
            DO UPDATE SET p256dh = $2, auth = $3, user_label = $4""",
            endpoint, keys.get("p256dh", ""), keys.get("auth", ""),
            user_label,
        )
        return {"ok": True}

    async def unsubscribe(self, endpoint: str) -> dict:
        """Remove a push subscription."""
        await db.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint
        )
        return {"ok": True}

    async def list_subscriptions(self) -> list[dict]:
        """List all active subscriptions."""
        rows = await db.fetch(
            "SELECT id, endpoint, user_label, created_at FROM push_subscriptions ORDER BY created_at DESC"
        )
        return [dict(r) for r in rows]

    # ── Send Notifications ─────────────────────────────

    async def send_to_all(self, title: str, body: str, data: dict = None):
        """Send push notification to all subscribers."""
        if not self.is_ready():
            logger.debug("Push notifications not configured, skipping")
            return

        subs = await db.fetch("SELECT endpoint, p256dh, auth FROM push_subscriptions")
        if not subs:
            return

        payload = json.dumps({
            "title": title,
            "body": body,
            "data": data or {},
        })

        failed_endpoints = []
        for sub in subs:
            subscription_info = {
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            }
            try:
                webpush(
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=self.vapid_claims,
                )
            except WebPushException as e:
                if "410" in str(e) or "404" in str(e):
                    # Subscription expired/invalid, remove it
                    failed_endpoints.append(sub["endpoint"])
                else:
                    logger.error(f"WebPush error: {e}")
            except Exception as e:
                logger.error(f"Push notification failed: {e}")

        # Clean up expired subscriptions
        for ep in failed_endpoints:
            await db.execute("DELETE FROM push_subscriptions WHERE endpoint = $1", ep)
            logger.info(f"Removed expired push subscription")

    async def send_alert(self, severity: str, message: str):
        """Send an alert as push notification."""
        icon = {"danger": "🔴", "warning": "🟡", "info": "🔵"}.get(severity, "⚪")
        await self.send_to_all(
            title=f"{icon} CFarm Alert",
            body=message,
            data={"type": "alert", "severity": severity},
        )


notification_service = NotificationService()
