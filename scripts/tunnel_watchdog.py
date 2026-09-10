"""
CFarm Tunnel Watchdog
=====================
Independent watchdog whose ONLY job is to verify the Cloudflare tunnel
is actually carrying traffic from the public URL down to the local
backend. Complements guardian.py and guardian_watchdog.py.

WHY THIS IS NEEDED
------------------
guardian.py supervises the cloudflared.exe process by checking the
local metrics endpoint (port 2000). But cloudflared can be:

  1. Crashed (port 2000 dead)        -> guardian catches this within ~30s
  2. Hung but listening on 2000     -> guardian's hung-detector catches this
  3. **Process alive but tunnel disconnected from Cloudflare edge**
     -> metrics still respond, but public URL fails. Guardian cannot
        detect this.

Case (3) happened on 2026-07-09: cloudflared.exe ran fine but every
QUIC connection to Cloudflare's HK edge dropped with
"timeout: no recent network activity". Public URL was unreachable.

BEHAVIOUR
---------
Polls https://doihong.io.vn/health every POLL_INTERVAL seconds.
A probe "fails" if:
  - Connection refused / DNS error / network unreachable
  - HTTP status not in [200, 302, 401, 403]  (anything else = backend broken)
  - Timeout (>10s)

When FAIL_THRESHOLD consecutive probes fail:
  - If cloudflared.exe is alive -> kill it (taskkill /F). guardian.py
    will detect the process exit within ~30s and restart it via wrapper.
  - If cloudflared.exe is already dead -> do nothing; guardian will
    handle its own restart. We just log and reset the failure counter.

Hard cap: MAX_RESTARTS_PER_HOUR cloudflared kills. Past that, we stop
intervening (likely the local backend is the problem, not the tunnel).

LAYER 1.6 in the auto-restart stack:
  Layer 1   shell:startup shortcut        (on user login)
  Layer 1.5 guardian_watchdog.py          (guardian process supervisor)
  Layer 1.6 THIS tunnel_watchdog.py       (tunnel reachability probe)
  Layer 2   Windows Task Scheduler        (restart every 1 min if dead)
  Layer 3   guardian.py self-respawn      (in-process, soft crashes)

USAGE
-----
  pythonw scripts/tunnel_watchdog.py

launched by start_guardian.bat alongside guardian_watchdog.py.
Stop: kill the pythonw process OR touch E:\\cfarm\\tunnel_watchdog.inhibit.
"""

import os
import sys
import time
import signal
import subprocess as sp
import urllib.request
import urllib.error
import ssl
import traceback
from datetime import datetime

# Suppress console flash on Windows when shelling out to tasklist/taskkill
NO_WINDOW = getattr(sp, "CREATE_NO_WINDOW", 0x08000000)

# ── Configuration ──────────────────────────────────────────────────────────
APP_DIR = r"E:\cfarm"
LOG_DIR = r"E:\cfarm\logs"
PID_FILE = os.path.join(LOG_DIR, "tunnel.watchdog.pid")
LOG_FILE = os.path.join(LOG_DIR, "tunnel.watchdog.log")
CRASH_LOG = os.path.join(LOG_DIR, "tunnel.watchdog.crash.log")
INHIBIT_FILE = os.path.join(APP_DIR, "tunnel_watchdog.inhibit")

PUBLIC_HEALTH_URL = os.environ.get(
    "TUNNEL_PUBLIC_HEALTH_URL", "https://doihong.io.vn/health"
)
LOCAL_HEALTH_URL = os.environ.get(
    "TUNNEL_LOCAL_HEALTH_URL", "http://localhost:8002/health"
)
PROBE_TIMEOUT = 10                # seconds for the HTTP probe
POLL_INTERVAL = 60                # seconds between probes
FAIL_THRESHOLD = 3                # consecutive failures before kill
MAX_RESTARTS_PER_HOUR = 10        # hard cap
COOLDOWN_AFTER_RESTART = 120      # seconds before next probe is "valid"
                               # (give cloudflared time to reconnect)

# Guardian-escalation (Option A): if cloudflared.exe stays dead while
# guardian.py is still alive but NOT restarting it, the watchdog forcibly
# kills guardian so Layer 1.5 (guardian_watchdog.py) respawns a fresh one.
# This recovers from guardian-stuck-hang scenarios where its main loop
# silently froze but its PID is still listed in tasklist.
GUARDIAN_PID_FILE = os.path.join(LOG_DIR, "guardian.pid")
GUARDIAN_ESCALATION_THRESHOLD = 3   # consecutive cf-dead probes before kill
GUARDIAN_ESCALATION_COOLDOWN = 300   # 5 min between escalations (avoid flap)

# Acceptable HTTP statuses from public URL. We allow 401/403 because
# they prove the tunnel is forwarding traffic even if the path is
# restricted. The "/health" endpoint is open per CLAUDE.md so 200 is
# expected, but we tolerate redirects.
ACCEPTABLE_STATUSES = {200, 301, 302, 307, 308, 401, 403}

os.makedirs(LOG_DIR, exist_ok=True)

# ── Crash logging ──────────────────────────────────────────────────────────
def _log_crash(reason: str, exc_info=None) -> None:
    try:
        with open(CRASH_LOG, "a", encoding="utf-8") as f:
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


# ── Logging ────────────────────────────────────────────────────────────────
def log(msg: str) -> None:
    line = f"{datetime.now().isoformat()} [tunnel-watchdog] {msg}"
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


# ── Helpers ────────────────────────────────────────────────────────────────
def is_cloudflared_alive() -> bool:
    """Returns True if at least one cloudflared.exe process is running."""
    if os.name != "nt":
        # POSIX path (left here for future Linux support)
        try:
            r = sp.run(["pgrep", "-f", "cloudflared"],
                       capture_output=True, timeout=5)
            return r.returncode == 0
        except Exception:
            return False

    try:
        r = sp.run(
            ["tasklist", "/FI", "IMAGENAME eq cloudflared.exe",
             "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=5,
            creationflags=NO_WINDOW,
        )
        out = r.stdout.strip()
        # tasklist returns "INFO: No tasks are running..." when empty
        return out.startswith('"cloudflared.exe"')
    except Exception as e:
        log(f"is_cloudflared_alive check failed: {e}")
        return False


def kill_cloudflared() -> bool:
    """Force-kill cloudflared.exe. Returns True on success."""
    try:
        r = sp.run(
            ["taskkill", "/F", "/IM", "cloudflared.exe"],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        # Exit code 0 = killed, 128 = not found
        if r.returncode == 0:
            log("killed cloudflared.exe (taskkill /F)")
            return True
        elif r.returncode == 128:
            log("taskkill: cloudflared.exe not found (already dead)")
            return True
        else:
            log(f"taskkill returned {r.returncode}: {r.stderr.strip()}")
            return False
    except Exception as e:
        log(f"taskkill exception: {e}")
        return False


def read_guardian_pid() -> int | None:
    """Returns guardian PID from logs/guardian.pid, or None if missing/invalid."""
    try:
        with open(GUARDIAN_PID_FILE, "r") as f:
            v = int(f.read().strip())
            return v if v > 0 else None
    except (FileNotFoundError, ValueError, OSError):
        return None


def is_process_alive(pid: int) -> bool:
    """Cross-platform liveness probe. Mirrors guardian_watchdog implementation."""
    if pid is None or pid <= 0:
        return False
    try:
        if os.name == "nt":
            r = sp.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=5,
                creationflags=NO_WINDOW,
            )
            return str(pid) in r.stdout
        else:
            os.kill(pid, 0)
            return True
    except (sp.TimeoutExpired, sp.SubprocessError, OSError):
        return False


def kill_pid(pid: int) -> bool:
    """Force-kill an arbitrary PID. Returns True on success (incl. already gone)."""
    try:
        r = sp.run(
            ["taskkill", "/F", "/PID", str(pid)],
            capture_output=True, text=True, timeout=10,
            creationflags=NO_WINDOW,
        )
        return r.returncode in (0, 128)
    except Exception as e:
        log(f"taskkill /F /PID {pid} failed: {e}")
        return False


def probe_public() -> tuple[bool, str]:
    """Probe the public URL via the Cloudflare tunnel.

    Returns (ok, reason). ok=True means the tunnel is forwarding
    traffic and the local backend is responding through it.
    """
    ctx = ssl.create_default_context()
    # The cert chain on the tunnel uses Cloudflare's; we should not
    # need to skip verification. If a user runs into local-CA issues
    # they can set TUNNEL_SKIP_TLS_VERIFY=1.
    if os.environ.get("TUNNEL_SKIP_TLS_VERIFY") == "1":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        PUBLIC_HEALTH_URL,
        headers={"User-Agent": "CFarmTunnelWatchdog/1.0",
                 "Cache-Control": "no-cache"},
    )
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT,
                                    context=ctx) as resp:
            status = resp.status
            if status in ACCEPTABLE_STATUSES:
                return True, f"HTTP {status}"
            return False, f"HTTP {status} (not in acceptable set)"
    except urllib.error.HTTPError as e:
        if e.code in ACCEPTABLE_STATUSES:
            return True, f"HTTP {e.code}"
        return False, f"HTTPError {e.code} {e.reason}"
    except urllib.error.URLError as e:
        return False, f"URLError: {e.reason}"
    except TimeoutError:
        return False, "Timeout (>{}s)".format(PROBE_TIMEOUT)
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


# ── Signal handling ────────────────────────────────────────────────────────
_running = True


def _stop(signum, frame):
    global _running
    log(f"Received signal {signum}, stopping watchdog")
    _running = False


signal.signal(signal.SIGINT, _stop)
signal.signal(signal.SIGTERM, _stop)


# ── Main loop ──────────────────────────────────────────────────────────────
def main():
    # Write PID file (overwriting any stale one from a previous run)
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    log(f"Tunnel watchdog started, PID={os.getpid()}")
    log(f"Probing {PUBLIC_HEALTH_URL} every {POLL_INTERVAL}s "
        f"(threshold={FAIL_THRESHOLD})")

    consecutive_failures = 0
    respawn_times: list[float] = []   # last hour of cloudflared kills
    last_kill_at = 0.0                # for cooldown
    last_alive_state: bool | None = None  # for state-change logging
    consecutive_cf_dead = 0          # Option A: cf-dead streak counter
    last_escalation_at = 0.0          # Option A: cooldown for guardian kill

    try:
        while _running:
            # Honour inhibit file (manual stop)
            if os.path.exists(INHIBIT_FILE):
                log(f"Inhibit file {INHIBIT_FILE} present, exiting.")
                break

            time.sleep(POLL_INTERVAL)

            ok, reason = probe_public()

            cf_alive = is_cloudflared_alive()
            if cf_alive != last_alive_state:
                log(f"cloudflared.exe state change: "
                    f"{'ALIVE' if cf_alive else 'DEAD'}")
                last_alive_state = cf_alive
                if cf_alive:
                    # Recovered — drop the dead-streak so we don't escalate
                    # from a stale count if cf dies again later.
                    consecutive_cf_dead = 0

            if ok:
                if consecutive_failures > 0:
                    log(f"Tunnel RECOVERED after {consecutive_failures} "
                        f"failures (last reason was: {reason})")
                consecutive_failures = 0
                log(f"OK: public URL reachable — {reason}")
                continue

            consecutive_failures += 1
            log(f"FAIL #{consecutive_failures}/{FAIL_THRESHOLD}: {reason}")

            if consecutive_failures < FAIL_THRESHOLD:
                continue

            # Threshold reached — act.
            now = time.time()

            # Cooldown: don't re-kill within COOLDOWN_AFTER_RESTART
            if now - last_kill_at < COOLDOWN_AFTER_RESTART:
                log(f"In cooldown ({int(now - last_kill_at)}s since last "
                    f"kill), skipping intervention.")
                continue

            # Trim respawn history to last hour
            respawn_times = [t for t in respawn_times if now - t < 3600]
            if len(respawn_times) >= MAX_RESTARTS_PER_HOUR:
                log(f"ERROR: {len(respawn_times)} cloudflared kills in the "
                    f"last hour — refusing to intervene further. "
                    f"Check local backend manually.")
                continue

            if not cf_alive:
                # cloudflared already dead. guardian SHOULD restart it, but
                # may be stuck (hung loop, missed SIGCHLD, etc). Track
                # how many consecutive probes see cf-dead; if it crosses
                # the threshold, escalate by killing guardian so Layer 1.5
                # can spawn a fresh one.
                consecutive_cf_dead += 1

                if consecutive_cf_dead >= GUARDIAN_ESCALATION_THRESHOLD:
                    now_e = time.time()
                    if now_e - last_escalation_at < GUARDIAN_ESCALATION_COOLDOWN:
                        log(f"ESCALATION: in cooldown "
                            f"({int(now_e - last_escalation_at)}s since last "
                            f"guardian kill), skipping")
                    else:
                        gpid = read_guardian_pid()
                        if gpid and is_process_alive(gpid):
                            log(f"ESCALATION: cloudflared.exe dead for "
                                f"{consecutive_cf_dead} consecutive probes "
                                f"AND guardian.py alive (PID={gpid}) but not "
                                f"restarting — killing guardian to trigger "
                                f"Layer 1.5 respawn")
                            if kill_pid(gpid):
                                last_escalation_at = now_e
                                consecutive_cf_dead = 0
                            else:
                                log("ESCALATION: kill_guardian failed; will retry")
                        else:
                            log(f"ESCALATION: cloudflared.exe dead for "
                                f"{consecutive_cf_dead} consecutive probes "
                                f"AND guardian not running (pid={gpid}) — "
                                f"Layer 1.5 will recover on its own")
                            # Reset to avoid spamming; Layer 1.5 handles it.
                            consecutive_cf_dead = 0
                else:
                    log(f"cloudflared.exe already dead; guardian should "
                        f"restart it ({consecutive_cf_dead}/"
                        f"{GUARDIAN_ESCALATION_THRESHOLD})")

                consecutive_failures = 0
                continue

            # cloudflared is alive but tunnel unreachable — kill it
            respawn_times.append(now)
            last_kill_at = now
            log(f"INTERVENTION: tunnel dead but cloudflared.exe alive — "
                f"killing to trigger guardian restart (kill "
                f"{len(respawn_times)}/{MAX_RESTARTS_PER_HOUR} this hour)")
            if kill_cloudflared():
                consecutive_failures = 0
            else:
                log("kill failed; not resetting failure counter")

    finally:
        try:
            os.remove(PID_FILE)
        except OSError:
            pass
        log("Tunnel watchdog exiting")


if __name__ == "__main__":
    main()