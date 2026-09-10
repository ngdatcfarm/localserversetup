"""CFarm Relay Bind Routes — admin/user endpoints for the Cloudflare Worker relay.

Endpoints:
    GET  /api/relay/status       (auth)    — relay config + last delivery stats
    POST /api/relay/bind-token   (admin)   — mint one-time bind token via Worker
    POST /api/relay/test         (admin)   — fire a test alert through the Worker
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from src.iot.cf_relay import cf_relay
from src.server.auth import require_auth, require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/relay", tags=["relay"])


@router.get("/status")
async def relay_status(_user: dict = Depends(require_auth)):
    """Return relay configuration + delivery stats + Worker health probe."""
    cfg = cf_relay.status()
    health = await cf_relay.health_check()
    return {
        **cfg,
        "worker_health": health,
    }


@router.post("/bind-token", dependencies=[Depends(require_admin)])
async def issue_bind_token(payload: dict | None = None, _admin: dict = Depends(require_admin)):
    """Ask the Worker to mint a one-time token for binding a Telegram chat_id.

    Returns the token + the URL the user should open in a browser.
    """
    user_label = (payload or {}).get("user_label") if payload else None
    if not user_label:
        # Fall back to admin username from auth
        user_label = _admin.get("username", "admin")

    if not cf_relay.is_ready():
        raise HTTPException(status_code=409, detail="Relay chưa được cấu hình (cf_relay block missing?)")

    token = await cf_relay.request_token(user_label=user_label, ttl_seconds=300)
    if not token:
        raise HTTPException(status_code=502, detail="Worker không phản hồi — kiểm tra worker_url / shared_secret")

    base = cf_relay.config.get("worker_url", "").rstrip("/")
    bind_url = f"{base}/register?token={token}"
    return {
        "token": token,
        "bind_url": bind_url,
        "ttl_seconds": 300,
        "instructions": (
            "1. Mở Telegram, tìm và bấm Start với bot "
            "(@CFarmAlertBot hoặc tên bạn đã đặt).\n"
            "2. Gõ /bind trong chat với bot, gửi kèm token này.\n"
            "Hoặc mở link bind_url trên điện thoại có Telegram, "
            "thêm ?chat_id=<id_của_bạn> vào URL."
        ),
    }


@router.post("/test", dependencies=[Depends(require_admin)])
async def relay_test(_admin: dict = Depends(require_admin)):
    """Fire a test alert through the Worker. Useful for verifying Telegram delivery."""
    if not cf_relay.is_ready():
        raise HTTPException(status_code=409, detail="Relay chưa được cấu hình")

    ok = await cf_relay.relay(
        alert_type="TEST",
        title="🧪 Test từ CFarm Relay",
        body=f"Đây là test message từ CFarm local server gửi qua Cloudflare Worker → Telegram. Nếu bạn thấy tin nhắn này, kênh đã hoạt động.",
        snapshot_url=None,
        severity="info",
    )
    if ok:
        return {"ok": True, "message": "Đã gửi test qua Worker. Kiểm tra Telegram trong vài giây."}
    stats = cf_relay.status().get("stats", {})
    raise HTTPException(
        status_code=502,
        detail=f"Worker không phản hồi. Last error: {stats.get('last_error', 'unknown')}",
    )