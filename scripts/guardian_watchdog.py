"""
CFarm Guardian Watchdog
=======================
A tiny process supervisor whose ONLY job is to ensure guardian.py stays alive.
It runs alongside guardian (launched by start_guardian.bat) and:
  - Polls guardian's PID every 5 seconds
  - If guardian dies (any reason — taskkill, OOM, exception, segfault),
    it writes a crash entry and re-launches guardian.py
  - Stops cleanly when guardian is asked to stop (PID file removed) or
    when this watchdog itself receives SIGTERM/SIGINT

This is LAYER 1.5 of the auto-start stack:
  Layer 1: shell:startup shortcut          (no admin, on user login)
  Layer 1.5: THIS watchdog                 (no admin, restart within 5s)
  Layer 2: Task Scheduler                  (admin, restart every 1 min)
  Layer 3: guardian.py self-respawn        (in-process, soft crashes only)

Layer 1.5 + Layer 1 = full auto-restart coverage without admin privileges.
"""

import os
import sys
import time
import signal
import subprocess
import subprocess as sp
import traceback

# Suppress console window flash on Windows when shelling out to console apps
# (tasklist.exe, taskkill.exe, powershell.exe, netstat.exe).
# Without this flag, each call briefly allocates a new conhost.exe which the
# user sees as a flashing terminal window (especially noticeable for the
# 5-second watchdog poll loop).
NO_WINDOW = getattr(sp, "CREATE_NO_WINDOW", 0x08000000)
from pathlib import Path
from datetime import datetime

# --- Crash logging (mirrors guardian.py) ---
WATCHDOG_CRASH_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "..", "logs", "guardian.watchdog.crash.log")
WATCHDOG_CRASH_LOG = os.path.normpath(WATCHDOG_CRASH_LOG)


def _log_crash(reason: str, exc_info=None) -> None:
    try:
        with open(WATCHDOG_CRASH_LOG, "a", encoding="utf-8") as f:
            f.write(f"\n{'=' * 70}\n")
            f.write(f"CRASH @ {datetime.now().isoformat()}\n")
            f.write(f"PID: {os.getpid()}\n")
            f.write(f"Reason: {reason}\n")
            if exc_info is not None:
                f.write("Traceback:\n")
                traceback.print_exception(*exc_info, file=f)
            f.write(f"{'=' * 70}\n")
    except Exception:
        pass


sys.excepthook = lambda et, ev, tb: (
    _log_crash("UNCAUGHT EXCEPTION", (et, ev, tb)),
    sys.__excepthook__(et, ev, tb),
)

# --- Config (must match guardian.py) ---
APP_DIR = r"E:\cfarm"
LOG_DIR = r"E:\cfarm\logs"
GUARDIAN_SCRIPT = os.path.join(APP_DIR, "scripts", "guardian.py")
GUARDIAN_PID_FILE = os.path.join(LOG_DIR, "guardian.pid")
WATCHDOG_PID_FILE = os.path.join(LOG_DIR, "guardian.watchdog.pid")
WATCHDOG_LOG = os.path.join(LOG_DIR, "guardian.watchdog.log")
POLL_INTERVAL = 5  # seconds
MAX_RESPAWNS_PER_HOUR = 20  # hard cap to prevent infinite loops

os.makedirs(LOG_DIR, exist_ok=True)


def log(msg: str) -> None:
    line = f"{datetime.now().isoformat()} [watchdog] {msg}"
    try:
        with open(WATCHDOG_LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


def read_pid_file(path: str):
    try:
        with open(path, "r") as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return None


def is_process_alive(pid: int) -> bool:
    """Cross-platform check: is pid still running?"""
    if pid is None or pid <= 0:
        return False
    try:
        if os.name == "nt":
            # Windows: use tasklist to avoid psutil dependency
            result = sp.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5,
                creationflags=NO_WINDOW,
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (sp.TimeoutExpired, sp.SubprocessError, OSError):
        return False


def is_guardian_intentionally_stopped() -> bool:
    """If the inhibit file exists OR there's no PID file, treat as intentional stop."""
    if os.path.exists(os.path.join(APP_DIR, "guardian.inhibit")):
        return True
    if not os.path.exists(GUARDIAN_PID_FILE):
        # PID file gone — either never started or was intentionally stopped
        return True
    return False


def launch_guardian() -> int:
    """Launch guardian.py as a fully detached subprocess. Returns PID or 0 on fail."""
    try:
        flags = 0
        if hasattr(sp, "CREATE_NEW_PROCESS_GROUP"):
            flags |= sp.CREATE_NEW_PROCESS_GROUP
        if hasattr(sp, "DETACHED_PROCESS"):
            flags |= sp.DETACHED_PROCESS
        # Use pythonw (no console) if available
        pyexe = "pythonw" if _which("pythonw") else sys.executable
        proc = sp.Popen(
            [pyexe, GUARDIAN_SCRIPT],
            cwd=APP_DIR,
            stdout=open(os.path.join(LOG_DIR, "guardian.respawn.stdout.log"), "a"),
            stderr=open(os.path.join(LOG_DIR, "guardian.respawn.stderr.log"), "a"),
            stdin=sp.DEVNULL,
            creationflags=flags,
            close_fds=True,
        )
        log(f"Launched guardian.py, PID={proc.pid}")
        return proc.pid
    except Exception as e:
        log(f"Failed to launch guardian: {e}")
        return 0


def _which(cmd: str) -> bool:
    try:
        sp.run(["where", cmd], capture_output=True, timeout=5)
        return True
    except Exception:
        return False


def _kill_orphans(parent_pid: int = 0) -> None:
    """Kill child processes of a dead guardian (parent_pid), plus any
    cloudflared.exe that might be holding our ports.  This handles the
    case where the previous guardian died but its child processes survived
    (Windows does not propagate parent death to children).

    When parent_pid > 0, only children of that PID are killed.
    cloudflared.exe is always checked (it may be a grandchild).

    CRITICAL: must exclude THIS process (the watchdog itself, which is
    also a pythonw3.12.exe) — otherwise the cleanup kills the watchdog.
    """
    my_pid = os.getpid()
    child_pids = set()

    # Step 1: Find direct children of the dead guardian
    if parent_pid > 0:
        try:
            wmic = sp.run(
                ["wmic", "process", "where", f"ParentProcessId={parent_pid}",
                 "get", "ProcessId", "/FORMAT:LIST"],
                capture_output=True, text=True, timeout=10,
                creationflags=NO_WINDOW,
            )
            for line in wmic.stdout.splitlines():
                if line.startswith("ProcessId="):
                    try:
                        child_pids.add(int(line.split("=", 1)[1].strip()))
                    except ValueError:
                        pass
        except Exception as e:
            log(f"Warning: could not find children of PID {parent_pid}: {e}")

    # Step 2: Kill found children (these are definitely orphans)
    for pid in child_pids:
        if pid == my_pid:
            continue
        try:
            sp.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True, text=True, timeout=5,
                creationflags=NO_WINDOW,
            )
            log(f"Killed orphan child PID={pid} of dead guardian {parent_pid}")
        except Exception as e:
            log(f"Warning: failed to kill orphan PID={pid}: {e}")

    # Step 3: Kill orphan cloudflared.exe — only those whose parent is dead
    # (PID 0/1 on Windows means parent exited) or the dead guardian itself.
    # Skip if parent_pid is 0 (startup, no known dead guardian).
    if parent_pid > 0:
        try:
            wmic_cf = sp.run(
                ["wmic", "process", "where", "Name='cloudflared.exe'",
                 "get", "ParentProcessId,ProcessId", "/FORMAT:LIST"],
                capture_output=True, text=True, timeout=10,
                creationflags=NO_WINDOW,
            )
            current_ppid = 0
            current_pid_cf = 0
            for line in wmic_cf.stdout.splitlines():
                line = line.strip()
                if line.startswith("ParentProcessId="):
                    try:
                        current_ppid = int(line.split("=", 1)[1].strip())
                    except ValueError:
                        current_ppid = 0
                elif line.startswith("ProcessId="):
                    try:
                        current_pid_cf = int(line.split("=", 1)[1].strip())
                    except ValueError:
                        current_pid_cf = 0
                    # Evaluate after seeing both fields for this instance
                    is_orphan = current_ppid in (0, 1, parent_pid)
                    if current_pid_cf and current_pid_cf != my_pid and current_pid_cf not in child_pids and is_orphan:
                        sp.run(
                            ["taskkill", "/F", "/PID", str(current_pid_cf)],
                            capture_output=True, text=True, timeout=5,
                            creationflags=NO_WINDOW,
                        )
                        log(f"Killed orphan cloudflared PID={current_pid_cf} (parent={current_ppid})")
                    current_ppid = 0
                    current_pid_cf = 0
        except Exception as e:
            log(f"Warning: orphan cloudflared cleanup error: {e}")


# --- Signal handling ---
_running = True


def _stop(signum, frame):
    global _running
    log(f"Received signal {signum}, stopping watchdog")
    _running = False


signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)


# --- Main loop ---
def main():
    # Write our own PID for the start_guardian.bat to detect
    with open(WATCHDOG_PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    log(f"Watchdog started, our PID={os.getpid()}")
    log(f"Monitoring {GUARDIAN_SCRIPT} every {POLL_INTERVAL}s")

    # On startup: clean up any orphan pythonw/cloudflared from a previous run
    # whose parent guardian died. Without this, the new guardian sees the
    # ports as busy and keeps restarting its own children in a loop.
    log("Cleaning up orphan processes from previous runs...")
    stale_pid = read_pid_file(GUARDIAN_PID_FILE) or 0
    _kill_orphans(stale_pid)
    time.sleep(2)  # Let the OS release the ports

    # If guardian is already running, adopt it
    current_pid = read_pid_file(GUARDIAN_PID_FILE)
    if current_pid and is_process_alive(current_pid):
        log(f"Adopting existing guardian PID={current_pid}")
    else:
        log("No guardian running, launching fresh")
        new_pid = launch_guardian()
        if new_pid == 0:
            log("FATAL: could not launch guardian on first attempt; exiting")
            sys.exit(1)
        time.sleep(3)
        current_pid = read_pid_file(GUARDIAN_PID_FILE) or new_pid

    respawn_times = []  # timestamps of recent respawns (last hour)

    try:
        while _running:
            time.sleep(POLL_INTERVAL)

            if is_guardian_intentionally_stopped():
                log("Guardian intentionally stopped (no PID file or inhibit set). Exiting watchdog.")
                break

            if not is_process_alive(current_pid):
                now = time.time()
                # Trim old respawn timestamps (last hour only)
                respawn_times = [t for t in respawn_times if now - t < 3600]
                if len(respawn_times) >= MAX_RESPAWNS_PER_HOUR:
                    log(f"ERROR: Guardian has died {len(respawn_times)} times in the last hour. "
                        f"Refusing to respawn — manual intervention required.")
                    break

                log(f"Guardian (PID={current_pid}) is DEAD. Respawning...")
                respawn_times.append(now)
                # Clean up any orphan children before launching new guardian
                # (Windows doesn't auto-kill children when parent dies)
                _kill_orphans(current_pid)
                time.sleep(2)
                current_pid = launch_guardian()
                if current_pid:
                    # Wait a bit for guardian to write its PID file
                    time.sleep(3)
                    pid_from_file = read_pid_file(GUARDIAN_PID_FILE)
                    if pid_from_file and is_process_alive(pid_from_file):
                        current_pid = pid_from_file
                        log(f"New guardian alive, PID={current_pid}")
                    else:
                        log(f"WARNING: launched PID {current_pid} but guardian.pid not yet valid")

    finally:
        try:
            os.remove(WATCHDOG_PID_FILE)
        except OSError:
            pass
        log("Watchdog exiting")


if __name__ == "__main__":
    main()
