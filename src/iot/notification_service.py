"""Notification Service - WebPush notifications for alerts and events."""

import asyncio
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
        # Push to cloud immediately
        try:
            from src.sync.sync_service import sync_service
            await sync_service._push_push_subscription_to_cloud({
                "endpoint": endpoint,
                "p256dh": keys.get("p256dh", ""),
                "auth": keys.get("auth", ""),
                "user_label": user_label,
            })
        except Exception as e:
            logger.warning(f"Immediate push push_subscription failed: {e}")
        return {"ok": True}

    async def unsubscribe(self, endpoint: str) -> dict:
        """Remove a push subscription."""
        await db.execute(
            "DELETE FROM push_subscriptions WHERE endpoint = $1", endpoint
        )
        # Push delete to cloud immediately
        try:
            from src.sync.sync_service import sync_service
            await sync_service._push_push_subscription_to_cloud({
                "endpoint": endpoint,
                "p256dh": "",
                "auth": "",
                "user_label": None,
                "_delete": True,
            })
        except Exception as e:
            logger.warning(f"Immediate push unsubscribe failed: {e}")
        return {"ok": True}

    async def list_subscriptions(self) -> list[dict]:
        """List all active subscriptions."""
        rows = await db.fetch(
            "SELECT id, endpoint, user_label, created_at FROM push_subscriptions ORDER BY created_at DESC"
        )
        return [dict(r) for r in rows]

    # ── Send Notifications ─────────────────────────────

    async def _send_one(self, sub, payload, claims_copy):
        """Send a single push notification. Returns endpoint if expired, else None."""
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=self.vapid_private_key,
                vapid_claims=claims_copy,
            )
        except WebPushException as e:
            status = getattr(getattr(e, 'response', None), 'status_code', None)
            if status in (410, 404):
                return sub["endpoint"]
            else:
                logger.error(f"WebPush error: {e}")
        except Exception as e:
            logger.error(f"Push notification failed: {e}")
        return None

    async def send_to_all(self, title: str, body: str, data: dict = None, notification_type: str = "TEST"):
        """Send push notification to all subscribers concurrently."""
        logger.debug(f"[send_to_all] notification_type={notification_type}, title={title[:50] if title else 'None'}")
        if not self.is_ready():
            logger.debug("Push notifications not configured, skipping")
            return

        subs = await db.fetch("SELECT endpoint, p256dh, auth FROM push_subscriptions")
        if not subs:
            logger.debug(f"[send_to_all] No subscribers found for {notification_type}")
            return

        payload = json.dumps({
            "title": title,
            "body": body,
            "data": data or {},
        })

        # Copy vapid_claims to avoid race condition — webpush() mutates it in-place
        claims_copy = dict(self.vapid_claims)

        # Send all notifications concurrently
        results = await asyncio.gather(
            *(self._send_one(sub, payload, claims_copy) for sub in subs),
            return_exceptions=True,
        )

        failed_endpoints = [r for r in results if isinstance(r, str)]

        # Clean up expired subscriptions
        for ep in failed_endpoints:
            try:
                await db.execute("DELETE FROM push_subscriptions WHERE endpoint = $1", ep)
                logger.info(f"Removed expired push subscription")
            except Exception as delete_err:
                logger.error(f"Failed to remove expired subscription {ep[:50]}...: {delete_err}")

        # Log to notification_history
        try:
            cycle_id = data.get("cycle_id") if data else None
            # Truncate title/body to prevent VARCHAR(100) overflow in notification_history
            safe_title = title[:100] if title else ""
            safe_body = body[:500] if body else ""
            logger.debug(f"[send_to_all] INSERT notification_history: type={notification_type}(len={len(notification_type)}), title={safe_title}(len={len(safe_title)}), body={safe_body[:50]}...")
            await db.execute(
                """INSERT INTO notification_history (type, title, body, cycle_id, sent_count, failed_count)
                VALUES ($1, $2, $3, $4, $5, $6)""",
                notification_type, safe_title, safe_body, cycle_id,
                len(subs) - len(failed_endpoints), len(failed_endpoints),
            )
        except Exception as e:
            logger.error(f"Failed to log notification history [{notification_type}]: {e}")

    async def send_alert(self, severity: str, message: str):
        """Send an alert as push notification."""
        icon = {"danger": "🔴", "warning": "🟡", "info": "🔵"}.get(severity, "⚪")
        await self.send_to_all(
            title=f"{icon} CFarm Alert",
            body=message,
            data={"type": "alert", "severity": severity},
            notification_type=f"ALERT_{severity.upper()}",
        )


notification_service = NotificationService()
