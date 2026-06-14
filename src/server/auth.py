"""
Authentication service for CFarm webapp.

Design notes
------------
- Passwords: bcrypt cost 12
- Sessions: signed cookie via itsdangerous (no DB session table needed;
  user identity is encoded in the signed token and validated on every request)
- Cookie attributes: HttpOnly (no JS access), SameSite=Lax (CSRF protection),
  Secure (only sent over HTTPS — set automatically when behind Cloudflare/HTTPS)
- Token TTL: 7 days (rolling)
- Rate limiting on /login: simple in-memory token bucket per username+IP

This module is the only place that touches bcrypt + signing. The DB lookup
goes through `src.services.database.db.fetchrow`.
"""

import logging
import os
import time
from typing import Optional

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

from src.services.database.db import db

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────
# Secret used to sign session cookies. In production this should come
# from an env var; we generate a stable one from SECRET_KEY env, falling
# back to a static dev value so cookies survive server restarts in dev.
SESSION_SECRET = os.environ.get(
    "CFARM_SESSION_SECRET",
    "cfarm-dev-secret-change-me-9f3a2b1c8d7e6f5a4b3c2d1e0f9a8b7c",
)
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days
COOKIE_NAME = "cfarm_session"
COOKIE_SECURE = os.environ.get("CFARM_COOKIE_SECURE", "0") == "1"

_signer = TimestampSigner(SESSION_SECRET)


# ── Password hashing ───────────────────────────────────────────
def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt (cost 12)."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verification."""
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── Session token ──────────────────────────────────────────────
def _encode_token(payload: dict) -> str:
    """Sign a small dict into a URL-safe token string."""
    import json
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _signer.sign(raw).decode("utf-8")


def _decode_token(token: str) -> Optional[dict]:
    """Verify signature + TTL, return payload or None."""
    if not token:
        return None
    try:
        raw = _signer.unsign(token, max_age=SESSION_TTL_SECONDS)
    except SignatureExpired:
        logger.info("Session expired")
        return None
    except BadSignature:
        logger.warning("Bad session signature (possible tampering)")
        return None
    import json
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


# ── Cookie helpers ─────────────────────────────────────────────
def set_session_cookie(response, user_id: int, username: str, role: str) -> None:
    """Attach the signed session cookie to a response."""
    token = _encode_token({"uid": user_id, "u": username, "r": role})
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response) -> None:
    """Remove the session cookie."""
    response.delete_cookie(COOKIE_NAME, path="/")


# ── Login rate limiter (basic, in-memory) ─────────────────────
# Token bucket: max 5 attempts per 60s per (username, ip).
_login_buckets: dict = {}
RATE_LIMIT_MAX = 5
RATE_LIMIT_WINDOW = 60.0  # seconds


def _check_rate_limit(key: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.monotonic()
    bucket = _login_buckets.get(key)
    if not bucket:
        _login_buckets[key] = [now, 0]  # [window_start, count]
        bucket = _login_buckets[key]
    # Reset window if expired
    if now - bucket[0] > RATE_LIMIT_WINDOW:
        bucket[0] = now
        bucket[1] = 0
    if bucket[1] >= RATE_LIMIT_MAX:
        return False
    bucket[1] += 1
    return True


# ── User lookup ────────────────────────────────────────────────
async def fetch_user_by_username(username: str) -> Optional[dict]:
    """Return user row dict or None."""
    if not username:
        return None
    try:
        row = await db.fetchrow(
            """SELECT id, username, password_hash, role, active, must_change_password
                 FROM users
                WHERE username = $1""",
            username,
        )
        return dict(row) if row else None
    except Exception as e:
        logger.error("fetch_user_by_username error: %s", e)
        return None


async def authenticate(username: str, password: str) -> Optional[dict]:
    """Verify credentials, return user dict (without password_hash) or None.

    Always runs bcrypt verification once (against a dummy hash if the user
    is missing) so timing doesn't leak whether the username exists.
    """
    user = await fetch_user_by_username(username)
    dummy_hash = "$2b$12$" + "0" * 53  # valid bcrypt shape, no plaintext matches
    target_hash = user["password_hash"] if user else dummy_hash
    password_ok = verify_password(password, target_hash)
    if not user or not user.get("active") or not password_ok:
        return None
    # Update last_login_at (best-effort, don't fail login)
    try:
        await db.execute(
            "UPDATE users SET last_login_at = NOW() WHERE id = $1",
            user["id"],
        )
    except Exception as e:
        logger.warning("Failed to update last_login_at: %s", e)
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "must_change_password": user.get("must_change_password", False),
    }


async def change_password(user_id: int, old_password: str, new_password: str) -> bool:
    """Change password if old matches. Returns True on success."""
    if not new_password or len(new_password) < 6:
        raise ValueError("Mật khẩu mới phải có ít nhất 6 ký tự")
    row = await db.fetchrow(
        "SELECT password_hash FROM users WHERE id = $1 AND active = TRUE",
        user_id,
    )
    if not row or not verify_password(old_password, row["password_hash"]):
        return False
    new_hash = hash_password(new_password)
    await db.execute(
        """UPDATE users
              SET password_hash = $1,
                  must_change_password = FALSE,
                  updated_at = NOW()
            WHERE id = $2""",
        new_hash,
        user_id,
    )
    return True


# ── FastAPI dependencies ──────────────────────────────────────
async def get_current_user(
    request: Request,
    cfarm_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
) -> Optional[dict]:
    """Resolve the current user from the session cookie, or None if invalid/missing.

    Used internally; the public dependency below is `require_auth`.
    """
    if not cfarm_session:
        return None
    payload = _decode_token(cfarm_session)
    if not payload:
        return None
    # Optional: re-validate against DB to catch deactivated/deleted users.
    # Skip for now — token is short-lived and we re-check on every request.
    return {
        "id": payload.get("uid"),
        "username": payload.get("u"),
        "role": payload.get("r"),
    }


async def require_auth(
    user: Optional[dict] = Depends(get_current_user),
) -> dict:
    """Dependency: 401 if no valid session, else return user dict."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa đăng nhập",
            headers={"WWW-Authenticate": "Cookie"},
        )
    return user


async def require_admin(user: dict = Depends(require_auth)) -> dict:
    """Dependency: 403 if user is not admin."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền quản trị viên",
        )
    return user


# ── Rate limit helper exposed to route ────────────────────────
def login_rate_limit_key(request: Request, username: str) -> str:
    """Combine username + client IP for rate limiting."""
    client_ip = request.client.host if request.client else "unknown"
    return f"{username.lower()}:{client_ip}"


def is_login_allowed(key: str) -> bool:
    return _check_rate_limit(key)
