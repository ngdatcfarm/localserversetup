"""
Tests for blend_zone_temp() — the pure helper that computes a weighted
average of reference-sensor readings for the PID input.

The helper is called from ZoneController._publish_zone_temps after
fetching brooder_zone_sensors + sensor_latest rows from the DB. It
must:
  - Average readings using each sensor's weight
  - Drop any reading older than ZONE_TEMP_STALE_S (default 180s)
  - Drop any sensor with None temp or None last_seen
  - Drop sensors with weight=0 (operator intentionally disabled)
  - Return (None, 0) when no fresh readings contribute
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub cv2 to avoid pulling OpenCV (matches test_project_smoke.py)
import types
fake_cv2 = types.SimpleNamespace(
    CAP_FFMPEG=0, CAP_PROP_BUFFERSIZE=0,
    CAP_PROP_FRAME_WIDTH=3, CAP_PROP_FRAME_HEIGHT=4, CAP_PROP_FPS=5,
    cuda=types.SimpleNamespace(getCudaEnabledDeviceCount=lambda: 0),
)
sys.modules.setdefault("cv2", fake_cv2)

from src.iot.brooder_service import blend_zone_temp  # noqa: E402


NOW = datetime(2026, 9, 17, 10, 0, 0, tzinfo=timezone.utc)


def _row(temp, weight=1.0, age_s=0):
    """Build a sensor row with last_seen = NOW - age_s."""
    return {
        "temp":      temp,
        "weight":    weight,
        "last_seen": NOW - timedelta(seconds=age_s),
    }


def test_weighted_average_three_sources():
    """3 sensors, weights [1, 2, 1], values [30, 28, 29] →
    (1*30 + 2*28 + 1*29) / (1+2+1) = (30+56+29)/4 = 115/4 = 28.75"""
    rows = [
        _row(30.0, weight=1.0, age_s=5),
        _row(28.0, weight=2.0, age_s=10),
        _row(29.0, weight=1.0, age_s=2),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 3
    assert value == 28.75


def test_stale_reading_dropped():
    """Sensor older than 180s is excluded from the average."""
    rows = [
        _row(30.0, weight=1.0, age_s=10),    # fresh
        _row(28.0, weight=1.0, age_s=200),   # stale (>180s)
        _row(29.0, weight=1.0, age_s=15),    # fresh
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 2
    # Average of 30 and 29
    assert abs(value - 29.5) < 0.001


def test_stale_exactly_at_threshold_kept():
    """180s is the boundary — should be included (age > 180 is the drop rule)."""
    rows = [_row(30.0, weight=1.0, age_s=180)]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 1
    assert value == 30.0


def test_stale_just_past_threshold_dropped():
    """181s → excluded."""
    rows = [_row(30.0, weight=1.0, age_s=181)]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert value is None
    assert fresh == 0


def test_zero_weight_sensor_ignored():
    """Sensor with weight=0 contributes nothing to sum, doesn't crash."""
    rows = [
        _row(30.0, weight=0.0, age_s=5),
        _row(28.0, weight=1.0, age_s=5),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    # The zero-weight row is filtered → fresh_count = 1
    assert fresh == 1
    assert value == 28.0


def test_all_zero_weight_returns_none():
    """All sensors weight=0 → no contribution → None, 0."""
    rows = [
        _row(30.0, weight=0.0, age_s=5),
        _row(28.0, weight=0.0, age_s=5),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert value is None
    assert fresh == 0


def test_none_temp_dropped():
    """Sensor with temp=None is skipped (not crashed)."""
    rows = [
        _row(None, weight=1.0, age_s=5),
        _row(29.0, weight=1.0, age_s=5),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 1
    assert value == 29.0


def test_none_last_seen_dropped():
    """Sensor with last_seen=None is skipped."""
    rows = [
        {"temp": 30.0, "weight": 1.0, "last_seen": None},
        _row(28.0, weight=1.0, age_s=5),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 1
    assert value == 28.0


def test_all_stale_returns_none():
    """All sensors older than 180s → None, 0."""
    rows = [
        _row(30.0, weight=1.0, age_s=200),
        _row(28.0, weight=1.0, age_s=300),
        _row(29.0, weight=1.0, age_s=400),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert value is None
    assert fresh == 0


def test_empty_rows_returns_none():
    """Empty list → None, 0 (no crash)."""
    value, fresh = blend_zone_temp([], now=NOW)
    assert value is None
    assert fresh == 0


def test_single_sensor():
    """Only one fresh sensor → value = that sensor's reading."""
    rows = [_row(33.5, weight=1.0, age_s=10)]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 1
    assert value == 33.5


def test_unequal_weights_dominate():
    """Heavy weight dominates — verify not simple average."""
    rows = [
        _row(20.0, weight=10.0, age_s=5),   # dominant
        _row(40.0, weight=1.0, age_s=5),
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    # (10*20 + 1*40) / 11 = 240/11 ≈ 21.818
    assert fresh == 2
    assert abs(value - 21.8181818) < 0.001


def test_default_stale_threshold_is_180s():
    """Default stale_s is the ZONE_TEMP_STALE_S module constant (180)."""
    rows = [_row(30.0, weight=1.0, age_s=179)]   # just under default
    value, fresh = blend_zone_temp(rows, now=NOW)  # no explicit stale_s
    assert fresh == 1
    assert value == 30.0


def test_custom_stale_threshold():
    """Operator can override stale_s (e.g. for tighter loop)."""
    rows = [
        _row(30.0, weight=1.0, age_s=50),  # would be fresh with 60s threshold
    ]
    value, fresh = blend_zone_temp(rows, now=NOW, stale_s=30)
    # 50 > 30 → dropped
    assert value is None
    assert fresh == 0


def test_missing_weight_key_defaults_to_one():
    """Row without 'weight' key uses 1.0 (operator hasn't set weight yet)."""
    rows = [
        {"temp": 30.0, "last_seen": NOW - timedelta(seconds=5)},
        {"temp": 28.0, "last_seen": NOW - timedelta(seconds=5)},
    ]
    value, fresh = blend_zone_temp(rows, now=NOW)
    assert fresh == 2
    assert abs(value - 29.0) < 0.001
