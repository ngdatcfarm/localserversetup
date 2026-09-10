"""Luxpower SNA 6.5k inverter runtime data model.

This module holds the InverterRuntime dataclass and the register-to-field
mapping for the Luxpower SNA 6.5k hybrid inverter (TCP port 8000 on the
WiFi dongle).

The register map below is a best-guess for Bank 1 (0x00..0x27). It must be
verified against actual firmware before relying on the values for power
dispatch. See the verification plan in docs and TODO comments inline.

Phase 1 = READ-ONLY monitoring. No write commands are issued to the inverter.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ── Register map (Bank 1, offset 0x00) ─────────────────────────────────
# VERIFIED against user's SNA 6.5k (dongle DG55140363, inverter 60104F0324)
# via protocol smoke test (2026-08-25).
#
# Bank 1 layout observed:
#   0x00..0x0D : ASCII firmware/model string ("60104F0324CHAA" + zeros)
#   0x0E..0x10 : small constants (device class / firmware rev)
#   0x11..0x12 : more constants
#   0x13       : VOLATILE counter (increments each poll — energy total / tick)
#   0x14..0x17 : status flags (1, 1, 0, 0)
#   0x18..0x1A : misc
#   0x1B       : SoC (%)               — VERIFIED: matches LCD (65% → 65)
#   0x1C..0x1D : misc / battery flags
#   0x1E..0x1F : PV1 voltage (×10 V) + current (×100 A)   — best guess
#   0x20..0x21 : battery voltage (×100 V) — 47.00 / 50.50
#   0x22..0x23 : PV2 voltage (×10 V) + current (×100 A)   — best guess
#   0x24..0x27 : misc
#   0x28..0x2E : misc
#   0x2F..0x30 : battery voltage (×100 V) — 47.00 / 52.00  — likely primary v_bat
#   0x31..0x52 : misc / often zero
#
# Confidence levels:
#   ✓ VERIFIED     — matches LCD ground truth
#   ◐ STRONG GUESS — physically plausible (battery V in 48V range, PV V ~195V)
#   ? WEAK GUESS   — constant values, may be config not telemetry
#
# Phase 1 (read-only): if a register is mis-mapped, downstream consumers see
# garbage. The dashboard gracefully shows 0 W / -- V; raw_registers is kept in
# the response so we can re-map later without losing data.
#
# ── IMPORTANT NOTE on grid / EPS / battery power (2026-08-25) ──
# When the inverter is in standby (no PV, no AC load), almost ALL registers
# in bank 1 stay CONSTANT — there is nothing changing on the electrical
# inputs/outputs. Only reg 0x13 (a running counter) and reg 0x1B (SoC which
# barely changes on a 48V LiFePO4) move.
#
# This means we cannot identify the registers for p_grid / p_eps / p_bat
# from static observation alone. The candidate mappings below are educated
# guesses based on Luxpower SNA register layout conventions; they will be
# wrong until the user triggers a load event (turn on water heater / AC)
# and we diff raw registers while power is actually flowing.
REGISTER_MAP: list[dict] = [
    # ── Verified telemetry ──
    {"off": 0x1B, "name": "soc",             "type": "u16", "scale": 1.0,   "unit": "%"},
    {"off": 0x2F, "name": "v_bat",           "type": "u16", "scale": 0.01,  "unit": "V"},
    {"off": 0x1E, "name": "ppv1_v_raw",      "type": "u16", "scale": 0.1,   "unit": "V"},
    {"off": 0x1F, "name": "ppv1_a_raw",      "type": "u16", "scale": 0.001, "unit": "A"},
    {"off": 0x22, "name": "ppv2_v_raw",      "type": "u16", "scale": 0.1,   "unit": "V"},
    {"off": 0x23, "name": "ppv2_a_raw",      "type": "u16", "scale": 0.001, "unit": "A"},
    {"off": 0x13, "name": "counter_raw",     "type": "u16"},

    # ── Candidate telemetry (NEEDS VERIFICATION) ──
    # 0x11: 2074 → ×0.1 = 207.4V, plausible for VN 220V grid line-to-neutral.
    #        (Grid frequency would be ~50Hz, would be 5000 at ×0.01 scale; 2841
    #        at 0x12 doesn't match — likely a different quantity.)
    {"off": 0x11, "name": "v_grid_cand",     "type": "u16", "scale": 0.1,   "unit": "V",
     "note": "Grid voltage candidate (unverified) — needs load test to confirm."},
    # 0x18: 16390 — observed as constant. ×0.01 = 163.9W (small load), ×0.1 = 1639W
    #        (export), ×1 = 16.39kW (way too high). Most plausible = EPS/load W.
    {"off": 0x18, "name": "p_eps_cand",      "type": "u16", "scale": 0.01,  "unit": "W",
     "note": "EPS/load candidate (unverified) — value 16390 doesn't change, may be config not telemetry."},
    # 0x21: 5050 — observed as constant. ×0.1 = 505W (battery charge/discharge).
    {"off": 0x21, "name": "p_bat_cand",      "type": "u16", "scale": 0.1,   "unit": "W",
     "note": "Battery power candidate (unverified) — sign convention unknown."},
    # 0x24: 500 — observed as constant. ×0.01 = 5W (too low), ×0.1 = 50W, ×1 = 500W.
    #        Could be grid current ×10 = 50A (no) or related to grid power.
    {"off": 0x24, "name": "p_grid_cand",     "type": "u16", "scale": 0.1,   "unit": "W",
     "note": "Grid power candidate (unverified) — value too low to be realistic grid W."},
]


@dataclass
class InverterRuntime:
    """One sampled snapshot of inverter telemetry.

    Field units:
      - ppv1, ppv2: PV string 1/2 power (W, ≥0)
      - p_grid: grid power (W, + = export, − = import)
      - p_eps: load / EPS power (W, ≥0)
      - p_bat: battery power (W, + = charge, − = discharge)
      - soc: state of charge (%)
      - v_bat: battery voltage (V)
      - raw_registers: raw uint16 list (debug / future-proofing)
      - ts: sample timestamp (UTC)
    """

    ts: datetime
    ppv1: float = 0.0
    ppv2: float = 0.0
    p_grid: float = 0.0
    p_eps: float = 0.0
    p_bat: float = 0.0
    soc: float = 0.0
    v_bat: float = 0.0
    raw_registers: list[int] = field(default_factory=list)

    # ── Helpers ────────────────────────────────────────────────────────
    def total_pv(self) -> float:
        return float(self.ppv1 or 0.0) + float(self.ppv2 or 0.0)

    def self_consumption(self) -> float:
        """Estimate load served directly from PV (no battery / grid round-trip).

        Conservative: clamp to [0, p_eps] so dispatch logic never thinks we
        are consuming more PV than the house is actually using.
        """
        pv = self.total_pv()
        load = max(0.0, float(self.p_eps or 0.0))
        return max(0.0, min(pv, load))

    def to_dict(self) -> dict:
        d = asdict(self)
        # ISO string so the JSON is consumable by JS without further parsing
        d["ts"] = self.ts.astimezone(timezone.utc).isoformat()
        return d

    # ── Factory: build from raw uint16 block ──────────────────────────
    @classmethod
    def from_registers(cls, regs: list[int], ts: Optional[datetime] = None) -> "InverterRuntime":
        """Decode a Bank-1 register block.

        Reads from offsets verified in REGISTER_MAP (see file header).
        Fields that are not yet identified (grid power, EPS power, battery
        power in/out) default to 0 — the dashboard shows them as "—" and
        the raw uint16 list is kept in `raw_registers` for later re-mapping.
        """
        ts = ts or datetime.now(timezone.utc)

        def u16(idx: int) -> int:
            if idx < 0 or idx >= len(regs):
                return 0
            return int(regs[idx]) & 0xFFFF

        # ── Verified / strong-guess fields ──
        soc = float(u16(0x1B))               # 65 = 65% (matches LCD)
        v_bat = u16(0x2F) * 0.01             # 4700 → 47.00V
        ppv1_v = u16(0x1E) * 0.1             # 1955 → 195.5V (open-circuit, plausible)
        ppv1_a = u16(0x1F) * 0.001           # 2530 → 2.530A (×0.001 keeps PV power < 6.5kW)
        ppv2_v = u16(0x22) * 0.1             # 1955 → 195.5V
        ppv2_a = u16(0x23) * 0.001           # 2530 → 2.530A

        # Derived PV power (W) — clamp to ≥0; matches the dataclass contract
        ppv1 = max(0.0, ppv1_v * ppv1_a)
        ppv2 = max(0.0, ppv2_v * ppv2_a)

        # ── Candidate fields (unverified — set to 0 until ground truth) ──
        # These register offsets are educated guesses based on Luxpower SNA
        # register layout conventions. Without a load event on the user's
        # AC side, we cannot tell if these are actual telemetry or just
        # configuration constants. They are kept at 0 to avoid misleading
        # the dashboard; raw_registers preserves the bytes for later diffing.
        p_grid = 0.0   # 0x18/0x21/0x24 — need load test
        p_eps = 0.0
        p_bat = 0.0

        return cls(
            ts=ts,
            ppv1=ppv1,
            ppv2=ppv2,
            p_grid=p_grid,
            p_eps=p_eps,
            p_bat=p_bat,
            soc=soc,
            v_bat=v_bat,
            raw_registers=list(regs),
        )

    # ── Serialisation helpers ─────────────────────────────────────────
    def to_json(self) -> str:
        """Compact JSON form for storage in JSONB column."""
        return json.dumps(self.to_dict(), default=str)


__all__ = ["InverterRuntime", "REGISTER_MAP"]
