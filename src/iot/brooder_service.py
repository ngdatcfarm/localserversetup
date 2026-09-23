"""Brooder Service - Server-side PID for chicken brooder heating.

Architecture (Master-Edge with bumpless failsafe):
    ESP32 node                         Local Server (this module)
    ─────────                          ──────────────────────────
    2x SHT40 → min(T1,T2)  ──MQTT──►   Subscribe telemetry
                          ◄──MQTT──   Publish power (PID output)
                          ◄──MQTT──   Publish setpoint (cached in NVS on ESP32)

Day-age setpoint auto-calculated from cycle.brooding_start_date.
Manual override via brooder_nodes.manual_setpoint (Dashboard).

Failsafe: ESP32 switches to local PID if no MQTT cmd in 5s. This module
just needs to keep publishing — if it goes down, ESP32 holds last setpoint
from NVS.

Topics:
    Subscribe:  cfarm/brooder-+/telemetry  (QoS 0)
                cfarm/brooder-+/status     (QoS 1)
                cfarm/brooder-+/lwt        (QoS 1)
    Publish:    cfarm/brooder-{code}/power     (QoS 1, not retained)
                cfarm/brooder-{code}/setpoint  (QoS 1, retained)

Database:
    brooder_nodes (device_code PK, cycle_id FK→cycles.id, manual_setpoint,
                   enabled, created_at, updated_at)
    telemetry → reuses sensor_data hypertable (sensor_type='brooder_temp')
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Dict, List, Tuple

from simple_pid import PID

from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db

logger = logging.getLogger(__name__)


# ============================================================
# Power-history audit trail (brooder_power_history hypertable).
#
# Insertion policy: record ONLY when power % actually changes. A tick that
# publishes the same power as last time is not recorded — otherwise the
# PID's 4-6s cadence would inflate the table to 36k rows/day/heater.
# The single-ESP and zone controllers each track their own "last recorded"
# field on the in-memory state and compare before INSERTing.
# ============================================================

async def _record_power_change(
    *,
    device_code: str,
    channel: int,
    power_pct: int,
    setpoint_c: Optional[float],
    pid_input_c: Optional[float],
    source: str,                       # 'pid' | 'setpoint_change' | 'mode_change' | 'manual_override'
    zone_id: Optional[int] = None,
    heater_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    """Append one row to brooder_power_history. Best-effort, never raises.

    Called from PID loops, manual setpoint changes, and mode transitions.
    Failures are logged at DEBUG so they don't pollute stderr.log but are
    visible to anyone chasing a missing audit row.
    """
    try:
        await db.execute(
            """
            INSERT INTO brooder_power_history
                (zone_id, heater_id, device_code, channel,
                 power_pct, setpoint_c, pid_input_c, source, note)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            """,
            zone_id, heater_id, device_code, channel,
            power_pct, setpoint_c, pid_input_c, source, note,
        )
    except Exception as e:
        logger.debug(f"brooder_power_history insert skipped: {e}")


async def _record_mode_change(node: "BrooderNode",
                              old_mode: str,
                              new_mode: str,
                              *,
                              note: Optional[str] = None,
                              zone_id: Optional[int] = None,
                              heater_id: Optional[int] = None,
                              channel: int = 1) -> None:
    """Record one brooder_power_history row for a node-level mode change.

    No-op when old_mode == new_mode (caller may still call without guarding).
    Records at the node's current ``last_power_sent`` so the audit trail can
    answer "what power was the heater at when it entered failsafe?".
    """
    if old_mode == new_mode:
        return
    parts = [f"{old_mode}→{new_mode}"]
    if note:
        parts.append(note)
    await _record_power_change(
        zone_id=zone_id, heater_id=heater_id,
        device_code=node.device_code, channel=channel,
        power_pct=node.last_power_sent or 0,
        setpoint_c=node.pid.setpoint if node.pid else None,
        pid_input_c=node.last_temp_min,
        source='mode_change',
        note='; '.join(parts),
    )


# ============================================================
# SETPOINT TABLE (Vietnamese free-range tropical chickens)
# Day-age (1-indexed) → setpoint °C
# ============================================================

SETPOINT_TABLE: List[tuple] = [
    (1,   3,   33.5),
    (4,   7,   32.0),
    (8,   14,  29.5),
    (15,  21,  27.0),
    (22,  28,  25.0),
    (29, 999,  22.0),    # 29+ → 22°C (or heater OFF via manual override)
]

DEFAULT_SETPOINT_C    = 33.5
# Max setpoint the firmware will accept from the server. Bumped down from 38.0°C
# on 2026-09-18 — chicks cooked past 35°C start to show mortality spike in week
# 1. This constant is published to ESP32 in every setpoint payload as
# `max_safe`, and the firmware clamps incoming setpoints to this value.
# Mirrors firmware EMERGENCY_MAX_TEMP_C in firmware/esp32_brooder/esp32_brooder.ino
# (latch at 35.1°C, release at 34.6°C). The bimetal hardware thermostat at 38°C
# is the FINAL mechanical backup if both this software limit and the firmware
# emergency clamp fail.
MAX_SAFE_TEMPERATURE  = 34.6
TELEMETRY_STALE_S     = 120    # Mark node as stale after 2 minutes no data
SENSOR_TYPE_CODE      = "brooder_temp"   # entry in sensor_types table
SENSOR_TYPE_POWER_CODE = "brooder_power"  # actuator output stream (%)


def _seconds_since(dt: Optional[datetime]) -> Optional[int]:
    """Seconds between now (UTC) and ``dt``. None when ``dt`` is None.

    Used by ``BrooderNode.to_dict`` / ``Zone.to_dict`` to expose a
    humanizable ``last_seen_seconds`` for the UI (color-coded by freshness).
    Returned as int (not float) so JSON consumers don't carry trailing noise.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))


def _max_member_last_seen(zone) -> Optional[int]:
    """Smallest (i.e. freshest) ``last_seen_seconds`` across zone members.

    A zone with one fresh + one stale member should look fresh overall —
    "last activity" should mean "most recent activity". Returns None when
    no member has ever reported telemetry.
    """
    freshest: Optional[int] = None
    for n in zone.member_nodes.values():
        s = _seconds_since(n.last_telemetry_at)
        if s is None:
            continue
        if freshest is None or s < freshest:
            freshest = s
    return freshest


def build_setpoint_payload(setpoint: float, manual_override: bool,
                           fallback_delta_c: float) -> dict:
    """Single source for the MQTT setpoint payload published to ESP32.

    All 5 publish sites in this module + 1 in routes/brooder.py use this
    helper so that adding a new field (e.g. emergency_off, sensor_bias)
    requires editing one place, not six. Mirrors firmware topic_setpoint
    schema in esp32_brooder.ino. mac `now()` is captured here so the
    timestamp is consistent with the moment of publish.
    """
    return {
        "setpoint":         setpoint,
        "max_safe":         MAX_SAFE_TEMPERATURE,
        "manual_override":  manual_override,
        "fallback_delta_c": fallback_delta_c,
        "ts":               datetime.now(timezone.utc).isoformat(),
    }


def extract_device_code(topic: str) -> Optional[str]:
    """Parse device code from a `cfarm/brooder-{code}/...` MQTT topic.

    Used by both BrooderController (per-node legacy path) and ZoneController
    (multi-ESP zone path). Module-level helper because both controllers
    subscribe to the same topic prefix and parse identically — keeping this
    out of class scope avoids subtle drift if one class updated its
    predicate but the other didn't.
    """
    parts = topic.split('/')
    if len(parts) >= 3 and parts[0] == 'cfarm' and parts[1].startswith('brooder-'):
        return parts[1][len('brooder-'):]
    return None

# Zone-reference (reference sensor) tunables
ZONE_TEMP_PUBLISH_S   = 20     # Server → brooder zone_temp cadence
ZONE_TEMP_STALE_S     = 180    # Drop a sensor reading older than 3 min (was 5)
ZONE_TEMP_SENSOR_TYPE = "temperature"  # sensor_latest.sensor_type for env sensors

# PID power-publish heartbeat to ESP32. Firmware FAILSAFE_TIMEOUT_MS=5000
# (esp32_brooder.ino:116) → lastMqttCmdMs resets only on /power or /cmd topics
# (NOT on /setpoint). If server only publishes /power when input changes,
# ESP32 would stay in FAILSAFE for the full 5s timeout window. PID_HEARTBEAT_S=4
# (just under 5s) keeps ESP32 in NORMAL continuously when server is alive and
# telemetry is flowing — but doesn't drown MQTT (one publish per telemetry
# event since telemetry cadence is 5s). Both BrooderController._tick_pid and
# ZoneController._tick_zone_pid use this constant for the skip window.
PID_HEARTBEAT_S       = 4

# PID tuning — v1.4.1 spam-failsafe + temp-stability pack (2026-09-23):
# - Kp 12 → 6:  was overshooting setpoint by 2-3°C then snapping to 0% on
#               overshoot correction (user-reported "100% rồi tắt luôn"
#               = visible 100→0 snap). Half as aggressive ramp-up.
# - Slew clamp:  limits raw PID output to ±SLEW_PCT_PER_TICK per publish
#               cycle. PID still computes true target; client only sees
#               gradual change.
# Matches the firmware local-PID so server and failsafe behave identically.
PID_KP = 6.0
PID_KI = 0.25
PID_KD = 25.0
PID_OUTPUT_LIMITS = (0, 100)
PID_SAMPLE_TIME_S  = 2.0

# Deadband — v1.4.1: 0.1°C → 0.5°C. Was too narrow — temp rounding caused
# output flip across setpoint. Holding ±0.5°C eliminates that bump while
# not adding meaningful static offset (chick comfort band is ±0.5-1°C).
DEADBAND_C = 0.5

# Slew-rate limit (v1.4.1) — max % change per publish tick. Telemetry
# cadence 5s; PID_HEARTBEAT_S=4s skip-gate → effective publish 5s. So
# 5%/5s = 1%/s ramp speed. Slowly reaches target on cold-start but
# eliminates bang-bang visible to user. Firmware-side failsafe mode
# uses MAX_SLEW_PER_SEC=8 (~3%/s) separately; this constant is for the
# NORMAL mode server-side clamp.
SLEW_PCT_PER_TICK = 5


# ============================================================
# ZONE-TEMP BLENDING (pure helper, no I/O)
# ============================================================
def blend_zone_temp(rows, now=None, stale_s: float = ZONE_TEMP_STALE_S):
    """Weighted-average zone temperature from reference sensors.

    `rows` is an iterable of dicts with keys:
        - temp:       float | None  (the latest reading)
        - weight:     float          (default 1.0)
        - last_seen:  datetime | None  (when the reading arrived)

    Returns (value, fresh_count) where value is the weighted average
    in °C, or None if no fresh readings contributed.

    Stale filter: any reading older than `stale_s` is dropped.
    Zero-weight filter: a sensor with weight=0 contributes nothing but
    does not crash the average.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    weighted_sum = 0.0
    weight_total = 0.0
    fresh_count = 0
    for r in rows:
        temp = r.get("temp")
        last_seen = r.get("last_seen")
        if temp is None or last_seen is None:
            continue
        age = (now - last_seen).total_seconds()
        if age > stale_s:
            continue
        w_raw = r.get("weight")
        # None / missing → 1.0; explicit 0.0 is preserved (operator disable).
        w = 1.0 if w_raw is None else float(w_raw)
        if w <= 0:
            continue
        weighted_sum += float(temp) * w
        weight_total += w
        fresh_count += 1
    if fresh_count == 0 or weight_total <= 0:
        return (None, 0)
    return (weighted_sum / weight_total, fresh_count)


# ============================================================
# PID TUNING (carbon fiber heater via phase-angle SSR)
# Conservative tuning per design v1.0.8: goal is ±0.5°C zone stability
# using zone-reference sensors (heater-zone SHT40 is NOT a control input).
# ============================================================


def calc_setpoint_for_day_age(day_age: int) -> float:
    """Return setpoint (°C) based on day_age (1-indexed)."""
    if day_age < 1:
        return SETPOINT_TABLE[0][2]
    for min_age, max_age, sp in SETPOINT_TABLE:
        if min_age <= day_age <= max_age:
            return sp
    return SETPOINT_TABLE[-1][2]


# ============================================================
# PROFILE CACHE (Phase 1 + 2)
# ============================================================
# A cached resolution of (cycle → profile → stage) computed once per periodic
# tick. Avoids N DB lookups inside current_setpoint() and lets the PID
# reference the resolved setpoint without hitting the DB on every telemetry
# arrival.
# ============================================================


@dataclass
class CachedProfile:
    profile_code:    str
    stage_id:        int
    setpoint_target: float
    heater_limit:    float
    night_boost:     float
    humidity_range:  Tuple[Optional[float], Optional[float]]


# ============================================================
# PER-NODE STATE
# ============================================================

@dataclass
class BrooderNode:
    device_code: str
    cycle_id: Optional[int] = None
    brooding_start_date: Optional[date] = None
    manual_setpoint: Optional[float] = None      # Dashboard override (None = auto)
    fallback_delta_c: float = 0.0                # Admin-tuned offset for Tier-2 fallback
    enabled: bool = True

    # Profile cache (Phase 1+2): filled by BrooderController._refresh_profile_caches.
    # When set, current_setpoint() returns profile_cache.setpoint_target (+night_boost)
    # instead of falling back to SETPOINT_TABLE day-age lookup.
    profile_cache: Optional["CachedProfile"]     = None
    profile_cache_cycle_date: Optional[date]     = None
    profile_cache_night_flag: Optional[bool]     = None

    # PID
    pid: Optional[PID] = None

    # Telemetry cache
    last_temp1: Optional[float] = None
    last_temp2: Optional[float] = None
    last_temp_min: Optional[float] = None
    last_hum_avg: Optional[float] = None
    last_telemetry_at: Optional[datetime] = None

    # Zone (reference sensor) cache
    last_zone_temp: Optional[float] = None       # weighted-avg of zone sensors
    last_zone_temp_at: Optional[datetime] = None # when we last computed it
    zone_sensors_count: int = 0                  # # configured reference sensors
    pid_source: Optional[str] = None             # "zone" | "local+delta" (echoed from ESP)

    # PID input cache — used to skip _tick_pid when the input hasn't actually
    # changed (telemetry arrives every 5s; zone_temp only changes every 20s).
    # Without this gate the simple_pid integral accumulates 4× the same error
    # per real measurement, causing windup + overshoot.
    last_pid_input: Optional[float] = None
    last_pid_input_at: Optional[datetime] = None

    # v1.3.0: zone_temp low-pass filter (α=0.3, τ≈2.5s with 5s tick).
    # Server-side smoothing for Tier-1 input. The zone_temp payload arrives
    # in 20s steps (large discrete jumps when sensor readings change), and
    # Kd=25 multiplied by a 20s step would cause D-term spikes. Filtering
    # the zone input before PID makes step changes gradual.
    zone_lpf: Optional[float] = None
    zone_lpf_init: bool = False

    # Sent state
    last_power_sent: int = 0
    last_power_sent_recorded: Optional[int] = None  # last value written to brooder_power_history
    last_setpoint_sent: Optional[float] = None
    last_setpoint_sent_at: Optional[datetime] = None

    # Status
    mode: str = "unknown"     # normal | failsafe | offline | stale
    last_error: Optional[str] = None

    def __post_init__(self):
        # v1.3.0: removed sample_time=PID_SAMPLE_TIME_S. simple_pid then uses
        # real elapsed dt between calls — critical because _tick_pid is
        # event-driven by telemetry (5s cadence) AND gated by zone_temp
        # updates (20s cadence). With fixed sample_time=2.0s, the D-term
        # would be calculated assuming dt=2s even when actual dt=20s →
        # 10x larger derivative kick on every zone_temp payload arrival.
        self.pid = PID(
            Kp=PID_KP, Ki=PID_KI, Kd=PID_KD,
            setpoint=self.current_setpoint(),
            output_limits=PID_OUTPUT_LIMITS,
        )
        self.pid.auto_mode = True

    # --------------------------------------------------------

    def current_setpoint(self) -> float:
        if self.manual_setpoint is not None:
            return self.manual_setpoint
        # Profile cache (Phase 1+2): if cycle has an active profile assignment
        # AND we're inside [start_date, end_date], use the resolved stage.
        if self.profile_cache is not None:
            sp = self.profile_cache.setpoint_target
            if self.profile_cache_night_flag:
                sp += self.profile_cache.night_boost
            return min(sp, MAX_SAFE_TEMPERATURE)
        # Legacy day-age fallback (kept for backward compat with cycles
        # that have no brooder_profile_id assigned).
        if self.brooding_start_date is None:
            return DEFAULT_SETPOINT_C
        days = (date.today() - self.brooding_start_date).days + 1
        return calc_setpoint_for_day_age(days)

    def current_day_age(self) -> Optional[int]:
        if self.brooding_start_date is None:
            return None
        return (date.today() - self.brooding_start_date).days + 1

    def update_pid_setpoint(self) -> None:
        sp = self.current_setpoint()
        if abs(self.pid.setpoint - sp) > 0.01:
            self.pid.setpoint = sp
            logger.info(f"Brooder {self.device_code}: setpoint → {sp:.2f}°C")

    def compute_power(self, current_temp: float) -> int:
        self.update_pid_setpoint()
        # v1.4.2 (server bug 2): ALWAYS call self.pid(current_temp) first so
        # simple_pid's internal state updates (integral accumulates, derivative
        # term gets a fresh reading). Previously we early-returned on deadband
        # BEFORE calling self.pid → simple_pid._last_time never advanced, so
        # on the next call dt = now - last = full elapsed wallclock (up to
        # 600s of missed ticks). The integral then jumps by Ki*err*dt ≈
        # 0.25 * 5°C * 600s = 750 units → way past saturation. v1.4.1 already
        # added the slew clamp downstream so a 750-unit spike is rate-limited
        # to 5%/publish tick, but the underlying integral stays poisoned until
        # the controller bleeds it off (could take 30+s). Reordering: always
        # tick PID, then apply deadband as a PUBLISHED-output hold only.
        raw = self.pid(current_temp)
        err = self.pid.setpoint - current_temp
        if abs(err) < DEADBAND_C:
            # Inside deadband → don't publish a new value, hold last output.
            # Internal PID state already updated above (integral still grows
            # slowly during long holds, which is correct).
            return max(0, min(100, self.last_power_sent))
        # v1.4.1: slew-rate clamp on published output. PID internally
        # computes true target, but to ESP32 we publish only what's reachable
        # in one tick (1%/s). Prevents user-visible 100→0 snaps caused by
        # integral overshoot on saturation recovery.
        last = self.last_power_sent if self.last_power_sent is not None else 0
        delta = raw - last
        if delta > SLEW_PCT_PER_TICK:
            out = last + SLEW_PCT_PER_TICK
        elif delta < -SLEW_PCT_PER_TICK:
            out = last - SLEW_PCT_PER_TICK
        else:
            out = raw
        return max(0, min(100, int(round(out))))

    def reset_pid_bumpless(self, last_output_pct: Optional[int] = None) -> None:
        """Reset PID for clean handoff (cycle change, manual clear, etc.)."""
        if last_output_pct is not None:
            # simple-pid: set_auto_mode(True, last_output) → resume from this output
            self.pid.set_auto_mode(True, last_output_pct)
        else:
            self.pid.reset()

    def is_online(self) -> bool:
        if self.last_telemetry_at is None:
            return False
        age = (datetime.now(timezone.utc) - self.last_telemetry_at).total_seconds()
        return age < 30

    def to_dict(self) -> dict:
        return {
            "device_code":        self.device_code,
            "cycle_id":           self.cycle_id,
            "day_age":            self.current_day_age(),
            "enabled":            self.enabled,
            "mode":               self.mode,
            "online":             self.is_online(),
            "setpoint":           self.current_setpoint(),
            "manual_setpoint":    self.manual_setpoint,
            "fallback_delta_c":   self.fallback_delta_c,
            "last_temp1":         self.last_temp1,
            "last_temp2":         self.last_temp2,
            "last_temp_min":      self.last_temp_min,
            "last_hum_avg":       self.last_hum_avg,
            "last_telemetry_at":  self.last_telemetry_at.isoformat() if self.last_telemetry_at else None,
            "last_power_sent":    self.last_power_sent,
            "last_setpoint_sent": self.last_setpoint_sent,
            "last_setpoint_sent_at": (
                self.last_setpoint_sent_at.isoformat()
                if self.last_setpoint_sent_at else None
            ),
            "last_zone_temp":       self.last_zone_temp,
            "last_zone_temp_at":    (
                self.last_zone_temp_at.isoformat()
                if self.last_zone_temp_at else None
            ),
            "zone_sensors_count":   self.zone_sensors_count,
            "pid_source":           self.pid_source,
            "last_error":         self.last_error,
            # UI-friendly: seconds since last telemetry (None if never).
            # Pair with `last_telemetry_at` so clients can format relative time.
            "last_seen_seconds":    _seconds_since(self.last_telemetry_at),
        }


# ============================================================
# CONTROLLER (singleton)
# ============================================================

class BrooderController:
    """Manages all brooder nodes. One process-wide singleton."""

    def __init__(self):
        self.nodes: Dict[str, BrooderNode] = {}
        self._running = False
        self._periodic_task: Optional[asyncio.Task] = None
        # Profile cache dirty flag — flipped by invalidate_profile_cache() or
        # by _reload_config when a node's cycle_id changes. Forces a refresh
        # on the next periodic tick.
        self._profile_cache_dirty: bool = False

    # ─── lifecycle ─────────────────────────────────────────

    async def start(self) -> None:
        """Load config, subscribe MQTT, start periodic task."""
        # v1.3.2 fix (2026-09-21): cancel leftover asyncio tasks from a prior
        # incarnation. BrooderController is a singleton on the FastAPI app —
        # when the server restarts (guardian recovers it), the process is
        # fresh but the SAME class instance is reused via lifespan. Without
        # this cleanup, each restart accumulates N keepalive loops alongside
        # the new one → exponential growth in /power publish rate (observed
        # live: 5 publishes in 7ms after a few restarts) and eventual OOM.
        for attr in ("_periodic_task", "_zone_task", "_keepalive_task"):
            t = getattr(self, attr, None)
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

        if self._running:
            return
        self._running = True
        await self._load_nodes()
        self._subscribe_mqtt()
        self._periodic_task = asyncio.create_task(self._periodic_loop())
        self._zone_task = asyncio.create_task(self._zone_temp_loop())
        # v1.3.0: keepalive watchdog — publishes current power every 6s
        # independent of telemetry. Keeps ESP in NORMAL when telemetry is
        # jittery but server is alive. Without this, server→ESP timeout
        # could trip from a single delayed telemetry packet.
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info(f"BrooderController started: {len(self.nodes)} nodes loaded")

    async def stop(self) -> None:
        self._running = False
        for t in (self._periodic_task,
                 getattr(self, "_zone_task", None),
                 getattr(self, "_keepalive_task", None)):
            if t:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("BrooderController stopped")

    async def _zone_temp_loop(self) -> None:
        """Independent 20s cadence for zone_temp publishing.

        Kept separate from the 60s _periodic_loop so we don't pay the
        config-reload cost 3× per minute.
        """
        while self._running:
            try:
                await asyncio.sleep(ZONE_TEMP_PUBLISH_S)
                await self._publish_zone_temps()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Brooder zone_temp loop error: {e}", exc_info=True)

    # ─── keepalive watchdog (v1.3.0) ────────────────────────
    #
    # Publishes a `power` message every 6s with the LAST power value the
    # server commanded — no PID recompute, no telemetry needed. This keeps
    # ESP in MODE_NORMAL across telemetry gaps/jitter even when no fresh
    # measurement has arrived. Cadence is 6s, just under the firmware
    # FAILSAFE_TIMEOUT_MS=8000 (was 5000; bumped to 8000 in v1.3.0), so
    # one missed keepalive window still has 2s of margin before failsafe.

    # v1.3.3 (2026-09-23): 6→4s. Fix spam-failsafe loop observed on barn-05
    # (esp32-2588 / esp-brooder-000000 flickered normal↔failsafe ~113× / 2h).
    # Doubles publish density → with FAILSAFE_TIMEOUT_MS=15s (firmware),
    # margin jumps from 9s to 11s. Firmware-side bump to 60s proposed in
    # firmware patch (separate flash).
    KEEPALIVE_INTERVAL_S = 4

    async def _keepalive_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.KEEPALIVE_INTERVAL_S)
                await self._publish_keepalive_power()
            except asyncio.CancelledError:
                break
            except Exception as e:
                # log + immediately retry next iteration (don't swallow time)
                logger.error(f"Brooder keepalive loop error: {e}", exc_info=True)
                # Small backoff so a tight exception loop doesn't burn CPU,
                # but keep it short so we don't accumulate gaps.
                await asyncio.sleep(1)

    async def _publish_keepalive_power(self) -> None:
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            # Skip if we never sent a power value yet (no PID has run).
            # First PID run is gated on telemetry arrival.
            if node.last_power_sent is None:
                continue
            topic = f"cfarm/brooder-{code}/power"
            try:
                mqtt_client.publish(topic, {
                    "power":    node.last_power_sent,
                    "setpoint": round(node.pid.setpoint, 2),
                    "ts":       datetime.now(timezone.utc).isoformat(),
                    "keepalive": True,
                }, qos=1)
            except Exception as e:
                logger.debug(f"Brooder {code}: keepalive publish failed: {e}")

    # ─── zone-reference (reference sensors) ────────────────
    #
    # Each brooder pulls its zone temperature from N ESP-sensor devices in the
    # same barn. Server blends their latest temperature readings (weighted avg)
    # and publishes the result to cfarm/brooder-{code}/zone_temp every 20s.
    # ESP uses the zone reading as the sole PID input in Tier 1 — NO blend
    # with its own SHT40 in that tier. Tier 2 falls back to filtered local
    # SHT40 minus an admin-tuned delta when zone_temp is stale (>3 min).
    # Local-only mode disables the heater entirely if even the SHT40 fails.

    async def _publish_zone_temps(self) -> None:
        """Run once per periodic tick: for each brooder with reference
        sensors attached, compute the weighted-avg zone temperature from
        sensor_latest and publish via MQTT.

        Reads from sensor_latest (snapshot, fast) — NOT sensor_data
        (hypertable). Joins devices for current barn context, but barn
        filtering is already enforced by what the admin attached.
        """
        now = datetime.now(timezone.utc)
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            try:
                rows = await db.fetch(
                    """
                    SELECT
                        bzs.sensor_device_code,
                        bzs.weight,
                        bzs.sub_sensor,
                        sl.value      AS temp,
                        sl.time       AS last_seen,
                        d.barn_id     AS sensor_barn_id,
                        d.name        AS sensor_name
                    FROM brooder_zone_sensors bzs
                    JOIN devices d
                         ON d.device_code = bzs.sensor_device_code
                    LEFT JOIN sensor_latest sl
                         ON sl.device_id = d.id
                        AND sl.sensor_type = $2
                        AND sl.sub_sensor  = bzs.sub_sensor
                    WHERE bzs.brooder_device_code = $1
                    ORDER BY bzs.id
                    """,
                    code, ZONE_TEMP_SENSOR_TYPE,
                )
            except Exception as e:
                logger.debug(f"Brooder {code}: zone-sensor query failed: {e}")
                continue

            node.zone_sensors_count = len(rows)
            if not rows:
                # No sensors configured → publish zero source count so ESP
                # can clear its stale zone_temp cache.
                node.last_zone_temp = None
                node.last_zone_temp_at = now
                self._send_zone_temp(code, None, 0)
                continue

            # Filter to fresh readings (≤ ZONE_TEMP_STALE_S old)
            weighted_sum = 0.0
            weight_total = 0.0
            fresh_count = 0
            for r in rows:
                if r["temp"] is None:
                    continue
                if r["last_seen"] is None:
                    continue
                age = (now - r["last_seen"]).total_seconds()
                if age > ZONE_TEMP_STALE_S:
                    continue
                w = float(r["weight"] or 1.0)
                weighted_sum += float(r["temp"]) * w
                weight_total += w
                fresh_count += 1

            if fresh_count == 0 or weight_total <= 0:
                # All sensors stale → don't override ESP's stale cache;
                # publish an explicit "no_fresh" sentinel so ESP knows.
                node.last_zone_temp = None
                node.last_zone_temp_at = now
                self._send_zone_temp(code, None, 0)
                continue

            zone_temp = weighted_sum / weight_total
            node.last_zone_temp = zone_temp
            node.last_zone_temp_at = now
            self._send_zone_temp(code, zone_temp, fresh_count)

    def _send_zone_temp(self, code: str,
                        value: Optional[float], source_count: int) -> None:
        """Publish zone_temp payload to MQTT.

        value=None with source_count=0  → ESP should drop its cache and
                                          fall back to local-only.
        value=N    → use 50/50 blend.
        """
        topic = f"cfarm/brooder-{code}/zone_temp"
        payload = {
            "temp":         value,            # None if no fresh sources
            "source_count": source_count,
            "stale_max_s":  ZONE_TEMP_STALE_S,
            "ts":           datetime.now(timezone.utc).isoformat(),
        }
        try:
            mqtt_client.publish(topic, payload, qos=0, retain=False)
        except Exception as e:
            logger.debug(f"Brooder {code}: zone_temp publish failed: {e}")

    # ─── DB loading ────────────────────────────────────────

    async def _load_nodes(self) -> None:
        """Load all enabled brooder_nodes from DB; join with cycles for start_date."""
        try:
            rows = await db.fetch("""
                SELECT device_code, cycle_id, manual_setpoint, fallback_delta_c, enabled
                FROM brooder_nodes
            """)
        except Exception as e:
            logger.error(f"Brooder: failed to load nodes (table missing?): {e}")
            return

        loaded_codes = set()
        for r in rows:
            code = r['device_code']
            loaded_codes.add(code)
            brooding_start = None
            if r['cycle_id']:
                try:
                    cycle = await db.fetchrow(
                        "SELECT start_date FROM cycles WHERE id = $1", r['cycle_id']
                    )
                    if cycle and cycle['start_date']:
                        brooding_start = cycle['start_date']
                except Exception as e:
                    logger.warning(f"Brooder: cycle lookup failed for {code}: {e}")

            if code in self.nodes:
                # Update existing in-place to preserve PID state
                node = self.nodes[code]
                node.cycle_id = r['cycle_id']
                node.brooding_start_date = brooding_start
                if node.manual_setpoint != r['manual_setpoint']:
                    node.manual_setpoint = r['manual_setpoint']
                    node.update_pid_setpoint()
                node.fallback_delta_c = float(r['fallback_delta_c'] or 0.0)
                node.enabled = r['enabled']
            else:
                self.nodes[code] = BrooderNode(
                    device_code=code,
                    cycle_id=r['cycle_id'],
                    brooding_start_date=brooding_start,
                    manual_setpoint=r['manual_setpoint'],
                    fallback_delta_c=float(r['fallback_delta_c'] or 0.0),
                    enabled=r['enabled'],
                )

    # ─── MQTT subscription ─────────────────────────────────

    def _subscribe_mqtt(self) -> None:
        """Subscribe to brooder telemetry/status/lwt topics.

        NOTE: MQTT spec [MQTT-4.7.3-1] requires '+' to be the ENTIRE
        level — patterns like 'cfarm/brooder-+/telemetry' are INVALID
        and will raise ValueError in paho-mqtt on reconnect, killing
        the MQTT listener thread. Use 'cfarm/+/telemetry' and filter
        by topic prefix in the handler.
        """
        mqtt_client.subscribe("cfarm/+/telemetry", self._on_telemetry)
        mqtt_client.subscribe("cfarm/+/status",    self._on_status)
        mqtt_client.subscribe("cfarm/+/lwt",       self._on_lwt)

    def _on_telemetry(self, topic: str, payload) -> None:
        """Handle telemetry from ESP32 (payload is already-parsed dict)."""
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.warning(f"Brooder telemetry JSON decode error on {topic}: {e}")
                return
        if not isinstance(payload, dict):
            return

        device_code = extract_device_code(topic)
        if not device_code:
            return

        # Auto-register unknown nodes (zero-config onboarding)
        if device_code not in self.nodes:
            logger.info(f"Brooder: auto-registering new node {device_code}")
            self.nodes[device_code] = BrooderNode(device_code=device_code)

        node = self.nodes[device_code]
        # Field-name compat: legacy firmware (single SHT40, e.g. esp32_brooder.ino)
        # sends `temp` / `hum` / `temp_pid`. Newer payloads (dual-sensor or
        # richer firmware) send `temp1` / `temp2` / `temp_min` / `hum_avg`.
        # Accept either so PID never silently stops because of a rename.
        temp1     = payload.get('temp1')
        temp2     = payload.get('temp2')
        temp_min  = payload.get('temp_min')
        hum_avg   = payload.get('hum_avg')
        if temp1 is None:
            temp1 = payload.get('temp')         # legacy single-sensor alias
        if temp2 is None:
            temp2 = temp1                       # single-sensor: temp1 == temp2
        if temp_min is None:
            # Prefer firmware's own temp_pid (post-filter) when present,
            # else min(temp1, temp2). temp_min is the PID input on the
            # server side and must be a single representative value.
            tpid = payload.get('temp_pid')
            if tpid is not None:
                temp_min = float(tpid)
            elif temp1 is not None and temp2 is not None:
                temp_min = min(float(temp1), float(temp2))
            elif temp1 is not None:
                temp_min = float(temp1)
        if hum_avg is None:
            hum_avg = payload.get('hum')        # legacy single-sensor alias
        node.last_temp1    = temp1
        node.last_temp2    = temp2
        node.last_temp_min = temp_min
        node.last_hum_avg  = hum_avg
        # Zone (reference sensor) contribution reported by ESP for diagnostics.
        # Firmware populates these when it has a fresh zone_temp payload.
        zt = payload.get('zone_temp')
        if zt is not None and zt != -999.0:
            node.last_zone_temp = float(zt)
        else:
            node.last_zone_temp = None
        # ESP also reports which tier is feeding PID + the cached delta
        node.pid_source    = payload.get('pid_source')
        # (fallback_delta_c is server-published; ESP just echoes it back)
        node.last_telemetry_at = datetime.now(timezone.utc)
        node.mode          = payload.get('mode', node.mode)

        # Run PID if enabled and we have temperature
        # v1.4.2 (server bug 1): gate — if HeaterController is managing
        # this device (per-device Heater rows registered), skip the
        # legacy BrooderController PID path entirely. Without this gate,
        # both controllers compute independent PIDs for the SAME physical
        # heater channels (BrooderNode.compute_power uses its own
        # last_power_sent; Heater.compute_power uses its own
        # last_power_pct) → they publish conflicting power values within
        # the same telemetry cycle. The MQTT broker delivers whichever
        # was published last, so the user's reported "100% rồi tắt luôn"
        # oscillation is partly this race. Node state updates above still
        # run so ZoneController.member_nodes stays populated for Tier-2
        # fallback and dashboards keep showing live temperature.
        if (node.enabled
                and node.last_temp_min is not None
                and device_code not in heater_controller.heaters_by_device):
            # NOTE: must schedule on main asyncio loop, not via
            # asyncio.create_task — this handler is invoked from paho-mqtt's
            # IO thread which has no running event loop. See mqtt_client.py
            # set_main_loop / schedule_coroutine.
            mqtt_client.schedule_coroutine(self._tick_pid(node))

    def _on_status(self, topic: str, payload) -> None:
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception:
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if device_code and device_code in self.nodes:
            new_mode = payload.get('status', self.nodes[device_code].mode)
            self.nodes[device_code].mode = new_mode

    def _on_lwt(self, topic: str, payload) -> None:
        device_code = extract_device_code(topic)
        if device_code and device_code in self.nodes:
            self.nodes[device_code].mode = 'offline'
            logger.warning(f"Brooder {device_code}: LWT received → offline")

    # ─── PID tick + telemetry persistence ──────────────────

    async def _tick_pid(self, node: BrooderNode) -> None:
        """Compute new power, publish MQTT cmd, persist telemetry.

        Fix #5: PID input is NOT the heater-zone SHT40 reading — that's biased
        +1.5 to +3.0°C relative to the chick zone. We use the same Tier-1/Tier-2
        logic as the firmware:
          Tier 1: last_zone_temp alone (server-computed weighted avg of reference
                  sensors; firmware uses it directly without blending with local)
          Tier 2: last_temp_min − fallback_delta_c  (admin-tuned heater/zone bias)
        Plus: skip the tick when the input hasn't changed since the last PID
        update — otherwise we'd call compute_power() 4× per zone_temp update
        (telemetry cadence 5s, zone_temp cadence 20s) and the integral would
        accumulate 4× the stale error per real measurement.
        """
        try:
            now = datetime.now(timezone.utc)
            # Tier 1: zone reference sensors alone (no 50/50 blend) when fresh
            zone_age_s = None
            if node.last_zone_temp is not None and node.last_zone_temp_at is not None:
                zone_age_s = (now - node.last_zone_temp_at).total_seconds()
            zone_fresh = (zone_age_s is not None
                          and zone_age_s <= ZONE_TEMP_STALE_S)

            if zone_fresh and node.last_zone_temp is not None:
                # v1.3.0: low-pass filter the zone input. zone_temp arrives in
                # 20s steps (large discrete jumps when sensor readings change),
                # and Kd=25 multiplied by a 20s step would cause D-term spikes.
                # α=0.3 with 5s tick → τ≈2.5s, smooths step into a gradual ramp.
                raw_zone = node.last_zone_temp
                if not node.zone_lpf_init:
                    node.zone_lpf = raw_zone
                    node.zone_lpf_init = True
                else:
                    node.zone_lpf = 0.3 * raw_zone + 0.7 * node.zone_lpf
                temp = node.zone_lpf
                pid_source = "zone"
            else:
                # Tier 2: estimate chick-zone by subtracting the admin-tuned
                # heater/zone bias from the local SHT40 reading.
                # (delta>0 → heater is hotter than zone; we want zone estimate.)
                if node.last_temp_min is None:
                    return
                # v1.4.1: sensor glitch filter. SHT40 I2C disconnect returns
                # 0°C or stale low values; running PID on that = huge positive
                # error = heater to 100% → bimetal trip at 38°C. Reject
                # implausible readings (<5°C or >50°C) instead of feeding the
                # PID. ESP32 firmware has the same SHT40 failsafe → heater=0
                # at the device level; this is the server-side mirror.
                if node.last_temp_min < 5.0 or node.last_temp_min > 50.0:
                    logger.warning(
                        f"Brooder {node.device_code}: rejecting implausible "
                        f"SHT40 reading {node.last_temp_min:.1f}°C (Tier-2 skipped)"
                    )
                    return
                temp = node.last_temp_min - node.fallback_delta_c
                pid_source = "local+delta"
                # Reset LPF state on tier transition — Tier-1 and Tier-2 use
                # different inputs, so accumulated LPF state is meaningless.
                node.zone_lpf_init = False

            # Skip when input hasn't changed AND recent enough — avoids integral
            # windup on repeated telemetry that carries the same zone_temp.
            # Window is PID_HEARTBEAT_S (4s) — just under firmware FAILSAFE_TIMEOUT
            # (5s) so the power topic still acts as a server-alive heartbeat even
            # when temp is dead-stable. Without this, ESP32 enters failsafe every
            # 20s (the old ZONE_TEMP_PUBLISH_S window).
            if (node.last_pid_input == temp
                    and node.last_pid_input_at is not None
                    and (now - node.last_pid_input_at).total_seconds() < PID_HEARTBEAT_S):
                return

            power_pct = node.compute_power(temp)
            node.last_pid_input = temp
            node.last_pid_input_at = now
            node.pid_source = pid_source
            sp = node.pid.setpoint

            topic = f"cfarm/brooder-{node.device_code}/power"
            ok = mqtt_client.publish(topic, {
                "power":    power_pct,
                "setpoint": round(sp, 2),
                "ts":       datetime.now(timezone.utc).isoformat(),
            }, qos=1)
            node.last_power_sent = power_pct

            # Audit trail — only record when power % actually changes. PID
            # ticks at 4-6s cadence; without this guard the audit table
            # would balloon to 36k rows/day/heater of duplicate zero-deltas.
            if power_pct != node.last_power_sent_recorded:
                node.last_power_sent_recorded = power_pct
                await _record_power_change(
                    heater_id=None,                  # single-ESP path: no Heater row
                    device_code=node.device_code,
                    channel=1,
                    power_pct=power_pct,
                    setpoint_c=sp,
                    pid_input_c=node.last_temp_min,
                    source='pid',
                )

            # Persist to sensor_data hypertable — two streams for the same tick:
            #   1. brooder_temp  → °C   (PID input, drives chart)
            #   2. brooder_power → %    (actuator output, drives correlation chart)
            # Both share the same metadata blob so a future JOIN can recover
            # the full (temp1, temp2, setpoint, mode) tuple per sample.
            metadata = json.dumps({
                "hum_avg":   node.last_hum_avg,
                "temp1":     node.last_temp1,
                "temp2":     node.last_temp2,
                "setpoint":  sp,
                "mode":      node.mode,
                "day_age":   node.current_day_age(),
            })
            try:
                # Look up device_id once for the per-tick writes
                device_id = await db.fetchval(
                    "SELECT id FROM devices WHERE device_code = $1",
                    node.device_code,
                )
                if device_id is None:
                    raise RuntimeError(f"device not found: {node.device_code}")
                async with db.transaction() as conn:
                    # Temperature row. sensor_data columns actually present:
                    #   time, device_id, sensor_type (varchar), value,
                    #   unit, barn_id, cycle_id, brooder_day_age, ...
                    # The older INSERT in this function used
                    # `sensor_type_id` + `recorded_at` + `metadata` which
                    # were removed during migration 021 (sensor_type → varchar,
                    # recorded_at → time, metadata dropped).
                    await conn.execute(
                        """
                        INSERT INTO sensor_data
                            (time, device_id, sensor_type, value, unit)
                        VALUES (NOW(), $1, $2, $3, NULL)
                        """,
                        device_id, SENSOR_TYPE_CODE, temp,
                    )
                    # Power row (same tick)
                    await conn.execute(
                        """
                        INSERT INTO sensor_data
                            (time, device_id, sensor_type, value, unit)
                        VALUES (NOW(), $1, $2, $3, '%')
                        """,
                        device_id, SENSOR_TYPE_POWER_CODE, float(power_pct),
                    )
                    # Snapshot for the dashboard polling endpoint
                    # (`/api/brooder/zones/{id}/heaters/power`). Single-ESP
                    # brooder controller writes ONE heater row per tick —
                    # zone controller writes N per zone.
                    await conn.execute(
                        """
                        INSERT INTO brooder_heater_latest_power
                            (heater_id, last_power_pct, last_setpoint,
                             last_published_at, source)
                        VALUES (
                            (SELECT id FROM brooder_heaters
                             WHERE device_code = $1 AND channel = 1),
                            $2, $3, NOW(), 'server')
                        ON CONFLICT (heater_id) DO UPDATE SET
                            last_power_pct    = EXCLUDED.last_power_pct,
                            last_setpoint     = EXCLUDED.last_setpoint,
                            last_published_at = EXCLUDED.last_published_at,
                            source            = EXCLUDED.source
                        """,
                        node.device_code, int(power_pct), float(sp),
                    )
            except Exception as e:
                # Telemetry persistence is best-effort; don't break control loop
                logger.warning(f"Brooder {node.device_code}: persist skipped: {e}")

            if not ok:
                logger.debug(f"Brooder {node.device_code}: MQTT publish queued/offline")

        except Exception as e:
            logger.error(f"Brooder {node.device_code} PID tick error: {e}")
            node.last_error = str(e)

    # ─── periodic tasks ────────────────────────────────────

    async def _periodic_loop(self) -> None:
        """Run every 60s: reload config, publish setpoint changes, mark stale."""
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._reload_config()
                # Profile cache (Phase 1+2): sweep expired test assignments
                # BEFORE refreshing the cache so the sweeper's cleared rows
                # are visible to the resolver. Both run before publish so
                # the next setpoint payload reflects the fresh profile.
                await self._sweep_test_assignments()
                await self._refresh_profile_caches()
                await self._publish_setpoint_changes()
                await self._mark_stale_nodes()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Brooder periodic loop error: {e}", exc_info=True)

    async def _reload_config(self) -> None:
        """Pick up DB changes (manual override, cycle reassignment, new node)."""
        try:
            rows = await db.fetch("""
                SELECT device_code, cycle_id, manual_setpoint, fallback_delta_c, enabled
                FROM brooder_nodes
            """)
        except Exception as e:
            logger.error(f"Brooder: reload config failed: {e}")
            return

        for r in rows:
            code = r['device_code']
            if code not in self.nodes:
                # New node — load with cycle lookup
                brooding_start = None
                if r['cycle_id']:
                    cycle = await db.fetchrow(
                        "SELECT start_date FROM cycles WHERE id = $1", r['cycle_id']
                    )
                    if cycle and cycle['start_date']:
                        brooding_start = cycle['start_date']
                self.nodes[code] = BrooderNode(
                    device_code=code,
                    cycle_id=r['cycle_id'],
                    brooding_start_date=brooding_start,
                    manual_setpoint=r['manual_setpoint'],
                    fallback_delta_c=float(r['fallback_delta_c'] or 0.0),
                    enabled=r['enabled'],
                )
                logger.info(f"Brooder: picked up new node {code}")
            else:
                node = self.nodes[code]
                if node.manual_setpoint != r['manual_setpoint']:
                    logger.info(f"Brooder {code}: manual_setpoint "
                                f"{node.manual_setpoint} → {r['manual_setpoint']}")
                    node.manual_setpoint = r['manual_setpoint']
                    node.update_pid_setpoint()
                new_delta = float(r['fallback_delta_c'] or 0.0)
                if abs(node.fallback_delta_c - new_delta) > 0.01:
                    logger.info(f"Brooder {code}: fallback_delta_c "
                                f"{node.fallback_delta_c} → {new_delta}")
                    node.fallback_delta_c = new_delta
                if node.cycle_id != r['cycle_id']:
                    node.cycle_id = r['cycle_id']
                    if r['cycle_id']:
                        cycle = await db.fetchrow(
                            "SELECT start_date FROM cycles WHERE id = $1",
                            r['cycle_id'],
                        )
                        node.brooding_start_date = (
                            cycle['start_date'] if cycle and cycle['start_date']
                            else None
                        )
                    else:
                        node.brooding_start_date = None
                    # Profile cache depends on cycle — flip dirty so the next
                    # periodic tick re-resolves.
                    self._profile_cache_dirty = True
                    node.update_pid_setpoint()
                node.enabled = r['enabled']

    async def _publish_setpoint_changes(self) -> None:
        """Publish setpoint when day-age crosses a band boundary (1× per day)."""
        for code, node in self.nodes.items():
            if not node.enabled:
                continue
            new_sp = node.current_setpoint()
            if (node.last_setpoint_sent is None
                    or abs(new_sp - node.last_setpoint_sent) > 0.05):
                topic = f"cfarm/brooder-{code}/setpoint"
                payload = build_setpoint_payload(
                    new_sp,
                    manual_override=node.manual_setpoint is not None,
                    fallback_delta_c=node.fallback_delta_c,
                )
                # Phase 1+2: append profile_code (firmware ignores unknown
                # keys; this is an extension for the dashboard / audit log).
                if node.profile_cache is not None:
                    payload["profile_code"] = node.profile_cache.profile_code
                mqtt_client.publish(topic, payload, qos=1, retain=True)
                node.last_setpoint_sent = new_sp
                node.last_setpoint_sent_at = datetime.now(timezone.utc)
                logger.info(f"Brooder {code}: published setpoint {new_sp:.1f}°C "
                            f"(day_age={node.current_day_age()}, "
                            f"fallback_delta={node.fallback_delta_c:+.1f}°C, "
                            f"profile={node.profile_cache.profile_code if node.profile_cache else 'legacy'})")

    async def _mark_stale_nodes(self) -> None:
        now = datetime.now(timezone.utc)
        for code, node in self.nodes.items():
            if node.last_telemetry_at is None:
                continue
            age = (now - node.last_telemetry_at).total_seconds()
            if age > TELEMETRY_STALE_S and node.mode not in ('offline', 'stale'):
                old_mode = node.mode
                node.mode = 'stale'
                logger.warning(f"Brooder {code}: stale telemetry "
                               f"({age:.0f}s > {TELEMETRY_STALE_S}s)")
                # Audit — record the stale transition at current power.
                await _record_mode_change(
                    node, old_mode, 'stale',
                    note=f"telemetry stale {age:.0f}s",
                )

    # ─── profile cache (Phase 1+2) ────────────────────────────
    #
    # Profile state is computed once per periodic tick per node, NOT in the
    # hot path of _tick_pid. The PID tick reads node.profile_cache (a simple
    # attribute access). A flag + per-node date/night-bool gate means we
    # only re-query DB when the day rolled over, the night/day window
    # flipped, or _profile_cache_dirty was set by an external mutation
    # (profile CRUD, test apply/clear, cycle_id change).

    def invalidate_profile_cache(self) -> None:
        """Flip the dirty flag so the next periodic tick re-resolves
        every node's profile cache. Called by routes/brooder_profiles.py
        after mutations and by _reload_config when cycle_id changes.
        """
        self._profile_cache_dirty = True

    async def _resolve_profile_setpoint_async(self, node: BrooderNode) -> None:
        """One-shot DB lookup → fills node.profile_cache (or leaves None).

        Honors:
          - cycle.status = 'active'
          - today ∈ [cycle.start_date, cycle.end_date]
          - profile.is_active = TRUE
          - unexpired test assignment override (takes precedence over
            cycle.brooder_profile_id when present)
          - feature flag `brooder.profiles_enabled` in cameras.yaml
            (when false, leaves cache as None — legacy fallback always wins)

        Safe to call concurrently; sets/reads on node.profile_cache are
        non-atomic but only this method writes, and _refresh_profile_caches
        is single-threaded per tick.
        """
        # Feature flag: skip if disabled in config
        try:
            from src.services.storage.config_service import config_service
            cfg = config_service.load_config() or {}
            if not (cfg.get("brooder", {}) or {}).get("profiles_enabled", True):
                node.profile_cache = None
                return
        except Exception:
            # If config can't be read, default ON (fail-open)
            pass

        if node.cycle_id is None:
            node.profile_cache = None
            return

        today = date.today()
        try:
            from src.utils.timezone import now_hcm
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            night_now = False

        try:
            row = await db.fetchrow(
                """
                SELECT cp.id           AS cycle_id,
                       cp.status       AS cycle_status,
                       cp.start_date   AS cycle_start,
                       cp.expected_end_date AS cycle_end,
                       cp.brooder_profile_id AS cycle_pid,
                       p.code          AS cycle_pcode,
                       p.is_active     AS cycle_pactive,
                       tst.profile_id  AS test_pid,
                       tst.expires_at  AS test_expires_at
                FROM cycles cp
                LEFT JOIN brooder_profiles p
                       ON p.id = cp.brooder_profile_id
                LEFT JOIN brooder_profile_test_assignments tst
                       ON tst.cycle_id = cp.id
                      AND tst.cleared_at IS NULL
                WHERE cp.id = $1
                """,
                node.cycle_id,
            )
        except Exception as e:
            logger.debug(f"Brooder {node.device_code}: profile resolve query failed: {e}")
            node.profile_cache = None
            return

        if not row or not row["cycle_start"]:
            node.profile_cache = None
            return

        # Test assignment overrides permanent profile when active + unexpired
        eff_pid = None
        eff_pcode = None
        if (row["test_pid"]
                and row["test_expires_at"]
                and row["test_expires_at"] > datetime.now(timezone.utc)):
            eff_pid = row["test_pid"]
            # Need to look up the test profile's code
            try:
                tp = await db.fetchrow(
                    "SELECT code, is_active FROM brooder_profiles WHERE id = $1",
                    row["test_pid"],
                )
                if tp and tp["is_active"]:
                    eff_pcode = tp["code"]
                else:
                    eff_pid = None  # test profile inactive — fall through
            except Exception as e:
                logger.debug(f"Brooder {node.device_code}: test profile lookup failed: {e}")
                eff_pid = None
        if eff_pid is None:
            eff_pid = row["cycle_pid"]
            eff_pcode = row["cycle_pcode"]
            if eff_pcode is None or not row["cycle_pactive"]:
                node.profile_cache = None
                return

        # Cycle must be active
        if row["cycle_status"] != "active":
            node.profile_cache = None
            return

        # Today must be inside [start, end]
        end_date = row["cycle_end"] or date.max
        if not (row["cycle_start"] <= today <= end_date):
            node.profile_cache = None
            return

        day_age = (today - row["cycle_start"]).days + 1
        try:
            stage = await db.fetchrow(
                """
                SELECT id, setpoint_target, heater_zone_limit,
                       night_boost_offset, humidity_min_pct, humidity_max_pct
                FROM brooder_profile_schedules
                WHERE profile_id = $1
                  AND day_range_start <= $2
                  AND day_range_end   >= $2
                LIMIT 1
                """,
                eff_pid, day_age,
            )
        except Exception as e:
            logger.debug(f"Brooder {node.device_code}: stage resolve query failed: {e}")
            node.profile_cache = None
            return

        if not stage:
            node.profile_cache = None
            return

        node.profile_cache = CachedProfile(
            profile_code=eff_pcode or "(unknown)",
            stage_id=int(stage["id"]),
            setpoint_target=float(stage["setpoint_target"]),
            heater_limit=float(stage["heater_zone_limit"]),
            night_boost=float(stage["night_boost_offset"] or 0.0),
            humidity_range=(stage["humidity_min_pct"], stage["humidity_max_pct"]),
        )
        node.profile_cache_cycle_date = today
        node.profile_cache_night_flag = night_now

    async def _refresh_profile_caches(self) -> None:
        """Walk every node; resolve only the stale ones. Cheap when nothing
        changed: a single DATE / bool compare per node."""
        try:
            from src.utils.timezone import now_hcm
            today = date.today()
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            today = date.today()
            night_now = False

        for node in self.nodes.values():
            if not self._profile_cache_dirty \
                    and node.profile_cache_cycle_date == today \
                    and node.profile_cache_night_flag == night_now \
                    and node.profile_cache is not None:
                continue
            try:
                await self._resolve_profile_setpoint_async(node)
            except Exception as e:
                logger.warning(f"Brooder {node.device_code}: profile refresh failed: {e}")
        self._profile_cache_dirty = False

    async def _sweep_test_assignments(self) -> None:
        """Auto-clear test assignments whose expires_at ≤ NOW(). Called once
        per periodic tick (before _refresh_profile_caches so the sweeper's
        rows are visible to the resolver)."""
        try:
            rows = await db.fetch(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'auto_expired'
                WHERE cleared_at IS NULL AND expires_at <= NOW()
                RETURNING id, cycle_id, profile_id
                """
            )
        except Exception as e:
            logger.debug(f"Brooder test sweeper query failed: {e}")
            return
        if rows:
            self._profile_cache_dirty = True
            logger.info(
                f"Brooder test sweeper: auto-expired {len(rows)} assignment(s)"
            )

    async def apply_test_profile(self, cycle_id: int, profile_id: int,
                                 hours: int, note: Optional[str] = None) -> dict:
        """Public entrypoint used by routes/brooder_profiles.apply_test.
        Marks any existing active test on the cycle as 'replaced', inserts
        a fresh one, and flips the dirty flag.

        Returns the new row as a dict. Raises ValueError on bad inputs
        (cycle or profile missing) — caller maps to HTTPException.
        """
        cyc = await db.fetchrow("SELECT id FROM cycles WHERE id = $1", cycle_id)
        if not cyc:
            raise ValueError(f"Cycle {cycle_id} not found")
        prof = await db.fetchrow(
            "SELECT id, code FROM brooder_profiles WHERE id = $1 AND is_active = TRUE",
            profile_id,
        )
        if not prof:
            raise ValueError(f"Profile {profile_id} not found or inactive")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        async with db.transaction() as tx:
            await tx.execute(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'replaced'
                WHERE cycle_id = $1 AND cleared_at IS NULL
                """,
                cycle_id,
            )
            row = await tx.fetchrow(
                """
                INSERT INTO brooder_profile_test_assignments
                    (cycle_id, profile_id, expires_at, note)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                cycle_id, profile_id, expires_at, note,
            )
        self._profile_cache_dirty = True
        out = dict(row)
        out["profile_code"] = prof["code"]
        return out

    async def clear_test_profile(self, cycle_id: int) -> bool:
        """Manual clear. Returns True if any row was cleared."""
        row = await db.fetchrow(
            """
            UPDATE brooder_profile_test_assignments
            SET cleared_at = NOW(), cleared_reason = 'manual_clear'
            WHERE cycle_id = $1 AND cleared_at IS NULL
            RETURNING id
            """,
            cycle_id,
        )
        if row:
            self._profile_cache_dirty = True
            return True
        return False

    # ─── public API (for routes / dashboard) ───────────────

    async def set_manual_setpoint(self, device_code: str,
                                  setpoint: Optional[float]) -> dict:
        """Dashboard override. None = clear manual override (back to auto)."""
        if device_code not in self.nodes:
            # Ensure node exists in DB before override
            row = await db.fetchrow(
                "SELECT 1 FROM brooder_nodes WHERE device_code = $1", device_code
            )
            if not row:
                raise ValueError(f"Unknown brooder node: {device_code}")
            await self._load_nodes()

        node = self.nodes[device_code]
        node.manual_setpoint = setpoint
        node.update_pid_setpoint()

        # Persist
        await db.execute(
            "UPDATE brooder_nodes SET manual_setpoint = $1, "
            "updated_at = NOW() WHERE device_code = $2",
            setpoint, device_code,
        )

        # Publish immediately (retain so ESP32 gets it after restart)
        topic = f"cfarm/brooder-{device_code}/setpoint"
        payload = build_setpoint_payload(
            node.pid.setpoint,
            manual_override=setpoint is not None,
            fallback_delta_c=node.fallback_delta_c,
        )
        if node.profile_cache is not None:
            payload["profile_code"] = node.profile_cache.profile_code
        mqtt_client.publish(topic, payload, qos=1, retain=True)
        node.last_setpoint_sent = node.pid.setpoint
        node.last_setpoint_sent_at = datetime.now(timezone.utc)

        # Audit trail — manual setpoint change is an explicit operator
        # action. Record at the current power so the chart can show
        # "setpoint → power" correlation. Reset the dedup gate so the
        # next PID tick (which will recompute power against the new
        # setpoint) also gets recorded.
        node.last_power_sent_recorded = None
        await _record_power_change(
            device_code=device_code, channel=1,
            power_pct=node.last_power_sent or 0,
            setpoint_c=setpoint,
            pid_input_c=node.last_temp_min,
            source='setpoint_change',
            note=f"manual override → {setpoint if setpoint is not None else 'auto'}",
        )

        logger.info(f"Brooder {device_code}: manual override → "
                    f"{setpoint if setpoint is not None else 'auto'} "
                    f"(effective {node.pid.setpoint:.2f}°C)")
        return node.to_dict()

    async def register_node(self, device_code: str,
                            cycle_id: Optional[int] = None,
                            manual_setpoint: Optional[float] = None) -> dict:
        """Register or update a brooder node in DB and in-memory."""
        await db.execute(
            """
            INSERT INTO brooder_nodes (device_code, cycle_id, manual_setpoint, enabled)
            VALUES ($1, $2, $3, TRUE)
            ON CONFLICT (device_code) DO UPDATE
              SET cycle_id = EXCLUDED.cycle_id,
                  manual_setpoint = EXCLUDED.manual_setpoint,
                  enabled = TRUE,
                  updated_at = NOW()
            """,
            device_code, cycle_id, manual_setpoint,
        )
        await self._load_nodes()
        return self.nodes[device_code].to_dict()

    async def unregister_node(self, device_code: str) -> None:
        await db.execute(
            "UPDATE brooder_nodes SET enabled = FALSE, "
            "updated_at = NOW() WHERE device_code = $1",
            device_code,
        )
        if device_code in self.nodes:
            self.nodes[device_code].enabled = False

    def get_status(self, device_code: Optional[str] = None):
        if device_code:
            node = self.nodes.get(device_code)
            return node.to_dict() if node else None
        return [n.to_dict() for n in self.nodes.values()]


# ============================================================
# Module-level singleton
# ============================================================

brooder_controller = BrooderController()


# ============================================================
# ZONE MODEL (Phase B — Brooder Zone Refactor)
# ============================================================
#
# A Zone is a thermal control unit: 1 PID + N heaters (across N ESP32
# nodes, each ESP32 contributes 1-2 heaters via its 2 DAC channels)
# + M reference sensors. The zone is the new unit of control — ESP32
# brooder_nodes are now just dumb actuators (member devices) inside
# a zone, and they receive a per-channel power command from the server.
#
# Phase B runs ZoneController PARALLEL with BrooderController — if the
# zone path breaks, legacy per-zone still keeps the farm warm.
# ============================================================


@dataclass
class Heater:
    """1 ESP32 + 1 channel + max wattage + INDEPENDENT PID. Heater-first refactor
    2026-09-21: each heater runs its own PID with its own setpoint. Zone is just
    a logical grouping for UI/management — no more shared PID, no more
    max-power weighting.
    """
    id: int
    zone_id: int
    device_code: str
    channel: int                    # 1 hoặc 2 (matches DAC1 / DAC2)
    label: Optional[str]
    max_power_w: float
    enabled: bool
    manual_setpoint: Optional[float] = None      # NEW: per-heater override
    fallback_delta_c: float = 0.0                # NEW: per-heater Tier-2 bias
    pid: Optional[PID] = field(default=None, init=False)  # NEW: own PID
    last_power_pct: int = 0         # cached from last MQTT publish
    last_power_pct_recorded: Optional[int] = None  # last value written to brooder_power_history
    last_published_at: Optional[datetime] = None
    last_pid_input: Optional[float] = None       # NEW: Tier-1 cache (skip-gate)
    last_pid_input_at: Optional[datetime] = None # NEW: skip-gate timestamp
    last_pid_input_lpf: Optional[float] = None  # NEW: Tier-1 low-pass filter (α=0.3)
    last_pid_input_lpf_init: bool = False       # NEW: LPF init flag

    # Profile cache (Phase 1+2): mirrored from zone (or first member cycle).
    # Per-heater profile override is a future enhancement — for now each
    # heater inherits its zone's profile so 2 heaters in the same zone get
    # the same setpoint unless one has manual_setpoint set.
    profile_cache: Optional["CachedProfile"] = None
    profile_cache_cycle_date: Optional[date] = None
    profile_cache_night_flag: Optional[bool] = None

    # Populated by HeaterController._refresh_heater_caches from zone member_nodes.
    # Used as last-resort fallback in current_setpoint() when neither
    # manual_setpoint nor profile_cache is set. Default empty list — first
    # refresh fills it.
    _zone_member_nodes: List["BrooderNode"] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self):
        # Mirrors BrooderNode.__post_init__: own PID with Kp/Ki/Kd that
        # match firmware local-PID so server and failsafe behave identically.
        # Removed sample_time=PID_SAMPLE_TIME_S — simple_pid uses real
        # elapsed dt between calls.
        self.pid = PID(
            Kp=PID_KP, Ki=PID_KI, Kd=PID_KD,
            setpoint=self.current_setpoint(),
            output_limits=PID_OUTPUT_LIMITS,
        )
        self.pid.auto_mode = True

    # ─── setpoint resolution (mirrors Zone.current_setpoint cascade) ───

    def current_setpoint(self) -> float:
        if self.manual_setpoint is not None:
            return self.manual_setpoint
        # Profile cache (mirrored from zone or first member cycle)
        if self.profile_cache is not None:
            sp = self.profile_cache.setpoint_target
            if self.profile_cache_night_flag:
                sp += self.profile_cache.night_boost
            return min(sp, MAX_SAFE_TEMPERATURE)
        # Legacy day-age fallback — look up any zone member's brooding_start_date
        # (set by HeaterController._refresh_heater_caches from zone member_nodes).
        # Populated by HeaterController._refresh_heater_caches; falls back to
        # DEFAULT_SETPOINT_C when no member has a cycle.
        for n in self._zone_member_nodes:
            if n.brooding_start_date is not None:
                days = (date.today() - n.brooding_start_date).days + 1
                return calc_setpoint_for_day_age(days)
        return DEFAULT_SETPOINT_C

    def update_pid_setpoint(self) -> None:
        sp = self.current_setpoint()
        if abs(self.pid.setpoint - sp) > 0.01:
            self.pid.setpoint = sp
            logger.info(f"Heater {self.id} ({self.device_code}/ch{self.channel}): setpoint → {sp:.2f}°C")

    # ─── PID compute (mirrors BrooderNode.compute_power) ─────────────

    def compute_power(self, current_temp: float) -> int:
        self.update_pid_setpoint()
        # v1.4.2 (server bug 2): see BrooderNode.compute_power for the
        # rationale — always call self.pid(current_temp) first so internal
        # PID state advances (simple_pid._last_time ticks). The deadband
        # only gates the PUBLISHED output, not the PID tick itself.
        raw = self.pid(current_temp)
        err = self.pid.setpoint - current_temp
        if abs(err) < DEADBAND_C:
            return max(0, min(100, self.last_power_pct))
        # v1.4.1: slew-rate clamp on published output (mirrors BrooderNode).
        # PID still computes true target; ESP32 only sees what's reachable in
        # one publish tick (~1%/s). Prevents user-visible 100→0 snaps caused
        # by integral overshoot on saturation recovery.
        last = self.last_power_pct if self.last_power_pct is not None else 0
        delta = raw - last
        if delta > SLEW_PCT_PER_TICK:
            out = last + SLEW_PCT_PER_TICK
        elif delta < -SLEW_PCT_PER_TICK:
            out = last - SLEW_PCT_PER_TICK
        else:
            out = raw
        return max(0, min(100, int(round(out))))

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "zone_id":         self.zone_id,
            "device_code":     self.device_code,
            "channel":         self.channel,
            "label":           self.label,
            "max_power_w":     self.max_power_w,
            "enabled":         self.enabled,
            "manual_setpoint": self.manual_setpoint,
            "effective_setpoint": self.current_setpoint(),
            "fallback_delta_c": self.fallback_delta_c,
            "last_power_pct":  self.last_power_pct,
            "last_published_at": (self.last_published_at.isoformat()
                                  if self.last_published_at else None),
            "profile_code":    (self.profile_cache.profile_code
                                  if self.profile_cache else None),
        }


@dataclass
class Zone:
    """A logical thermal-control grouping — N heaters, M sensors.

    Heater-first refactor 2026-09-21: a Zone is NO LONGER a control unit.
    Each Heater owns its own PID; the Zone just collects members for UI
    grouping, MQTT fan-out of /setpoint, and zone-temp publishing.

    The PID field, current_setpoint(), distribute_power(), and
    update_pid_setpoint() are removed. manual_setpoint / fallback_delta_c
    are retained as LEGACY read-only state — zone-level setpoint changes
    fan out to per-heater manual_setpoint overrides (see set_zone_setpoint
    + HeaterController.set_heater_setpoint).
    """
    id: int
    barn_id: Optional[int]
    name: str
    manual_setpoint: Optional[float] = None  # LEGACY — read-only mirror
    fallback_delta_c: float = 0.0             # LEGACY — read-only mirror
    enabled: bool = True
    max_total_w: Optional[float] = None

    # Profile cache (Phase 1+2) — mirrored from the first member node with
    # a cycle_id set. Used by _publish_setpoint_changes to publish the
    # retained /setpoint payload (single value = average across heaters).
    # No PID reads this — each Heater has its own profile_cache now.
    profile_cache: Optional["CachedProfile"]     = None
    profile_cache_cycle_date: Optional[date]     = None
    profile_cache_night_flag: Optional[bool]     = None

    # Filled by ZoneController._load_zones()
    member_device_codes: List[str] = field(default_factory=list, init=False)
    member_nodes: Dict[str, "BrooderNode"] = field(default_factory=dict, init=False)
    heaters: Dict[int, Heater] = field(default_factory=dict, init=False)

    # Live overlay (read-only diagnostics for UI)
    last_zone_temp: Optional[float] = None
    last_zone_temp_at: Optional[datetime] = None
    zone_sensors_count: int = 0
    last_setpoint_sent: Optional[float] = None
    last_setpoint_sent_at: Optional[datetime] = None
    mode: str = "unknown"           # normal | failsafe | offline | stale | startup

    # ─── legacy helpers used by ZoneController (still needed) ────

    def current_setpoint(self) -> float:
        """Legacy cascade — manual → profile → day-age → default. Kept so
        the /zones/{id} response can echo effective_setpoint. The PID
        does NOT read this — each Heater has its own cascade."""
        if self.manual_setpoint is not None:
            return self.manual_setpoint
        if self.profile_cache is not None:
            sp = self.profile_cache.setpoint_target
            if self.profile_cache_night_flag:
                sp += self.profile_cache.night_boost
            return min(sp, MAX_SAFE_TEMPERATURE)
        for n in self.member_nodes.values():
            if n.brooding_start_date is not None:
                days = (date.today() - n.brooding_start_date).days + 1
                return calc_setpoint_for_day_age(days)
        return DEFAULT_SETPOINT_C

    # ─── online / status ──────────────────────────────────────

    def is_online(self) -> bool:
        # Zone is "online" if any member has fresh telemetry
        for n in self.member_nodes.values():
            if n.is_online():
                return True
        return False

    def to_dict(self) -> dict:
        return {
            "id":                    self.id,
            "barn_id":               self.barn_id,
            "name":                  self.name,
            "manual_setpoint":       self.manual_setpoint,
            "effective_setpoint":    self.current_setpoint(),
            "fallback_delta_c":      self.fallback_delta_c,
            "enabled":               self.enabled,
            "max_total_w":           self.max_total_w,
            "online":                self.is_online(),
            "mode":                  self.mode,
            "setpoint_sent":         self.last_setpoint_sent,
            "setpoint_sent_at":      (self.last_setpoint_sent_at.isoformat()
                                       if self.last_setpoint_sent_at else None),
            "last_zone_temp":        self.last_zone_temp,
            "last_zone_temp_at":     (self.last_zone_temp_at.isoformat()
                                       if self.last_zone_temp_at else None),
            "zone_sensors_count":    self.zone_sensors_count,
            "member_count":          len(self.member_device_codes),
            "heater_count":          len([h for h in self.heaters.values()
                                          if h.enabled]),
            # UI-friendly freshness: take the freshest member's telemetry so the
            # zone reflects real recent activity, not the most-stale member.
            "last_seen_seconds":    _max_member_last_seen(self),
        }


# ============================================================
# ZONE CONTROLLER — singleton
# ============================================================

class ZoneController:
    """Parallel to BrooderController but acts at the zone level.

    Subscribes to the same MQTT topics (`cfarm/+/telemetry`, etc.) and
    filters by `brooder-` prefix. For each zone with a member node's
    telemetry, runs the PID and distributes output across the zone's
    heaters via per-ESP32 MQTT publish.

    Backward compatibility: legacy BrooderController keeps running so
    the legacy `/api/brooder/nodes/{code}/...` endpoints still work and
    the firmware receives a single `power` payload it can interpret
    (firmware v1.0.x) OR a per-channel `ch1`/`ch2` payload it can
    interpret (firmware v1.1.0+).
    """

    def __init__(self):
        self.zones: Dict[int, Zone] = {}
        self._running = False
        self._periodic_task: Optional[asyncio.Task] = None
        self._zone_temp_task: Optional[asyncio.Task] = None
        # Profile cache dirty flag (Phase 1+2). Mirrors BrooderController.
        self._profile_cache_dirty: bool = False

    # ─── lifecycle ─────────────────────────────────────────

    async def start(self) -> None:
        # v1.3.2 fix (2026-09-21): cancel leftover asyncio tasks from a prior
        # incarnation. Same pattern as BrooderController.start() — without this,
        # server restarts accumulate zone_temp + periodic loops alongside new ones.
        for attr in ("_zone_temp_task", "_periodic_task"):
            t = getattr(self, attr, None)
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

        if self._running:
            return
        self._running = True
        try:
            await self._load_zones()
        except Exception as e:
            logger.error(f"ZoneController: _load_zones failed: {e}")
        self._subscribe_mqtt()
        self._zone_temp_task = asyncio.create_task(self._zone_temp_loop())
        self._periodic_task = asyncio.create_task(self._periodic_loop())
        logger.info(f"ZoneController started: {len(self.zones)} zones loaded")

    async def stop(self) -> None:
        self._running = False
        for t in (self._periodic_task, self._zone_temp_task):
            if t:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("ZoneController stopped")

    # ─── DB loading ────────────────────────────────────────

    async def _load_zones(self) -> None:
        """Build Zone objects from DB: zones + zone_devices + heaters."""
        # Load zones
        try:
            zone_rows = await db.fetch("""
                SELECT id, barn_id, name, manual_setpoint, fallback_delta_c,
                       enabled, is_active, max_total_w
                FROM brooder_zones
                WHERE is_active = TRUE
                ORDER BY id
            """)
        except Exception as e:
            logger.error(f"ZoneController: load_zones failed: {e}")
            return

        for r in zone_rows:
            zid = r["id"]
            if zid in self.zones:
                # In-place update — preserves PID state
                z = self.zones[zid]
                z.barn_id          = r["barn_id"]
                z.name             = r["name"]
                z.manual_setpoint  = r["manual_setpoint"]
                z.fallback_delta_c = float(r["fallback_delta_c"] or 0.0)
                z.enabled          = r["enabled"]
                z.max_total_w      = r["max_total_w"]
                # NOTE: zone-level manual_setpoint is now LEGACY read-only
                # state. Per-heater manual_setpoint is the source of truth
                # for the PID. Fan-out happens in set_zone_setpoint on
                # operator action; on periodic reload, no cascade needed.
            else:
                self.zones[zid] = Zone(
                    id=zid,
                    barn_id=r["barn_id"],
                    name=r["name"],
                    manual_setpoint=r["manual_setpoint"],
                    fallback_delta_c=float(r["fallback_delta_c"] or 0.0),
                    enabled=r["enabled"],
                    max_total_w=r["max_total_w"],
                )

        # Load zone→device mapping
        try:
            zd_rows = await db.fetch("""
                SELECT zone_id, brooder_device_code
                FROM brooder_zone_devices
            """)
        except Exception as e:
            logger.warning(f"ZoneController: zone_devices load failed: {e}")
            zd_rows = []

        # Reset member lists then refill (cheap — N zones × N devices)
        for z in self.zones.values():
            z.member_device_codes = []
            z.member_nodes = {}

        for r in zd_rows:
            z = self.zones.get(r["zone_id"])
            if z is None:
                continue
            code = r["brooder_device_code"]
            z.member_device_codes.append(code)
            # Reuse the BrooderNode instance if it exists (shared cache)
            node = brooder_controller.nodes.get(code)
            if node is None:
                # Auto-register a stub so we can read telemetry as it arrives
                node = BrooderNode(device_code=code)
                brooder_controller.nodes[code] = node
            z.member_nodes[code] = node

        # Load heaters
        try:
            heater_rows = await db.fetch("""
                SELECT id, zone_id, device_code, channel, label, max_power_w,
                       enabled, is_active
                FROM brooder_heaters
                WHERE is_active = TRUE
            """)
        except Exception as e:
            logger.warning(f"ZoneController: heaters load failed: {e}")
            heater_rows = []

        # Reset heater maps then refill
        for z in self.zones.values():
            z.heaters = {}

        # Preserve last_power_pct if heater already loaded
        for r in heater_rows:
            z = self.zones.get(r["zone_id"])
            if z is None:
                continue
            hid = r["id"]
            old = z.heaters.get(hid)
            z.heaters[hid] = Heater(
                id=hid,
                zone_id=r["zone_id"],
                device_code=r["device_code"],
                channel=r["channel"],
                label=r["label"],
                max_power_w=float(r["max_power_w"] or 1500.0),
                enabled=r["enabled"],
                last_power_pct=old.last_power_pct if old else 0,
                last_published_at=old.last_published_at if old else None,
            )

    # ─── MQTT subscription ─────────────────────────────────
    #
    # Subscribes to the SAME topics as BrooderController — that's fine
    # because paho-mqtt allows multiple subscribers on a topic; both
    # controllers just observe the same messages. ZoneController filters
    # for `cfarm/brooder-*/telemetry` etc.

    def _subscribe_mqtt(self) -> None:
        mqtt_client.subscribe("cfarm/+/telemetry", self._on_telemetry)
        mqtt_client.subscribe("cfarm/+/status",    self._on_status)
        mqtt_client.subscribe("cfarm/+/lwt",       self._on_lwt)

    def _zone_for_device(self, device_code: str) -> Optional[Zone]:
        for z in self.zones.values():
            if device_code in z.member_nodes:
                return z
        return None

    def _on_telemetry(self, topic: str, payload) -> None:
        """Mirror BrooderController._on_telemetry but resolve the zone and
        run the zone-level PID tick."""
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.warning(f"Zone telemetry JSON decode error on {topic}: {e}")
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if not device_code:
            return

        zone = self._zone_for_device(device_code)
        if zone is None:
            return  # Not in any zone — legacy BrooderController handles it

        # Sync to in-memory BrooderNode (shared with BrooderController)
        node = zone.member_nodes[device_code]
        # Field-name compat — see BrooderController._on_telemetry. Accept
        # legacy single-sensor fields (temp/hum/temp_pid) alongside the
        # newer temp1/temp2/temp_min/hum_avg names.
        temp1     = payload.get('temp1')
        temp2     = payload.get('temp2')
        temp_min  = payload.get('temp_min')
        hum_avg   = payload.get('hum_avg')
        if temp1 is None:
            temp1 = payload.get('temp')
        if temp2 is None:
            temp2 = temp1
        if temp_min is None:
            tpid = payload.get('temp_pid')
            if tpid is not None:
                temp_min = float(tpid)
            elif temp1 is not None and temp2 is not None:
                temp_min = min(float(temp1), float(temp2))
            elif temp1 is not None:
                temp_min = float(temp1)
        if hum_avg is None:
            hum_avg = payload.get('hum')
        node.last_temp1    = temp1
        node.last_temp2    = temp2
        node.last_temp_min = temp_min
        node.last_hum_avg  = hum_avg
        zt = payload.get('zone_temp')
        if zt is not None and zt != -999.0:
            node.last_zone_temp = float(zt)
        else:
            node.last_zone_temp = None
        node.pid_source = payload.get('pid_source')
        node.last_telemetry_at = datetime.now(timezone.utc)
        old_mode = node.mode
        new_mode = payload.get('mode', node.mode)
        node.mode = new_mode
        zone.mode = new_mode  # mirror
        # Audit — record only when telemetry reports a mode transition.
        # Sync MQTT handler — schedule coroutine on the captured asyncio loop.
        if new_mode != old_mode:
            mqtt_client.schedule_coroutine(
                _record_mode_change(node, old_mode, new_mode)
            )

        if zone.enabled and node.last_temp_min is not None:
            # NOTE: PID tick has moved to HeaterController (per-heater
            # independent PID). ZoneController._on_telemetry only maintains
            # the member_nodes cache + zone.mode. HeaterController subscribes
            # to the same MQTT topics and runs PID for each heater in
            # heaters_by_device[device_code].
            pass

    def _on_status(self, topic: str, payload) -> None:
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception:
                return
        if not isinstance(payload, dict):
            return
        device_code = extract_device_code(topic)
        if not device_code:
            return
        zone = self._zone_for_device(device_code)
        if zone is None:
            return
        node = zone.member_nodes.get(device_code)
        if node is None:
            return
        old_mode = node.mode
        new_mode = payload.get('status', node.mode)
        node.mode = new_mode
        zone.mode = new_mode
        # Audit — record only on actual mode change (sync handler).
        if new_mode != old_mode:
            mqtt_client.schedule_coroutine(
                _record_mode_change(node, old_mode, new_mode)
            )

    def _on_lwt(self, topic: str, payload) -> None:
        device_code = extract_device_code(topic)
        if not device_code:
            return
        zone = self._zone_for_device(device_code)
        if zone is None:
            return
        node = zone.member_nodes.get(device_code)
        if node is not None:
            old_mode = node.mode
            node.mode = 'offline'
            # Audit — record only on actual transition into offline.
            # Sync MQTT handler — schedule coroutine on the captured loop.
            if old_mode != 'offline':
                mqtt_client.schedule_coroutine(
                    _record_mode_change(node, old_mode, 'offline', note="LWT")
                )
        # Zone mode becomes offline only if ALL members offline
        if all((n.mode in ('offline', 'unknown') or n.last_telemetry_at is None)
               for n in zone.member_nodes.values()):
            if zone.mode != 'offline':
                # Record one audit row per heater in the zone so the offline
                # transition is visible per heater (not just per zone).
                old_zone_mode = zone.mode
                zone.mode = 'offline'
                # Compute a representative setpoint for the audit row —
                # average across the zone's heaters, fall back to current_setpoint.
                setpoint_repr = zone.current_setpoint()
                for h in zone.heaters.values():
                    mqtt_client.schedule_coroutine(_record_power_change(
                        zone_id=zone.id, heater_id=h.id,
                        device_code=h.device_code, channel=h.channel,
                        power_pct=h.last_power_pct or 0,
                        setpoint_c=setpoint_repr,
                        pid_input_c=None,
                        source='mode_change',
                        note=f"zone {old_zone_mode}→offline (all members offline)",
                    ))

    # ─── zone_temp publishing (one per zone) ───────────────

    async def _zone_temp_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(ZONE_TEMP_PUBLISH_S)
                await self._publish_zone_temps()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"ZoneController zone_temp loop error: {e}", exc_info=True)

    async def _publish_zone_temps(self) -> None:
        """Compute weighted-avg of each zone's attached sensors, publish to
        cfarm/brooder-{code}/zone_temp for EVERY member ESP.

        With the heater-first PID refactor (2026-09-21), sensors may be:
          - heater-specific (heater_id=<one>)  → feeds that heater's PID
          - shared zone-level (is_shared=TRUE)  → feeds ALL heaters in zone
          - legacy zone-pool (heater_id=NULL AND is_shared=FALSE) → unused

        Zone-temp MQTT publish keeps its original semantics: only zone-level
        sensors (heater_id IS NULL) feed the published average. This avoids
        double-counting when shared sensors are also bound per-heater.
        """
        now = datetime.now(timezone.utc)
        for z in self.zones.values():
            if not z.enabled:
                continue
            try:
                rows = await db.fetch(
                    """
                    SELECT
                        bzs.sensor_device_code,
                        bzs.weight,
                        bzs.sub_sensor,
                        sl.value      AS temp,
                        sl.time       AS last_seen
                    FROM brooder_zone_sensors bzs
                    LEFT JOIN devices d
                         ON d.device_code = bzs.sensor_device_code
                    LEFT JOIN sensor_latest sl
                         ON sl.device_id = d.id
                        AND sl.sensor_type = $2
                        AND sl.sub_sensor  = bzs.sub_sensor
                    WHERE bzs.zone_id = $1 AND bzs.heater_id IS NULL
                    ORDER BY bzs.id
                    """,
                    z.id, ZONE_TEMP_SENSOR_TYPE,
                )
            except Exception as e:
                logger.debug(f"Zone {z.id}: zone-sensor query failed: {e}")
                continue

            z.zone_sensors_count = len(rows)
            # Plain dict() before passing — asyncpg.Record is immutable
            # (see MEMORY.md asyncpg-pitfalls).
            payload = [dict(r) for r in rows]
            value, fresh_count = blend_zone_temp(payload, now=now)

            if value is None:
                z.last_zone_temp = None
                z.last_zone_temp_at = now
            else:
                z.last_zone_temp = value
                z.last_zone_temp_at = now

            # Publish to every member ESP
            for code in z.member_device_codes:
                topic = f"cfarm/brooder-{code}/zone_temp"
                payload = {
                    "temp":         value,
                    "source_count": fresh_count,
                    "stale_max_s":  ZONE_TEMP_STALE_S,
                    "ts":           now.isoformat(),
                }
                try:
                    mqtt_client.publish(topic, payload, qos=0, retain=False)
                except Exception as e:
                    logger.debug(f"Zone {z.id}/{code}: zone_temp publish failed: {e}")

    # ─── periodic tasks ────────────────────────────────────

    async def _periodic_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._reload_config()
                # Profile cache (Phase 1+2): sweep expired tests, then refresh
                # the per-zone cache. Runs BEFORE publish so the next setpoint
                # payload reflects the fresh profile.
                await self._sweep_test_assignments()
                await self._refresh_profile_caches()
                await self._publish_setpoint_changes()
                await self._mark_stale_zones()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"ZoneController periodic loop error: {e}", exc_info=True)

    async def _reload_config(self) -> None:
        """Pick up DB changes (manual override, new zone, new heater)."""
        try:
            await self._load_zones()
        except Exception as e:
            logger.error(f"ZoneController: reload failed: {e}")

    async def _publish_setpoint_changes(self) -> None:
        """Publish setpoint retained to ALL member ESPs when day-age changes
        or manual override is set/cleared."""
        for z in self.zones.values():
            if not z.enabled:
                continue
            new_sp = z.current_setpoint()
            if (z.last_setpoint_sent is None
                    or abs(new_sp - z.last_setpoint_sent) > 0.05):
                payload = build_setpoint_payload(
                    new_sp,
                    manual_override=z.manual_setpoint is not None,
                    fallback_delta_c=z.fallback_delta_c,
                )
                # Phase 1+2: append profile_code (firmware ignores unknown
                # keys). Same extension as BrooderController.
                if z.profile_cache is not None:
                    payload["profile_code"] = z.profile_cache.profile_code
                for code in z.member_device_codes:
                    topic = f"cfarm/brooder-{code}/setpoint"
                    mqtt_client.publish(topic, payload, qos=1, retain=True)
                z.last_setpoint_sent = new_sp
                z.last_setpoint_sent_at = datetime.now(timezone.utc)
                logger.info(f"Zone {z.id} ({z.name}): published setpoint "
                            f"{new_sp:.1f}°C to {len(z.member_device_codes)} member(s) "
                            f"(profile={z.profile_cache.profile_code if z.profile_cache else 'legacy'})")

    async def _mark_stale_zones(self) -> None:
        now = datetime.now(timezone.utc)
        for z in self.zones.values():
            # Zone is stale if NO member has fresh telemetry
            any_fresh = False
            for n in z.member_nodes.values():
                if n.last_telemetry_at is None:
                    continue
                age = (now - n.last_telemetry_at).total_seconds()
                if age <= TELEMETRY_STALE_S:
                    any_fresh = True
                    break
            if not any_fresh and z.mode not in ('offline', 'stale'):
                if z.member_nodes:
                    z.mode = 'stale'

    # ─── profile cache (Phase 1+2) ────────────────────────────
    #
    # Mirrors BrooderController. Zones typically share one cycle, so the
    # resolver looks up via the first member node with cycle_id set and
    # mirrors the result into the Zone cache (one DB hit per zone per tick,
    # not per member).

    def invalidate_profile_cache(self) -> None:
        """Flip the dirty flag so the next periodic tick re-resolves."""
        self._profile_cache_dirty = True

    async def _resolve_profile_setpoint_async(self, zone: "Zone") -> None:
        """Look up the cycle (via first member node with cycle_id) and
        mirror the resolved CachedProfile into the Zone. Mirrors
        BrooderController._resolve_profile_setpoint_async."""
        # Feature flag
        try:
            from src.services.storage.config_service import config_service
            cfg = config_service.load_config() or {}
            if not (cfg.get("brooder", {}) or {}).get("profiles_enabled", True):
                zone.profile_cache = None
                return
        except Exception:
            pass

        cycle_id = None
        for n in zone.member_nodes.values():
            if n.cycle_id is not None:
                cycle_id = n.cycle_id
                break
        if cycle_id is None:
            zone.profile_cache = None
            return

        today = date.today()
        try:
            from src.utils.timezone import now_hcm
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            night_now = False

        try:
            row = await db.fetchrow(
                """
                SELECT cp.status       AS cycle_status,
                       cp.start_date   AS cycle_start,
                       cp.expected_end_date AS cycle_end,
                       cp.brooder_profile_id AS cycle_pid,
                       p.code          AS cycle_pcode,
                       p.is_active     AS cycle_pactive,
                       tst.profile_id  AS test_pid,
                       tst.expires_at  AS test_expires_at
                FROM cycles cp
                LEFT JOIN brooder_profiles p
                       ON p.id = cp.brooder_profile_id
                LEFT JOIN brooder_profile_test_assignments tst
                       ON tst.cycle_id = cp.id
                      AND tst.cleared_at IS NULL
                WHERE cp.id = $1
                """,
                cycle_id,
            )
        except Exception as e:
            logger.debug(f"Zone {zone.id}: profile resolve query failed: {e}")
            zone.profile_cache = None
            return

        if not row or not row["cycle_start"]:
            zone.profile_cache = None
            return

        eff_pid = None
        eff_pcode = None
        if (row["test_pid"]
                and row["test_expires_at"]
                and row["test_expires_at"] > datetime.now(timezone.utc)):
            eff_pid = row["test_pid"]
            try:
                tp = await db.fetchrow(
                    "SELECT code, is_active FROM brooder_profiles WHERE id = $1",
                    row["test_pid"],
                )
                if tp and tp["is_active"]:
                    eff_pcode = tp["code"]
                else:
                    eff_pid = None
            except Exception:
                eff_pid = None
        if eff_pid is None:
            eff_pid = row["cycle_pid"]
            eff_pcode = row["cycle_pcode"]
            if eff_pcode is None or not row["cycle_pactive"]:
                zone.profile_cache = None
                return

        if row["cycle_status"] != "active":
            zone.profile_cache = None
            return

        end_date = row["cycle_end"] or date.max
        if not (row["cycle_start"] <= today <= end_date):
            zone.profile_cache = None
            return

        day_age = (today - row["cycle_start"]).days + 1
        try:
            stage = await db.fetchrow(
                """
                SELECT id, setpoint_target, heater_zone_limit,
                       night_boost_offset, humidity_min_pct, humidity_max_pct
                FROM brooder_profile_schedules
                WHERE profile_id = $1
                  AND day_range_start <= $2
                  AND day_range_end   >= $2
                LIMIT 1
                """,
                eff_pid, day_age,
            )
        except Exception as e:
            logger.debug(f"Zone {zone.id}: stage resolve query failed: {e}")
            zone.profile_cache = None
            return

        if not stage:
            zone.profile_cache = None
            return

        zone.profile_cache = CachedProfile(
            profile_code=eff_pcode or "(unknown)",
            stage_id=int(stage["id"]),
            setpoint_target=float(stage["setpoint_target"]),
            heater_limit=float(stage["heater_zone_limit"]),
            night_boost=float(stage["night_boost_offset"] or 0.0),
            humidity_range=(stage["humidity_min_pct"], stage["humidity_max_pct"]),
        )
        zone.profile_cache_cycle_date = today
        zone.profile_cache_night_flag = night_now

    async def _refresh_profile_caches(self) -> None:
        try:
            from src.utils.timezone import now_hcm
            today = date.today()
            night_now = (now_hcm().hour >= 18) or (now_hcm().hour < 6)
        except Exception:
            today = date.today()
            night_now = False

        for z in self.zones.values():
            if not self._profile_cache_dirty \
                    and z.profile_cache_cycle_date == today \
                    and z.profile_cache_night_flag == night_now \
                    and z.profile_cache is not None:
                continue
            try:
                await self._resolve_profile_setpoint_async(z)
            except Exception as e:
                logger.warning(f"Zone {z.id}: profile refresh failed: {e}")
        self._profile_cache_dirty = False

    async def _sweep_test_assignments(self) -> None:
        """Mirror of BrooderController._sweep_test_assignments — same DB
        rows, same auto-expire semantics. Idempotent (the WHERE clause
        only matches cleared_at IS NULL rows)."""
        try:
            rows = await db.fetch(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'auto_expired'
                WHERE cleared_at IS NULL AND expires_at <= NOW()
                RETURNING id, cycle_id, profile_id
                """
            )
        except Exception as e:
            logger.debug(f"ZoneController test sweeper query failed: {e}")
            return
        if rows:
            self._profile_cache_dirty = True
            logger.info(
                f"ZoneController test sweeper: auto-expired {len(rows)} assignment(s)"
            )

    async def apply_test_profile(self, cycle_id: int, profile_id: int,
                                 hours: int, note: Optional[str] = None) -> dict:
        """Mirror of BrooderController.apply_test_profile. Both controllers
        call this from routes/brooder_profiles.apply_test — one DB row is
        the source of truth."""
        cyc = await db.fetchrow("SELECT id FROM cycles WHERE id = $1", cycle_id)
        if not cyc:
            raise ValueError(f"Cycle {cycle_id} not found")
        prof = await db.fetchrow(
            "SELECT id, code FROM brooder_profiles WHERE id = $1 AND is_active = TRUE",
            profile_id,
        )
        if not prof:
            raise ValueError(f"Profile {profile_id} not found or inactive")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
        async with db.transaction() as tx:
            await tx.execute(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'replaced'
                WHERE cycle_id = $1 AND cleared_at IS NULL
                """,
                cycle_id,
            )
            row = await tx.fetchrow(
                """
                INSERT INTO brooder_profile_test_assignments
                    (cycle_id, profile_id, expires_at, note)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                cycle_id, profile_id, expires_at, note,
            )
        self._profile_cache_dirty = True
        out = dict(row)
        out["profile_code"] = prof["code"]
        return out

    async def clear_test_profile(self, cycle_id: int) -> bool:
        row = await db.fetchrow(
            """
            UPDATE brooder_profile_test_assignments
            SET cleared_at = NOW(), cleared_reason = 'manual_clear'
            WHERE cycle_id = $1 AND cleared_at IS NULL
            RETURNING id
            """,
            cycle_id,
        )
        if row:
            self._profile_cache_dirty = True
            return True
        return False

    # ─── public API (for routes / dashboard) ───────────────

    async def set_zone_setpoint(self, zone_id: int,
                                setpoint: Optional[float],
                                note: Optional[str] = None) -> dict:
        """Set or clear manual setpoint override on a zone.

        setpoint=None → clear override (back to day-age auto).
        Re-publishes /setpoint retained to every member ESP.
        """
        z = self.zones.get(zone_id)
        if z is None:
            raise ValueError(f"Unknown zone: {zone_id}")
        z.manual_setpoint = setpoint
        # Heater-first refactor: zone-level manual_setpoint fans out to per-
        # heater manual_setpoint overrides. We persist both rows so the zone
        # column stays accurate for legacy endpoints, but the per-heater
        # override is the source of truth for the PID.
        effective = z.current_setpoint()

        await db.execute(
            "UPDATE brooder_zones SET manual_setpoint = $1, "
            "updated_at = NOW() WHERE id = $2",
            setpoint, zone_id,
        )

        # Fan-out: set manual_setpoint on EVERY heater in the zone.
        # HeaterController picks up the change on the next periodic reload.
        for h in z.heaters.values():
            await db.execute(
                "UPDATE brooder_heaters SET manual_setpoint = $1, "
                "updated_at = NOW() WHERE id = $2",
                setpoint, h.id,
            )
            # Live update in-memory so the next PID tick sees the override
            # without waiting for the 60s periodic reload.
            if h.manual_setpoint != setpoint:
                h.manual_setpoint = setpoint
                h.update_pid_setpoint()

        # Publish retained setpoint to all member ESPs.
        # Single value = zone effective setpoint (firmware only knows one
        # retained setpoint; per-channel PIDs are server-side only).
        payload = build_setpoint_payload(
            effective,
            manual_override=setpoint is not None,
            fallback_delta_c=z.fallback_delta_c,
        )
        if z.profile_cache is not None:
            payload["profile_code"] = z.profile_cache.profile_code
        for code in z.member_device_codes:
            topic = f"cfarm/brooder-{code}/setpoint"
            mqtt_client.publish(topic, payload, qos=1, retain=True)
        z.last_setpoint_sent = effective
        z.last_setpoint_sent_at = datetime.now(timezone.utc)

        # Audit
        try:
            await db.execute(
                """
                INSERT INTO zone_setpoint_history
                    (zone_id, manual_setpoint, effective_setpoint, source, note)
                VALUES ($1, $2, $3, 'manual', $4)
                """,
                zone_id, setpoint, effective, note,
            )
        except Exception as e:
            logger.debug(f"Zone {zone_id}: audit write failed: {e}")

        # Per-heater audit + power-history. One row per heater so the
        # heater-first refactor is visible in the audit trail.
        for h in z.heaters.values():
            await _record_power_change(
                zone_id=zone_id, heater_id=h.id,
                device_code=h.device_code, channel=h.channel,
                power_pct=h.last_power_pct or 0,
                setpoint_c=setpoint,
                pid_input_c=None,
                source='heater_setpoint_change',
                note=f"zone override → heater {h.id} (ch{h.channel}) "
                     f"manual_setpoint={setpoint if setpoint is not None else 'auto'}",
            )

        logger.info(f"Zone {zone_id}: manual override → "
                    f"{setpoint if setpoint is not None else 'auto'} "
                    f"(effective {effective:.2f}°C, fanned out to "
                    f"{len(z.heaters)} heater(s))")
        return z.to_dict()

    async def set_zone_fallback_delta(self, zone_id: int, delta: float) -> dict:
        """Update Tier-2 fallback delta (admin-tuned offset for the local
        SHT40 path). Re-publishes setpoint retained.

        Heater-first refactor: zone-level fallback_delta_c is now LEGACY
        read-only. New per-heater fallback_delta_c is the source of truth.
        This setter still updates the zone row (for legacy dashboards) AND
        fans the delta out to all heaters so each heater's Tier-2 fallback
        uses the new offset.
        """
        z = self.zones.get(zone_id)
        if z is None:
            raise ValueError(f"Unknown zone: {zone_id}")
        z.fallback_delta_c = float(delta)
        await db.execute(
            "UPDATE brooder_zones SET fallback_delta_c = $1, "
            "updated_at = NOW() WHERE id = $2",
            float(delta), zone_id,
        )
        # Fan-out: write the delta to all heaters in the zone.
        for h in z.heaters.values():
            await db.execute(
                "UPDATE brooder_heaters SET fallback_delta_c = $1, "
                "updated_at = NOW() WHERE id = $2",
                float(delta), h.id,
            )
            h.fallback_delta_c = float(delta)
        # Republish retained /setpoint (single value = zone effective setpoint).
        effective = z.current_setpoint()
        payload = build_setpoint_payload(
            effective,
            manual_override=z.manual_setpoint is not None,
            fallback_delta_c=z.fallback_delta_c,
        )
        if z.profile_cache is not None:
            payload["profile_code"] = z.profile_cache.profile_code
        for code in z.member_device_codes:
            topic = f"cfarm/brooder-{code}/setpoint"
            mqtt_client.publish(topic, payload, qos=1, retain=True)
        return z.to_dict()

    def get_zone(self, zone_id: int) -> Optional[dict]:
        z = self.zones.get(zone_id)
        return z.to_dict() if z else None

    def list_zones(self) -> List[dict]:
        return [z.to_dict() for z in self.zones.values()]

    def get_zone_heaters(self, zone_id: int) -> List[dict]:
        z = self.zones.get(zone_id)
        if z is None:
            return []
        out = []
        for h in z.heaters.values():
            out.append({
                "id":              h.id,
                "zone_id":         h.zone_id,
                "device_code":     h.device_code,
                "channel":         h.channel,
                "label":           h.label,
                "max_power_w":     h.max_power_w,
                "enabled":         h.enabled,
                "last_power_pct":  h.last_power_pct,
                "last_published_at": (h.last_published_at.isoformat()
                                       if h.last_published_at else None),
            })
        return out

    def get_zone_members(self, zone_id: int) -> List[dict]:
        z = self.zones.get(zone_id)
        if z is None:
            return []
        return [n.to_dict() for n in z.member_nodes.values()]


# ============================================================
# Module-level singleton (ZoneController)
# ============================================================

zone_controller = ZoneController()


# ============================================================
# HEATER CONTROLLER — singleton (Heater-first refactor 2026-09-21)
# ============================================================
#
# Each Heater runs its own PID with its own setpoint. The HeaterController
# owns the per-heater control loop and replaces the zone-level PID that
# ZoneController used to run.
#
# Architecture:
#   * Loads all heaters from brooder_heaters at start().
#   * Subscribes to cfarm/+/telemetry (filter cfarm/brooder-*) like the
#     other controllers. Paho allows multiple subscribers on the same topic.
#   * On each telemetry event for a device with N heaters:
#       - compute weighted-avg of sensors assigned to THIS heater (Tier 1)
#       - or freshest member SHT40 minus this heater's fallback_delta_c (Tier 2)
#       - run Heater.compute_power()
#   * When ALL heaters for a device have ticked, build per-ESP payload
#     {ch1: pct1, ch2: pct2, ...} and publish cfarm/brooder-{code}/power.
#   * The retained /setpoint topic stays single-value (zone-avg) so the
#     firmware v1.0.x NVS-cached setpoint keeps working.
# ============================================================


class HeaterController:
    """Per-heater PID controller. Heater-first refactor 2026-09-21.

    One PID per Heater, weighted-avg Tier-1 input from sensors with
    heater_id=X, freshest-member Tier-2 fallback for zones with no
    sensor assignment. Publishes per-ESP power payload; retained
    setpoint is published by ZoneController (single value for firmware
    compat).
    """

    def __init__(self):
        self.heaters: Dict[int, Heater] = {}
        # For per-ESP power-payload grouping when multiple heaters live
        # on the same device (channel 1 + channel 2).
        self.heaters_by_device: Dict[str, List[Heater]] = {}
        # Mirror of ZoneController member_nodes (for Tier-2 fallback).
        # Populated by _refresh_member_nodes() called from _load_heaters
        # and periodically on reload.
        self._member_nodes_by_zone: Dict[int, Dict[str, "BrooderNode"]] = {}
        # Zone-level profile cache mirror (so per-heater setpoints fall
        # back to the zone's resolved profile when manual_setpoint is None).
        self._zone_profile_cache: Dict[int, "CachedProfile"] = {}
        self._zone_profile_cache_date: Dict[int, date] = {}
        self._zone_profile_cache_night: Dict[int, bool] = {}
        self._running = False
        self._periodic_task: Optional[asyncio.Task] = None
        # Per-heater profile cache dirty flag — flipped when a profile test
        # assignment is applied/cleared or when cycle_id changes.
        self._profile_cache_dirty: bool = False

    # ─── lifecycle ─────────────────────────────────────────

    async def start(self) -> None:
        # Cancel leftover tasks from a prior incarnation (same pattern
        # as BrooderController / ZoneController).
        for attr in ("_periodic_task", "_keepalive_task"):
            t = getattr(self, attr, None)
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

        if self._running:
            return
        self._running = True
        try:
            await self._load_heaters()
            await self._refresh_member_nodes()
            # v1.4.2 (server bug 5): seed PID setpoints ONLY after
            # _refresh_member_nodes populated _zone_member_nodes. Previously
            # update_pid_setpoint() was called inside _load_heaters while
            # _zone_member_nodes was still empty — fell through to
            # DEFAULT_SETPOINT_C=33.5 even for 25-day-old chicks (who need 25°C).
            # First-boot-only race window of ~10ms, but the wrong setpoint
            # would persist until the next telemetry event triggered a PID
            # call. Defer the seed here so the very first PID tick uses the
            # right profile_cache / brooding_start_date fallback.
            for h in self.heaters.values():
                h.update_pid_setpoint()
        except Exception as e:
            logger.error(f"HeaterController: initial load failed: {e}")
        self._subscribe_mqtt()
        self._periodic_task = asyncio.create_task(self._periodic_loop())
        # v1.4.2 (server bug 3): mirror BrooderController's keepalive loop
        # for HeaterController — devices with Heater rows registered have
        # ZERO keepalive coverage today. Telemetry cadence is 5s but PID
        # publishes also gate on skip window (PID_HEARTBEAT_S=4), so a
        # ~10s stall in either pipeline would let FAILSAFE_TIMEOUT_MS=8000
        # on firmware expire and the heater drop into FAILSAFE for ~15s
        # before the next publish resumes control. The keepalive loop is
        # the same idea as BrooderController's: every 4s, publish the last
        # commanded power value (no PID recompute, no DB hit) so the
        # firmware sees fresh /power packets and stays in MODE_NORMAL.
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info(
            f"HeaterController started: {len(self.heaters)} heaters loaded "
            f"across {len(self.heaters_by_device)} device(s)"
        )

    async def stop(self) -> None:
        self._running = False
        for attr in ("_periodic_task",):
            t = getattr(self, attr, None)
            if t and not t.done():
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("HeaterController stopped")

    # ─── DB loading ────────────────────────────────────────

    async def _load_heaters(self) -> None:
        """Load all enabled heaters from DB + rebuild heaters_by_device."""
        try:
            rows = await db.fetch(
                """
                SELECT id, zone_id, device_code, channel, label, max_power_w,
                       enabled, manual_setpoint, fallback_delta_c
                FROM brooder_heaters
                WHERE is_active = TRUE
                ORDER BY zone_id, device_code, channel
                """
            )
        except Exception as e:
            logger.error(f"HeaterController: load heaters failed: {e}")
            return

        # Preserve last_power_pct / last_published_at if heater already loaded.
        loaded_ids = set()
        for r in rows:
            hid = r["id"]
            loaded_ids.add(hid)
            old = self.heaters.get(hid)
            new_pid_setpoint = old.pid.setpoint if (old and old.pid) else None
            self.heaters[hid] = Heater(
                id=hid,
                zone_id=r["zone_id"],
                device_code=r["device_code"],
                channel=r["channel"],
                label=r["label"],
                max_power_w=float(r["max_power_w"] or 1500.0),
                enabled=r["enabled"],
                manual_setpoint=r["manual_setpoint"],
                fallback_delta_c=float(r["fallback_delta_c"] or 0.0),
                last_power_pct=old.last_power_pct if old else 0,
                last_published_at=old.last_published_at if old else None,
            )
            # Restore last_pid_input cache (skip-gate state)
            if old:
                self.heaters[hid].last_pid_input = old.last_pid_input
                self.heaters[hid].last_pid_input_at = old.last_pid_input_at
                self.heaters[hid].last_pid_input_lpf = old.last_pid_input_lpf
                self.heaters[hid].last_pid_input_lpf_init = old.last_pid_input_lpf_init
                self.heaters[hid].last_power_pct_recorded = old.last_power_pct_recorded
                self.heaters[hid].profile_cache = old.profile_cache
                self.heaters[hid].profile_cache_cycle_date = old.profile_cache_cycle_date
                self.heaters[hid].profile_cache_night_flag = old.profile_cache_night_flag
                self.heaters[hid]._zone_member_nodes = old._zone_member_nodes
            # v1.4.2 (server bug 5): update_pid_setpoint() moved to start()
            # AFTER _refresh_member_nodes populates _zone_member_nodes.
            # Previously called here while field was still empty → fall
            # through to DEFAULT_SETPOINT_C=33.5 ignoring brooding_start_date.
            # If we had a PID setpoint cached from before and current matches
            # within 0.05°C, keep it (avoids a one-shot bump on reload).
            if (new_pid_setpoint is not None
                    and abs(new_pid_setpoint - 0) > 0.01):  # only if real cached
                self.heaters[hid].pid.setpoint = new_pid_setpoint

        # Drop heaters that no longer exist / were soft-deleted
        for hid in list(self.heaters.keys()):
            if hid not in loaded_ids:
                del self.heaters[hid]

        # Rebuild heaters_by_device
        self.heaters_by_device = {}
        for h in self.heaters.values():
            self.heaters_by_device.setdefault(h.device_code, []).append(h)

    async def _refresh_member_nodes(self) -> None:
        """Mirror ZoneController's member_nodes per zone. Used by Heater
        controllers to compute Tier-2 fallback (freshest member SHT40)
        and brooding_start_date fallback for setpoint resolution.

        Cheaper to read directly from ZoneController (same process) than
        to issue a DB query.
        """
        self._member_nodes_by_zone = {}
        for zid, z in zone_controller.zones.items():
            self._member_nodes_by_zone[zid] = dict(z.member_nodes)
        # Update each heater's _zone_member_nodes reference
        for h in self.heaters.values():
            h._zone_member_nodes = list(
                self._member_nodes_by_zone.get(h.zone_id, {}).values()
            )

    # ─── MQTT subscription ─────────────────────────────────
    #
    # Mirrors BrooderController and ZoneController — paho-mqtt allows
    # multiple subscribers on the same topic. We filter for the
    # cfarm/brooder- prefix and skip everything else.

    def _subscribe_mqtt(self) -> None:
        mqtt_client.subscribe("cfarm/+/telemetry", self._on_telemetry)
        mqtt_client.subscribe("cfarm/+/status",    self._on_status)
        mqtt_client.subscribe("cfarm/+/lwt",       self._on_lwt)

    def _on_telemetry(self, topic: str, payload) -> None:
        if isinstance(payload, (bytes, bytearray)):
            try:
                payload = json.loads(payload.decode('utf-8'))
            except Exception as e:
                logger.warning(f"Heater telemetry JSON decode error on {topic}: {e}")
                return
        if not isinstance(payload, dict):
            return

        device_code = extract_device_code(topic)
        if not device_code:
            return

        heaters = self.heaters_by_device.get(device_code)
        if not heaters:
            return  # Not in our heater registry — ZoneController/BrooderController
                    # may handle this device via legacy paths

        # Schedule the per-heater tick on the main event loop (this
        # handler runs on paho-mqtt's IO thread).
        mqtt_client.schedule_coroutine(self._tick_device_heaters(device_code, payload))

    def _on_status(self, topic: str, payload) -> None:
        # Heater status mirror is delegated to ZoneController._on_status
        # (which already records mode transitions in brooder_power_history).
        # HeaterController only needs per-heater power accounting, not
        # status bookkeeping.
        pass

    def _on_lwt(self, topic: str, payload) -> None:
        device_code = extract_device_code(topic)
        if not device_code:
            return
        # Mark all heaters for this device as offline (record audit row).
        for h in self.heaters_by_device.get(device_code, []):
            mqtt_client.schedule_coroutine(_record_power_change(
                zone_id=h.zone_id, heater_id=h.id,
                device_code=h.device_code, channel=h.channel,
                power_pct=h.last_power_pct or 0,
                setpoint_c=h.current_setpoint(),
                pid_input_c=None,
                source='heater_mode_change',
                note=f"LWT (device offline)",
            ))

    # ─── per-heater PID tick ────────────────────────────────

    async def _tick_device_heaters(self, device_code: str, payload: dict) -> None:
        """Run PID for every heater on `device_code` and publish a single
        per-ESP MQTT payload at the end.

        The Tier-1/Tier-2 logic mirrors BrooderController._tick_pid /
        ZoneController._tick_zone_pid but operates per-heater instead of
        per-zone.
        """
        try:
            now = datetime.now(timezone.utc)
            temp1 = payload.get('temp1')
            temp2 = payload.get('temp2')
            temp_min = payload.get('temp_min')
            if temp1 is None:
                temp1 = payload.get('temp')
            if temp2 is None:
                temp2 = temp1
            if temp_min is None:
                tpid = payload.get('temp_pid')
                if tpid is not None:
                    temp_min = float(tpid)
                elif temp1 is not None and temp2 is not None:
                    temp_min = min(float(temp1), float(temp2))
                elif temp1 is not None:
                    temp_min = float(temp1)
            if temp_min is None:
                return

            # Zone this device belongs to (for Tier-2 fallback + profile cache)
            zone_heaters = self.heaters_by_device.get(device_code) or []
            zone_id = zone_heaters[0].zone_id if zone_heaters else None

            per_heater_output: Dict[int, int] = {}
            per_heater_input: Dict[int, float] = {}
            per_heater_sp: Dict[int, float] = {}

            for h in zone_heaters:
                if not h.enabled:
                    continue
                # Tier-1: weighted-avg of sensors assigned to this heater.
                # Tier-2: freshest member SHT40 minus this heater's
                # fallback_delta_c.
                temp, pid_source = await self._compute_pid_input(
                    h, temp_min, now,
                )
                if temp is None:
                    continue

                # Skip-gate: don't re-run PID when input hasn't changed.
                if (h.last_pid_input == temp
                        and h.last_pid_input_at is not None
                        and (now - h.last_pid_input_at).total_seconds() < PID_HEARTBEAT_S):
                    per_heater_output[h.id] = h.last_power_pct
                    per_heater_input[h.id] = temp
                    per_heater_sp[h.id] = h.pid.setpoint
                    continue

                out_pct = h.compute_power(temp)
                h.last_pid_input = temp
                h.last_pid_input_at = now
                h.last_power_pct = out_pct
                h.last_published_at = now
                per_heater_output[h.id] = out_pct
                per_heater_input[h.id] = temp
                per_heater_sp[h.id] = h.pid.setpoint

                # Audit — only when power % actually changes
                if out_pct != h.last_power_pct_recorded:
                    h.last_power_pct_recorded = out_pct
                    await _record_power_change(
                        zone_id=h.zone_id, heater_id=h.id,
                        device_code=h.device_code, channel=h.channel,
                        power_pct=out_pct,
                        setpoint_c=h.pid.setpoint,
                        pid_input_c=temp,
                        source='pid',
                    )

            if not per_heater_output:
                return

            # Build per-ESP payload {ch1: pct1, ch2: pct2, ...}
            channels: Dict[str, int] = {}
            for hid, pct in per_heater_output.items():
                h = self.heaters.get(hid)
                if h is None:
                    continue
                channels[f"ch{h.channel}"] = pct
            avg = int(sum(channels.values()) / max(len(channels), 1))
            # v1.4.2 (server bug 6): firmware uses the payload's setpoint as
            # the retained NVS reference for FAILSAFE_SETPOINT_C fallback
            # when server connectivity drops. If we AVERAGE setpoints and one
            # heater is on manual_setpoint=24°C while the other runs the
            # profile at 31°C, firmware sees 27.5°C and converges there →
            # wrong profile for the zone's *primary* heater (the one
            # following brooding_start_date). Use MAX instead so the
            # warmest required setpoint governs the firmware reference,
            # and the per-channel server-side PID can still override below.
            avg_sp = (max(per_heater_sp.values())
                      if per_heater_sp else DEFAULT_SETPOINT_C)
            payload_out = {
                **channels,
                "power":    avg,
                "setpoint": round(avg_sp, 2),
                "ts":       now.isoformat(),
            }
            topic = f"cfarm/brooder-{device_code}/power"
            mqtt_client.publish(topic, payload_out, qos=1)

            # Persist to hypertable (same as BrooderController._tick_pid)
            try:
                device_id = await db.fetchval(
                    "SELECT id FROM devices WHERE device_code = $1",
                    device_code,
                )
                if device_id is None:
                    raise RuntimeError(f"device not found: {device_code}")
                # Use first heater's input as the temp sample
                first_input = next(iter(per_heater_input.values()), None)
                async with db.transaction() as conn:
                    if first_input is not None:
                        await conn.execute(
                            """
                            INSERT INTO sensor_data
                                (time, device_id, sensor_type, value, unit)
                            VALUES (NOW(), $1, $2, $3, NULL)
                            """,
                            device_id, SENSOR_TYPE_CODE, float(first_input),
                        )
                    await conn.execute(
                        """
                        INSERT INTO sensor_data
                            (time, device_id, sensor_type, value, unit)
                        VALUES (NOW(), $1, $2, $3, '%')
                        """,
                        device_id, SENSOR_TYPE_POWER_CODE, float(avg),
                    )
                    # Snapshot per-heater latest power (one UPSERT per heater).
                    for hid, pct in per_heater_output.items():
                        h = self.heaters.get(hid)
                        if h is None:
                            continue
                        await conn.execute(
                            """
                            INSERT INTO brooder_heater_latest_power
                                (heater_id, last_power_pct, last_setpoint,
                                 last_published_at, source)
                            VALUES ($1, $2, $3, NOW(), 'server')
                            ON CONFLICT (heater_id) DO UPDATE SET
                                last_power_pct    = EXCLUDED.last_power_pct,
                                last_setpoint     = EXCLUDED.last_setpoint,
                                last_published_at = EXCLUDED.last_published_at,
                                source            = EXCLUDED.source
                            """,
                            hid, int(pct), float(per_heater_sp[hid]),
                        )
            except Exception as e:
                logger.warning(f"Heater {device_code}: persist skipped: {e}")

        except Exception as e:
            logger.error(f"HeaterController tick error for {device_code}: {e}")

    async def _compute_pid_input(self, h: Heater, source_temp_min: float,
                                 now: datetime) -> Tuple[Optional[float], str]:
        """Compute the PID input for heater `h`.

        Returns (temp, source_label):
          - Tier 1: weighted-avg of sensors EITHER bound to this heater
                    (heater_id = h.id) OR shared zone-level rows
                    (is_shared = TRUE, heater_id IS NULL). The shared
                    branch restores the docstring semantics at
                    src/server/routes/brooder.py:953-957 — a zone-level
                    sensor with is_shared=TRUE feeds every heater in the
                    zone without N-row duplication. When fresh → use directly.
          - Tier 2: freshest member node's SHT40 (last_temp_min) minus
                    h.fallback_delta_c. Each heater has its own delta
                    so ch1 and ch2 can be calibrated independently.

        Returns (None, ...) when no usable input is available.
        """
        # Tier 1: heaters with at least 1 sensor assigned OR shared zone-level
        # sensors (is_shared=TRUE). Shared rows (heater_id=NULL) feed ALL
        # heaters in the zone via this query — see scripts/083_zone_shared_sensor_flag.sql.
        try:
            sensor_rows = await db.fetch(
                """
                SELECT
                    bzs.sensor_device_code,
                    bzs.weight,
                    bzs.sub_sensor,
                    sl.value      AS temp,
                    sl.time       AS last_seen,
                    bzs.is_shared
                FROM brooder_zone_sensors bzs
                LEFT JOIN devices d
                       ON d.device_code = bzs.sensor_device_code
                LEFT JOIN sensor_latest sl
                       ON sl.device_id = d.id
                      AND sl.sensor_type = $3
                      -- v1.4.2 (server bug 7): PostgreSQL `=` returns NULL
                      -- when either side is NULL → NULL is treated as FALSE
                      -- in WHERE/ON, so a bzs row with sub_sensor IS NULL
                      -- (zone-level shared sensor) never matched a sensor_latest
                      -- row whose sub_sensor is NULL. IS NOT DISTINCT FROM
                      -- treats NULL as a comparable value so the JOIN actually
                      -- returns rows for shared null-tagged sensors.
                      AND sl.sub_sensor  IS NOT DISTINCT FROM bzs.sub_sensor
                WHERE bzs.zone_id = $1 AND (
                    bzs.heater_id = $2
                    OR (bzs.is_shared = TRUE AND bzs.heater_id IS NULL)
                )
                ORDER BY bzs.id
                """,
                h.zone_id, h.id, ZONE_TEMP_SENSOR_TYPE,
            )
        except Exception as e:
            logger.debug(f"Heater {h.id}: sensor query failed: {e}")
            sensor_rows = []

        if sensor_rows:
            payload = [dict(r) for r in sensor_rows]
            value, fresh_count = blend_zone_temp(payload, now=now)
            if value is not None:
                # v1.3.0: low-pass filter (α=0.3) — mirrors BrooderNode
                # zone_lpf logic. Tier-1 sensor payloads arrive in 20s steps;
                # α=0.3 with 5s tick → τ≈2.5s smooths the discrete jumps
                # before the D-term sees them.
                if not h.last_pid_input_lpf_init:
                    h.last_pid_input_lpf = value
                    h.last_pid_input_lpf_init = True
                else:
                    h.last_pid_input_lpf = 0.3 * value + 0.7 * h.last_pid_input_lpf
                return h.last_pid_input_lpf, "heater-zone"

        # Tier 2: freshest member SHT40 minus this heater's fallback_delta_c.
        # Use ZoneController's member_nodes (same process, no extra DB hit).
        zone = zone_controller.zones.get(h.zone_id)
        if zone is not None:
            freshest: Optional[BrooderNode] = None
            freshest_age: Optional[float] = None
            for n in zone.member_nodes.values():
                if n.last_temp_min is None or n.last_telemetry_at is None:
                    continue
                age = (now - n.last_telemetry_at).total_seconds()
                if freshest_age is None or age < freshest_age:
                    freshest = n
                    freshest_age = age
            if freshest is not None and freshest_age is not None \
                    and freshest_age <= ZONE_TEMP_STALE_S:
                # v1.4.2 (server bug 4): Tier-2 sensor glitch filter — mirror
                # of the Tier-1 logic BrooderController._tick_pid applies.
                # SHT40 I2C hang returns -40°C (or 0°C on some variants) and
                # would otherwise drive the heater to 100% for as long as
                # the stale reading persists (≤ ZONE_TEMP_STALE_S = 180s).
                raw = freshest.last_temp_min
                if raw < 5.0 or raw > 50.0:
                    logger.debug(
                        f"Heater {h.id} Tier-2: rejected member "
                        f"{freshest.device_code} reading {raw:.1f}°C "
                        f"(glitch filter)"
                    )
                    return None, "local+delta-glitch"
                # Reset LPF state on tier transition (different inputs).
                h.last_pid_input_lpf_init = False
                return raw - h.fallback_delta_c, "local+delta"

        return None, "no-input"

    # ─── keepalive watchdog (v1.4.2 / server bug 3) ─────────
    #
    # Mirror BrooderController's keepalive loop for devices that have
    # Heater rows. Same 4s cadence (matches BrooderController's
    # KEEPALIVE_INTERVAL_S), same no-PID-recompute semantics — just
    # publish the LAST commanded per-channel power + setpoint so the
    # firmware sees fresh /power packets and stays in MODE_NORMAL.
    # Without this, HeaterController devices had ZERO keepalive: their
    # /power publishes were gated on telemetry arrival + the
    # PID_HEARTBEAT_S=4 skip window, so any stall in either would let
    # firmware's FAILSAFE_TIMEOUT_MS expire.

    KEEPALIVE_INTERVAL_S = 4

    async def _keepalive_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(self.KEEPALIVE_INTERVAL_S)
                await self._publish_keepalive_power()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(
                    f"Heater keepalive loop error: {e}", exc_info=True
                )
                # Small backoff so a tight exception loop doesn't burn CPU.
                await asyncio.sleep(1)

    async def _publish_keepalive_power(self) -> None:
        """Publish the last commanded per-channel power for every device
        that has at least one Heater row. Uses Heater.last_power_pct
        (the same field Heater.compute_power writes) so the firmware's
        retained value never drifts from what the server PID last
        commanded. Each device gets a single /power message with all
        channels (ch1, ch2, …) plus the max-setpoint reference (v1.4.2
        server bug 6 — same logic as _tick_device_heaters uses).
        """
        for code, hs in self.heaters_by_device.items():
            if not hs:
                continue
            # Skip if no PID has run yet on any heater — first publish is
            # gated on telemetry arrival and there'd be no payload to keep
            # alive.
            if any(h.last_power_pct is None for h in hs):
                continue
            # Build per-channel payload + max-setpoint (mirrors the
            # _tick_device_heaters payload shape so the firmware doesn't
            # have to learn two formats).
            channels: Dict[str, int] = {}
            setpoints: List[float] = []
            for h in hs:
                channels[f"ch{h.channel}"] = int(h.last_power_pct)
                if h.pid is not None:
                    setpoints.append(h.pid.setpoint)
            max_sp = max(setpoints) if setpoints else DEFAULT_SETPOINT_C
            payload_out = {
                **channels,
                "power":    int(sum(channels.values()) / max(len(channels), 1)),
                "setpoint": round(max_sp, 2),
                "ts":       datetime.now(timezone.utc).isoformat(),
                "keepalive": True,
            }
            topic = f"cfarm/brooder-{code}/power"
            try:
                mqtt_client.publish(topic, payload_out, qos=1)
            except Exception as e:
                logger.debug(f"Heater {code}: keepalive publish failed: {e}")

    # ─── periodic reload (60s) ─────────────────────────────

    async def _periodic_loop(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(60)
                await self._load_heaters()
                await self._refresh_member_nodes()
                # Sweep expired test assignments + refresh profile caches
                await self._sweep_test_assignments()
                await self._refresh_heater_profile_caches()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"HeaterController periodic loop error: {e}",
                             exc_info=True)

    def invalidate_profile_cache(self) -> None:
        """Flip the dirty flag so the next periodic tick re-resolves
        every heater's profile cache. Called by routes/brooder_profiles.py
        after mutations.
        """
        self._profile_cache_dirty = True

    async def _sweep_test_assignments(self) -> None:
        """Mirror BrooderController._sweep_test_assignments — auto-expire
        stale test assignments so the next profile resolve sees the cleared
        state.
        """
        try:
            rows = await db.fetch(
                """
                UPDATE brooder_profile_test_assignments
                SET cleared_at = NOW(), cleared_reason = 'auto_expired'
                WHERE cleared_at IS NULL AND expires_at <= NOW()
                RETURNING id
                """
            )
        except Exception as e:
            logger.debug(f"HeaterController test sweeper query failed: {e}")
            return
        if rows:
            self._profile_cache_dirty = True
            logger.info(
                f"HeaterController test sweeper: auto-expired {len(rows)} assignment(s)"
            )

    async def _refresh_heater_profile_caches(self) -> None:
        """Resolve the zone-level profile once per periodic tick (the
        zone's primary cycle resolution is already done by ZoneController
        in _refresh_profile_caches; we just mirror it). Then mirror it
        into each heater's profile_cache.
        """
        try:
            await self._refresh_member_nodes()
            # Mirror zone profile_cache into heater profile_cache. Cheaper
            # to reuse ZoneController's existing resolution than to redo
            # the same DB lookup per heater.
            for zid, z in zone_controller.zones.items():
                self._zone_profile_cache[zid] = z.profile_cache
                self._zone_profile_cache_date[zid] = z.profile_cache_cycle_date
                self._zone_profile_cache_night[zid] = z.profile_cache_night_flag
            for h in self.heaters.values():
                # Only mirror when our heater doesn't have a manual override
                # — manual_setpoint always wins.
                if h.manual_setpoint is not None:
                    continue
                cache = self._zone_profile_cache.get(h.zone_id)
                if cache is None:
                    h.profile_cache = None
                    h.profile_cache_cycle_date = None
                    h.profile_cache_night_flag = None
                    continue
                # Skip when the zone's cache hasn't moved (date/night bool)
                if (h.profile_cache is not None
                        and h.profile_cache is cache
                        and h.profile_cache_cycle_date == self._zone_profile_cache_date.get(h.zone_id)
                        and h.profile_cache_night_flag == self._zone_profile_cache_night.get(h.zone_id)
                        and not self._profile_cache_dirty):
                    continue
                h.profile_cache = cache
                h.profile_cache_cycle_date = self._zone_profile_cache_date.get(h.zone_id)
                h.profile_cache_night_flag = self._zone_profile_cache_night.get(h.zone_id)
                h.update_pid_setpoint()
            self._profile_cache_dirty = False
        except Exception as e:
            logger.warning(f"HeaterController: profile refresh failed: {e}")

    # ─── public API (for routes / dashboard) ───────────────

    def get_heater(self, heater_id: int) -> Optional[dict]:
        h = self.heaters.get(heater_id)
        return h.to_dict() if h else None

    def list_heaters(self, zone_id: Optional[int] = None) -> List[dict]:
        out = []
        for h in self.heaters.values():
            if zone_id is not None and h.zone_id != zone_id:
                continue
            out.append(h.to_dict())
        return out

    async def set_heater_setpoint(self, heater_id: int,
                                   setpoint: Optional[float],
                                   note: Optional[str] = None) -> dict:
        """Set/clear manual_setpoint override on a single heater.

        None → clear override (back to auto day-age / profile).
        Float → lock to that °C.

        Audit logged to heater_setpoint_history + brooder_power_history.
        Retained /setpoint topic re-published (single value = average
        across the device's heaters for firmware compat).
        """
        h = self.heaters.get(heater_id)
        if h is None:
            raise ValueError(f"Unknown heater: {heater_id}")
        old_setpoint = h.manual_setpoint
        h.manual_setpoint = setpoint
        h.update_pid_setpoint()
        effective = h.pid.setpoint

        await db.execute(
            "UPDATE brooder_heaters SET manual_setpoint = $1, "
            "updated_at = NOW() WHERE id = $2",
            setpoint, heater_id,
        )

        # Audit — heater_setpoint_history
        try:
            await db.execute(
                """
                INSERT INTO heater_setpoint_history
                    (heater_id, manual_setpoint, effective_setpoint, source, note)
                VALUES ($1, $2, $3, 'manual', $4)
                """,
                heater_id, setpoint, effective, note,
            )
        except Exception as e:
            logger.debug(f"Heater {heater_id}: audit write failed: {e}")

        # Republish retained /setpoint to the device (average across this
        # device's heaters, so the firmware's NVS-cached setpoint stays
        # representative for the failsafe path).
        try:
            await self._republish_setpoint_for_device(h.device_code)
        except Exception as e:
            logger.warning(f"Heater {heater_id}: setpoint republish failed: {e}")

        # Power-history audit
        await _record_power_change(
            zone_id=h.zone_id, heater_id=h.id,
            device_code=h.device_code, channel=h.channel,
            power_pct=h.last_power_pct or 0,
            setpoint_c=setpoint,
            pid_input_c=None,
            source='heater_setpoint_change',
            note=f"heater override: {old_setpoint} → {setpoint}"
                 + (f" ({note})" if note else ""),
        )
        logger.info(f"Heater {heater_id} ({h.device_code}/ch{h.channel}): "
                    f"manual override → {setpoint if setpoint is not None else 'auto'} "
                    f"(effective {effective:.2f}°C)")
        return h.to_dict()

    async def set_heater_fallback_delta(self, heater_id: int,
                                          delta: float) -> dict:
        """Update Tier-2 fallback delta for a single heater."""
        h = self.heaters.get(heater_id)
        if h is None:
            raise ValueError(f"Unknown heater: {heater_id}")
        h.fallback_delta_c = float(delta)
        await db.execute(
            "UPDATE brooder_heaters SET fallback_delta_c = $1, "
            "updated_at = NOW() WHERE id = $2",
            float(delta), heater_id,
        )
        # Republish retained setpoint so firmware's NVS-cached delta updates
        try:
            await self._republish_setpoint_for_device(h.device_code)
        except Exception as e:
            logger.warning(f"Heater {heater_id}: delta republish failed: {e}")
        return h.to_dict()

    async def get_heater_setpoint_history(self, heater_id: int,
                                            limit: int = 50) -> List[dict]:
        """Recent manual override changes for this heater (audit + UI)."""
        rows = await db.fetch(
            """
            SELECT id, manual_setpoint, effective_setpoint, source, note, created_at
            FROM heater_setpoint_history
            WHERE heater_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            heater_id, limit,
        )
        out = []
        for r in rows:
            d = dict(r)
            d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
            out.append(d)
        return out

    async def _republish_setpoint_for_device(self, device_code: str) -> None:
        """Republish the retained /setpoint for one ESP. Computes the
        MAX setpoint across all heaters on the device (not average) so
        the firmware's NVS reference governs the warmest profile target
        — v1.4.2 (server bug 6) correction; previously a per-heater
        manual_setpoint at 24°C dragging the device average down to
        27.5°C made the firmware failsafe converge to the wrong floor.
        """
        heaters = self.heaters_by_device.get(device_code) or []
        if not heaters:
            return
        setpoints = [h.pid.setpoint for h in heaters if h.pid is not None]
        avg_sp = max(setpoints) if setpoints else DEFAULT_SETPOINT_C
        # Use the zone's profile_cache + fallback_delta_c as representative
        # for the firmware payload (firmware cares about max_safe +
        # fallback_delta_c, not per-heater overrides). Delta stays averaged
        # — each heater applies its own delta independently in Tier-2.
        zone = zone_controller.zones.get(heaters[0].zone_id)
        profile_cache = zone.profile_cache if zone else None
        avg_delta = (
            sum(h.fallback_delta_c for h in heaters) / len(heaters)
            if heaters else 0.0
        )
        payload = build_setpoint_payload(
            avg_sp,
            manual_override=any(h.manual_setpoint is not None for h in heaters),
            fallback_delta_c=avg_delta,
        )
        if profile_cache is not None:
            payload["profile_code"] = profile_cache.profile_code
        topic = f"cfarm/brooder-{device_code}/setpoint"
        mqtt_client.publish(topic, payload, qos=1, retain=True)


# ============================================================
# Module-level singleton (HeaterController)
# ============================================================

heater_controller = HeaterController()