"""Push notification API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.notification_service import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


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
    return {"publicKey": notification_service.vapid_public_key}


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
