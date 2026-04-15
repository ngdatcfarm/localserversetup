"""Sync API routes - Cloud-Local bidirectional sync endpoints."""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional

from src.sync.sync_service import sync_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])


# ── Request Models ──────────────────────────────────

class SyncConfigUpdate(BaseModel):
    cloud_url: Optional[str] = None
    api_token: Optional[str] = None
    local_token: Optional[str] = None
    sync_interval: Optional[int] = None
    push_batch_size: Optional[int] = None
    enabled: Optional[bool] = None


class SyncReceivePayload(BaseModel):
    """Payload from cloud pushing changes to local."""
    source: str = "cloud"
    items: list[dict] = []


class RemoteCommand(BaseModel):
    """Command from cloud to execute locally."""
    type: str  # relay, curtain, ping
    payload: dict = {}


# ── Helper ──────────────────────────────────────────

def _verify_cloud_token(authorization: Optional[str]) -> bool:
    """Verify Bearer token from cloud."""
    if not authorization:
        return False
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0] != "Bearer":
        return False
    return sync_service.verify_token(parts[1])


# ── Endpoints ───────────────────────────────────────

@router.get("/status")
async def get_sync_status():
    """Get current sync status and stats."""
    return sync_service.get_status()


@router.get("/config")
async def get_sync_config():
    """Get current sync configuration (masks sensitive tokens)."""
    cfg = {**sync_service.config}
    if cfg.get("api_token"):
        cfg["api_token"] = cfg["api_token"][:8] + "..." if len(cfg["api_token"]) > 8 else "***"
    if cfg.get("local_token"):
        cfg["local_token"] = cfg["local_token"][:8] + "..." if len(cfg["local_token"]) > 8 else "***"
    return cfg


@router.post("/config")
async def update_sync_config(body: SyncConfigUpdate):
    """Update sync configuration."""
    updated = []
    for key, value in body.dict(exclude_none=True).items():
        await sync_service.save_config(key, str(value))
        updated.append(key)

    # Restart sync if enabled status changed
    if "enabled" in updated:
        if body.enabled:
            await sync_service.start()
        else:
            await sync_service.stop()

    return {"ok": True, "updated": updated}


@router.post("/now")
async def trigger_sync_now():
    """Trigger immediate sync cycle (push + pull)."""
    if not sync_service.config["cloud_url"]:
        raise HTTPException(400, "Cloud URL not configured")
    result = await sync_service.sync_now()
    return {"ok": True, **result}


@router.post("/full-sync")
async def trigger_full_sync():
    """Trigger initial full sync - pull all data from cloud + push all local data."""
    if not sync_service.config["cloud_url"]:
        raise HTTPException(400, "Cloud URL not configured")
    result = await sync_service.initial_full_sync()
    if "error" in result:
        raise HTTPException(400, result["error"])
    return {"ok": True, **result}


@router.post("/barns-devices-sync")
async def trigger_barns_devices_sync():
    """Sync all barns and devices to cloud.

    Called after barn or device creation/update/delete on local.
    This ensures cloud has up-to-date device inventory for relay control.
    """
    if not sync_service.config["cloud_url"]:
        raise HTTPException(400, "Cloud URL not configured")
    result = await sync_service.sync_barns_and_devices()
    if not result.get("ok", False):
        raise HTTPException(500, result.get("error", "Sync failed"))
    return {"ok": True, **result}


@router.post("/test-notification")
async def test_notification_to_cloud():
    """Test sending a notification from local to cloud for iPhone push.

    This simulates what alert_service does when an alert is triggered.
    """
    if not sync_service.config["cloud_url"]:
        raise HTTPException(400, "Cloud URL not configured")
    success = await sync_service.send_notification_to_cloud(
        alert_type="TEST",
        title="🔔 CFarm Test",
        body="Thong bao tu local server! " + datetime.now().strftime("%H:%M:%S"),
        cycle_id=None,
        url="/"
    )
    if success:
        return {"ok": True, "message": "Notification sent to cloud"}
    raise HTTPException(500, "Failed to send notification to cloud")


@router.post("/receive")
async def receive_from_cloud(body: SyncReceivePayload, authorization: str = Header(None)):
    """Receive changes pushed from cloud to local.

    Cloud calls this endpoint to push config/data changes.
    Protected by Bearer token authentication.
    """
    if not _verify_cloud_token(authorization):
        raise HTTPException(401, "Invalid or missing token")

    applied = 0
    errors = []
    for item in body.items:
        try:
            await sync_service._apply_cloud_change(item)
            applied += 1
        except Exception as e:
            errors.append({"table": item.get("table"), "error": str(e)})
            logger.error(f"Failed to apply cloud change: {e}")

    return {"ok": True, "applied": applied, "errors": errors}


@router.post("/command")
async def execute_remote_command(body: RemoteCommand, authorization: str = Header(None)):
    """Execute a remote command from cloud (relay control, ping, etc).

    Cloud calls this to control IoT devices via local MQTT.
    Protected by Bearer token authentication.
    """
    if not _verify_cloud_token(authorization):
        raise HTTPException(401, "Invalid or missing token")

    result = await sync_service.execute_remote_command(body.dict())
    if not result.get("ok"):
        raise HTTPException(400, result.get("message", "Command failed"))
    return result


@router.get("/queue")
async def get_sync_queue(limit: int = 50):
    """View pending sync queue items (for debugging)."""
    items = await sync_service.get_pending_queue(limit)
    for item in items:
        for k, v in item.items():
            if hasattr(v, 'isoformat'):
                item[k] = v.isoformat()
    return {"count": len(items), "items": items}


@router.get("/logs")
async def get_sync_logs(limit: int = 20):
    """Get recent sync operation logs."""
    logs = await sync_service.get_sync_logs(limit)
    for log in logs:
        for k, v in log.items():
            if hasattr(v, 'isoformat'):
                log[k] = v.isoformat()
    return {"count": len(logs), "logs": logs}
