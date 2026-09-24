"""
Guardian wrapper for CFarm FastAPI service (port 8002)
Monitors health every 30s, auto-restarts on crash, max 10 restarts per boot.
"""
import subprocess
import time
import logging
import sys
import os
from datetime import datetime

# Configuration
APP_DIR = r"E:\cfarm"
LOG_DIR = r"E:\cfarm\logs"
LOG_FILE = os.path.join(LOG_DIR, "guardian_fastapi.log")
HEALTH_URL = "http://localhost:8002/health"
HEALTH_INTERVAL = 30  # seconds
MAX_RESTARTS = 10
RESTART_DELAY = 5  # seconds

# Ensure log directory exists
os.makedirs(LOG_DIR, exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("guardian_fastapi")


def get_uptime():
    """Get system uptime string via PowerShell."""
    import subprocess as sp
    try:
        result = sp.run(
            ["powershell", "-Command", "(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Format-List TotalDays,TotalHours,TotalMinutes"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def is_process_running(proc):
    """Check if process is still running."""
    if proc is None:
        return False
    return proc.poll() is None


def check_health():
    """Check if FastAPI /health endpoint responds."""
    import urllib.request
    try:
        req = urllib.request.Request(HEALTH_URL)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception as e:
        log.warning("Health check failed: %s", e)
        return False


def start_uvicorn():
    """Start uvicorn process."""
    log.info("Starting uvicorn on port 8002...")
    log_file = os.path.join(LOG_DIR, "uvicorn_fastapi.log")
    fh = open(log_file, "a")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "src.server.main:app",
         "--host", "0.0.0.0", "--port", "8002"],
        cwd=APP_DIR,
        stdout=fh,
        stderr=fh,
    )
    return proc


def _port_is_listening(port: int) -> bool:
    """Return True if some process is currently bound to the given port.

    Used to skip a restart while the previous uvicorn is still in TIME_WAIT
    (or someone else is holding the port) — Windows surfaces that as
    WinError 10048 ("only one usage of each socket address ... is normally
    permitted") and the new uvicorn immediately shuts down, so the wrapper
    keeps spinning a new process every few seconds and never recovers.
    """
    try:
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def _wait_for_port_free(port: int, timeout_s: int = 60) -> bool:
    """Block until no process is listening on port, or timeout elapses.

    Returns True if the port is free, False on timeout. Used after a crash
    to give the kernel TIME_WAIT window (~30-60s on Windows) a chance to
    expire so the next uvicorn can bind successfully. Backs off the polling
    to keep CPU usage negligible.
    """
    deadline = time.time() + timeout_s
    sleep_s = 0.5
    while time.time() < deadline:
        if not _port_is_listening(port):
            return True
        time.sleep(sleep_s)
        sleep_s = min(sleep_s * 1.5, 4.0)
    return not _port_is_listening(port)


def main():
    log.info("=" * 50)
    log.info("CFarm FastAPI Guardian starting (uptime: %s)", get_uptime())
    log.info("App directory: %s", APP_DIR)
    log.info("Health endpoint: %s", HEALTH_URL)
    log.info("Health check interval: %ds, Max restarts: %d", HEALTH_INTERVAL, MAX_RESTARTS)
    log.info("=" * 50)

    restart_count = 0
    proc = None

    while True:
        # Start process if not running
        if not is_process_running(proc):
            if restart_count >= MAX_RESTARTS:
                log.error("Max restarts (%d) reached. Sleeping 60s before retry...", MAX_RESTARTS)
                time.sleep(60)
                restart_count = 0  # Reset after sleep
                continue

            # Wait for the previous socket to clear from TIME_WAIT before
            # starting a new uvicorn. Without this, the new process hits
            # WinError 10048 ("only one usage of each socket address ...
            # is normally permitted") and exits in <1s, the wrapper sees
            # the dead PID, and we end up in a tight restart loop that
            # hammers the port until the kernel finally clears the
            # TIME_WAIT (~30-60s on Windows). The /health endpoint
            # flips offline for those 30-60s of bind failures, which is
            # what was causing the perpetual 90s restart cycle.
            if not _wait_for_port_free(8002, timeout_s=60):
                log.warning(
                    "Port 8002 still busy after 60s — TIME_WAIT or another "
                    "holder. Sleeping 5s and trying anyway."
                )
                time.sleep(5)

            proc = start_uvicorn()
            restart_count += 1
            log.info("Process started (restart #%d), waiting 5s for startup...", restart_count)
            time.sleep(5)  # Wait for uvicorn to start

        # Health check loop
        for _ in range(HEALTH_INTERVAL):
            if not is_process_running(proc):
                log.warning("Process died, will restart...")
                break
            time.sleep(1)
        else:
            # Process still alive after interval, check health
            if check_health():
                log.debug("Health check OK")
            else:
                log.warning("Health check FAILED, will restart process...")
                proc.terminate()
                proc = None
                time.sleep(2)
                continue

        # Loop continues, restart if needed


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Guardian stopped by user")
    except Exception as e:
        log.exception("Guardian crashed: %s", e)
        sys.exit(1)
