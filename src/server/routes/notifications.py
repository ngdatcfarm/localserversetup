"""Push notification API routes."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from src.iot.notification_service import notification_service
from src.server.auth import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"], dependencies=[Depends(require_auth)])


# ── Request Models ──────────────────────────────────

class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}
    user_label: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


class TestNotificationRequest(BaseModel):
    title: str = "CFarm Test"
    body: str = "Push notification is working!"


# ── Routes ──────────────────────────────────────────

@router.get("/vapid-public-key")
async def get_vapid_key():
    """Get VAPID public key for client-side subscription."""
    if not notification_service.vapid_public_key:
        raise HTTPException(status_code=503, detail="VAPID keys not configured")

    # Convert SPKI format to raw P-256 key for browser Push API
    try:
        import base64
        der = base64.b64decode(notification_service.vapid_public_key)
        # Parse SPKI structure: find BIT STRING with length 0x42 (66 = 1 unused bits + 65 key bytes)
        idx = 0
        while idx < len(der) - 1:
            if der[idx] == 0x03 and der[idx + 1] == 0x42:  # BIT STRING with 66 bytes
                # Skip tag, length, and the 0x00 unused bits byte
                key_start = idx + 3  # skip tag + len + unused bits
                raw_key = der[key_start:key_start + 65]
                if len(raw_key) == 65 and raw_key[0] == 0x04:
                    # Success - convert to base64 with standard padding for browser
                    key = base64.b64encode(raw_key).decode().replace('\n', '')
                    return {"publicKey": key}
            idx += 1
        # If parsing failed, fallback
        key = notification_service.vapid_public_key.replace('\n', '').replace('\r', '').replace(' ', '')
    except Exception:
        key = notification_service.vapid_public_key.replace('\n', '').replace('\r', '')

    return {"publicKey": key}


@router.get("/status")
async def notification_status():
    """Check push notification service status."""
    return {
        "ready": notification_service.is_ready(),
        "vapid_configured": bool(notification_service.vapid_public_key),
        "has_webpush": notification_service.is_ready() or not notification_service.vapid_private_key,
    }


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest):
    """Register a push notification subscription."""
    subscription = {"endpoint": req.endpoint, "keys": req.keys}
    return await notification_service.subscribe(subscription, req.user_label)


@router.post("/unsubscribe")
async def unsubscribe(req: UnsubscribeRequest):
    """Remove a push notification subscription."""
    return await notification_service.unsubscribe(req.endpoint)


@router.get("/subscriptions")
async def list_subscriptions():
    """List all active push subscriptions."""
    return await notification_service.list_subscriptions()


@router.post("/test")
async def send_test_notification(req: TestNotificationRequest):
    """Send a test push notification to all subscribers."""
    if not notification_service.is_ready():
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    await notification_service.send_to_all(req.title, req.body)
    return {"ok": True, "message": "Test notification sent"}


# ── Vaccine Notification Settings ────────────────────

class VaccineNotificationSettingRequest(BaseModel):
    enabled: bool


@router.get("/vaccine-notification-setting")
async def get_vaccine_notification_setting():
    """Get vaccine notification setting."""
    try:
        from src.services.database.db import db
        row = await db.fetchrow(
            "SELECT value FROM notification_settings WHERE key = 'vaccine_notifications_enabled'"
        )
        return {"enabled": row["value"].lower() == "true" if row else True}
    except Exception:
        return {"enabled": True}


@router.put("/vaccine-notification-setting")
async def set_vaccine_notification_setting(req: VaccineNotificationSettingRequest):
    """Update vaccine notification setting."""
    try:
        from src.services.database.db import db
        await db.execute(
            """INSERT INTO notification_settings (key, value, updated_at)
            VALUES ('vaccine_notifications_enabled', $1, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()""",
            "true" if req.enabled else "false",
        )
        return {"ok": True, "enabled": req.enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════
# GENERAL NOTIFICATION SETTINGS (Key-Value Store)
# ══════════════════════════════════════════════════════

class NotificationSettingsRequest(BaseModel):
    """Accept dict of key:value string pairs."""
    settings: dict[str, str]


@router.get("/settings")
async def get_notification_settings():
    """Get all notification settings as a dict."""
    try:
        from src.services.database.db import db
        rows = await db.fetch("SELECT key, value FROM notification_settings")
        return {row["key"]: row["value"] for row in rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings")
async def update_notification_settings(req: NotificationSettingsRequest):
    """Update one or more notification settings."""
    try:
        from src.services.database.db import db
        for key, value in req.settings.items():
            await db.execute(
                """INSERT INTO notification_settings (key, value, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()""",
                key, value,
            )
        # Push to cloud immediately
        try:
            from src.sync.sync_service import sync_service
            for key, value in req.settings.items():
                await sync_service._push_notification_settings_to_cloud({
                    "key": key,
                    "value": value,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            logger.warning(f"Immediate push notification_settings failed: {e}")
        return {"ok": True, "updated": req.settings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/care-status")
async def get_care_compliance_status():
    """Return current care compliance status for all active cycles.

    For each active cycle, check today's feed log status for morning/afternoon.
    Used by the UI to show which cycles need feeding attention.
    """
    try:
        from src.services.database.db import db
        from datetime import date

        today = date.today()

        # Get active cycles
        cycles = await db.fetch(
            """SELECT c.id, c.name, c.barn_id, c.start_date,
                      b.name as barn_name
               FROM cycles c
               JOIN barns b ON c.barn_id = b.id
               WHERE c.status = 'active'"""
        )

        results = []
        for cycle in cycles:
            # Check morning feed (meal in ('sang', 'morning', 'all_day'))
            morning = await db.fetchrow(
                """SELECT id FROM care_feeds
                WHERE cycle_id = $1 AND feed_date = $2
                AND meal IN ('sang', 'morning', 'all_day')
                LIMIT 1""",
                cycle["id"], today,
            )
            # Check afternoon feed (meal in ('chieu', 'evening', 'all_day'))
            afternoon = await db.fetchrow(
                """SELECT id FROM care_feeds
                WHERE cycle_id = $1 AND feed_date = $2
                AND meal IN ('chieu', 'evening', 'all_day')
                LIMIT 1""",
                cycle["id"], today,
            )
            # Check for medication/water logs today
            medicated = await db.fetchrow(
                """SELECT id FROM care_water_logs
                WHERE cycle_id = $1 AND water_date = $2 AND medicated = TRUE
                LIMIT 1""",
                cycle["id"], today,
            )

            results.append({
                "cycle_id": cycle["id"],
                "cycle_name": cycle["name"],
                "barn_id": cycle["barn_id"],
                "barn_name": cycle["barn_name"],
                "has_morning_feed": morning is not None,
                "has_afternoon_feed": afternoon is not None,
                "has_medication_water": medicated is not None,
            })

        return {"date": today.isoformat(), "cycles": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════
# NOTIFICATION HISTORY
# ══════════════════════════════════════════════════════

class AckRequest(BaseModel):
    cycle_id: int
    alert_type: str  # "feed_morning"|"feed_afternoon"|"medication"
    date: str        # ISO date string "YYYY-MM-DD"


@router.get("/history")
async def get_notification_history(limit: int = 50):
    """Get notification history from local database.

    Returns alerts that were triggered, including dismissed ones.
    Used by the notifications page to show recent alerts.
    """
    try:
        from src.services.database.db import db

        rows = await db.fetch(
            """SELECT id, type, title, body, cycle_id, sent_at,
                      sent_count, failed_count, acknowledged_at
               FROM notification_history
               ORDER BY sent_at DESC
               LIMIT $1""",
            limit,
        )
        return [dict(r) for r in rows]
    except Exception as e:
        # Table might not exist yet - return empty
        return []


@router.post("/dismiss")
async def dismiss_alert(req: AckRequest):
    """Dismiss an alert for a cycle so it stops nagging.

    Creates a dismissal record that care notification service checks
    before sending duplicate alerts.
    """
    try:
        from src.services.database.db import db
        await db.execute(
            """INSERT INTO care_dismissals (cycle_id, alert_type, dismissed_date, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (cycle_id, alert_type, dismissed_date)
            DO UPDATE SET created_at = NOW()""",
            req.cycle_id, req.alert_type, req.date,
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dismissed")
async def get_dismissed_alerts():
    """Get currently dismissed alerts (active dismissals)."""
    try:
        from src.services.database.db import db
        rows = await db.fetch(
            """SELECT cycle_id, alert_type, dismissed_date, created_at
               FROM care_dismissals
               WHERE dismissed_date >= CURRENT_DATE - INTERVAL '7 days'
               ORDER BY created_at DESC"""
        )
        return [dict(r) for r in rows]
    except Exception as e:
        return []
