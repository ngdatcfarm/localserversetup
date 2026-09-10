"""Security routes — anti-theft / person detection dashboard API.

Endpoints (all under /api/security):
  GET    /zones            (auth)     list all zones
  POST   /zones            (admin)    create zone
  PUT    /zones/{id}       (admin)    update zone
  DELETE /zones/{id}       (admin)    delete zone (CASCADE deletes events)
  POST   /zones/{id}/arm    (admin)   set armed=true
  POST   /zones/{id}/disarm (admin)   set armed=false
  GET    /events           (auth)     list events (filterable)
  POST   /events/{id}/ack  (admin)    acknowledge event
  POST   /events/{id}/unack  (admin)  un-acknowledge event
  GET    /status           (auth)     service health
  POST   /test-alert/{zone_id} (admin) fire a test push (debug)

Created 2026-08-26 for Phase 1 manual arm/disarm anti-theft.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.server.auth import require_auth, require_admin
from src.security.security_service import security_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/security", tags=["security"])


# ── Pydantic models ────────────────────────────────────────


class ZoneCreateModel(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    camera_id: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True
    armed: bool = False
    motion_threshold: Optional[float] = None
    yolo_confidence: Optional[float] = None
    cooldown_seconds: Optional[int] = None
    trigger_siren: bool = False
    siren_device_id: Optional[int] = None
    siren_channel: Optional[int] = None
    siren_duration_seconds: Optional[int] = 30
    notes: Optional[str] = None


class ZoneUpdateModel(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    armed: Optional[bool] = None
    motion_threshold: Optional[float] = None
    yolo_confidence: Optional[float] = None
    cooldown_seconds: Optional[int] = None
    trigger_siren: Optional[bool] = None
    siren_device_id: Optional[int] = None
    siren_channel: Optional[int] = None
    siren_duration_seconds: Optional[int] = None
    notes: Optional[str] = None


# ── Service status ─────────────────────────────────────────


@router.get("/status", dependencies=[Depends(require_auth)])
async def status():
    """Health & stats for the security service."""
    return security_service.get_status()


# ── Zones CRUD ─────────────────────────────────────────────


@router.get("/zones", dependencies=[Depends(require_auth)])
async def list_zones():
    return await security_service.list_zones()


@router.post("/zones", dependencies=[Depends(require_admin)], status_code=201)
async def create_zone(data: ZoneCreateModel, user: dict = Depends(require_admin)):
    try:
        zone = await security_service.create_zone(data.model_dump(), user_id=user["id"])
    except Exception as e:
        # Likely UNIQUE violation on camera_id — surface as 409
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Camera '{data.camera_id}' đã có zone.")
        raise HTTPException(status_code=400, detail=str(e))
    return zone


@router.put("/zones/{zone_id}", dependencies=[Depends(require_admin)])
async def update_zone(zone_id: int, data: ZoneUpdateModel):
    ok = await security_service.update_zone(zone_id, data.model_dump(exclude_none=True))
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại")
    return {"ok": True}


@router.delete("/zones/{zone_id}", dependencies=[Depends(require_admin)])
async def delete_zone(zone_id: int):
    ok = await security_service.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại")
    return {"ok": True}


# ── Arm / Disarm ───────────────────────────────────────────


@router.post("/zones/{zone_id}/arm", dependencies=[Depends(require_admin)])
async def arm_zone(zone_id: int):
    ok = await security_service.set_armed(zone_id, True)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại")
    return {"ok": True, "armed": True}


@router.post("/zones/{zone_id}/disarm", dependencies=[Depends(require_admin)])
async def disarm_zone(zone_id: int):
    ok = await security_service.set_armed(zone_id, False)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại")
    return {"ok": True, "armed": False}


# ── Events ─────────────────────────────────────────────────


@router.get("/events", dependencies=[Depends(require_auth)])
async def list_events(
    limit: int = Query(50, ge=1, le=500),
    camera_id: Optional[str] = None,
    since: Optional[str] = None,
    acknowledged: Optional[bool] = None,
):
    """List detection events, newest first. Filters: camera_id, since (ISO), acknowledged."""
    return await security_service.list_events(
        limit=limit, camera_id=camera_id, since=since, acknowledged=acknowledged
    )


@router.post("/events/{event_id}/ack", dependencies=[Depends(require_admin)])
async def ack_event(event_id: int, user: dict = Depends(require_admin)):
    return {"ok": await security_service.ack_event(event_id, user_id=user["id"])}


@router.post("/events/{event_id}/unack", dependencies=[Depends(require_admin)])
async def unack_event(event_id: int):
    return {"ok": await security_service.unack_event(event_id)}


# ── Debug helpers ──────────────────────────────────────────


@router.post("/test-alert/{zone_id}", dependencies=[Depends(require_admin)])
async def test_alert(zone_id: int, user: dict = Depends(require_admin)):
    """Send a fake push notification to all subscribers for the given zone.
    Use this to verify push notification setup without waiting for a real detection.
    """
    from src.iot.notification_service import notification_service
    from src.services.database.db import db

    zone = await db.fetchrow("SELECT name, camera_id FROM security_zones WHERE id = $1", zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại")

    title = f"🛡️ Test alert — {zone['name']}"
    body = f"Đây là thông báo thử nghiệm cho zone {zone['name']} (camera {zone['camera_id']})"
    await notification_service.send_to_all(
        title, body,
        data={"type": "security_test", "zone_id": zone_id, "camera_id": zone["camera_id"]},
        notification_type="SECURITY_TEST",
    )
    # Forward to Cloudflare Worker relay (Telegram etc.) — fire-and-forget
    try:
        from src.iot.cf_relay import cf_relay
        await cf_relay.relay(
            alert_type="SECURITY_TEST",
            title=title,
            body=body,
            severity="warning",
            url="/security",
        )
    except Exception:
        pass
    return {"ok": True, "message": "Đã gửi test notification đến tất cả subscribers."}