"""
Tests for the brooder profiles API surface.

Focus areas (no live DB required):
  1. Pydantic schema validation — the wire contract for POST/PUT payloads.
  2. Cross-stage validator (_validate_stages) — overlap + setpoint descent.
  3. Router registration — paths + methods + handler names so a renamed
     endpoint fails CI before it ships.
  4. Schedule safety — heater_zone_limit ≤ firmware cap, setpoint ≤ MAX_SAFE.
  5. Test apply/clear payloads — hours in [1,168].

The full CRUD roundtrip needs a live TimescaleDB and is covered by manual
smoke tests in docs/ and the verification plan in the implementation plan.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub cv2 to avoid pulling OpenCV (matches other test files)
import types
fake_cv2 = types.SimpleNamespace(
    CAP_FFMPEG=0, CAP_PROP_BUFFERSIZE=0,
    CAP_PROP_FRAME_WIDTH=3, CAP_PROP_FRAME_HEIGHT=4, CAP_PROP_FPS=5,
    cuda=types.SimpleNamespace(getCudaEnabledDeviceCount=lambda: 0),
)
sys.modules.setdefault("cv2", fake_cv2)

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from src.server.routes.brooder_profiles import (  # noqa: E402
    SafetyLimits, ScheduleStage, ScheduleCreate, ScheduleUpdate,
    ProfileCreate, ProfileUpdate, TestApplyRequest,
    _validate_stages,
    FIRMWARE_EMERGENCY_LATCH_C,
    router,
)
from src.iot.brooder_service import MAX_SAFE_TEMPERATURE  # noqa: E402


# ─── SafetyLimits ──────────────────────────────────────────
def test_safety_limits_default_values():
    s = SafetyLimits()
    assert s.emergency_cutoff_temp == 35.1
    assert s.emergency_release_temp == 34.6
    assert s.min_ambient_temp == 5.0


def test_safety_limits_rejects_release_gte_cutoff():
    # 34.6 must be < 35.1 — but 34.6 == 34.6 fails (must be strictly less)
    with pytest.raises(ValidationError) as exc:
        SafetyLimits(emergency_cutoff_temp=34.6, emergency_release_temp=34.6)
    assert "release" in str(exc.value).lower() or "cutoff" in str(exc.value).lower()


def test_safety_limits_rejects_cutoff_above_firmware_cap():
    # Cutoff must be ≤ 35.1 (firmware cap)
    with pytest.raises(ValidationError):
        SafetyLimits(emergency_cutoff_temp=36.0, emergency_release_temp=34.0)


def test_safety_limits_accepts_valid_window():
    s = SafetyLimits(
        emergency_cutoff_temp=35.0,
        emergency_release_temp=34.5,
        min_ambient_temp=2.0,
    )
    assert s.emergency_cutoff_temp == 35.0


# ─── ScheduleStage ──────────────────────────────────────────
def test_stage_default_night_boost():
    s = ScheduleStage(
        stage_order=1, day_range_start=1, day_range_end=7,
        setpoint_target=33.0, heater_zone_limit=35.0,
    )
    assert s.night_boost_offset == 0.0
    assert s.humidity_min_pct is None
    assert s.humidity_max_pct is None


def test_stage_rejects_setpoint_above_max_safe():
    with pytest.raises(ValidationError):
        ScheduleStage(
            stage_order=1, day_range_start=1, day_range_end=7,
            setpoint_target=35.0,   # > MAX_SAFE_TEMPERATURE (34.6)
            heater_zone_limit=35.0,
        )


def test_stage_rejects_heater_limit_above_firmware_cap():
    with pytest.raises(ValidationError):
        ScheduleStage(
            stage_order=1, day_range_start=1, day_range_end=7,
            setpoint_target=30.0,
            heater_zone_limit=36.0,  # > firmware EMERGENCY_LATCH_C (35.1)
        )


def test_stage_accepts_heater_limit_at_firmware_cap():
    """35.1 is the absolute cap; equals is allowed."""
    s = ScheduleStage(
        stage_order=1, day_range_start=1, day_range_end=7,
        setpoint_target=30.0,
        heater_zone_limit=35.1,
    )
    assert s.heater_zone_limit == 35.1


def test_stage_rejects_day_range_end_before_start():
    with pytest.raises(ValidationError) as exc:
        ScheduleStage(
            stage_order=1, day_range_start=10, day_range_end=5,
            setpoint_target=30.0, heater_zone_limit=35.0,
        )
    assert "end" in str(exc.value).lower() or "start" in str(exc.value).lower()


def test_stage_rejects_humidity_max_below_min():
    with pytest.raises(ValidationError):
        ScheduleStage(
            stage_order=1, day_range_start=1, day_range_end=7,
            setpoint_target=30.0, heater_zone_limit=35.0,
            humidity_min_pct=70.0, humidity_max_pct=50.0,
        )


def test_stage_rejects_night_boost_out_of_range():
    with pytest.raises(ValidationError):
        ScheduleStage(
            stage_order=1, day_range_start=1, day_range_end=7,
            setpoint_target=30.0, heater_zone_limit=35.0,
            night_boost_offset=3.0,  # > 2.0 cap
        )


# ─── _validate_stages (cross-stage) ─────────────────────────
def test_validate_stages_accepts_empty_list():
    # Empty profile is allowed (no schedules yet)
    _validate_stages([])


def test_validate_stages_accepts_non_overlapping_descending():
    stages = [
        ScheduleStage(stage_order=1, day_range_start=1, day_range_end=7,
                      setpoint_target=33.5, heater_zone_limit=35.0),
        ScheduleStage(stage_order=2, day_range_start=8, day_range_end=14,
                      setpoint_target=29.5, heater_zone_limit=31.0),
        ScheduleStage(stage_order=3, day_range_start=15, day_range_end=999,
                      setpoint_target=22.0, heater_zone_limit=24.0),
    ]
    _validate_stages(stages)  # no exception


def test_validate_stages_rejects_overlap():
    stages = [
        ScheduleStage(stage_order=1, day_range_start=1, day_range_end=10,
                      setpoint_target=33.5, heater_zone_limit=35.0),
        ScheduleStage(stage_order=2, day_range_start=8, day_range_end=14,
                      setpoint_target=29.5, heater_zone_limit=31.0),
    ]
    with pytest.raises(HTTPException) as exc:
        _validate_stages(stages)
    assert exc.value.status_code == 400
    assert "trùng" in str(exc.value.detail).lower() or "overlap" in str(exc.value.detail).lower()


def test_validate_stages_rejects_setpoint_ascending():
    stages = [
        ScheduleStage(stage_order=1, day_range_start=1, day_range_end=7,
                      setpoint_target=29.5, heater_zone_limit=31.0),  # lower
        ScheduleStage(stage_order=2, day_range_start=8, day_range_end=14,
                      setpoint_target=33.5, heater_zone_limit=35.0),  # higher!
    ]
    with pytest.raises(HTTPException) as exc:
        _validate_stages(stages)
    assert exc.value.status_code == 400
    assert "setpoint" in str(exc.value.detail).lower()


def test_validate_stages_allows_equal_setpoints():
    # Two stages with the same setpoint is OK (e.g. both 30.0°C, different days)
    stages = [
        ScheduleStage(stage_order=1, day_range_start=1, day_range_end=7,
                      setpoint_target=30.0, heater_zone_limit=32.0),
        ScheduleStage(stage_order=2, day_range_start=8, day_range_end=14,
                      setpoint_target=30.0, heater_zone_limit=32.0),
    ]
    _validate_stages(stages)  # no exception


def test_validate_stages_tolerates_tiny_float_drift():
    # 0.01°C drift is treated as equal (no violation)
    stages = [
        ScheduleStage(stage_order=1, day_range_start=1, day_range_end=7,
                      setpoint_target=30.00, heater_zone_limit=32.0),
        ScheduleStage(stage_order=2, day_range_start=8, day_range_end=14,
                      setpoint_target=30.005, heater_zone_limit=32.0),
    ]
    _validate_stages(stages)  # 0.005 < 0.01 tolerance, no error


# ─── ProfileCreate ──────────────────────────────────────────
def test_profile_create_minimal_required():
    p = ProfileCreate(code="hill_chicken_standard", name="Gà thả vườn tiêu chuẩn")
    assert p.code == "hill_chicken_standard"
    assert p.name == "Gà thả vườn tiêu chuẩn"
    assert p.species is None
    assert p.description is None
    assert p.safety.emergency_cutoff_temp == 35.1
    assert p.is_active is True
    assert p.schedules == []


def test_profile_create_rejects_empty_code():
    with pytest.raises(ValidationError):
        ProfileCreate(code="", name="X")


def test_profile_create_with_nested_schedules():
    p = ProfileCreate(
        code="test", name="Test",
        schedules=[
            ScheduleStage(stage_order=1, day_range_start=1, day_range_end=7,
                          setpoint_target=33.0, heater_zone_limit=35.0),
        ],
    )
    assert len(p.schedules) == 1


# ─── TestApplyRequest ───────────────────────────────────────
def test_test_apply_default_hours():
    t = TestApplyRequest(cycle_id=1)
    assert t.hours == 2  # default 2h
    assert t.note is None


def test_test_apply_accepts_max_hours():
    t = TestApplyRequest(cycle_id=1, hours=168)
    assert t.hours == 168


def test_test_apply_rejects_hours_below_one():
    with pytest.raises(ValidationError):
        TestApplyRequest(cycle_id=1, hours=0)


def test_test_apply_rejects_hours_above_one_week():
    with pytest.raises(ValidationError):
        TestApplyRequest(cycle_id=1, hours=169)


def test_test_apply_rejects_missing_cycle_id():
    with pytest.raises(ValidationError):
        TestApplyRequest(hours=2)  # cycle_id is required


# ─── Router registration ────────────────────────────────────
def test_router_prefix():
    assert router.prefix == "/api/brooder/profiles"


def test_router_routes_registered():
    """All 12 endpoints from the plan must be registered.

    This test fails CI when an endpoint is renamed or removed without
    updating the SPA. Pairs with app.js route registration.

    The router's prefix (`/api/brooder/profiles`) is prepended to each
    declared path, so the actual paths include the prefix.
    """
    prefix = router.prefix
    paths = {(r.path, tuple(sorted(r.methods))) for r in router.routes}
    expected = {
        # 12 endpoints from the plan (full paths including router prefix)
        (f"{prefix}/profiles",                              frozenset({"GET"})),
        (f"{prefix}/profiles",                              frozenset({"POST"})),
        (f"{prefix}/profiles/{{profile_id}}",               frozenset({"GET"})),
        (f"{prefix}/profiles/{{profile_id}}",               frozenset({"PUT"})),
        (f"{prefix}/profiles/{{profile_id}}",               frozenset({"DELETE"})),
        (f"{prefix}/profiles/{{profile_id}}/schedules",     frozenset({"POST"})),
        (f"{prefix}/profiles/{{profile_id}}/schedules/{{stage_id}}", frozenset({"PUT"})),
        (f"{prefix}/profiles/{{profile_id}}/schedules/{{stage_id}}", frozenset({"DELETE"})),
        (f"{prefix}/profiles/{{profile_id}}/stages-resolved",         frozenset({"GET"})),
        (f"{prefix}/profiles/{{profile_id}}/apply-test",              frozenset({"POST"})),
        (f"{prefix}/profiles/test/{{cycle_id}}",                      frozenset({"GET"})),
        (f"{prefix}/profiles/test/{{cycle_id}}",                      frozenset({"DELETE"})),
    }
    actual = {(p, tuple(sorted(m))) for p, m in paths}
    expected_paths = {(p, tuple(sorted(m))) for p, m in expected}
    missing = expected_paths - actual
    assert not missing, (
        f"Missing routes: {missing}\n"
        f"Actual routes: {sorted(actual)}"
    )


def test_router_requires_auth():
    """All routes in this router must require authentication."""
    for r in router.routes:
        # The dependency should include require_auth — verify by checking
        # the route's dependencies list isn't empty.
        assert r.dependencies, (
            f"Route {r.path} has no dependencies — must include require_auth"
        )


# ─── ScheduleUpdate ─────────────────────────────────────────
def test_schedule_update_all_fields_optional():
    s = ScheduleUpdate()
    assert s.stage_order is None
    assert s.setpoint_target is None
    assert s.night_boost_offset is None


def test_schedule_update_partial_fields():
    s = ScheduleUpdate(setpoint_target=30.0, night_boost_offset=0.5)
    assert s.setpoint_target == 30.0
    assert s.night_boost_offset == 0.5
    assert s.stage_order is None


# ─── Constants sanity ───────────────────────────────────────
def test_firmware_constants_consistent():
    """Sanity: the firmware cap (35.1) MUST exceed MAX_SAFE_TEMPERATURE (34.6).
    If someone changes MAX_SAFE_TEMPERATURE without updating the firmware,
    this test fails."""
    assert FIRMWARE_EMERGENCY_LATCH_C == 35.1
    assert MAX_SAFE_TEMPERATURE == 34.6
    assert FIRMWARE_EMERGENCY_LATCH_C > MAX_SAFE_TEMPERATURE


# ─── ProfileUpdate ──────────────────────────────────────────
def test_profile_update_all_optional():
    u = ProfileUpdate()
    assert u.name is None
    assert u.safety is None
    assert u.schedules is None
    assert u.is_active is None


# ─── ScheduleCreate ─────────────────────────────────────────
def test_schedule_create_required_fields():
    """stage_order, day_range_start/end, setpoint, heater_limit are required."""
    with pytest.raises(ValidationError):
        ScheduleCreate()


def test_schedule_create_minimal():
    s = ScheduleCreate(
        stage_order=1, day_range_start=1, day_range_end=7,
        setpoint_target=33.0, heater_zone_limit=35.0,
    )
    assert s.stage_order == 1
    assert s.night_boost_offset == 0.0


# ─── Edge cases (the seed grandfather case) ─────────────────
def test_stage_above_firmware_cap_is_blocked_for_new_edits():
    """The hill_chicken_standard seed has stage_order=1 with
    heater_zone_limit=35.5 (above firmware cap). New edits via the API
    are blocked. This test ensures that invariant holds.

    The seed INSERT bypasses Pydantic validation, but any API-driven
    update must be rejected.
    """
    with pytest.raises(ValidationError):
        ScheduleStage(
            stage_order=1, day_range_start=1, day_range_end=3,
            setpoint_target=33.5, heater_zone_limit=35.5,  # above firmware cap
        )