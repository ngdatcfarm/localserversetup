"""
CFarm Guardian Control Panel
============================
CLI and control interface for Guardian v3.

Usage:
  python guardian_control.py <command>

Commands:
  start              Start guardian in foreground
  stop               Stop guardian gracefully
  restart            Restart all services (creates inhibit)
  status             Show status of all services
  dev on             Enable development mode
  dev off            Disable development mode
  dev status         Check if development mode is active
  log [n]            Show last n lines of log (default 20)
  service <name> restart   Restart specific service
  service <name> stop      Stop specific service
  service <name> start     Start specific service
  health            Run health checks now
  watch             Monitor status in real-time (Ctrl+C to exit)
"""

import subprocess
import time
import urllib.request
import urllib.error
import socket
import json
import os
import sys
import signal
from pathlib import Path
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════════════
# Paths
# ══════════════════════════════════════════════════════════════════════════════

APP_DIR = os.environ.get("APP_DIR", r"C:\Users\nguye")
LOG_DIR = os.environ.get("LOG_DIR", r"C:\Local server\logs")
CLOUDFLARED_PATH = os.environ.get("CLOUDFLARED_PATH", os.path.join(APP_DIR, "cloudflared.exe"))
TUNNEL_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "")

LOCAL_HEALTH_8002 = os.environ.get("HEALTH_8002", "http://localhost:8002/health")
LOCAL_HEALTH_8003 = os.environ.get("HEALTH_8003", "http://localhost:8003/")
TUNNEL_PUBLIC_URL = os.environ.get("TUNNEL_PUBLIC_URL", "https://doihong.io.vn")
METRICS_URL = os.environ.get("METRICS_URL", "http://localhost:2000/api/status")

LOG_FILE = os.path.join(LOG_DIR, "guardian.log")
PID_FILE = os.path.join(LOG_DIR, "guardian.pid")
INHIBIT_FILE = "guardian.inhibit"
CONFIG_FILE = os.path.join(LOG_DIR, "guardian.conf")

# ══════════════════════════════════════════════════════════════════════════════
# Service Definitions
# ══════════════════════════════════════════════════════════════════════════════

SERVICES = [
    {"name": "app_8002", "exe": None, "port": 8002, "type": "http"},
    {"name": "app_8003", "exe": None, "port": 8003, "type": "http"},
    {"name": "cloudflared", "exe": "cloudflared.exe", "port": None, "type": "tunnel"},
]

# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def green(text): return f"\033[92m{text}\033[0m"
def red(text): return f"\033[91m{text}\033[0m"
def yellow(text): return f"\033[93m{text}\033[0m"
def cyan(text): return f"\033[96m{text}\033[0m"
def bold(text): return f"\033[1m{text}\033[0m"

# ASCII-safe status icons (Windows console compatibility)
OK_ICON = "[OK]"
ERR_ICON = "[X]"
WARN_ICON = "[!]"

def print_header(text):
    print(f"\n{'='*60}")
    print(bold(text))
    print('='*60)

def is_guardian_running():
    """Check if guardian is running."""
    if not os.path.exists(PID_FILE):
        return False
    try:
        with open(PID_FILE, "r") as f:
            pid = int(f.read().strip())
        subprocess.run(
            ["powershell", "-Command", f"Get-Process -Id {pid} -ErrorAction SilentlyContinue"],
            capture_output=True, timeout=5
        )
        return True
    except:
        return False

def get_guardian_pid():
    try:
        with open(PID_FILE, "r") as f:
            return int(f.read().strip())
    except:
        return None

def check_http(port, path="/health", timeout=3):
    try:
        url = f"http://localhost:{port}{path}"
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Guardian-Control/1.0")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, str(e.reason)
    except socket.timeout:
        return False, "Timeout"
    except Exception as e:
        return False, str(e)

def check_process(name):
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Get-Process -Name '{name}' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            count = int(result.stdout.strip())
            return count > 0, f"{count} instance(s)"
        return False, "Check failed"
    except Exception as e:
        return False, str(e)

def check_tunnel_external(timeout=10):
    try:
        req = urllib.request.Request(TUNNEL_PUBLIC_URL)
        req.add_header("User-Agent", "Guardian-Control/1.0")
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

def check_tunnel_process():
    return check_process("cloudflared")

def get_service_status(svc):
    """Get status dict for a service."""
    name = svc["name"]
    port = svc["port"]
    exe = svc["exe"]
    stype = svc["type"]

    status = {"name": name, "running": False, "health": False, "details": ""}

    if stype == "http" and port:
        path = "/" if port == 8003 else "/health"
        running, msg = check_http(port, path)
        status["running"] = running
        status["health"] = running
        status["details"] = msg
    elif stype == "tunnel":
        # Check external URL (most important)
        ext_ok, ext_msg = check_tunnel_external()
        proc_ok, proc_msg = check_tunnel_process()
        status["running"] = proc_ok
        status["health"] = ext_ok
        status["details"] = f"URL: {ext_msg} | Process: {proc_msg}"

    return status

def get_all_status():
    """Get status of all services."""
    return [get_service_status(svc) for svc in SERVICES]

# ══════════════════════════════════════════════════════════════════════════════
# Control Commands
# ══════════════════════════════════════════════════════════════════════════════

def cmd_start():
    """Start guardian."""
    print_header("Starting Guardian")

    if is_guardian_running():
        pid = get_guardian_pid()
        print(red(f"Guardian already running (PID {pid})"))
        return

    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR, exist_ok=True)

    guardian_script = os.path.join(os.path.dirname(__file__), "guardian.py")

    print(f"Starting guardian from {guardian_script}...")
    try:
        proc = subprocess.Popen(
            [sys.executable, guardian_script],
            cwd=os.path.dirname(os.path.dirname(__file__)),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP') else 0,
        )
        time.sleep(1)
        if is_guardian_running():
            print(green(f"Guardian started (PID {get_guardian_pid()})"))
        else:
            print(yellow("Guardian may have started but PID not found"))
    except Exception as e:
        print(red(f"Failed to start guardian: {e}"))

def cmd_stop():
    """Stop guardian."""
    print_header("Stopping Guardian")

    if not is_guardian_running():
        print(yellow("Guardian not running"))
        return

    pid = get_guardian_pid()
    print(f"Sending SIGTERM to PID {pid}...")

    try:
        os.kill(pid, signal.SIGTERM)
        # Wait for graceful shutdown
        for i in range(10):
            time.sleep(0.5)
            if not is_guardian_running():
                print(green("Guardian stopped"))
                return
        print(yellow("Guardian did not stop gracefully, killing..."))
        # On Windows, use taskkill for SIGKILL equivalent
        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        time.sleep(1)
        print(green("Guardian killed"))
    except Exception as e:
        print(red(f"Error stopping guardian: {e}"))

def cmd_restart():
    """Restart all services with inhibit."""
    print_header("Restarting All Services")

    # Create inhibit file
    Path(INHIBIT_FILE).touch()
    print(f"Created {INHIBIT_FILE} - services will not auto-restart")

    # Stop all services via guardian
    if is_guardian_running():
        pid = get_guardian_pid()
        print(f"Sending stop signal to guardian (PID {pid})...")
        os.kill(pid, signal.SIGTERM)
        time.sleep(2)

    # Note: Services keep running because we created inhibit file
    print(green("Services keep running (inhibit active)"))
    print("To restart services manually:")
    print("  1. net stop farm_server (or restart from app)")
    print("  2. net start farm_server")
    print(f"  3. rm {INHIBIT_FILE} to re-enable auto-restart")

def cmd_status():
    """Show status of all services."""
    print_header("Service Status")

    guardian_pid = get_guardian_pid()
    if is_guardian_running():
        print(f"Guardian: {green('RUNNING')} (PID {guardian_pid})")
    else:
        print(f"Guardian: {red('NOT RUNNING')}")

    dev_mode = os.path.exists(INHIBIT_FILE)
    if dev_mode:
        print(f"Mode: {yellow('DEVELOPMENT')} (auto-restart disabled)")
    else:
        print(f"Mode: {cyan('WORK')} (auto-restart enabled)")

    print()
    print(bold("Services:"))
    print("-" * 50)

    for svc_status in get_all_status():
        name = svc_status["name"]
        running = svc_status["running"]
        health = svc_status["health"]
        details = svc_status["details"]

        if running and health:
            status_icon = green(OK_ICON)
            status_text = green("HEALTHY")
        elif running and not health:
            status_icon = yellow(WARN_ICON)
            status_text = yellow("DEGRADED")
        else:
            status_icon = red(ERR_ICON)
            status_text = red("DOWN")

        print(f"\n{status_icon} {bold(name)}: {status_text}")
        print(f"  Running: {green('Yes') if running else red('No')}")
        print(f"  Health: {status_text}")
        print(f"  Details: {details}")

def cmd_dev(cmd_type):
    """Toggle development mode."""
    print_header("Development Mode Control")

    if cmd_type == "on":
        Path(INHIBIT_FILE).touch()
        print(f"Created {INHIBIT_FILE}")
        print(yellow("Development mode ENABLED - auto-restart DISABLED"))
        print("Services will NOT be auto-restarted if they fail.")
        print("This allows manual restart without guardian interference.")

    elif cmd_type == "off":
        if os.path.exists(INHIBIT_FILE):
            os.remove(INHIBIT_FILE)
            print(f"Removed {INHIBIT_FILE}")
        print(green("Development mode DISABLED - auto-restart ENABLED"))
        print("Services will be auto-restarted if they fail.")

    elif cmd_type == "status":
        if os.path.exists(INHIBIT_FILE):
            print(yellow("Development mode: ACTIVE"))
            print("Auto-restart: DISABLED")
            try:
                with open(INHIBIT_FILE, "r") as f:
                    reason = f.read().strip()
                    if reason:
                        print(f"Reason: {reason}")
            except:
                pass
        else:
            print(green("Development mode: INACTIVE"))
            print("Auto-restart: ENABLED")

def cmd_log(lines=20):
    """Show last n lines of log."""
    print_header(f"Last {lines} Log Lines")

    if not os.path.exists(LOG_FILE):
        print(f"Log file not found: {LOG_FILE}")
        return

    try:
        with open(LOG_FILE, "r") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:]

        for line in last_lines:
            line = line.rstrip()
            if "[ERROR]" in line or "[CRITICAL]" in line:
                print(red(line))
            elif "[WARNING]" in line:
                print(yellow(line))
            elif "[INFO]" in line:
                print(line)
            else:
                print(line)
    except Exception as e:
        print(red(f"Error reading log: {e}"))

def cmd_service(name, action):
    """Control specific service."""
    print_header(f"Service {name}: {action}")

    svc = None
    for s in SERVICES:
        if s["name"] == name:
            svc = s
            break

    if not svc:
        print(red(f"Unknown service: {name}"))
        print("Available services: " + ", ".join([s["name"] for s in SERVICES]))
        return

    if action == "restart":
        print(f"Restarting {name}...")
        if name == "app_8002":
            # Use PowerShell to restart app
            print("Please restart app_8002 manually or via service manager")
        elif name == "app_8003":
            print("Please restart app_8003 manually or via service manager")
        elif name == "cloudflared":
            print("Restarting cloudflared requires guardian...")
            if is_guardian_running():
                # Trigger via signal or file
                Path("cloudflared.restart").touch()
                print("Restart signal sent")
            else:
                print(red("Guardian not running, cannot restart cloudflared"))

    elif action == "start":
        print(f"Starting {name}...")
        print("Use service manager or start script")

    elif action == "stop":
        print(f"Stopping {name}...")
        print("Use service manager or stop script")

    elif action == "status":
        status = get_service_status(svc)
        print(f"Name: {status['name']}")
        print(f"Running: {status['running']}")
        print(f"Health: {status['health']}")
        print(f"Details: {status['details']}")

def cmd_health():
    """Run health checks now."""
    print_header("Health Check Results")
    print()

    results = get_all_status()
    all_healthy = True

    for status in results:
        icon = green(OK_ICON) if status["health"] else red(ERR_ICON)
        print(f"{icon} {bold(status['name'])}: {status['details']}")
        if not status["health"]:
            all_healthy = False

    print()
    if all_healthy:
        print(green("All services HEALTHY"))
    else:
        print(yellow("Some services DEGRADED or DOWN"))

def cmd_watch():
    """Monitor status in real-time."""
    print_header("Monitoring Services (Ctrl+C to exit)")
    print()

    try:
        while True:
            # Clear line and go to beginning
            print("\r", end="", flush=True)

            timestamp = datetime.now().strftime("%H:%M:%S")
            statuses = get_all_status()

            summary = []
            for s in statuses:
                if s["health"]:
                    summary.append(green(OK_ICON))
                else:
                    summary.append(red(ERR_ICON))

            dev_marker = yellow("DEV") if os.path.exists(INHIBIT_FILE) else cyan("WRK")
            guardian_marker = green("G") if is_guardian_running() else red("G")

            print(f"[{timestamp}] {guardian_marker} {dev_marker} | " + " ".join(summary) + "    ", end="", flush=True)

            time.sleep(2)

    except KeyboardInterrupt:
        print()
        print(green("\nStopped monitoring"))

# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    arg = sys.argv[2] if len(sys.argv) > 2 else None

    commands = {
        "start": cmd_start,
        "stop": cmd_stop,
        "restart": cmd_restart,
        "status": cmd_status,
        "dev": lambda: cmd_dev(arg) if arg else cmd_status(),
        "log": lambda: cmd_log(int(arg) if arg else 20),
        "service": lambda: cmd_service(sys.argv[2] if len(sys.argv) > 2 else "", sys.argv[3] if len(sys.argv) > 3 else "") if len(sys.argv) > 3 else (print("Usage: python guardian_control.py service <name> <action>"), sys.exit(1)),
        "health": cmd_health,
        "watch": cmd_watch,
        "help": lambda: print(__doc__),
    }

    if cmd == "service" and len(sys.argv) < 4:
        print("Usage: python guardian_control.py service <name> <restart|stop|start|status>")
        sys.exit(1)

    if cmd not in commands:
        print(red(f"Unknown command: {cmd}"))
        print("Commands: " + ", ".join(commands.keys()))
        sys.exit(1)

    commands[cmd]()

if __name__ == "__main__":
    main()
