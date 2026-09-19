"""
Tests for Zone.distribute_power() — the max-power weighted split that
maps a single PID output (0-100%) to per-heater percent values.

The formula is:
    heater_i_pct = output_pct * (max_power_w_i / sum(max_power_w))

Then rounding drift (sum may be off by ±N) is folded onto the heater
with the largest max_power_w so the total exactly equals the target.

Why this matters: the ESP32 firmware runs each channel at the integer
percent we publish. If the sum drifts from PID output, the actual zone
total wattage drifts too — bad news for a stable control loop. So we
assert sum(distribution.values()) == round(output_pct) in every test.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub cv2 so importing src.iot.* doesn't pull OpenCV through the
# camera subsystem (matches the pattern in test_project_smoke.py).
import types
fake_cv2 = types.SimpleNamespace(
    CAP_FFMPEG=0, CAP_PROP_BUFFERSIZE=0,
    CAP_PROP_FRAME_WIDTH=3, CAP_PROP_FRAME_HEIGHT=4, CAP_PROP_FPS=5,
    cuda=types.SimpleNamespace(getCudaEnabledDeviceCount=lambda: 0),
)
sys.modules.setdefault("cv2", fake_cv2)

from src.iot.brooder_service import Zone, Heater  # noqa: E402


def _make_zone(heaters_spec):
    """Build a Zone with no member_nodes (so current_setpoint() returns
    DEFAULT_SETPOINT_C, which is fine — we never call distribute_power
    in a way that touches the PID)."""
    zone = Zone(
        id=1, barn_id=1, name="Zone-A",
        manual_setpoint=None, fallback_delta_c=0.0, enabled=True,
    )
    zone.heaters = {}
    for hid, dev, ch, max_w, enabled in heaters_spec:
        zone.heaters[hid] = Heater(
            id=hid, zone_id=1, device_code=dev, channel=ch,
            label=None, max_power_w=max_w, enabled=enabled,
        )
    return zone


def test_distribute_power_proportional_two_heaters():
    """1500W vs 1000W heater, 60% PID output → expect 36% / 24%
    (60 * 1500/2500 = 36, 60 * 1000/2500 = 24)."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, True),
        (2, "esp1", 2, 1000, True),
    ])
    out = zone.distribute_power(60.0)
    assert out == {1: 36, 2: 24}
    assert sum(out.values()) == 60


def test_distribute_power_three_heaters_equal_weight():
    """3 heaters × 1000W, 33% output → expect sum = 33, no drift."""
    zone = _make_zone([
        (1, "esp1", 1, 1000, True),
        (2, "esp1", 2, 1000, True),
        (3, "esp2", 1, 1000, True),
    ])
    out = zone.distribute_power(33.0)
    # 33/3 = 11 each — sum = 33 exactly.
    assert sum(out.values()) == 33
    # All three enabled heaters present.
    assert set(out.keys()) == {1, 2, 3}


def test_distribute_power_rounding_drift_corrected():
    """Verify the largest-wattage heater absorbs any rounding remainder.

    With max_power_w (1000, 1000, 2000) and output 50%:
        share = 50*1000/4000=12.5 → Python banker's round(12.5) = 12
        share = 50*1000/4000=12.5 → round(12.5) = 12
        share = 50*2000/4000=25.0 → round(25.0) = 25
        sum = 12+12+25 = 49; target = 50; diff = +1
        → biggest (id=3) gains 1 → 12, 12, 26 → sum = 50 ✓
    """
    zone = _make_zone([
        (1, "esp1", 1, 1000, True),
        (2, "esp1", 2, 1000, True),
        (3, "esp2", 1, 2000, True),
    ])
    out = zone.distribute_power(50.0)
    assert sum(out.values()) == 50
    # The biggest heater (id=3, 2000W) absorbed the drift
    assert out[3] == 26
    assert out[1] == 12
    assert out[2] == 12


def test_distribute_power_disabled_heater_excluded():
    """Disabled heater is skipped — output flows only to enabled ones."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, False),  # disabled
        (2, "esp1", 2, 1000, True),
    ])
    out = zone.distribute_power(60.0)
    assert set(out.keys()) == {2}
    # Only heater is 1000W so it gets the full 60%.
    assert out[2] == 60


def test_distribute_power_no_heaters_returns_empty():
    """No heaters at all (zone deconfigured) → empty dict, no crash."""
    zone = _make_zone([])
    assert zone.distribute_power(50.0) == {}


def test_distribute_power_all_heaters_disabled_returns_empty():
    """All disabled → empty dict."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, False),
        (2, "esp1", 2, 1000, False),
    ])
    assert zone.distribute_power(50.0) == {}


def test_distribute_power_zero_output():
    """PID output 0% → all heaters 0."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, True),
        (2, "esp1", 2, 1000, True),
    ])
    out = zone.distribute_power(0.0)
    assert out == {1: 0, 2: 0}


def test_distribute_power_full_output():
    """PID output 100% → all heaters 100 (with drift correction)."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, True),
        (2, "esp1", 2, 1000, True),
    ])
    out = zone.distribute_power(100.0)
    assert sum(out.values()) == 100
    # 1500W heater gets more than 1000W one — proportional split.
    assert out[1] > out[2]


def test_distribute_power_clamps_to_zero_minimum():
    """Very small PID output → all heaters 0%, no negative values."""
    zone = _make_zone([
        (1, "esp1", 1, 1500, True),
        (2, "esp1", 2, 1000, True),
    ])
    out = zone.distribute_power(0.4)
    assert all(v >= 0 for v in out.values())
    assert sum(out.values()) == 0  # both rounded to 0


def test_distribute_power_zero_wattage_heaters_equal_split():
    """All heaters have max_power_w=0 (pathological config) → equal split."""
    zone = _make_zone([
        (1, "esp1", 1, 0, True),
        (2, "esp1", 2, 0, True),
        (3, "esp2", 1, 0, True),
    ])
    out = zone.distribute_power(60.0)
    # 60 / 3 = 20 each
    assert out == {1: 20, 2: 20, 3: 20}


def test_distribute_power_four_heaters_no_drift():
    """4 heaters × 1500W, 50% output → 25 each, sum=100? Wait: 50%/4=12.5
    each → rounded 13/13/13/12 → sum=51 → diff=-1 → biggest loses 1.

    Actually let's use exact: 4 heaters × 1000W equal weight, 80% output
    → 80/4=20 each → sum=80 exact."""
    zone = _make_zone([
        (1, "esp1", 1, 1000, True),
        (2, "esp1", 2, 1000, True),
        (3, "esp2", 1, 1000, True),
        (4, "esp2", 2, 1000, True),
    ])
    out = zone.distribute_power(80.0)
    assert sum(out.values()) == 80
    assert all(v == 20 for v in out.values())
