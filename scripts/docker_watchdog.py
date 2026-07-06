"""
Docker Desktop Watchdog
=======================
Polls `docker info` every 60 seconds. If Docker is unresponsive for 3
consecutive checks (3 minutes), it:
  1. Kills all Docker processes
  2. Runs `wsl --shutdown`
  3. Relaunches Docker Desktop
  4. Waits for containers to come back

Run as: pythonw scripts/docker_watchdog.py
(start_guardian.bat can launch this alongside the guardian watchdog)
"""

import os
import sys
import time
import signal
import subprocess as sp
from pathlib import Path
from datetime import datetime

NO_WINDOW = getattr(sp, "CREATE_NO_WINDOW", 0x08000000)

LOG_DIR = r"E:\cfarm\logs"
LOG_FILE = os.path.join(LOG_DIR, "docker_watchdog.log")
PID_FILE = os.path.join(LOG_DIR, "docker_watchdog.pid")
INHIBIT_FILE = r"E:\cfarm\docker_watchdog.inhibit"

POLL_INTERVAL = 60        # seconds between checks
FAIL_THRESHOLD = 3        # consecutive failures before restart
DOCKER_DESKTOP = r"C:\Program Files\Docker\Docker\Docker Desktop.exe"
RESTART_COOLDOWN = 300    # don't restart more than once per 5 minutes

os.makedirs(LOG_DIR, exist_ok=True)

_running = True

def _stop(signum, frame):
    global _running
    _running = False

signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)


def log(msg: str):
    line = f"{datetime.now().isoformat()} [docker-watchdog] {msg}"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


def docker_responsive() -> bool:
    """Check if Docker daemon responds within 10 seconds."""
    try:
        r = sp.run(
            ["docker", "info"],
            capture_output=True, timeout=10, creationflags=NO_WINDOW,
        )
        return r.returncode == 0
    except (sp.TimeoutExpired, FileNotFoundError, OSError):
        return False


def kill_docker():
    """Kill all Docker-related processes."""
    for name in ["Docker Desktop", "com.docker.backend", "com.docker.build",
                  "docker", "docker-agent"]:
        try:
            sp.run(
                ["taskkill", "/F", "/IM", f"{name}.exe"],
                capture_output=True, timeout=10, creationflags=NO_WINDOW,
            )
        except Exception:
            pass
    # Give processes time to die
    time.sleep(3)


def shutdown_wsl():
    """Force shutdown all WSL distributions."""
    try:
        sp.run(["wsl", "--shutdown"], capture_output=True, timeout=30)
        log("WSL shutdown complete")
    except Exception as e:
        log(f"WSL shutdown error: {e}")
    time.sleep(5)


def start_docker_desktop():
    """Launch Docker Desktop."""
    try:
        sp.Popen(
            ["cmd", "/c", "start", "", DOCKER_DESKTOP],
            creationflags=NO_WINDOW | sp.DETACHED_PROCESS,
            close_fds=True,
        )
        log("Docker Desktop launched")
    except Exception as e:
        log(f"Failed to launch Docker Desktop: {e}")


def wait_for_docker(timeout: int = 120) -> bool:
    """Wait until Docker becomes responsive."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if docker_responsive():
            return True
        time.sleep(5)
    return False


def restart_docker():
    """Full restart sequence: kill → WSL shutdown → relaunch → wait."""
    log("=== RESTARTING DOCKER ===")
    kill_docker()
    shutdown_wsl()
    start_docker_desktop()
    if wait_for_docker(120):
        log("Docker is responsive again")
        # Wait for containers to start
        time.sleep(15)
        try:
            r = sp.run(
                ["docker", "ps", "--format", "{{.Names}} {{.Status}}"],
                capture_output=True, text=True, timeout=15, creationflags=NO_WINDOW,
            )
            log(f"Containers: {r.stdout.strip()}")
        except Exception:
            pass
    else:
        log("WARNING: Docker did not recover within 120s")


def main():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    log(f"Watchdog started, PID={os.getpid()}")
    consecutive_failures = 0
    last_restart = 0

    try:
        while _running:
            time.sleep(POLL_INTERVAL)

            if os.path.exists(INHIBIT_FILE):
                consecutive_failures = 0
                continue

            if docker_responsive():
                if consecutive_failures > 0:
                    log(f"Docker recovered after {consecutive_failures} failures")
                consecutive_failures = 0
                continue

            consecutive_failures += 1
            log(f"Docker unresponsive ({consecutive_failures}/{FAIL_THRESHOLD})")

            if consecutive_failures >= FAIL_THRESHOLD:
                now = time.time()
                if now - last_restart < RESTART_COOLDOWN:
                    log("Cooldown active, skipping restart")
                    consecutive_failures = 0
                    continue

                last_restart = now
                restart_docker()
                consecutive_failures = 0

    finally:
        try:
            os.remove(PID_FILE)
        except OSError:
            pass
        log("Watchdog exiting")


if __name__ == "__main__":
    main()
