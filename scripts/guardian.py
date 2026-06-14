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
import urllib.request
import urllib.error
import logging
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

APP_DIR = os.environ.get("APP_DIR", r"E:\Cfarm")
LOG_DIR = os.environ.get("LOG_DIR", r"E:\Cfarm\logs")
CLOUDFLARED_PATH = os.environ.get("CLOUDFLARED_PATH", os.path.join(APP_DIR, "cloudflared.exe"))
TUNNEL_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "")

LOCAL_HEALTH_8002 = os.environ.get("HEALTH_8002", "http://localhost:8002/health")
LOCAL_HEALTH_8003 = os.environ.get("HEALTH_8003", "http://localhost:8003/")
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
INHIBIT_FILE = os.environ.get("INHIBIT_FILE", "guardian.inhibit")  # Development mode flag

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

# ══════════════════════════════════════════════════════════════════════════════
# Service State
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class Service:
    name: str
    exe: Optional[str] = None          # e.g., "cloudflared.exe" or None if HTTP service
    port: Optional[int] = None         # e.g., 8002 for HTTP check
    check_type: str = "process"        # "process" | "http" | "tunnel"
    command: Optional[list] = None     # Full command to start the service
    cwd: Optional[str] = None          # Working directory for the command
    proc: Optional[subprocess.Popen] = None
    failure_count: int = 0
    restart_timestamps: list = field(default_factory=list)  # Timestamps of restarts
    startup_time: Optional[float] = None  # Timestamp when service was last started
    hung_count: int = 0  # Consecutive health check timeouts (for hung detection)

    def is_running(self) -> bool:
        if self.proc is None:
            return False
        return self.proc.poll() is None

    def should_restart(self) -> bool:
        """Check if restart is allowed based on time window"""
        now = time.time()
        # Clean old timestamps outside window
        self.restart_timestamps = [
            t for t in self.restart_timestamps if now - t < RESTART_WINDOW_SECONDS
        ]
        return len(self.restart_timestamps) < MAX_RESTARTS_PER_WINDOW

    def record_restart(self):
        self.restart_timestamps.append(time.time())
        self.failure_count = 0
        self.hung_count = 0  # Reset hung counter on successful restart

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
        cwd=r"E:\CFarm",
    ),
    Service(
        name="app_8003",
        exe=None,
        port=8003,
        check_type="http",
        command=[sys.executable, "-m", "uvicorn", "src.server.main:app", "--host", "0.0.0.0", "--port", "8003"],
        cwd=r"E:\CFarm",
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
    """Check HTTP health endpoint. Returns (success, message)."""
    if url is None:
        url = f"http://localhost:{port}/health"

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Guardian/3.0")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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
            capture_output=True, text=True, timeout=10
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
    if svc.check_type == "http" and svc.port:
        # Use /health endpoint consistently for all HTTP services (lightweight)
        return check_http(svc.port, f"http://localhost:{svc.port}/health")
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

# Configuration for hung detection
HUNG_TIMEOUT_THRESHOLD = 3  # Number of consecutive timeouts to trigger hung detection
CLOSEWAIT_THRESHOLD = 10  # Number of closewait connections to trigger force kill
HUNG_KILL_ENABLED = os.environ.get("GUARDIAN_HUNG_KILL", "true").lower() == "true"


def check_port_listening(port: int) -> tuple[bool, str]:
    """Check if a port is listening and responsive via netstat."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Where-Object {{ $_.State -eq 'Listen' }} | Measure-Object | "
             f"Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=10
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
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return int(result.stdout.strip())
        return 0
    except:
        return 0


def get_process_by_port(port: int) -> Optional[int]:
    """Get PID of process listening on a port."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | "
             f"Where-Object {{ $_.State -eq 'Listen' }} | "
             f"Select-Object -First 1 -ExpandProperty OwningProcess"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            pid_str = result.stdout.strip()
            if pid_str.isdigit():
                return int(pid_str)
        return None
    except:
        return None


def force_kill_by_pid(pid: int) -> bool:
    """Force kill a process by PID."""
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue"],
            capture_output=True, text=True, timeout=10
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

    if svc.check_type != "http" or not svc.port:
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


def force_kill(name: str, exe: str = None) -> bool:
    """
    Force kill process by name using taskkill.
    Returns True if successful.
    """
    process_name = exe or name
    if not process_name.endswith(".exe"):
        process_name += ".exe"

    try:
        result = subprocess.run(
            ["taskkill", "/F", "/IM", process_name],
            capture_output=True,
            timeout=10
        )
        if result.returncode == 0:
            log.info(f"Force killed {process_name}")
            return True
        log.warning(f"taskkill returned {result.returncode} for {process_name}")
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
            if svc.check_type == "http" and svc.port:
                # HTTP service: kill the actual OS process holding the port
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
                success = force_kill(svc.name, svc.exe)
                if not success:
                    log.error(f"  Force kill failed for {svc.name}")

    # Clean up proc reference
    svc.proc = None

    # Check if restart is allowed (time window limit)
    if not svc.should_restart():
        log.error(f"  Restart limit reached for {svc.name}, skipping restart")
        return False

    # Start new process if command is defined
    if svc.command:
        try:
            # Redirect stdout/stderr to log files to avoid pipe buffer issues
            stdout_file = open(os.path.join(LOG_DIR, f"{svc.name}.stdout.log"), "a")
            stderr_file = open(os.path.join(LOG_DIR, f"{svc.name}.stderr.log"), "a")
            svc.proc = subprocess.Popen(
                svc.command,
                cwd=svc.cwd or APP_DIR,
                stdout=stdout_file,
                stderr=stderr_file,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP') else 0,
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

    # Skip cloudflared if no tunnel token configured
    if svc.exe == "cloudflared.exe" and not TUNNEL_TOKEN:
        log.info(f"{svc.name} skipped: CLOUDFLARE_TUNNEL_TOKEN not set")
        return True  # Treat as success to avoid restart loops

    if svc.command:
        try:
            # Redirect stdout/stderr to log files to avoid pipe buffer issues
            stdout_file = open(os.path.join(LOG_DIR, f"{svc.name}.stdout.log"), "a")
            stderr_file = open(os.path.join(LOG_DIR, f"{svc.name}.stderr.log"), "a")
            svc.proc = subprocess.Popen(
                svc.command,
                cwd=svc.cwd or APP_DIR,
                stdout=stdout_file,
                stderr=stderr_file,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP') else 0,
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
        except:
            pass
    if hasattr(svc, '_stderr_file') and svc._stderr_file:
        try:
            svc._stderr_file.close()
        except:
            pass

    if svc.is_running():
        time.sleep(FORCE_KILL_DELAY)
        force_kill(svc.name, svc.exe)

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
    apps = [s for s in services if s.check_type == "http"]
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
    except:
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
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            log.warning(f"Another guardian instance already running (PID {old_pid})")
            return True
    except:
        pass

    # PID file stale, remove it
    try:
        os.remove(PID_FILE)
    except:
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
    if hasattr(service, '_grace_start'):
        elapsed = time.time() - service._grace_start
        remaining = GRACE_PERIOD - elapsed
        if remaining > 0:
            log.info(f"  Waiting in grace period ({remaining:.0f}s remaining) for {service.name}")
            return True
        else:
            # Grace period expired
            log.info(f"  Grace period expired for {service.name}, will restart")
            delattr(service, '_grace_start')
            return False

    return False


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

    # Check for existing guardian
    if is_guardian_running():
        log.error("Guardian already running, exiting")
        sys.exit(1)

    write_pid()
    # Register atexit to ensure PID file is cleaned up on any exit (normal, exception, signal)
    import atexit
    atexit.register(cleanup_pid_file)

    # Cleanup on exit
    def cleanup(signum, frame):
        log.info("Guardian shutting down...")
        for svc in SERVICES:
            stop_service(svc)
        try:
            os.remove(PID_FILE)
        except:
            pass
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Main health check loop
    while True:
        check_start = time.time()

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
                log.debug(f"Health check OK: {svc.name}")
            else:
                svc.failure_count += 1
                log.warning(f"Health check FAIL #{svc.failure_count}: {svc.name} - {msg}")

                # Special handling for hung services (port listening but unresponsive)
                if "Timeout" in msg and svc.check_type == "http" and svc.port:
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
                    apps = [s for s in SERVICES if s.check_type == "http"]
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
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "stop":
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
        else:
            print("Usage: python guardian.py [stop|restart|status]")
    else:
        try:
            main()
        except KeyboardInterrupt:
            log.info("Guardian stopped by user")
        except Exception as e:
            log.exception(f"Guardian crashed: {e}")
            sys.exit(1)
