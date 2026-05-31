"""
Guardian wrapper for Cloudflared Tunnel service - v2
Monitors tunnel connectivity via multiple checks:
  1. Local health endpoint (localhost:8002/health)
  2. External tunnel URL (https://doihong.io.vn)
  3. Cloudflared metrics API (localhost:2000/api/status)
Auto-restarts on failure, max 10 restarts per boot cycle.
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
from datetime import datetime

# Configuration
APP_DIR = r"C:\Users\nguye"
LOG_DIR = r"C:\Local server\logs"
LOG_FILE = os.path.join(LOG_DIR, "guardian_cloudflared.log")
TUNNEL_TOKEN = "eyJhIjoiOGE1ZWJhOGY1YmRiNWZiZDYzOGIzNTM1ZTQ0NDIzMDYiLCJ0IjoiNzU5YWVhNmUtMGU4My00ZTc1LWFmNWEtYzNjNTJiNWQ0YzI0IiwicyI6IlpXUmpaR1JrTkdNdFpUSm1PUzAwT0RSbUxUaGtZelV0WkRsaE1USmtPRFJsT0ROaCJ9"
LOCAL_HEALTH_URL = "http://localhost:8002/health"
TUNNEL_PUBLIC_URL = "https://doihong.io.vn"
METRICS_URL = "http://localhost:2000/api/status"
HEALTH_INTERVAL = 30  # seconds between checks
MAX_RESTARTS = 10
RESTART_DELAY = 10  # seconds between restart attempts
CONSECUTIVE_FAILURES = 3  # need 3 consecutive failures before restarting

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
log = logging.getLogger("guardian_cloudflared")

# State
failure_count = 0
restart_count = 0
proc = None
last_check_time = None
last_error = None


def get_uptime():
    """Get system uptime string via PowerShell."""
    try:
        result = subprocess.run(
            ["powershell", "-Command", "(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Format-List TotalDays,TotalHours,TotalMinutes"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def is_process_running(p):
    """Check if process is still running."""
    if p is None:
        return False
    return p.poll() is None


def check_local_health():
    """Check if local server is responding."""
    try:
        req = urllib.request.Request(LOCAL_HEALTH_URL)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def check_tunnel_external():
    """Check if tunnel is accessible from outside via public URL."""
    try:
        req = urllib.request.Request(TUNNEL_PUBLIC_URL)
        req.add_header("User-Agent", "Cloudflare-Guardian/2.0")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except urllib.error.HTTPError as e:
        # 530 = tunnel error from cloudflare
        # 502 = bad gateway (tunnel up but backend down)
        # 522 = connection timed out
        if e.code in (530, 502, 522, 504):
            return False
        # Other errors might mean tunnel is up but returning error page
        return e.code < 500
    except Exception:
        return False


def check_cloudflared_metrics():
    """Check cloudflared metrics endpoint for tunnel status."""
    try:
        req = urllib.request.Request(METRICS_URL)
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                # Check if tunnel is connected
                if data.get("tunnel", {}).get("state") == "healthy":
                    return True
                # Check for active connections
                connections = data.get("tunnel", {}).get("connections", 0)
                if connections > 0:
                    return True
    except Exception:
        pass
    return False


def get_cloudflared_status():
    """Get cloudflared process status and log output."""
    try:
        # Check process list for cloudflared
        result = subprocess.run(
            ["powershell", "-Command", "Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object Id, Path, CPU, WorkingSet | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                data = json.loads(result.stdout)
                if isinstance(data, dict):
                    return {"running": True, "pid": data.get("Id"), "mem": data.get("WorkingSet")}
                elif isinstance(data, list) and len(data) > 0:
                    return {"running": True, "pid": data[0].get("Id"), "mem": data[0].get("WorkingSet")}
            except:
                pass
    except Exception:
        pass
    return {"running": False}


def start_cloudflared():
    """Start cloudflared tunnel process."""
    log.info("Starting cloudflared tunnel...")
    try:
        proc = subprocess.Popen(
            [os.path.join(APP_DIR, "cloudflared.exe"), "tunnel", "run", "--token", TUNNEL_TOKEN],
            cwd=APP_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP') else 0,
        )
        log.info("Cloudflared started with PID %s", proc.pid)
        return proc
    except Exception as e:
        log.error("Failed to start cloudflared: %s", e)
        return None


def kill_cloudflared():
    """Kill all cloudflared processes."""
    log.info("Killing cloudflared processes...")
    try:
        subprocess.run(["taskkill", "/F", "/IM", "cloudflared.exe"],
                      capture_output=True, timeout=10)
        time.sleep(2)
    except Exception as e:
        log.warning("Error killing cloudflared: %s", e)


def restart_cloudflared():
    """Restart cloudflared tunnel."""
    global proc, failure_count, restart_count

    log.warning("=== RESTARTING CLOUDFLARED (failure #%d, restart #%d) ===", failure_count, restart_count + 1)

    # Kill existing process
    if proc:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        except Exception:
            pass
        proc = None

    # Also kill any remaining cloudflared processes
    kill_cloudflared()

    # Increment restart count
    restart_count += 1
    failure_count = 0

    if restart_count >= MAX_RESTARTS:
        log.error("Max restarts (%d) reached. Sleeping 180s before retry...", MAX_RESTARTS)
        time.sleep(180)
        restart_count = 0
        return

    # Restart
    proc = start_cloudflared()
    if proc:
        log.info("Restart #%d initiated, waiting 8s for tunnel establishment...", restart_count)
        time.sleep(8)
    else:
        log.error("Failed to restart cloudflared, will retry in %ds...", RESTART_DELAY)
        time.sleep(RESTART_DELAY)


def perform_health_check():
    """
    Perform comprehensive health check.
    Returns True if all checks pass, False otherwise.
    Error message stored in last_error global.
    """
    global last_error

    # Check 1: Local health
    local_ok = check_local_health()
    if not local_ok:
        last_error = "Local server health check failed"
        return False

    # Check 2: External tunnel URL
    tunnel_ok = check_tunnel_external()
    if not tunnel_ok:
        last_error = f"Tunnel external check failed ({TUNNEL_PUBLIC_URL} unreachable)"
        return False

    # Check 3: Cloudflared metrics (if available)
    metrics_ok = check_cloudflared_metrics()
    if not metrics_ok:
        log.debug("Cloudflared metrics endpoint not available (may be normal)")

    # All checks passed
    last_error = None
    return True


def log_status(status_type, message):
    """Log status to file for monitoring."""
    status_file = os.path.join(LOG_DIR, "guardian_status.log")
    try:
        with open(status_file, "a") as f:
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"{ts} [{status_type}] {message}\n")
    except Exception:
        pass


def main():
    global proc, failure_count, restart_count, last_check_time

    log.info("=" * 60)
    log.info("CFarm Cloudflared Guardian v2 starting")
    log.info("Uptime: %s", get_uptime())
    log.info("App directory: %s", APP_DIR)
    log.info("Health check interval: %ds", HEALTH_INTERVAL)
    log.info("Max restarts per cycle: %d", MAX_RESTARTS)
    log.info("Tunnel URL: %s", TUNNEL_PUBLIC_URL)
    log.info("Local health: %s", LOCAL_HEALTH_URL)
    log.info("=" * 60)

    # Clean up any existing cloudflared processes before starting
    kill_cloudflared()

    # Start cloudflared if not running
    if not is_process_running(proc):
        proc = start_cloudflared()
        restart_count += 1
        log.info("Initial start (restart #%d), waiting 8s...", restart_count)
        time.sleep(8)

    # Main health check loop
    while True:
        check_start = time.time()

        # Check if process died
        if not is_process_running(proc):
            log.warning("Cloudflared process died unexpectedly")
            restart_cloudflared()
            continue

        # Perform health check
        ok = perform_health_check()

        if ok:
            if failure_count > 0:
                log.info("Tunnel recovered after %d failures", failure_count)
            failure_count = 0
            log.debug("Health check OK (local=OK, tunnel=OK)")
            log_status("OK", "All checks passed")
        else:
            failure_count += 1
            log.warning("Health check FAILED (#%d): %s", failure_count, last_error or "unknown")
            log_status("FAIL", last_error or "unknown")

            if failure_count >= CONSECUTIVE_FAILURES:
                log.error("=== CONSECUTIVE FAILURES (%d), triggering restart ===", CONSECUTIVE_FAILURES)
                log_status("RESTART", f"Failure count {failure_count} reached threshold")
                restart_cloudflared()

        # Wait for next check interval
        elapsed = time.time() - check_start
        wait_time = HEALTH_INTERVAL - elapsed
        if wait_time > 0:
            time.sleep(wait_time)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Guardian stopped by user")
    except Exception as e:
        log.exception("Guardian crashed: %s", e)
        sys.exit(1)