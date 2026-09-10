"""
Remote terminal route — serves a browser-accessible shell over WebSocket.

URL:   GET  /terminal          → HTML page (xterm.js frontend)
       WS   /terminal/ws        → PTY bridge (auth-gated)

Behavior
--------
- Cookie auth: same CFarm session cookie used elsewhere, validated before
  the WS is accepted. We refuse without auth so this can't be abused
  from inside the LAN.
- CORS/open-route considerations: /terminal is *not* added to the open
  routes list in CLAUDE.md — it goes through require_auth.
- Session persistence (pin): when a mobile user backgrounds the tab,
  iOS/Android suspends the WebSocket and would otherwise kill the PTY
  process. The SessionStore singleton (src/server/session_store.py)
  keeps a single TerminalSession alive per user_id for a configurable
  grace window; WS reconnects from the same user reattach to the
  existing session and replay the buffered output. A "pin" toggle
  bumps the grace from 60 s to 24 h.

Notes
-----
- pywinpty ConPTY is synchronous; the read-side runs in a worker
  thread and wakes the asyncio loop via call_soon_threadsafe.
- Resizing: frontend sends JSON `{type:"resize", cols:.., rows:..}`.
- Mobile keys toolbar: the frontend can send JSON
  `{type:"signal", name:"<key>"}` to inject escape sequences (arrow
  keys, Ctrl+C, etc.) for clients that lack a hardware keyboard.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse
from itsdangerous import BadSignature, SignatureExpired

from src.server.auth import COOKIE_NAME, _decode_token
from src.server.session_store import SessionStore, StoredSession
from src.server.terminal_manager import TerminalSession, spawn_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/terminal", tags=["terminal"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
TERMINAL_HTML = BASE_DIR / "src" / "server" / "templates" / "terminal.html"


# ── Mobile-key signal escape sequences ──────────────────
# Maps frontend `{type:"signal", name:"<key>"}` to the bytes sent to the
# PTY. Only used for keys the mobile on-screen keyboard can't produce.
KEY_SIGNALS: dict[str, str] = {
    "ctrl_c":     "\x03",
    "ctrl_d":     "\x04",
    "arrow_up":   "\x1b[A",
    "arrow_down": "\x1b[B",
    "arrow_right":"\x1b[C",
    "arrow_left": "\x1b[D",
    "home":       "\x1b[H",
    "end":        "\x1b[F",
    "tab":        "\t",
    "esc":        "\x1b",
}


# ── Auth helpers (WS doesn't get Depends(), so we check manually) ──
async def _require_terminal_user(request_or_ws, cookie_value: Optional[str]) -> dict:
    """Validate the cfarm_session cookie. Same logic as auth.require_auth
    but usable from inside a WS handler where Depends() isn't supported.

    Returns the user dict. Raises HTTPException on failure.
    """
    if not cookie_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa đăng nhập",
        )
    payload = _decode_token(cookie_value)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên không hợp lệ hoặc đã hết hạn",
        )
    return {
        "id": payload.get("uid"),
        "username": payload.get("u"),
        "role": payload.get("r"),
    }


def _cookie_from_websocket(ws: WebSocket) -> Optional[str]:
    """Extract the cfarm_session cookie value from a WS handshake."""
    return ws.cookies.get(COOKIE_NAME)


def _cookie_from_request(request: Request) -> Optional[str]:
    return request.cookies.get(COOKIE_NAME)


# ── Security: hardcoded allow-lists ──────────────────
# Adding a shell here is a deliberate change — we do NOT trust the
# CFARM_TERMINAL_SHELL env var or any client-supplied ?shell= value
# for the default path. Only entries below are accepted when the
# client explicitly opts in via ?shell=.
_ALLOWED_SHELLS: set[str] = {
    "cmd.exe",
    "powershell",
    "pwsh",
}


def _is_shell_allowed(shell: str) -> bool:
    """Case-insensitive basename match against the allow-list."""
    if not shell:
        return False
    base = os.path.basename(shell).lower()
    return base in {s.lower() for s in _ALLOWED_SHELLS}


# ── HTML page ──────────────────────────────────────────
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def terminal_page(request: Request):
    """Serve the terminal HTML page (requires auth)."""
    user = await _require_terminal_user(request, _cookie_from_request(request))
    if not TERMINAL_HTML.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="terminal.html not found on disk",
        )
    return FileResponse(
        str(TERMINAL_HTML),
        media_type="text/html",
        headers={
            # Don't cache the page — it references versioned JS but we
            # keep it simple and let the static NoCacheStaticFiles policy
            # apply to the vendored xterm.js + addons.
            "Cache-Control": "no-store, max-age=0",
        },
    )


# ── WebSocket bridge ───────────────────────────────────
@router.websocket("/ws")
async def terminal_ws(
    ws: WebSocket,
    shell: Optional[str] = Query(default=None),
):
    """PTY bridge with session persistence (pin) and reattach."""
    # 1. Auth gate BEFORE accept() so unauthenticated clients get 403
    #    and don't even upgrade the connection.
    cookie = _cookie_from_websocket(ws)
    try:
        user = await _require_terminal_user(ws, cookie)
    except HTTPException:
        await ws.close(code=4401, reason="auth_required")
        return

    # 2. Origin check — only same-origin or no-origin (mobile PWA) requests.
    origin = ws.headers.get("origin") or ws.headers.get("Origin")
    allowed_origin = os.environ.get("CFARM_TERMINAL_ORIGIN", "")
    if origin and allowed_origin and origin != allowed_origin:
        logger.warning("terminal: rejected origin=%r user=%s",
                       origin, user.get("username"))
        await ws.close(code=4403, reason="origin_not_allowed")
        return

    # 3. Shell whitelist. If client asked for a specific shell via
    #    ?shell=, validate it. Otherwise default to cmd.exe
    #    (terminal_manager.default_shell() already returns cmd.exe).
    requested = shell or os.environ.get("CFARM_TERMINAL_SHELL", "")
    if requested and not _is_shell_allowed(requested):
        logger.warning(
            "terminal: rejected shell=%r user=%s", requested, user.get("username"),
        )
        await ws.close(code=4403, reason="shell_not_allowed")
        return

    await ws.accept()
    username = user.get("username", "?")
    user_id = user.get("id")

    # 4. Reattach to an existing session if one is alive in the
    #    SessionStore for this user; otherwise spawn a fresh one. A
    #    failure to spawn pywinpty (rare — usually means cmd.exe is
    #    missing) closes the WS with 4400.
    store = SessionStore.get_instance()
    existing = store.get(user_id) if user_id is not None else None
    is_reattach = False

    if existing is not None and not existing.is_expired():
        # Replace-on-new-connect: if a previous WS is still attached
        # (e.g. opened a second tab), close it with 4409 so the user
        # sees a clear message instead of a stale connection.
        if existing.active_ws is not None:
            try:
                await existing.active_ws.close(code=4409, reason="session_replaced")
            except Exception:
                pass
        session = existing.session
        existing.mark_active()
        existing.active_ws = ws
        is_reattach = True
        logger.info("terminal: user=%s pid=%d reattached (pinned=%s)",
                    username, session.pid, existing.pinned)
    else:
        # Expired entry or none — drop and spawn fresh.
        if existing is not None:
            try:
                existing.session.close()
            except Exception:
                pass
            store.remove(user_id)
        try:
            # Explicit shell = "cmd.exe" if not given, since we already
            # validated any user-supplied shell. This bypasses the env var
            # path so a stray CFARM_TERMINAL_SHELL from the .env file can't
            # slip through.
            session: TerminalSession = spawn_session(shell=requested or "cmd.exe")
        except Exception as e:
            logger.exception("terminal: spawn failed for user=%s: %s", username, e)
            try:
                await ws.send_text(json.dumps({
                    "type": "error",
                    "message": "Không thể khởi tạo shell (lỗi nội bộ).",
                }))
            finally:
                await ws.close(code=4400, reason="spawn_failed")
            return

        # Register in the store. The StoredSession's last_active starts
        # at now; mark_active() below is redundant but harmless.
        stored = StoredSession(
            session=session,
            user_id=user_id,
            username=username,
            active_ws=ws,
        )
        if user_id is not None:
            store.put(user_id, stored)

        # Only start the PTY reader thread on FRESH spawn. On reattach
        # the reader is already running from the original spawn — calling
        # start_reader again would start a second thread racing on
        # proc.read() and double-pushing the EOF sentinel.
        loop = asyncio.get_running_loop()
        session.start_reader(loop)

    logger.info("terminal: user=%s pid=%d shell=%r origin=%r connected (reattach=%s)",
                username, session.pid, session.shell, origin, is_reattach)

    # 5. Bridge sync queue → asyncio queue. Single drain_pending flag
    #    guards against reentrant scheduling.
    loop = asyncio.get_running_loop()
    output_q: asyncio.Queue = asyncio.Queue()
    drain_pending = False

    def _capture_for_buffer(chunk: str) -> None:
        """Push a chunk into the StoredSession replay buffer (if any).

        Called once per chunk before it hits the asyncio queue. Capped
        at 256 KB FIFO; see StoredSession.append_output.
        """
        if user_id is None:
            return
        stored = store.get(user_id)
        if stored is not None:
            stored.append_output(chunk)

    def _drain_from_queue() -> None:
        """Move everything currently in the sync queue to output_q.

        Runs on the asyncio loop. Resets drain_pending so the next
        reader-thread wakeup can request another drain.
        """
        nonlocal drain_pending
        drain_pending = False
        while True:
            try:
                data = session.output_queue.get_nowait()
            except Exception:
                return
            if data is None:
                # EOF sentinel from reader thread
                output_q.put_nowait(None)
                return
            _capture_for_buffer(data)
            output_q.put_nowait(data)

    def schedule_drain() -> None:
        """Called from the reader thread via call_soon_threadsafe."""
        nonlocal drain_pending
        if drain_pending:
            return
        drain_pending = True
        loop.call_soon_threadsafe(_drain_from_queue)

    session.attach_to_loop(schedule_drain)
    # NOTE: start_reader() is called inside the fresh-spawn branch above.
    # On reattach the reader thread is already running from the original
    # spawn, so we must NOT start a second one.

    # Replay any output that arrived while the client was disconnected.
    # Sent synchronously before writer_task starts so the user sees the
    # backlog first, then live streaming continues.
    if is_reattach:
        stored = store.get(user_id)
        if stored is not None:
            for chunk in stored.drain_buffer():
                try:
                    await ws.send_text(chunk)
                except Exception:
                    break

    async def writer_task() -> None:
        """Forward chunks to the WS client."""
        while True:
            data = await output_q.get()
            if data is None:
                try:
                    await ws.send_text("\r\n[terminal: session ended]\r\n")
                except Exception:
                    pass
                return
            try:
                await ws.send_text(data)
            except Exception:
                return

    wt = asyncio.create_task(writer_task())

    # 6. Read from WS → forward to PTY (or handle control messages).
    try:
        while True:
            msg = await ws.receive_text()
            if not msg:
                continue
            # Try to parse as a JSON control message.
            if msg.startswith("{"):
                try:
                    obj = json.loads(msg)
                    if isinstance(obj, dict):
                        kind = obj.get("type")
                        if kind == "resize":
                            cols = int(obj.get("cols") or 0)
                            rows = int(obj.get("rows") or 0)
                            if cols > 0 and rows > 0:
                                session.resize(cols, rows)
                            continue
                        if kind == "ping":
                            await ws.send_text(json.dumps({"type": "pong"}))
                            continue
                        if kind == "signal":
                            seq = KEY_SIGNALS.get(obj.get("name", ""))
                            if seq is not None:
                                session.write(seq)
                            continue
                        if kind == "pin":
                            stored = store.get(user_id) if user_id is not None else None
                            if stored is not None:
                                stored.set_pinned(not stored.pinned)
                                session.pinned = stored.pinned
                                session.idle_timeout = stored.idle_timeout
                                logger.info(
                                    "terminal: user=%s pid=%d pin=%s idle=%.0fs",
                                    username, session.pid, stored.pinned,
                                    stored.idle_timeout,
                                )
                                await ws.send_text(json.dumps({
                                    "type": "pin_status",
                                    "pinned": stored.pinned,
                                    "idle_timeout": int(stored.idle_timeout),
                                }))
                            continue
                except (json.JSONDecodeError, ValueError):
                    # Not JSON — treat as raw shell input.
                    pass

            # Default: raw keystrokes / pasted text → shell
            session.write(msg)
    except WebSocketDisconnect:
        logger.info("terminal: user=%s pid=%d client disconnected",
                    username, session.pid)
    except Exception as e:
        logger.exception("terminal: user=%s pid=%d error: %s",
                         username, session.pid, e)
    finally:
        # 7. Tear down — cancel writer, release WS, but DO NOT kill the
        #    session: the SessionStore cleanup task owns the lifecycle
        #    (grace window of `idle_timeout`, 24h if pinned).
        wt.cancel()
        try:
            await wt
        except asyncio.CancelledError:
            pass
        if user_id is not None:
            stored = store.get(user_id)
            if stored is not None:
                # If a NEW WS has already taken over (replace-on-new-connect
                # from a second tab), leave active_ws alone — that new WS
                # is the live connection. Clobbering it here would orphan
                # the session and the cleanup task would (correctly) start
                # the grace countdown against a phantom attachment.
                if stored.active_ws is ws:
                    stored.active_ws = None
                    stored.mark_active()  # start the grace clock
                    logger.info(
                        "terminal: user=%s pid=%d ws detached (grace=%.0fs, pinned=%s)",
                        username, session.pid, stored.idle_timeout, stored.pinned,
                    )
                else:
                    logger.info(
                        "terminal: user=%s pid=%d ws replaced by new connection "
                        "(session continues)",
                        username, session.pid,
                    )
        try:
            await ws.close()
        except Exception:
            pass
        logger.info("terminal: user=%s pid=%d ws closed",
                    username, session.pid)
