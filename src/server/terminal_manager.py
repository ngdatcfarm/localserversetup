"""
Stateless PTY session manager for the /terminal web endpoint.

Each WebSocket connection gets exactly one fresh cmd.exe process. When the
client disconnects, the process is killed (and any descendants via
taskkill /T) — no state survives across reconnects.

Design notes
------------
- pywinpty exposes a synchronous ConPTY API. The WS handler runs it in a
  dedicated worker thread so we never block the asyncio loop.
- We buffer the PTY read thread via a thread-safe queue and an asyncio
  reader that wakes up the event loop with loop.call_soon_threadsafe.
- Resizing uses winpty.set_size() in character units (cols, rows). The
  frontend sends a JSON `{cols, rows}` message when the layout settles.
- Default shell is cmd.exe (Windows full shell). The frontend can pass
  `?shell=powershell` or `?shell=pwsh` if the user wants a different
  shell, but the chosen default is cmd.exe per product decision.
- This module deliberately does NOT support persistence / reattach —
  every connect is a brand-new shell. Simple, predictable, debuggable.
"""

from __future__ import annotations

import asyncio
import logging
import os
import queue
import subprocess
import threading
from dataclasses import dataclass, field
from typing import Optional

# pywinpty is Windows-only. Import lazily so import errors on other
# platforms raise a clear error at *use* time, not at module load.
try:
    from winpty import PtyProcess  # type: ignore
except ImportError:  # pragma: no cover — only triggered on non-Windows
    PtyProcess = None  # type: ignore

logger = logging.getLogger(__name__)


# ── Default shell selection ─────────────────────────────
def default_shell() -> str:
    """Return the default shell command for a fresh session.

    Order: CFARM_TERMINAL_SHELL env var → cmd.exe (product default).
    """
    env = os.environ.get("CFARM_TERMINAL_SHELL", "").strip()
    if env:
        return env
    # On Windows: use %ComSpec% so the user gets the same shell they see
    # in Win+R / explorer. Otherwise fall back to cmd.exe explicitly.
    if os.name == "nt":
        comspec = os.environ.get("ComSpec", "").strip()
        return comspec or "cmd.exe"
    return "/bin/bash"


@dataclass
class TerminalSession:
    """One PTY-backed shell process.

    Created per fresh WS connection when the SessionStore has no live
    entry for the user. Lifetime is now owned by SessionStore:
    unpinned sessions are killed ``idle_timeout`` (60 s) after the
    last WS disconnect; pinned sessions live up to 24 h.
    """

    proc: "PtyProcess"
    shell: str
    pid: int
    output_queue: "queue.Queue[str]" = field(default_factory=queue.Queue)
    reader_thread: Optional[threading.Thread] = None
    _stopped: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock)
    # Pin/persistence metadata (used by SessionStore). idle_timeout is
    # the grace period after the last WS disconnect before the session
    # is killed (default 60s; 24h when pinned).
    pinned: bool = False
    idle_timeout: float = 60.0

    def mark_active(self) -> None:
        """Touch the last-active timestamp. Hook for SessionStore."""
        # Implemented by SessionStore.StoredSession when it owns this
        # session. Here we only keep state on the dataclass; the
        # bookkeeping clock is held in the StoredSession wrapper.
        return None

    def start_reader(self, loop: asyncio.AbstractEventLoop) -> None:
        """Spawn a background thread that drains PTY → output_queue → WS."""
        def _reader() -> None:
            try:
                while not self._stopped:
                    # read() blocks until data or EOF. Slight timeout would
                    # let us check _stopped, but ConPTY data is event-driven
                    # and we want zero-latency passthrough.
                    try:
                        data = self.proc.read(1024)
                    except EOFError:
                        logger.info("terminal: PTY EOF (pid=%d)", self.pid)
                        break
                    except Exception as e:
                        logger.warning("terminal: PTY read error pid=%d: %s", self.pid, e)
                        break
                    if not data:
                        continue
                    self.output_queue.put(data)
                    # Wake the asyncio loop. Call via call_soon_threadsafe
                    # to schedule a _drain() coroutine that reads from the
                    # queue and writes to the WS without holding the thread.
                    loop.call_soon_threadsafe(self._wake_drain, loop)
            except Exception as e:
                logger.exception("terminal: reader crashed pid=%d: %s", self.pid, e)
            finally:
                # Push a sentinel so the WS side knows the stream is done.
                self.output_queue.put(None)
                loop.call_soon_threadsafe(self._wake_drain, loop)

        t = threading.Thread(target=_reader, name=f"pty-reader-{self.pid}", daemon=True)
        t.start()
        self.reader_thread = t

    # The drain wakeup is set per-loop by attach_to_loop(); placeholder
    # until then. We can't store a bound method on the dataclass cleanly,
    # so we hold a small adapter dict on the instance instead.
    _drain_cb: Optional["callable"] = None

    def _wake_drain(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._drain_cb is not None:
            try:
                self._drain_cb()
            except Exception as e:
                logger.warning("terminal: drain callback failed pid=%d: %s", self.pid, e)

    def attach_to_loop(self, drain_cb: "callable") -> None:
        """Register the drain callback so reader thread can wake it up."""
        self._drain_cb = drain_cb

    def write(self, data: str) -> None:
        """Send user input to the shell."""
        if self._stopped:
            return
        try:
            self.proc.write(data)
        except Exception as e:
            logger.warning("terminal: write error pid=%d: %s", self.pid, e)

    def resize(self, cols: int, rows: int) -> None:
        """Resize the ConPTY in character units (1-based, clamped)."""
        if self._stopped:
            return
        cols = max(20, min(int(cols), 500))
        rows = max(5, min(int(rows), 200))
        try:
            self.proc.setwinsize(rows, cols)
        except Exception as e:
            logger.debug("terminal: resize ignored pid=%d: %s", self.pid, e)

    def close(self) -> None:
        """Kill the process tree and join the reader thread. Idempotent."""
        with self._lock:
            if self._stopped:
                return
            self._stopped = True
        try:
            self.proc.terminate(force=True)
        except Exception:
            pass
        # Belt-and-braces: if ConPTY didn't clean up child cmd.exe, kill
        # the whole tree. taskkill /T walks the process tree.
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(self.pid)],
                capture_output=True,
                timeout=3,
            )
        except Exception:
            pass
        if self.reader_thread is not None and self.reader_thread.is_alive():
            self.reader_thread.join(timeout=2)


def spawn_session(
    *,
    cols: int = 120,
    rows: int = 30,
    cwd: Optional[str] = None,
    shell: Optional[str] = None,
) -> TerminalSession:
    """Spawn a fresh PTY-backed shell and return a TerminalSession.

    Defaults: cmd.exe, 120×30, cwd=project root.
    """
    if PtyProcess is None:
        raise RuntimeError(
            "pywinpty is not available on this platform. "
            "Install it with `pip install pywinpty` (Windows only)."
        )

    shell_cmd = shell or default_shell()
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cwd = cwd or project_root

    # Strip CLAUDECODE so a `claude` invocation from inside this shell
    # doesn't refuse to start due to the outer Claude Code marker.
    # The browser terminal is the intended entry point for remote Claude
    # Code usage — see docs/terminal_remote.md. The outer Claude Code
    # (the one running this server) is a development/debug session and
    # the inner Claude Code is a separate, isolated user session.
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)
    logger.info(
        "terminal: spawning shell=%r cols=%d rows=%d cwd=%r (CLAUDECODE stripped)",
        shell_cmd, cols, rows, cwd,
    )
    proc = PtyProcess.spawn(
        shell_cmd,
        dimensions=(rows, cols),
        cwd=cwd,
        env=env,
    )
    session = TerminalSession(proc=proc, shell=shell_cmd, pid=proc.pid)
    # Switch the console to UTF-8 so IME input (Vietnamese, CJK) round-trips
    # through ConPTY without corruption. cmd.exe defaults to the OEM codepage
    # (CP437 / CP850) which mangles composed Vietnamese characters even when
    # the browser fires proper composition events. `chcp 65001` is a cmd.exe
    # builtin; PowerShell accepts it too. Bytes sit in the PTY input buffer
    # until the shell starts reading, so it's safe to inject before the
    # reader thread is wired up by the WS handler.
    try:
        session.write("chcp 65001\r\n")
    except Exception as e:
        logger.debug("terminal: chcp 65001 inject failed (continuing): %s", e)
    return session
