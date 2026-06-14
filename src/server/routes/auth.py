"""Authentication routes: login, logout, me, change-password.

These routes are PUBLIC (no require_auth) — they are how users authenticate.
All other routers should use `Depends(require_auth)` from `src.server.auth`.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from src.server.auth import (
    authenticate,
    change_password,
    clear_session_cookie,
    get_current_user,
    is_login_allowed,
    login_rate_limit_key,
    require_auth,
    set_session_cookie,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Request/Response models ───────────────────────────────────
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=255)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=255)


class UserInfo(BaseModel):
    id: int
    username: str
    role: str
    must_change_password: bool = False


# ── Routes ─────────────────────────────────────────────────────
@router.post("/login", response_model=UserInfo)
async def login(req: LoginRequest, request: Request, response: Response):
    """Authenticate with username + password, set session cookie.

    Returns the user info. Sets the `cfarm_session` HttpOnly cookie.
    Generic 401 on bad creds (doesn't reveal whether username exists).
    """
    rate_key = login_rate_limit_key(request, req.username)
    if not is_login_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Quá nhiều lần thử. Vui lòng đợi 1 phút rồi thử lại.",
        )

    user = await authenticate(req.username, req.password)
    if not user:
        # Constant-ish: don't leak whether the username exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không đúng",
        )

    set_session_cookie(response, user["id"], user["username"], user["role"])
    logger.info("User logged in: %s (id=%s, role=%s)", user["username"], user["id"], user["role"])
    return UserInfo(**user)


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(require_auth)):
    """Clear the session cookie. Requires a valid session (so attackers
    can't probe for valid sessions)."""
    clear_session_cookie(response)
    logger.info("User logged out: %s (id=%s)", user.get("username"), user.get("id"))
    return {"ok": True}


@router.get("/me", response_model=UserInfo)
async def me(user: dict = Depends(get_current_user)):
    """Return current user info, or 401 if not logged in.

    Frontend calls this on app load to check auth state.
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa đăng nhập",
        )
    # Re-fetch must_change_password from DB to stay accurate
    from src.server.auth import fetch_user_by_username
    fresh = await fetch_user_by_username(user["username"])
    if not fresh:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")
    if not fresh.get("active"):
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
    return UserInfo(
        id=fresh["id"],
        username=fresh["username"],
        role=fresh["role"],
        must_change_password=fresh.get("must_change_password", False),
    )


@router.post("/change-password", response_model=UserInfo)
async def change_pw(
    req: ChangePasswordRequest,
    user: dict = Depends(require_auth),
):
    """Change the current user's password. Requires old password."""
    try:
        ok = await change_password(user["id"], req.old_password, req.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu cũ không đúng",
        )
    logger.info("Password changed for user id=%s", user["id"])
    # Return fresh user info (must_change_password now false)
    from src.server.auth import fetch_user_by_username
    fresh = await fetch_user_by_username(user["username"])
    return UserInfo(
        id=fresh["id"],
        username=fresh["username"],
        role=fresh["role"],
        must_change_password=fresh.get("must_change_password", False),
    )
