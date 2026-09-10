"""CFarm Cloudflare Worker Relay Client.

Optional third notification channel that sits alongside local WebPush and the
cloud sync notification. When configured, every alert is signed with HMAC-SHA256
and POSTed to a Cloudflare Worker (https://cfarm-relay.<sub>.workers.dev/relay)
which then fans out to Telegram (and future channels).

Failure mode: fire-and-forget. If the Worker is unreachable, the local WebPush
and cloud sync paths still fire — alerts are never lost because of this layer.

Usage:
    from src.iot.cf_relay import cf_relay
    await cf_relay.configure({...config block...})
    await cf_relay.relay(alert_type="ALERT_DANGER", title=..., body=..., ...)
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class CfRelay:
    """Singleton client for the Cloudflare Worker notification relay."""

    # Severity ordering (low → high). Below threshold → skip.
    _SEVERITY_ORDER = {"info": 0, "warning": 1, "danger": 2}

    def __init__(self):
        self.config = {
            "enabled": False,
            "worker_url": None,
            "shared_secret": None,
            "timeout_seconds": 5.0,
            "severity_threshold": "info",
            "snapshot_base_url": None,
        }
        self._client: Optional[httpx.AsyncClient] = None
        self._stats = {
            "delivered": 0,
            "failed": 0,
            "skipped": 0,
            "last_error": None,
            "last_delivery_at": None,
        }

    async def configure(self, cfg: dict):
        """Apply configuration. Safe to call multiple times (e.g. on config reload)."""
        self.config.update(cfg or {})
        # Recreate client if timeout changed
        timeout = float(self.config.get("timeout_seconds") or 5.0)
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=timeout)
        else:
            # httpx clients are configured at creation time; if timeout changed,
            # close + recreate on next call.
            try:
                await self._client.aclose()
            except Exception:
                pass
            self._client = httpx.AsyncClient(timeout=timeout)

        if self.config.get("enabled") and self.config.get("worker_url"):
            logger.info(
                "CfRelay configured, worker_url=%s threshold=%s",
                self.config["worker_url"],
                self.config.get("severity_threshold"),
            )
        else:
            logger.debug("CfRelay disabled or unconfigured")

    def is_ready(self) -> bool:
        return bool(self.config.get("enabled") and self.config.get("worker_url") and self.config.get("shared_secret"))

    def _passes_threshold(self, severity: str) -> bool:
        threshold = (self.config.get("severity_threshold") or "info").lower()
        incoming = (severity or "info").lower()
        return self._SEVERITY_ORDER.get(incoming, 0) >= self._SEVERITY_ORDER.get(threshold, 0)

    def _absolutize_url(self, url: Optional[str]) -> Optional[str]:
        """Prepend snapshot_base_url to relative paths so Telegram gets clickable links."""
        if not url:
            return None
        if url.startswith(("http://", "https://")):
            return url
        base = (self.config.get("snapshot_base_url") or "").rstrip("/")
        if not base:
            return url
        if url.startswith("/"):
            return f"{base}{url}"
        return f"{base}/{url}"

    def _sign(self, ts: int, body: str) -> str:
        secret = (self.config.get("shared_secret") or "").encode("utf-8")
        msg = f"{ts}.{body}".encode("utf-8")
        return hmac.new(secret, msg, hashlib.sha256).hexdigest()

    async def relay(
        self,
        alert_type: str,
        title: str,
        body: str,
        snapshot_url: Optional[str] = None,
        severity: str = "info",
        cycle_id: Optional[int] = None,
        url: str = "/",
    ) -> bool:
        """Sign and POST a notification to the Worker. Returns True on 2xx, False otherwise.

        Never raises — caller can `try/except` but doesn't need to.
        """
        if not self.is_ready():
            self._stats["skipped"] += 1
            return False
        if not self._passes_threshold(severity):
            self._stats["skipped"] += 1
            return False

        payload = {
            "type": alert_type,
            "title": (title or "")[:200],
            "body": (body or "")[:1500],
            "snapshot_url": self._absolutize_url(snapshot_url),
            "severity": (severity or "info").lower(),
            "cycle_id": cycle_id,
            "url": url,
        }
        body_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        ts = int(time.time())
        sig = self._sign(ts, body_str)

        headers = {
            "Content-Type": "application/json",
            "X-CFarm-Signature": f"t={ts},v1={sig}",
            "User-Agent": "CFarm-Local/0.10.0",
        }

        try:
            client = self._client
            if client is None or client.is_closed:
                client = httpx.AsyncClient(
                    timeout=float(self.config.get("timeout_seconds") or 5.0)
                )
                self._client = client
            resp = await client.post(
                self.config["worker_url"].rstrip("/") + "/relay",
                content=body_str,
                headers=headers,
            )
            if resp.status_code < 300:
                self._stats["delivered"] += 1
                self._stats["last_delivery_at"] = ts
                logger.debug(f"CfRelay delivered: {alert_type} → {resp.status_code}")
                return True
            self._stats["failed"] += 1
            self._stats["last_error"] = f"HTTP {resp.status_code}: {resp.text[:120]}"
            logger.debug(f"CfRelay failed: {resp.status_code} {resp.text[:200]}")
            return False
        except Exception as e:
            self._stats["failed"] += 1
            self._stats["last_error"] = str(e)
            logger.debug(f"CfRelay skipped: {e}")
            return False

    async def request_token(self, user_label: str = "user", ttl_seconds: int = 300) -> Optional[str]:
        """Ask the Worker to mint a one-time bind token for Telegram registration.

        Returns the token string on success, None otherwise. Used by the
        /api/relay/bind-token endpoint on the CFarm side.
        """
        if not self.is_ready():
            return None
        payload = {"user_label": user_label, "ttl_seconds": ttl_seconds}
        body_str = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        ts = int(time.time())
        sig = self._sign(ts, body_str)
        headers = {
            "Content-Type": "application/json",
            "X-CFarm-Signature": f"t={ts},v1={sig}",
        }
        try:
            client = self._client
            if client is None or client.is_closed:
                client = httpx.AsyncClient(timeout=float(self.config.get("timeout_seconds") or 5.0))
                self._client = client
            resp = await client.post(
                self.config["worker_url"].rstrip("/") + "/admin/issue-token",
                content=body_str,
                headers=headers,
            )
            if resp.status_code < 300:
                data = resp.json()
                return data.get("token")
            logger.warning(f"CfRelay request_token failed: {resp.status_code} {resp.text[:200]}")
            return None
        except Exception as e:
            logger.warning(f"CfRelay request_token error: {e}")
            return None

    async def health_check(self) -> dict:
        """Probe Worker /healthz. Returns dict with `ok`, `db`, `ts`. No HMAC needed."""
        if not self.config.get("worker_url"):
            return {"ok": False, "reason": "unconfigured"}
        try:
            client = self._client
            if client is None or client.is_closed:
                client = httpx.AsyncClient(timeout=3.0)
                self._client = client
            resp = await client.get(self.config["worker_url"].rstrip("/") + "/healthz")
            if resp.status_code == 200:
                return resp.json()
            return {"ok": False, "status": resp.status_code}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def status(self) -> dict:
        return {
            "configured": self.is_ready(),
            "enabled": self.config.get("enabled", False),
            "worker_url": self.config.get("worker_url"),
            "severity_threshold": self.config.get("severity_threshold"),
            "snapshot_base_url": self.config.get("snapshot_base_url"),
            "stats": dict(self._stats),
        }

    async def close(self):
        if self._client and not self._client.is_closed:
            try:
                await self._client.aclose()
            except Exception:
                pass
            self._client = None


# Module-level singleton
cf_relay = CfRelay()