"""
Docker Desktop Watchdog
=======================
Polls `docker info` every 60 seconds. If Docker is unresponsive for 3
consecutive checks (3 minutes), it:
  1. Kills all Docker processes
  2. Runs `wsl --shutdown`
  3. Relaunches Docker Desktop
  4. Waits for containers to come back

Namespace mismatch detection (Docker Desktop 4.80.0 bug):
  wsl-bootstrap (outer mount namespace) waits for /run/containerd/containerd.sock
  but containerd creates the socket in an inner namespace (created by
  unshare -mpf --propagation=unchanged). The socket never propagates back.
  If detected, the watchdog skips restart cycles and enters hibernation
  immediately — only a Windows restart can fix this. Data is never deleted.

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

# Hyper-V corruption detection: if this many consecutive restart cycles
# fail (Docker still dead after kill+relaunch), enter hibernation.
MAX_FAILED_RESTARTS = 3
HIBERNATION_LOG_INTERVAL = 600  # log warning every 10 min during hibernation

# Critical ports that must be accessible from LAN for ESP devices + server
CRITICAL_PORTS = [1884, 5432]  # MQTT broker, TimescaleDB

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


def _get_lan_ip() -> str:
    """Get the primary LAN IP address (192.168.x.x)."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def ports_accessible() -> tuple[bool, str]:
    """Check if critical Docker ports are accessible from LAN IP.

    Docker Desktop on Windows sometimes runs (docker info OK) but fails
    to forward ports from container to host — ESP devices can't connect.
    This detects that specific failure mode.

    Returns (ok, detail) where detail lists broken ports.
    """
    import socket
    lan_ip = _get_lan_ip()
    broken = []
    for port in CRITICAL_PORTS:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3)
            result = s.connect_ex((lan_ip, port))
            s.close()
            if result != 0:
                broken.append(port)
        except Exception:
            broken.append(port)
    if broken:
        return False, f"ports {broken} not reachable on {lan_ip}"
    return True, "OK"


def detect_namespace_mismatch() -> bool:
    """Detect Docker Desktop mount namespace bug (Docker 4.80.0).

    wsl-bootstrap (PID ~13, outer namespace) waits for
    /run/containerd/containerd.sock, but containerd (PID ~116, inner
    namespace created by unshare -mpf) creates the socket where
    wsl-bootstrap can't see it.

    Returns True if namespace mismatch is confirmed (restart is pointless).
    """
    try:
        # Find wsl-bootstrap PID (first child of init, runs "wsl-bootstrap run")
        r = sp.run(
            ["wsl", "-d", "docker-desktop", "--", "sh", "-c",
             "ps -o pid=,args= | grep 'wsl-bootstrap run' | head -1 | awk '{print $1}'"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        bootstrap_pid = r.stdout.strip().split()[0] if r.stdout.strip() else ""
        if not bootstrap_pid or not bootstrap_pid.isdigit():
            return False

        # Find containerd PID
        r = sp.run(
            ["wsl", "-d", "docker-desktop", "--", "sh", "-c",
             "ps -o pid=,args= | grep '/usr/bin/containerd' | grep -v grep | head -1 | awk '{print $1}'"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        containerd_pid = r.stdout.strip().split()[0] if r.stdout.strip() else ""
        if not containerd_pid or not containerd_pid.isdigit():
            return False

        # Check: does containerd's socket exist in containerd's namespace?
        r1 = sp.run(
            ["wsl", "-d", "docker-desktop", "--", "sh", "-c",
             f"test -S /proc/{containerd_pid}/root/run/containerd/containerd.sock && echo yes || echo no"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        socket_in_containerd_ns = "yes" in r1.stdout

        # Check: does the same socket exist in wsl-bootstrap's namespace?
        r2 = sp.run(
            ["wsl", "-d", "docker-desktop", "--", "sh", "-c",
             f"test -S /proc/{bootstrap_pid}/root/run/containerd/containerd.sock && echo yes || echo no"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        socket_in_bootstrap_ns = "yes" in r2.stdout

        if socket_in_containerd_ns and not socket_in_bootstrap_ns:
            log(f"NAMESPACE MISMATCH: containerd socket exists in PID {containerd_pid} "
                f"namespace but not in wsl-bootstrap PID {bootstrap_pid} namespace. "
                f"Restart is pointless — only Windows restart can fix this.")
            return True

        return False

    except Exception as e:
        log(f"Namespace check failed: {e}")
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


def restart_docker() -> bool:
    """Full restart sequence: kill → WSL shutdown → relaunch → wait.
    Returns True if Docker recovered, False otherwise.
    NEVER deletes Docker data (images/containers/volumes are preserved).
    """
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
        return True
    else:
        log("WARNING: Docker did not recover within 120s")
        return False


def main():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    log(f"Watchdog started, PID={os.getpid()}")
    consecutive_failures = 0
    failed_restart_cycles = 0   # consecutive restart cycles that failed
    last_restart = 0
    last_hibernation_log = 0    # timestamp of last hibernation warning

    try:
        while _running:
            time.sleep(POLL_INTERVAL)

            if os.path.exists(INHIBIT_FILE):
                consecutive_failures = 0
                failed_restart_cycles = 0
                continue

            # --- Hibernation mode: Hyper-V likely corrupted ---
            # Stop restarting entirely. Log a warning periodically.
            # Docker data is SAFE — only a Windows restart can fix this.
            if failed_restart_cycles >= MAX_FAILED_RESTARTS:
                now = time.time()
                if now - last_hibernation_log >= HIBERNATION_LOG_INTERVAL:
                    log(
                        f"HIBERNATION: {failed_restart_cycles} consecutive restart cycles "
                        f"failed. Hyper-V VM state is likely corrupted. "
                        f"Docker data is SAFE — restart Windows to fix. "
                        f"Will auto-recover when Docker becomes responsive."
                    )
                    last_hibernation_log = now
                # Still check if Docker recovered (e.g. after manual Windows restart)
                if docker_responsive():
                    ports_ok, _ = ports_accessible()
                    if ports_ok:
                        log(f"Docker recovered after hibernation (likely Windows restart). "
                            f"Resetting all counters.")
                        consecutive_failures = 0
                        failed_restart_cycles = 0
                continue

            # Check 1: Docker daemon responsive?
            if not docker_responsive():
                consecutive_failures += 1
                log(f"Docker daemon unresponsive ({consecutive_failures}/{FAIL_THRESHOLD})")
            else:
                # Check 2: Ports forwarded correctly?
                # Docker Desktop on Windows can run but fail to forward ports
                # after WSL2 VM corruption — ESP devices can't connect.
                ports_ok, port_detail = ports_accessible()
                if not ports_ok:
                    consecutive_failures += 1
                    log(f"Docker running but {port_detail} ({consecutive_failures}/{FAIL_THRESHOLD})")
                else:
                    if consecutive_failures > 0:
                        log(f"Docker recovered after {consecutive_failures} failures")
                    consecutive_failures = 0
                    failed_restart_cycles = 0  # reset on full recovery
                    continue

            if consecutive_failures >= FAIL_THRESHOLD:
                now = time.time()
                if now - last_restart < RESTART_COOLDOWN:
                    log("Cooldown active, skipping restart")
                    consecutive_failures = 0
                    continue

                # Early detection: skip useless restart cycles if namespace
                # mismatch is confirmed (Docker Desktop 4.80.0 bug).
                if detect_namespace_mismatch():
                    log("Skipping restart — namespace mismatch detected. "
                        "Entering hibernation. Restart Windows to fix.")
                    failed_restart_cycles = MAX_FAILED_RESTARTS
                    consecutive_failures = 0
                    continue

                last_restart = now
                recovered = restart_docker()
                consecutive_failures = 0

                if not recovered:
                    failed_restart_cycles += 1
                    log(f"Restart cycle {failed_restart_cycles}/{MAX_FAILED_RESTARTS} failed")
                else:
                    failed_restart_cycles = 0

    finally:
        try:
            os.remove(PID_FILE)
        except OSError:
            pass
        log("Watchdog exiting")


if __name__ == "__main__":
    main()
