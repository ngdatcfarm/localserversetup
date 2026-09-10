"""
Pinned-terminal session registry.

Why this exists
---------------
A mobile user (iOS Safari / Android Chrome) will routinely lose the WS
connection when the OS suspends the tab in the background — the PTY
process gets killed, and the user loses their shell context (in-progress
downloads, watch processes, log tailing).

This module keeps a single TerminalSession alive per ``user_id`` for a
configurable grace period. WS reconnects from the same user reattach to
the existing session; output that arrived while the client was away is
buffered (capped at 256 KB FIFO) and replayed.

When ``pin`` is enabled, the grace period jumps from 60 s to 24 h. The
client can toggle pin on/off via a WS control message.

Cleanup runs every 30 s: an entry is killed when **both** ``active_ws is
None`` (no client connected) and ``now - last_active > idle_timeout``.

Pattern reuse
-------------
- Singleton + ``get_instance()`` (cf. ``src/server/auth.py::_login_buckets``).
- Background asyncio task started from FastAPI ``startup`` (cf.
  ``src/server/main.py::_offline_check_loop``).
"""

from __future__ import annotations

import asyncio
import atexit
import logging
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Optional

from fastapi import WebSocket

from src.server.terminal_manager import TerminalSession

logger = logging.getLogger(__name__)


# ── Tunables ───────────────────────────────────────────
DEFAULT_IDLE_TIMEOUT: float = 60.0          # grace period for unpinned sessions
PINNED_IDLE_TIMEOUT:  float = 24 * 3600.0  # 24h for pinned sessions
CLEANUP_INTERVAL:     float = 30.0          # sweep period
MAX_BUFFER_BYTES:     int   = 256 * 1024    # 256 KB replay buffer per session


# ── Per-session state ──────────────────────────────────
@dataclass
class StoredSession:
    """A TerminalSession plus the bookkeeping for reattach + replay."""

    session: TerminalSession
    user_id: int
    username: str
    pinned: bool = False
    last_active: float = field(default_factory=time.monotonic)
    idle_timeout: float = DEFAULT_IDLE_TIMEOUT
    # FIFO replay buffer (capped at MAX_BUFFER_BYTES by append_output)
    buffer: Deque[str] = field(default_factory=deque)
    buffer_bytes: int = 0
    # WebSocket currently attached, or None during the grace window.
    active_ws: Optional[WebSocket] = None

    # ── Activity / expiry ───────────────────────────────
    def mark_active(self) -> None:
        """Touch the timestamp; called on connect, disconnect, and writes."""
        self.last_active = time.monotonic()

    def is_expired(self) -> bool:
        """Expired = no client connected AND past the grace period."""
        if self.active_ws is not None:
            return False
        return (time.monotonic() - self.last_active) > self.idle_timeout

    # ── Buffer (bounded FIFO) ───────────────────────────
    def append_output(self, chunk: str) -> None:
        """Push a chunk into the replay buffer; drop oldest if over cap."""
        if not chunk:
            return
        # Approximate byte size for ASCII-only cmd.exe output. TUI apps
        # could emit multi-byte chars; UTF-8 byte length is the safe upper
        # bound for memory accounting.
        try:
            size = len(chunk.encode("utf-8"))
        except Exception:
            size = len(chunk)
        self.buffer.append(chunk)
        self.buffer_bytes += size
        while self.buffer_bytes > MAX_BUFFER_BYTES and len(self.buffer) > 1:
            evicted = self.buffer.popleft()
            try:
                self.buffer_bytes -= len(evicted.encode("utf-8"))
            except Exception:
                self.buffer_bytes -= len(evicted)
        # Defensive: if the very first chunk was huge, drop it entirely
        # rather than holding a 1 MB item forever.
        if self.buffer_bytes > MAX_BUFFER_BYTES:
            self.buffer.clear()
            self.buffer_bytes = 0

    def drain_buffer(self) -> list[str]:
        """Return and clear everything currently in the replay buffer."""
        out = list(self.buffer)
        self.buffer.clear()
        self.buffer_bytes = 0
        return out

    # ── Pin toggle ──────────────────────────────────────
    def set_pinned(self, pinned: bool) -> None:
        self.pinned = pinned
        self.idle_timeout = PINNED_IDLE_TIMEOUT if pinned else DEFAULT_IDLE_TIMEOUT
        self.mark_active()  # reset the clock at the moment of toggle


# ── Singleton registry ─────────────────────────────────
class SessionStore:
    """Map user_id → StoredSession. Singleton."""

    _instance: Optional["SessionStore"] = None

    def __init__(self) -> None:
        self._by_user: dict[int, StoredSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        # threading.Lock — guards sync reads (stats) against the cleanup
        # task running in the asyncio loop. The CRUD methods are called
        # from WS handlers (async) but mutate _by_user briefly; the lock
        # here is just for stats() which snapshots the dict.
        self._lock = threading.Lock()
        # Idempotent atexit guard. Without this, repeated start_cleanup()
        # calls (or test re-imports) stack the handler.
        self._atexit_registered = False

    # ── Singleton access ────────────────────────────────
    @classmethod
    def get_instance(cls) -> "SessionStore":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── CRUD ────────────────────────────────────────────
    def get(self, user_id: int) -> Optional[StoredSession]:
        return self._by_user.get(user_id)

    def put(self, user_id: int, stored: StoredSession) -> None:
        self._by_user[user_id] = stored

    def remove(self, user_id: int) -> Optional[StoredSession]:
        return self._by_user.pop(user_id, None)

    # ── Lifecycle ───────────────────────────────────────
    def start_cleanup(self) -> None:
        """Spawn the periodic cleanup task. Idempotent."""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            return
        self._cleanup_task = asyncio.create_task(
            self._cleanup_loop(),
            name="terminal-session-cleanup",
        )
        logger.info("terminal: SessionStore cleanup task started (interval=%.0fs)",
                    CLEANUP_INTERVAL)

        # atexit fallback for graceful shutdown (SIGTERM/SIGINT). When the
        # process is killed via taskkill /F, atexit doesn't fire — but in
        # that case /T walks the cmd.exe tree, so children are still
        # cleaned by Windows. This covers the uvicorn-receives-SIGTERM
        # case where the lifespan event may run AFTER the registry
        # already cleared in-flight sessions.
        if not self._atexit_registered:
            atexit.register(SessionStore.get_instance().shutdown_all)
            self._atexit_registered = True

    def shutdown_all(self) -> None:
        """Kill every stored session. Used at server shutdown."""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            self._cleanup_task = None
        for uid, stored in list(self._by_user.items()):
            try:
                stored.session.close()
            except Exception as e:
                logger.warning("terminal: shutdown close failed uid=%d: %s", uid, e)
        self._by_user.clear()
        logger.info("terminal: SessionStore shut down")

    # ── Stats (for /health) ─────────────────────────────
    def stats(self) -> dict:
        """Return terminal subsystem counters for /health.

        Cheap to call: walks in-memory dict + one bounded tasklist call
        (cmd.exe count) per invocation. Safe to expose on /health.
        """
        now = time.monotonic()
        with self._lock:
            n_sessions = len(self._by_user)
            n_active_ws = sum(
                1 for s in self._by_user.values() if s.active_ws is not None
            )
            oldest_age = 0.0
            for s in self._by_user.values():
                age = now - s.last_active
                if age > oldest_age:
                    oldest_age = age

        # cmd.exe process count — bounded by user count (1 cmd per
        # terminal session at most). Walk tasklist once.
        n_cmd = 0
        try:
            out = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq cmd.exe", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=2,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
            ).stdout
            n_cmd = sum(1 for line in out.splitlines() if "cmd.exe" in line)
        except Exception:
            pass

        return {
            "session_count": n_sessions,
            "active_ws_count": n_active_ws,
            "cmd_proc_count": n_cmd,
            "oldest_session_age_s": round(oldest_age, 1),
        }

    # ── Cleanup loop ────────────────────────────────────
    async def _cleanup_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(CLEANUP_INTERVAL)
                self._sweep_once()
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.exception("terminal: SessionStore cleanup loop crashed: %s", e)

    def _sweep_once(self) -> None:
        """Walk the registry; kill expired entries."""
        killed = 0
        for uid, stored in list(self._by_user.items()):
            if stored.is_expired():
                logger.info(
                    "terminal: expiring session uid=%d username=%s pid=%d "
                    "pinned=%s idle=%.0fs",
                    uid, stored.username, stored.session.pid,
                    stored.pinned,
                    time.monotonic() - stored.last_active,
                )
                try:
                    stored.session.close()
                except Exception as e:
                    logger.warning("terminal: cleanup close failed uid=%d: %s", uid, e)
                self._by_user.pop(uid, None)
                killed += 1
        if killed:
            logger.info("terminal: cleanup swept %d expired session(s)", killed)