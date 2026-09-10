"""
CFarm Guardian - Unified Process Supervisor v4
==============================================
Monitors and restarts all critical services:
  1. App on port 8002 (management)
  2. App on port 8003 (branding)
  3. Cloudflared tunnel

Features:
- Configurable from environment variables
- Time-windowed restart limit (prevents crash loops)
- 2-phase termination (graceful + force kill)
- Dependency-aware restart order (apps restart before cloudflared)
- Development mode with inhibit file
- Grace period before auto-restart (allows manual restart)
- Log rotation
- Self-supervision via PID file
- Hung process detection (port listening but unresponsive)
- CloseWait connection monitoring with auto-recovery
- Force kill by port/PID for hung services

Environment Variables:
  GUARDIAN_HUNG_KILL=true           Enable/disable hung process force kill
  HUNG_TIMEOUT_THRESHOLD=3          Consecutive timeouts before hung detection
  CLOSEWAIT_THRESHOLD=10            CloseWait connections to trigger force kill

Usage:
  python guardian.py           # Start guardian
  python guardian.py stop     # Stop guardian
  python guardian.py restart  # Restart all services
  touch guardian.inhibit      # Enable development mode (prevent auto-restart)
  rm guardian.inhibit        # Disable development mode
"""

import subprocess
import time

# Suppress console window flash when shelling out to console apps (powershell,
# taskkill). Each call briefly allocates a new conhost.exe which the user sees
# as a flashing terminal window. With CREATE_NO_WINDOW the new console is
# suppressed. Also added to subprocess.Popen calls for service starts.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
import urllib.request
import urllib.error
import logging
import ssl
import sys
import os
import signal
import json
import threading
import socket
from datetime import datetime
from pathlib import Path
from logging.handlers import RotatingFileHandler
from dataclasses import dataclass, field
from typing import Optional

# ══════════════════════════════════════════════════════════════════════════════
# Configuration (from environment)
# ══════════════════════════════════════════════════════════════════════════════

APP_DIR = os.environ.get("APP_DIR", r"E:\cfarm")
LOG_DIR = os.environ.get("LOG_DIR", r"E:\cfarm\logs")
CLOUDFLARED_PATH = os.environ.get("CLOUDFLARED_PATH", os.path.join(APP_DIR, "cloudflared.exe"))
TUNNEL_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "")

TUNNEL_PUBLIC_URL = os.environ.get("TUNNEL_PUBLIC_URL", "https://doihong.io.vn")
METRICS_URL = os.environ.get("METRICS_URL", "http://localhost:2000/api/status")

HEALTH_INTERVAL = int(os.environ.get("HEALTH_INTERVAL", "30"))  # seconds
GRACE_PERIOD = int(os.environ.get("GRACE_PERIOD", "60"))  # seconds to wait before restart (allow manual restart)
MAX_RESTARTS_PER_WINDOW = int(os.environ.get("MAX_RESTARTS", "5"))  # max restarts per time window
RESTART_WINDOW_SECONDS = int(os.environ.get("RESTART_WINDOW", "600"))  # 10 minutes window
MAX_GRACEFUL_WAIT = int(os.environ.get("MAX_GRACEFUL_WAIT", "5"))  # seconds to wait for graceful shutdown
FORCE_KILL_DELAY = int(os.environ.get("FORCE_KILL_DELAY", "3"))  # seconds between graceful fail and force kill
STARTUP_DELAY = int(os.environ.get("STARTUP_DELAY", "15"))  # seconds to wait after start before health check
HUNG_TIMEOUT_THRESHOLD = int(os.environ.get("HUNG_TIMEOUT_THRESHOLD", "3"))  # consecutive timeouts to trigger hung detection
CLOSEWAIT_THRESHOLD = int(os.environ.get("CLOSEWAIT_THRESHOLD", "10"))  # closewait connections to trigger force kill
HUNG_KILL_ENABLED = os.environ.get("GUARDIAN_HUNG_KILL", "true").lower() == "true"

LOG_FILE = os.path.join(LOG_DIR, "guardian.log")
PID_FILE = os.path.join(LOG_DIR, "guardian.pid")
# B4: anchor INHIBIT_FILE to LOG_DIR. Previously relative, which made it
# invisible when the watchdog's CWD changed (e.g. Task Scheduler).
INHIBIT_FILE = os.environ.get("INHIBIT_FILE", os.path.join(LOG_DIR, "guardian.inhibit"))
# B3: set by the "stop" CLI before sending SIGTERM. Watchdog checks
# this and refuses to respawn guardian. Removed when cfarm.bat start
# runs (intentional restart clears the intent).
INTENTIONAL_SHUTDOWN_FILE = os.path.join(LOG_DIR, "guardian.intentional_shutdown")
# B6: when this file appears, the supervisor forces a cloudflared
# restart on its next tick and removes the marker. Operator escape hatch.
CLOUDFLARED_RESTART_MARKER = os.path.join(LOG_DIR, "cloudflared.restart")
# Crash-loop detection: how many consecutive immediate deaths before we
# stop restarting and demand manual intervention. Default 5 (~2.5 minutes
# of repeated attempts at 30s HEALTH_INTERVAL). Prevents log spam when
# a service is misconfigured (e.g. missing SSL cert files).
CRASH_LOOP_THRESHOLD = int(os.environ.get("CRASH_LOOP_THRESHOLD", "5"))

# ══════════════════════════════════════════════════════════════════════════════
# Ensure directories exist
# ══════════════════════════════════════════════════════════════════════════════

os.makedirs(LOG_DIR, exist_ok=True)

# ══════════════════════════════════════════════════════════════════════════════
# Logging with rotation
# ══════════════════════════════════════════════════════════════════════════════

def setup_logging():
    handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=1_000_000,  # 1MB per file
        backupCount=5        # Keep 5 backup files
    )
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        handlers=[handler, logging.StreamHandler(sys.stdout)],
    )
    return logging.getLogger("guardian")

log = setup_logging()

# Max size for child process log files before rotation
_CHILD_LOG_MAX_BYTES = int(os.environ.get("CHILD_LOG_MAX_BYTES", str(10 * 1024 * 1024)))  # 10 MB
_CHILD_LOG_BACKUP_COUNT = int(os.environ.get("CHILD_LOG_BACKUP_COUNT", "3"))  # keep 3 backups


def _open_rotated_log(filepath: str):
    """Open a log file for appending, rotating it first if it exceeds the size limit.

    Rotation: file.log → file.log.1 → file.log.2 → file.log.3 (oldest deleted).
    This prevents child process logs from growing unbounded (the original
    app_8002.stderr.log reached 362 MB with no rotation).
    """
    try:
        if os.path.exists(filepath) and os.path.getsize(filepath) >= _CHILD_LOG_MAX_BYTES:
            # Shift existing backups (delete oldest, rename others)
            oldest = f"{filepath}.{_CHILD_LOG_BACKUP_COUNT}"
            if os.path.exists(oldest):
                os.remove(oldest)
            for i in range(_CHILD_LOG_BACKUP_COUNT - 1, 0, -1):
                src = f"{filepath}.{i}"
                dst = f"{filepath}.{i + 1}"
                if os.path.exists(src):
                    os.rename(src, dst)
            os.rename(filepath, f"{filepath}.1")
            log.info(f"Rotated log {os.path.basename(filepath)} (exceeded {_CHILD_LOG_MAX_BYTES // (1024*1024)} MB)")
    except Exception as e:
        log.warning(f"Log rotation failed for {filepath}: {e}")
    return open(filepath, "a")

# ══════════════════════════════════════════════════════════════════════════════
# Service State
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Service:
    name: str
    exe: Optional[str] = None          # e.g., "cloudflared.exe" or None if HTTP service
    port: Optional[int] = None         # e.g., 8002 for HTTP check
    check_type: str = "process"        # "process" | "http" | "tunnel" | "https"
    command: Optional[list] = None     # Full command to start the service
    cwd: Optional[str] = None          # Working directory for the command
    proc: Optional[subprocess.Popen] = None
    failure_count: int = 0
    restart_timestamps: list = field(default_factory=list)  # Timestamps of restarts
    startup_time: Optional[float] = None  # Timestamp when service was last started
    hung_count: int = 0  # Consecutive health check timeouts (for hung detection)
    consecutive_misses: int = 0  # B2: gate restart until 3 consecutive misses
    # Crash-loop detection: how many consecutive times this service died
    # before the next health check. Resets to 0 on successful health check.
    # Used to suppress log spam (and eventually stop restarting) when a
    # service is misconfigured (e.g. missing cert files for app_8443_https).
    consecutive_boot_recoveries: int = 0
    health_url: Optional[str] = None  # B2/P2: override HTTP/HTTPS health URL
    # Grace-period timestamp set on the first failure of a new failure
    # cycle. None when no grace period is active.
    _grace_start: Optional[float] = None
    # B5: service-level lock. The main loop is single-threaded today, so
    # this lock is defensive — it makes should_restart() / record_restart()
    # atomic under future multi-threaded supervisors (e.g. if the loop is
    # ever parallelised across services). Uncontended locks are essentially
    # free, so the cost is just code clarity.
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def is_running(self) -> bool:
        if self.proc is None:
            return False
        return self.proc.poll() is None

    def should_restart(self) -> bool:
        """Check if restart is allowed based on time window.
        B5: serialize the read+append+filter under self._lock so two
        supervisor ticks cannot both pass the rate-limit check.
        """
        with self._lock:
            now = time.time()
            # Clean old timestamps outside window
            self.restart_timestamps = [
                t for t in self.restart_timestamps if now - t < RESTART_WINDOW_SECONDS
            ]
            return len(self.restart_timestamps) < MAX_RESTARTS_PER_WINDOW

    def record_restart(self):
        # Append under the same lock that gates should_restart(). Without
        # this, two supervisor ticks can both pass should_restart()'s
        # rate-limit check before either appends — allowing one restart
        # beyond MAX_RESTARTS_PER_WINDOW.
        with self._lock:
            self.restart_timestamps.append(time.time())
        self.failure_count = 0
        self.hung_count = 0  # Reset hung counter on successful restart
        self.consecutive_misses = 0  # B2: reset on successful restart
        self._grace_start = None  # End any active grace period

# ══════════════════════════════════════════════════════════════════════════════
# Service Definitions
# ══════════════════════════════════════════════════════════════════════════════

SERVICES = [
    Service(
        name="app_8002",
        exe=None,
        port=8002,
        check_type="http",
        command=[sys.executable, "-m", "uvicorn", "src.server.main:app", "--host", "0.0.0.0", "--port", "8002"],
        cwd=APP_DIR,
    ),
    # DISABLED 2026-08-15: app_8443_https (local-HTTPS-with-self-signed-cert)
    # removed because:
    #   1. Cert path mismatch (guardian referenced "certs/key.pem" + "certs/cert.pem"
    #      but certs/ dir doesn't exist; actual files are cert.key + cert.pem
    #      at project root). Fixing the path alone wasn't enough — two uvicorn
    #      instances sharing the singleton DB pool deadlock on startup.
    #   2. Production traffic flows over Cloudflare tunnel → port 8002 (HTTP).
    #      Port 8443 was only a LAN convenience for HTTPS testing; not used
    #      by anyone in 25h+ of broken state.
    #   3. The 30-second restart loop was spamming ~10KB of guardian.log/hour
    #      and churning CPU on uvicorn spawn/die.
    # To re-enable: also fix DB singleton (split pool per port) and align
    # cert paths between guardian.py / main.py / start_server.bat.
    # Service(
    #     name="app_8443_https",
    #     exe=None,
    #     port=8443,
    #     check_type="https",
    #     health_url="https://127.0.0.1:8443/health",
    #     command=[
    #         sys.executable, "-m", "uvicorn", "src.server.main:app",
    #         "--host", "0.0.0.0", "--port", "8443",
    #         "--ssl-keyfile", str(Path(APP_DIR) / "cert.key"),
    #         "--ssl-certfile", str(Path(APP_DIR) / "cert.pem"),
    #         "--log-level", "info",
    #     ],
    #     cwd=APP_DIR,
    # ),
    Service(
        name="app_8003",
        exe=None,
        port=8003,
        check_type="http",
        command=[sys.executable, "-m", "uvicorn", "src.server.main:app", "--host", "0.0.0.0", "--port", "8003"],
        cwd=APP_DIR,
    ),
    Service(
        name="cloudflared",
        exe="cloudflared.exe",
        port=None,
        check_type="tunnel",
        command=[CLOUDFLARED_PATH, "tunnel", "run", "--token", TUNNEL_TOKEN],
        cwd=APP_DIR,
    ),
]

# ══════════════════════════════════════════════════════════════════════════════
# Health Check Functions
# ══════════════════════════════════════════════════════════════════════════════

def check_http(port: int, url: str = None, timeout: float = 3.0) -> tuple[bool, str]:
    """Check HTTP(S) health endpoint. Returns (success, message).

    For HTTPS URLs, cert verification is disabled (verify=False equivalent)
    because the cert at E:\\cfarm\\certs\\cert.pem is self-signed.
    """
    if url is None:
        url = f"http://localhost:{port}/health"

    # Detect HTTPS so we can attach an unverified SSL context. Without
    # this, urlopen() would reject the self-signed cert with CERTIFICATE_VERIFY_FAILED.
    ctx = None
    if url.lower().startswith("https://"):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Guardian/3.0")
        # Pass `context` for HTTPS; urllib ignores it for HTTP.
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            if resp.status == 200:
                return True, "OK"
            return False, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, f"URLError: {e.reason}"
    except socket.timeout:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_process(name: str) -> tuple[bool, str]:
    """Check if process is running by name. Returns (success, message)."""
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Get-Process -Name '{name}' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        if result.returncode == 0:
            count = int(result.stdout.strip())
            if count > 0:
                return True, f"Running ({count} instances)"
            return False, "Not running"
        return False, "Check failed"
    except Exception as e:
        return False, str(e)


def check_tunnel_external(timeout: float = 10.0) -> tuple[bool, str]:
    """Check if tunnel is accessible externally. Returns (success, message)."""
    try:
        req = urllib.request.Request(TUNNEL_PUBLIC_URL)
        req.add_header("User-Agent", "Guardian/3.0")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return True, f"OK (HTTP {resp.status})"
    except urllib.error.HTTPError as e:
        if e.code in (530, 502, 522, 504):
            return False, f"Tunnel error {e.code}"
        return e.code < 500, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, f"URLError: {e.reason}"
    except socket.timeout:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)


def check_cloudflared_metrics(timeout: float = 5.0) -> tuple[bool, str]:
    """Check cloudflared metrics endpoint. Returns (success, message)."""
    try:
        req = urllib.request.Request(METRICS_URL)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                state = data.get("tunnel", {}).get("state", "unknown")
                connections = data.get("tunnel", {}).get("connections", 0)
                return state == "healthy", f"State={state}, connections={connections}"
    except Exception as e:
        return False, str(e)
    return False, "Metrics unavailable"


def check_service_health(svc: Service) -> tuple[bool, str]:
    """Perform health check based on service type. Returns (success, message)."""
    if svc.check_type in ("http", "https") and (svc.port or svc.health_url):
        # Use /health endpoint consistently for all HTTP(S) services (lightweight).
        # `health_url` (if set) takes precedence — used by app_8443_https which
        # needs HTTPS on a non-default URL form.
        url = svc.health_url or f"http{'s' if svc.check_type == 'https' else ''}://localhost:{svc.port}/health"
        return check_http(svc.port or 0, url)
    elif svc.check_type == "tunnel":
        # Skip tunnel check if token not configured
        if not TUNNEL_TOKEN:
            return True, "OK (no token configured)"
        # Tunnel needs both internal and external checks
        external_ok, ext_msg = check_tunnel_external()
        if not external_ok:
            return False, f"Tunnel down: {ext_msg}"

        # Also check cloudflared process
        proc_ok, proc_msg = check_process("cloudflared")
        if not proc_ok:
            return False, f"Cloudflared process: {proc_msg}"

        # Metrics check (informational only)
        metrics_ok, metrics_msg = check_cloudflared_metrics()
        log.debug(f"Tunnel metrics: {metrics_msg}")

        return True, "OK"
    else:
        return check_process(svc.name)


# ══════════════════════════════════════════════════════════════════════════════
# Hung Process Detection & Recovery
# ══════════════════════════════════════════════════════════════════════════════

# Configuration for hung detection — values set from env vars at top of file (lines 79-81)


def check_port_listening(port: int) -> tuple[bool, str]:
    """Check if a port is listening and responsive via netstat."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Where-Object {{ $_.State -eq 'Listen' }} | Measure-Object | "
             f"Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        if result.returncode == 0:
            count = int(result.stdout.strip())
            if count > 0:
                return True, f"Listening ({count} listeners)"
            return False, "Not listening"
        return False, "Check failed"
    except Exception as e:
        return False, str(e)


def check_closewait_connections(port: int) -> int:
    """Get count of CloseWait connections for a port."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Where-Object {{ $_.State -eq 'CloseWait' }} | "
             f"Measure-Object | Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        if result.returncode == 0:
            return int(result.stdout.strip())
        return 0
    except Exception:
        return 0


def get_process_by_port(port: int) -> Optional[int]:
    """Get PID of process listening on a port."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Where-Object {{ $_.State -eq 'Listen' }} | "
             f"Select-Object -First 1 -ExpandProperty OwningProcess"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        if result.returncode == 0:
            pid_str = result.stdout.strip()
            if pid_str.isdigit():
                return int(pid_str)
        return None
    except Exception:
        return None


def force_kill_by_pid(pid: int) -> bool:
    """Force kill a process by PID."""
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        return result.returncode == 0
    except Exception as e:
        log.error(f"Force kill PID {pid} failed: {e}")
        return False


def detect_and_recover_hung_service(svc: Service) -> bool:
    """
    Detect hung service (port listening but unresponsive) and recover.
    Returns True if recovery was attempted.
    """
    if not HUNG_KILL_ENABLED:
        return False

    if svc.check_type not in ("http", "https") or not svc.port:
        return False

    # Check if port is listening
    port_ok, port_msg = check_port_listening(svc.port)
    if not port_ok:
        return False  # Port not listening, normal restart will handle

    # Port is listening - check CloseWait connections
    closewait_count = check_closewait_connections(svc.port)

    if closewait_count >= CLOSEWAIT_THRESHOLD:
        log.warning(f"{svc.name}: Detected {closewait_count} CloseWait connections - "
                   f"service appears HUNG (port {svc.port} listening but unresponsive)")
        svc.hung_count += 1

        if svc.hung_count >= HUNG_TIMEOUT_THRESHOLD:
            pid = get_process_by_port(svc.port)
            log.warning(f"{svc.name}: Force killing hung process (PID {pid}) "
                       f"after {svc.hung_count} consecutive timeout detections")
            if pid:
                success = force_kill_by_pid(pid)
                if success:
                    log.info(f"{svc.name}: Force killed PID {pid} to recover from hung state")
                    svc.hung_count = 0
                    return True
                else:
                    log.error(f"{svc.name}: Failed to force kill PID {pid}")
    else:
        # Reset hung count if we see healthy CloseWait levels
        if svc.hung_count > 0 and closewait_count < CLOSEWAIT_THRESHOLD:
            log.info(f"{svc.name}: CloseWait connections normal ({closewait_count}), resetting hung detection")
            svc.hung_count = max(0, svc.hung_count - 1)

    return False

# ══════════════════════════════════════════════════════════════════════════════
# Process Control Functions
# ══════════════════════════════════════════════════════════════════════════════

def graceful_shutdown(proc: subprocess.Popen, timeout: int = 5) -> bool:
    """
    Attempt graceful shutdown with SIGTERM.
    Returns True if process exited within timeout.
    """
    if proc is None or proc.poll() is not None:
        return True  # Already dead

    try:
        proc.terminate()
        proc.wait(timeout=timeout)
        return True
    except subprocess.TimeoutExpired:
        log.warning("Graceful shutdown timed out, will force kill")
        return False
    except Exception as e:
        log.warning(f"Graceful shutdown error: {e}")
        return False


def force_kill(pid: int, image: str, *, timeout: float = 10.0) -> bool:
    """
    B1: PID-targeted kill. Falls back to /IM only if PID is unknown.

    Why not /IM? An image-name match kills ALL processes with that name.
    If a developer's other python.exe was coincidentally matched, it'd
    die too. The PID approach is surgical — only the exact process we
    intended to kill goes away.

    `image` is only used for the /IM fallback (e.g. "cloudflared.exe"
    when we couldn't resolve a PID for a tunnel subprocess).
    """
    if pid:
        try:
            result = subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                timeout=timeout,
                creationflags=NO_WINDOW,
            )
            if result.returncode == 0:
                log.info(f"Force killed PID {pid}")
                return True
            log.warning(f"taskkill /PID returned {result.returncode} for {pid}")
            return False
        except Exception as e:
            log.error(f"Force kill PID {pid} failed: {e}")
            return False

    # PID unknown — fall back to /IM but warn loudly. The caller should
    # only hit this path when the service died so badly we never
    # captured its PID (or it's a system image like cloudflared.exe).
    process_name = image if image.endswith(".exe") else (image + ".exe" if image else "")
    if not process_name:
        log.error("force_kill: no pid AND no image — refusing")
        return False
    log.warning(
        "force_kill: no PID for image=%s, falling back to /IM (may affect "
        "other processes with same image name)", process_name,
    )
    try:
        result = subprocess.run(
            ["taskkill", "/F", "/IM", process_name],
            capture_output=True,
            timeout=timeout,
            creationflags=NO_WINDOW,
        )
        if result.returncode == 0:
            log.info(f"Force killed {process_name} (via /IM fallback)")
            return True
        log.warning(f"taskkill /IM returned {result.returncode} for {process_name}")
        return False
    except Exception as e:
        log.error(f"Force kill failed for {process_name}: {e}")
        return False


def restart_service(svc: Service) -> bool:
    """
    Restart a service. Handles 2-phase shutdown (graceful + force).
    Returns True if restart succeeded.
    """
    log.info(f"Restarting {svc.name}...")

    # Skip cloudflared if no tunnel token configured
    if svc.exe == "cloudflared.exe" and not TUNNEL_TOKEN:
        log.info(f"  {svc.name} skipped: CLOUDFLARE_TUNNEL_TOKEN not set")
        return True  # Treat as success to avoid restart loops

    # Phase 1: Graceful shutdown
    if svc.proc and svc.is_running():
        log.info(f"  Attempting graceful shutdown of {svc.name}...")
        if graceful_shutdown(svc.proc, timeout=MAX_GRACEFUL_WAIT):
            log.info(f"  Graceful shutdown OK")
        else:
            # Phase 2: Force kill after small delay
            log.warning(f"  Graceful failed, force killing...")
            time.sleep(FORCE_KILL_DELAY)
            if svc.check_type in ("http", "https") and svc.port:
                # HTTP(S) service: kill the actual OS process holding the port
                # (taskkill by name won't work for python.exe running uvicorn)
                pid = get_process_by_port(svc.port)
                if pid:
                    log.info(f"  Killing HTTP service PID {pid} on port {svc.port}")
                    if force_kill_by_pid(pid):
                        log.info(f"  Killed PID {pid}")
                    else:
                        log.error(f"  Failed to kill PID {pid}")
                else:
                    log.warning(f"  No process found on port {svc.port}")
            else:
                # B1: prefer PID-targeted kill; fall back to /IM only if PID unknown.
                pid = svc.proc.pid if svc.proc and svc.proc.pid else 0
                success = force_kill(pid, svc.exe or svc.name)
                if not success:
                    log.error(f"  Force kill failed for {svc.name}")

    # Clean up proc reference
    svc.proc = None

    # Rate-limit check. Redundant for the main-loop path (which checks
    # should_restart() before calling restart_service), but required for
    # the tunnel cascade path — when a tunnel fails, we restart the
    # dependent HTTP services inside the same call, and those haven't
    # had should_restart() checked individually. Without this guard the
    # cascade could exceed MAX_RESTARTS_PER_WINDOW for an app.
    if not svc.should_restart():
        log.error(f"  Restart limit reached for {svc.name}, skipping restart")
        return False

    # Start new process if command is defined
    if svc.command:
        try:
            # Close old log file handles to prevent leaks on repeated restarts
            for attr in ('_stdout_file', '_stderr_file'):
                old = getattr(svc, attr, None)
                if old:
                    try:
                        old.close()
                    except Exception:
                        pass
            # Redirect stdout/stderr to log files (with rotation to prevent disk fill)
            stdout_file = _open_rotated_log(os.path.join(LOG_DIR, f"{svc.name}.stdout.log"))
            stderr_file = _open_rotated_log(os.path.join(LOG_DIR, f"{svc.name}.stderr.log"))
            # CREATE_NO_WINDOW prevents the child from spawning a console
            # window (critical for cloudflared.exe — it's a console app).
            flags = 0
            if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
                flags |= subprocess.CREATE_NEW_PROCESS_GROUP
            if hasattr(subprocess, "CREATE_NO_WINDOW"):
                flags |= subprocess.CREATE_NO_WINDOW
            svc.proc = subprocess.Popen(
                svc.command,
                cwd=svc.cwd or APP_DIR,
                stdout=stdout_file,
                stderr=stderr_file,
                creationflags=flags,
            )
            svc.startup_time = time.time()  # Record when service was started
            svc._stdout_file = stdout_file
            svc._stderr_file = stderr_file
            log.info(f"  Started {svc.name} with PID {svc.proc.pid}, waiting {STARTUP_DELAY}s before health check")
        except Exception as e:
            log.error(f"  Failed to start {svc.name}: {e}")
            return False

    svc.record_restart()
    return True


def start_service(svc: Service) -> bool:
    """Start a service if not already running."""
    if svc.is_running():
        return True

    # Reset stale grace/failure state from previous lifetime
    svc.failure_count = 0
    svc.hung_count = 0
    svc.consecutive_boot_recoveries = 0  # Fresh start resets crash-loop counter
    svc._grace_start = None

    # Skip cloudflared if no tunnel token configured
    if svc.exe == "cloudflared.exe" and not TUNNEL_TOKEN:
        log.info(f"{svc.name} skipped: CLOUDFLARE_TUNNEL_TOKEN not set")
        return True  # Treat as success to avoid restart loops

    if svc.command:
        try:
            # Redirect stdout/stderr to log files (with rotation to prevent disk fill)
            stdout_file = _open_rotated_log(os.path.join(LOG_DIR, f"{svc.name}.stdout.log"))
            stderr_file = _open_rotated_log(os.path.join(LOG_DIR, f"{svc.name}.stderr.log"))
            # CREATE_NO_WINDOW (0x08000000) prevents the child from spawning
            # a console window — critical for cloudflared.exe which is a
            # console app. Without this, every restart flashes a black window.
            flags = 0
            if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
                flags |= subprocess.CREATE_NEW_PROCESS_GROUP
            if hasattr(subprocess, "CREATE_NO_WINDOW"):
                flags |= subprocess.CREATE_NO_WINDOW
            svc.proc = subprocess.Popen(
                svc.command,
                cwd=svc.cwd or APP_DIR,
                stdout=stdout_file,
                stderr=stderr_file,
                creationflags=flags,
            )
            svc.startup_time = time.time()  # Record when service was started
            svc._stdout_file = stdout_file
            svc._stderr_file = stderr_file
            log.info(f"Started {svc.name} with PID {svc.proc.pid}, waiting {STARTUP_DELAY}s before health check")
            return True
        except Exception as e:
            log.error(f"Failed to start {svc.name}: {e}")
            return False
    return False


def stop_service(svc: Service) -> bool:
    """Stop a service."""
    if not svc.is_running():
        log.info(f"{svc.name} already stopped")
        return True

    log.info(f"Stopping {svc.name}...")
    graceful_shutdown(svc.proc, timeout=MAX_GRACEFUL_WAIT)

    # Close log file handles
    if hasattr(svc, '_stdout_file') and svc._stdout_file:
        try:
            svc._stdout_file.close()
        except Exception:
            pass
    if hasattr(svc, '_stderr_file') and svc._stderr_file:
        try:
            svc._stderr_file.close()
        except Exception:
            pass

    if svc.is_running():
        time.sleep(FORCE_KILL_DELAY)
        # HTTP(S) services: kill by port (actual python.exe process), not by name
        if svc.check_type in ("http", "https") and svc.port:
            pid = get_process_by_port(svc.port)
            if pid:
                log.info(f"  Killing HTTP service PID {pid} on port {svc.port}")
                force_kill_by_pid(pid)
            else:
                log.warning(f"  No process found on port {svc.port}")
        else:
            # B1: prefer PID-targeted kill; fall back to /IM only if PID unknown.
            pid = svc.proc.pid if svc.proc and svc.proc.pid else 0
            force_kill(pid, svc.exe or svc.name)

    svc.proc = None
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Dependency Management
# ══════════════════════════════════════════════════════════════════════════════

def get_restart_order(services: list[Service]) -> list[Service]:
    """
    Return services in order they should be restarted.
    Apps restart BEFORE cloudflared (dependency).
    """
    apps = [s for s in services if s.check_type in ("http", "https")]
    tunnels = [s for s in services if s.check_type == "tunnel"]
    return apps + tunnels


# ══════════════════════════════════════════════════════════════════════════════
# Development Mode
# ══════════════════════════════════════════════════════════════════════════════

def is_development_mode() -> bool:
    """Check if development mode is active (inhibit file exists)."""
    return os.path.exists(INHIBIT_FILE)


def development_mode_reason() -> str:
    """Return reason for inhibit if file exists."""
    if not is_development_mode():
        return ""
    try:
        with open(INHIBIT_FILE, "r") as f:
            return f.read().strip() or "Development mode active"
    except Exception:
        return "Development mode active"


# ══════════════════════════════════════════════════════════════════════════════
# PID Management
# ══════════════════════════════════════════════════════════════════════════════

def write_pid():
    """Write guardian PID to file for external monitoring."""
    try:
        with open(PID_FILE, "w") as f:
            f.write(str(os.getpid()))
    except Exception as e:
        log.warning(f"Could not write PID file: {e}")


def cleanup_pid_file():
    """Cleanup PID file (registered with atexit to handle crashes)."""
    try:
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
            log.info(f"Removed PID file {PID_FILE}")
    except Exception as e:
        log.warning(f"Could not remove PID file: {e}")


def is_guardian_running() -> bool:
    """Check if another guardian instance is already running."""
    if not os.path.exists(PID_FILE):
        return False

    try:
        with open(PID_FILE, "r") as f:
            old_pid = int(f.read().strip())
        # Check if process exists
        result = subprocess.run(
            ["powershell", "-Command", f"Get-Process -Id {old_pid} -ErrorAction SilentlyContinue"],
            capture_output=True, timeout=5,
            creationflags=NO_WINDOW,
        )
        if str(old_pid) in result.stdout.decode(errors="ignore"):
            log.warning(f"Another guardian instance already running (PID {old_pid})")
            return True
    except Exception:
        pass

    # PID file stale, remove it
    try:
        os.remove(PID_FILE)
    except Exception:
        pass
    return False


# ══════════════════════════════════════════════════════════════════════════════
# Grace Period Logic
# ══════════════════════════════════════════════════════════════════════════════

def check_grace_period(service: Service, failed_check: str) -> bool:
    """
    Check if we should wait in grace period before restarting.
    Returns True if we should WAIT (don't restart yet).
    Returns False if grace period expired and restart should proceed.
    """
    if is_development_mode():
        log.info(f"  Development mode active, not restarting {service.name}")
        return True

    # First failure - start grace period
    if service.failure_count == 1:
        service._grace_start = time.time()
        log.info(f"  Grace period started ({GRACE_PERIOD}s) for {service.name}")
        log.info(f"  Reason: {failed_check}")
        return True

    # Subsequent failures during grace period
    if service._grace_start is not None:
        elapsed = time.time() - service._grace_start
        remaining = GRACE_PERIOD - elapsed
        if remaining > 0:
            log.info(f"  Waiting in grace period ({remaining:.0f}s remaining) for {service.name}")
            return True
        else:
            # Grace period expired
            log.info(f"  Grace period expired for {service.name}, will restart")
            service._grace_start = None
            return False

    return False


# ══════════════════════════════════════════════════════════════════════════════
# Crash Logging & Self-Respawn
# ══════════════════════════════════════════════════════════════════════════════

CRASH_LOG_FILE = os.path.join(LOG_DIR, "guardian.crash.log")
RESPAWN_HISTORY_FILE = os.path.join(LOG_DIR, "guardian.respawn_history")
RESPAWN_WINDOW_SECONDS = 600   # 10 minutes
RESPAWN_MAX_PER_WINDOW = 5     # max 5 respawns per 10 min
RESPAWN_DELAY = 3              # seconds before respawn


def _log_crash(reason: str, exc_info=None) -> None:
    """Write a crash entry to guardian.crash.log with full diagnostics.
    This file is forensic-only — it survives log rotation of guardian.log.
    """
    import traceback
    try:
        with open(CRASH_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 70}\n")
            f.write(f"CRASH @ {datetime.now().isoformat()}\n")
            f.write(f"PID: {os.getpid()}\n")
            f.write(f"PPID: {os.getppid() if hasattr(os, 'getppid') else 'N/A'}\n")
            f.write(f"Reason: {reason}\n")
            f.write(f"argv: {sys.argv}\n")
            if exc_info is not None:
                f.write("Traceback:\n")
                traceback.print_exception(*exc_info, file=f)
            f.write(f"{'=' * 70}\n")
        log.error(f"Crash logged to {CRASH_LOG_FILE}: {reason}")
    except Exception as e:
        # Last-ditch effort: print to stderr
        try:
            sys.stderr.write(f"CRASH LOG WRITE FAILED: {e}\nReason was: {reason}\n")
        except Exception:
            pass


def _install_crash_hooks() -> None:
    """Install sys.excepthook and sys.unraisablehook to log any uncaught error."""
    def excepthook(exc_type, exc_value, exc_tb):
        _log_crash("UNCAUGHT EXCEPTION", (exc_type, exc_value, exc_tb))
        # Still call the default hook so the OS / debugger sees it
        sys.__excepthook__(exc_type, exc_value, exc_tb)
    sys.excepthook = excepthook

    if hasattr(sys, "unraisablehook"):
        def unraisablehook(unraisable):
            exc = unraisable.exc_value
            _log_crash(
                f"UNRAISABLE ({unraisable.err_msg})",
                (type(exc) if exc is not None else Exception,
                 exc if exc is not None else unraisable.err_msg,
                 unraisable.exc_traceback),
            )
            sys.__unraisablehook__(unraisable)
        sys.unraisablehook = unraisablehook


def _can_respawn() -> bool:
    """Rate-limit self-respawn to RESPAWN_MAX_PER_WINDOW per RESPAWN_WINDOW_SECONDS.
    Prevents infinite crash loops (e.g. if guardian crashes on every startup).
    """
    now = time.time()
    history = []
    try:
        if os.path.exists(RESPAWN_HISTORY_FILE):
            with open(RESPAWN_HISTORY_FILE, "r") as f:
                history = [float(x.strip()) for x in f if x.strip()]
    except Exception:
        pass
    # Filter to current window
    history = [t for t in history if now - t < RESPAWN_WINDOW_SECONDS]
    if len(history) >= RESPAWN_MAX_PER_WINDOW:
        log.error(
            f"Respawn limit reached ({RESPAWN_MAX_PER_WINDOW}/{RESPAWN_WINDOW_SECONDS}s). "
            f"Manual intervention required."
        )
        return False
    # Record this respawn attempt
    try:
        with open(RESPAWN_HISTORY_FILE, "a") as f:
            f.write(f"{now}\n")
        # Trim file to last 100 lines to keep it small
        with open(RESPAWN_HISTORY_FILE, "r") as f:
            lines = f.readlines()[-100:]
        with open(RESPAWN_HISTORY_FILE, "w") as f:
            f.writelines(lines)
    except Exception:
        pass
    return True


def _kill_other_guardians() -> int:
    """Kill all OTHER guardian.py processes (singleton enforcement).

    Uses WMIC to find pythonw.exe processes running guardian.py, then kills
    all except our own PID. This prevents zombie guardians from accumulating
    when multiple layers (self-respawn, watchdog, Task Scheduler) try to
    start guardian simultaneously.

    Returns number of orphans killed.
    """
    my_pid = os.getpid()
    killed = 0
    try:
        wmic = subprocess.run(
            ["wmic", "process", "where",
             "Name='pythonw.exe' and CommandLine like '%guardian.py%'",
             "get", "ProcessId", "/FORMAT:LIST"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        for line in wmic.stdout.splitlines():
            if line.startswith("ProcessId="):
                try:
                    pid = int(line.split("=", 1)[1].strip())
                except ValueError:
                    continue
                if pid != my_pid:
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/PID", str(pid)],
                            capture_output=True, timeout=5,
                            creationflags=NO_WINDOW,
                        )
                        log.warning(f"Killed orphan guardian PID={pid}")
                        killed += 1
                    except Exception:
                        pass
    except Exception as e:
        log.warning(f"Guardian orphan cleanup error: {e}")
    return killed


def _respawn_self() -> None:
    """Spawn a fresh guardian process. The current one exits.
    Detached via CREATE_NEW_PROCESS_GROUP + DETACHED_PROCESS so the new
    process survives the parent's exit.

    CRITICAL: kills other guardian processes first to prevent zombies.
    """
    try:
        # Kill any orphan guardians before spawning a new one
        orphans = _kill_other_guardians()
        if orphans > 0:
            log.warning(f"Cleaned {orphans} orphan guardian(s) before respawn")
            time.sleep(2)  # Let OS release ports

        stdout_file = open(os.path.join(LOG_DIR, "guardian.respawn.stdout.log"), "a")
        stderr_file = open(os.path.join(LOG_DIR, "guardian.respawn.stderr.log"), "a")
        flags = 0
        if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
            flags |= subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, "DETACHED_PROCESS"):
            flags |= subprocess.DETACHED_PROCESS
        subprocess.Popen(
            [sys.executable, os.path.abspath(__file__)],
            cwd=APP_DIR,
            stdout=stdout_file,
            stderr=stderr_file,
            stdin=subprocess.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
        log.warning("Self-respawn: new guardian process launched")
    except Exception as e:
        _log_crash(f"RESPAWN LAUNCH FAILED: {e}")
        log.error(f"Self-respawn failed: {e}")


def _should_respawn() -> bool:
    """Decide whether to respawn on crash.
    Skip respawn in:
      - development mode (inhibit file present)
      - explicit CLI subcommands (stop, status, restart)
      - if respawn limit hit (handled by _can_respawn)
    """
    if is_development_mode():
        return False
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("stop", "status", "restart"):
        return False
    return _can_respawn()


# ══════════════════════════════════════════════════════════════════════════════
# Main Guardian Loop
# ══════════════════════════════════════════════════════════════════════════════

def main():
    log.info("=" * 60)
    log.info("CFarm Guardian v3 starting")
    log.info(f"APP_DIR: {APP_DIR}")
    token_short = TUNNEL_TOKEN[:20] + "..." if TUNNEL_TOKEN else "(not set)"
    log.info(f"Cloudflare Tunnel Token: {token_short}")
    log.info(f"Health interval: {HEALTH_INTERVAL}s")
    log.info(f"Grace period: {GRACE_PERIOD}s")
    log.info(f"Startup delay: {STARTUP_DELAY}s")
    log.info(f"Max restarts per {RESTART_WINDOW_SECONDS}s window: {MAX_RESTARTS_PER_WINDOW}")
    log.info(f"Development mode file: {INHIBIT_FILE}")
    log.info("=" * 60)

    # Kill orphan guardian processes first (prevents zombie accumulation)
    orphans = _kill_other_guardians()
    if orphans > 0:
        log.warning(f"Startup: killed {orphans} orphan guardian(s)")
        time.sleep(2)

    # Check for existing guardian (PID file based)
    if is_guardian_running():
        log.error("Guardian already running, exiting")
        sys.exit(1)

    write_pid()
    # PID file cleanup is now handled by the atexit hook installed in __main__,
    # which also logs the exit reason. No duplicate registration here.

    # Cleanup on exit (signal-driven shutdown)
    def cleanup(signum, frame):
        log.info(f"Guardian shutting down (signal={signum})...")
        for svc in SERVICES:
            stop_service(svc)
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Main health check loop
    while True:
        check_start = time.time()

        # B6: cloudflared.restart marker. If the operator (or a script)
        # touches logs/cloudflared.restart, force a kill+respawn of
        # cloudflared and remove the marker. This is an escape hatch for
        # situations where the tunnel is wedged but the health check
        # still reports OK (e.g. local listener up, but remote side
        # has lost the connection).
        if os.path.exists(CLOUDFLARED_RESTART_MARKER):
            cf_svc = next((s for s in SERVICES if s.name == "cloudflared"), None)
            if cf_svc is not None:
                log.info("Cloudflared restart marker found, forcing restart")
                if cf_svc.is_running():
                    stop_service(cf_svc)
                start_service(cf_svc)
            else:
                log.warning(
                    "Cloudflared restart marker found but no cloudflared service configured"
                )
            try:
                os.remove(CLOUDFLARED_RESTART_MARKER)
                log.info("Removed cloudflared.restart marker")
            except Exception as e:
                log.warning(f"Could not remove cloudflared.restart marker: {e}")

        for svc in SERVICES:
            # Boot/crash recovery: if process is dead, start it immediately
            # (don't wait 60s grace period - that was only for transient failures)
            if not svc.is_running():
                if is_development_mode():
                    log.info(f"  Development mode active, not starting {svc.name}")
                    continue
                if not svc.should_restart():
                    log.error(f"Restart limit reached for {svc.name}, manual intervention required")
                    continue
                # Crash-loop guard: if the service has died immediately after
                # startup CRASH_LOOP_THRESHOLD times in a row, assume it's
                # misconfigured (missing certs, port in use, bad path) and
                # stop restarting until the operator fixes the config.
                # Reset on the next successful health check.
                if svc.consecutive_boot_recoveries >= CRASH_LOOP_THRESHOLD:
                    log.error(
                        f"{svc.name}: CRASH-LOOP detected ({svc.consecutive_boot_recoveries} "
                        f"consecutive immediate deaths). NOT restarting. "
                        f"Likely misconfiguration — check cert files, port availability, "
                        f"or startup logs in {svc.name}.stdout.log / .stderr.log. "
                        f"Once fixed, restart guardian (`cfarm.bat restart`)."
                    )
                    continue
                svc.consecutive_boot_recoveries += 1
                if svc.consecutive_boot_recoveries > 1:
                    # Suppress the verbose log on the first occurrence only.
                    log.warning(
                        f"{svc.name} not running (recovery attempt "
                        f"#{svc.consecutive_boot_recoveries}/{CRASH_LOOP_THRESHOLD}), "
                        f"starting immediately..."
                    )
                else:
                    log.warning(f"{svc.name} not running, starting immediately...")
                if start_service(svc):
                    log.info(f"{svc.name} start initiated, waiting {STARTUP_DELAY}s for readiness")
                continue

            # Skip health check if service is still in startup phase
            if svc.startup_time is not None and (time.time() - svc.startup_time) < STARTUP_DELAY:
                elapsed = time.time() - svc.startup_time
                remaining = STARTUP_DELAY - elapsed
                log.debug(f"{svc.name} still starting up ({remaining:.0f}s remaining)")
                continue

            ok, msg = check_service_health(svc)

            if ok:
                if svc.failure_count > 0:
                    log.info(f"{svc.name} recovered (was {svc.failure_count} failures)")
                svc.failure_count = 0
                svc._grace_start = None  # Reset grace period
                svc.hung_count = 0  # Reset hung detection on successful health check
                svc.consecutive_misses = 0  # B2: reset miss counter on success
                svc.consecutive_boot_recoveries = 0  # Service is healthy now
                log.debug(f"Health check OK: {svc.name}")
            else:
                svc.failure_count += 1
                svc.consecutive_misses += 1  # B2: count consecutive misses
                log.warning(
                    f"Health check FAIL #{svc.failure_count} "
                    f"(miss {svc.consecutive_misses}/3): {svc.name} - {msg}"
                )

                # Special handling for hung services (port listening but unresponsive)
                if "Timeout" in msg and svc.check_type in ("http", "https") and svc.port:
                    # Check if this service is hung - port listening but not responding
                    port_ok, _ = check_port_listening(svc.port)
                    if port_ok:
                        # Port is listening but health check times out - likely hung
                        log.warning(f"{svc.name}: Port {svc.port} listening but health check timeout "
                                   f"- checking for hung state...")
                        recovered = detect_and_recover_hung_service(svc)
                        if recovered:
                            log.info(f"{svc.name}: Hung state detected and recovered, "
                                    "waiting for service to restart")
                            continue  # Skip normal restart, wait for service to recover

                # B2: require 3 consecutive misses before triggering a restart.
                # Without this guard, a single transient WMI/av hiccup during
                # uvicorn's startup window causes: restart → still not bound →
                # restart → loop until rate-limit trips. Spaced across
                # HEALTH_INTERVAL (30s) this gives the service ~90s to come
                # up before we declare it hung and restart.
                if svc.consecutive_misses < 3:
                    log.debug(
                        f"{svc.name}: only {svc.consecutive_misses}/3 misses — "
                        f"giving service more time before restart"
                    )
                    continue

                # Check grace period before deciding to restart
                if check_grace_period(svc, msg):
                    continue  # Skip restart, wait in grace period

                # Check restart limit
                if not svc.should_restart():
                    log.error(f"Restart limit reached for {svc.name}, manual intervention required")
                    continue

                # Determine restart order
                log.warning(f"Triggering restart for {svc.name}")
                if svc.check_type == "tunnel":
                    # For tunnel, restart ALL apps first, then tunnel
                    apps = [s for s in SERVICES if s.check_type in ("http", "https")]
                    for app in apps:
                        if not app.is_running() or app.failure_count >= 3:
                            restart_service(app)
                            time.sleep(2)  # Wait for app to start

                restart_service(svc)

        # Wait for next interval
        elapsed = time.time() - check_start
        wait_time = HEALTH_INTERVAL - elapsed
        if wait_time > 0:
            time.sleep(wait_time)


if __name__ == "__main__":
    # Install crash hooks BEFORE anything else can throw.
    # This ensures every subsequent error (uncaught or unraisable) is captured.
    _install_crash_hooks()

    # atexit handler: logs the final exit reason and cleans up PID.
    # This fires on sys.exit(), normal return, or unhandled exception alike.
    import atexit
    _exit_reason = {"reason": "normal exit"}

    def _on_exit():
        if _exit_reason["reason"] != "normal exit":
            _log_crash(f"ATEEXIT: {_exit_reason['reason']}")
        cleanup_pid_file()
    atexit.register(_on_exit)

    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "stop":
            # B3: touch the intentional-shutdown flag BEFORE sending SIGTERM.
            # The watchdog checks for this file and refuses to respawn
            # guardian after we exit — making "stop" actually stop.
            try:
                Path(INTENTIONAL_SHUTDOWN_FILE).touch()
                log.info(f"B3: marked intentional shutdown via {INTENTIONAL_SHUTDOWN_FILE}")
            except Exception as e:
                log.warning(f"Could not write intentional shutdown flag: {e}")
            # Send signal to stop
            if os.path.exists(PID_FILE):
                try:
                    with open(PID_FILE, "r") as f:
                        pid = int(f.read().strip())
                    os.kill(pid, signal.SIGTERM)
                    print(f"Sent stop signal to guardian PID {pid}")
                except Exception as e:
                    print(f"Could not stop guardian: {e}")
            else:
                print("Guardian not running (no PID file)")
        elif cmd == "restart":
            # Touch inhibit file, stop services, remove inhibit
            # Also clear any leftover intentional-shutdown flag from a prior stop.
            try:
                if os.path.exists(INTENTIONAL_SHUTDOWN_FILE):
                    os.remove(INTENTIONAL_SHUTDOWN_FILE)
            except Exception:
                pass
            print("Restarting all services...")
            Path(INHIBIT_FILE).touch()
            print(f"Created {INHIBIT_FILE} - services will not auto-restart")
            print("To restart manually, then run:")
            print(f"  rm {INHIBIT_FILE}")
        elif cmd == "status":
            # Show status of all services
            print("Service status:")
            for svc in SERVICES:
                status = "RUNNING" if svc.is_running() else "STOPPED"
                print(f"  {svc.name}: {status}")
        elif cmd == "start":
            # Clearing CLI: remove both flags so a fresh start proceeds
            # cleanly. Used by cfarm.bat to wipe state before re-launching.
            try:
                if os.path.exists(INHIBIT_FILE):
                    os.remove(INHIBIT_FILE)
                    print(f"Removed {INHIBIT_FILE}")
            except Exception as e:
                print(f"Could not remove inhibit file: {e}")
            try:
                if os.path.exists(INTENTIONAL_SHUTDOWN_FILE):
                    os.remove(INTENTIONAL_SHUTDOWN_FILE)
                    print(f"Removed {INTENTIONAL_SHUTDOWN_FILE}")
            except Exception as e:
                print(f"Could not remove intentional-shutdown file: {e}")
        else:
            print("Usage: python guardian.py [stop|restart|status|start]")
    else:
        # Default startup path: clear any leftover intentional-shutdown
        # flag from a previous stop. (No-op if the file doesn't exist.)
        try:
            if os.path.exists(INTENTIONAL_SHUTDOWN_FILE):
                os.remove(INTENTIONAL_SHUTDOWN_FILE)
                log.info(f"Cleared stale {INTENTIONAL_SHUTDOWN_FILE} on startup")
        except Exception as e:
            log.warning(f"Could not clear {INTENTIONAL_SHUTDOWN_FILE}: {e}")

        try:
            main()
        except KeyboardInterrupt:
            _exit_reason["reason"] = "KeyboardInterrupt (user)"
            log.info("Guardian stopped by user")
        except SystemExit as e:
            _exit_reason["reason"] = f"SystemExit(code={e.code})"
            # Don't re-raise; let atexit + crash log handle it
            log.warning(f"Guardian exited via SystemExit(code={e.code})")
        except BaseException as e:
            # Catch EVERYTHING (including KeyboardInterrupt as a fallback).
            # _log_crash + sys.excepthook both fire here.
            import traceback
            exc_info = (type(e), e, e.__traceback__)
            _log_crash("UNCAUGHT IN MAIN LOOP", exc_info)
            _exit_reason["reason"] = f"unhandled {type(e).__name__}: {e}"
            log.exception(f"Guardian crashed: {e}")

            # Self-respawn: launch a fresh guardian before exiting, so we
            # don't need Task Scheduler to be configured for the system to
            # recover from a guardian crash. Rate-limited via _can_respawn().
            if _should_respawn():
                log.warning(f"Self-respawning in {RESPAWN_DELAY}s...")
                time.sleep(RESPAWN_DELAY)
                _respawn_self()
            else:
                log.error("Self-respawn disabled (dev mode / CLI / rate limit). "
                          "Rely on Task Scheduler or manual restart.")
            sys.exit(1)
