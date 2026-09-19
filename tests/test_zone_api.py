"""
Tests for the zone API surface.

We focus on what's testable without a live database:
  1. Pydantic schema validation (the wire contract for POST/PUT payloads)
  2. Route registration (paths + methods + handler names) so a renamed
     endpoint fails CI before it ships.

The full CRUD roundtrip needs a live TimescaleDB + MQTT broker and is
covered by manual smoke tests in docs/ and the verification plan in
the implementation plan.
"""

import sys
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

import pytest  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from src.server.routes.brooder import (  # noqa: E402
    ZoneCreate, ZoneUpdate, HeaterCreate, HeaterUpdate,
    ZoneSensorAttach, ZoneSensorPatch, MemberAttach,
    SetpointSet, FallbackDeltaSet,
)


# ─── ZoneCreate ────────────────────────────────────────────────
def test_zone_create_minimal_required_field():
    z = ZoneCreate(name="Zone A")
    assert z.barn_id is None
    assert z.name == "Zone A"
    assert z.manual_setpoint is None
    assert z.fallback_delta_c == 0.0
    assert z.max_total_w is None
    assert z.enabled is True
    assert z.notes is None


def test_zone_create_full_payload():
    z = ZoneCreate(
        barn_id="barn-04", name="Trại 4 - Zone A",
        manual_setpoint=33.5, fallback_delta_c=1.5,
        max_total_w=6000.0, enabled=True, notes="Day-old chicks",
    )
    assert z.barn_id == "barn-04"
    assert z.manual_setpoint == 33.5


def test_zone_create_rejects_empty_name():
    with pytest.raises(ValidationError) as exc:
        ZoneCreate(name="")
    assert "name" in str(exc.value)


def test_zone_create_rejects_oversized_name():
    with pytest.raises(ValidationError):
        ZoneCreate(name="x" * 101)


def test_zone_create_rejects_setpoint_out_of_range():
    # 45°C is the absolute hardware thermostat cap; below 0 is impossible
    with pytest.raises(ValidationError):
        ZoneCreate(name="Z", manual_setpoint=46.0)
    with pytest.raises(ValidationError):
        ZoneCreate(name="Z", manual_setpoint=-1.0)


def test_zone_create_rejects_fallback_delta_out_of_range():
    with pytest.raises(ValidationError):
        ZoneCreate(name="Z", fallback_delta_c=6.0)
    with pytest.raises(ValidationError):
        ZoneCreate(name="Z", fallback_delta_c=-6.0)


def test_zone_create_accepts_boundary_values():
    # Boundary checks — ge/le should accept the exact bounds.
    ZoneCreate(name="Z", manual_setpoint=0.0)
    ZoneCreate(name="Z", manual_setpoint=45.0)
    ZoneCreate(name="Z", fallback_delta_c=-5.0)
    ZoneCreate(name="Z", fallback_delta_c=5.0)


# ─── ZoneUpdate ────────────────────────────────────────────────
def test_zone_update_all_fields_optional():
    z = ZoneUpdate()
    assert z.name is None
    assert z.manual_setpoint is None
    assert z.fallback_delta_c is None
    assert z.max_total_w is None
    assert z.enabled is None
    assert z.is_active is None
    assert z.notes is None


def test_zone_update_partial():
    z = ZoneUpdate(name="New name", enabled=False)
    assert z.name == "New name"
    assert z.enabled is False
    # Unset fields stay None
    assert z.manual_setpoint is None


def test_zone_update_validates_ranges_when_present():
    # Note: ZoneUpdate.manual_setpoint is intentionally unconstrained
    # (None means "clear override" — back to day-age auto).
    # Only fallback_delta_c carries a range guard.
    with pytest.raises(ValidationError):
        ZoneUpdate(fallback_delta_c=10.0)  # > 5
    with pytest.raises(ValidationError):
        ZoneUpdate(fallback_delta_c=-10.0)  # < -5


def test_zone_update_clear_manual_setpoint_with_none():
    """Pydantic distinguishes 'omit' (None field) from 'set to None' — but
    manual_setpoint is Optional[float] with no validator, so passing
    None explicitly is allowed. The route handler interprets None as
    'clear override' (back to day-age auto)."""
    z = ZoneUpdate(manual_setpoint=None)
    assert z.manual_setpoint is None


# ─── HeaterCreate ──────────────────────────────────────────────
def test_heater_create_channel_must_be_1_or_2():
    h = HeaterCreate(device_code="esp-brooder-01", channel=1)
    assert h.channel == 1
    h2 = HeaterCreate(device_code="esp-brooder-01", channel=2)
    assert h2.channel == 2
    with pytest.raises(ValidationError):
        HeaterCreate(device_code="esp", channel=0)
    with pytest.raises(ValidationError):
        HeaterCreate(device_code="esp", channel=3)


def test_heater_create_default_max_power():
    h = HeaterCreate(device_code="esp", channel=1)
    assert h.max_power_w == 1500.0
    assert h.enabled is True
    assert h.label is None


def test_heater_create_rejects_zero_or_negative_wattage():
    with pytest.raises(ValidationError):
        HeaterCreate(device_code="esp", channel=1, max_power_w=0)
    with pytest.raises(ValidationError):
        HeaterCreate(device_code="esp", channel=1, max_power_w=-100)


def test_heater_create_rejects_oversized_wattage():
    # 10000W is the documented hard cap (industrial heaters go higher
    # but we don't have that hardware)
    with pytest.raises(ValidationError):
        HeaterCreate(device_code="esp", channel=1, max_power_w=10001.0)


def test_heater_create_accepts_boundary_wattage():
    HeaterCreate(device_code="esp", channel=1, max_power_w=10000.0)


# ─── HeaterUpdate ──────────────────────────────────────────────
def test_heater_update_all_optional():
    u = HeaterUpdate()
    assert u.label is None
    assert u.max_power_w is None
    assert u.enabled is None


def test_heater_update_partial():
    u = HeaterUpdate(label="Chảo chính", enabled=False)
    assert u.label == "Chảo chính"
    assert u.enabled is False


def test_heater_update_max_power_must_be_positive():
    with pytest.raises(ValidationError):
        HeaterUpdate(max_power_w=0)


# ─── ZoneSensorAttach / Patch ──────────────────────────────────
def test_zone_sensor_attach_weight_default():
    s = ZoneSensorAttach(sensor_device_code="sensor-01")
    assert s.weight == 1.0
    assert s.label is None


def test_zone_sensor_attach_weight_range():
    # ge=0 (operator can disable by setting 0), le=10
    ZoneSensorAttach(sensor_device_code="s", weight=0.0)
    ZoneSensorAttach(sensor_device_code="s", weight=10.0)
    with pytest.raises(ValidationError):
        ZoneSensorAttach(sensor_device_code="s", weight=-1.0)
    with pytest.raises(ValidationError):
        ZoneSensorAttach(sensor_device_code="s", weight=11.0)


def test_zone_sensor_patch_all_optional():
    p = ZoneSensorPatch()
    assert p.weight is None
    assert p.label is None


# ─── MemberAttach ──────────────────────────────────────────────
def test_member_attach_role_default():
    m = MemberAttach(device_code="esp-brooder-01")
    assert m.role == "member"


def test_member_attach_role_must_be_member_or_lead():
    MemberAttach(device_code="esp", role="member")
    MemberAttach(device_code="esp", role="lead")
    with pytest.raises(ValidationError):
        MemberAttach(device_code="esp", role="primary")  # not in pattern


def test_member_attach_device_code_required():
    with pytest.raises(ValidationError):
        MemberAttach()


# ─── SetpointSet / FallbackDeltaSet (shared with legacy) ───────
def test_setpoint_set_accepts_null_to_clear_override():
    s = SetpointSet(setpoint=None, note="clearing manual override")
    assert s.setpoint is None


def test_setpoint_set_validates_range():
    SetpointSet(setpoint=30.0)
    SetpointSet(setpoint=0.0)
    SetpointSet(setpoint=45.0)
    with pytest.raises(ValidationError):
        SetpointSet(setpoint=46.0)
    with pytest.raises(ValidationError):
        SetpointSet(setpoint=-0.1)


def test_fallback_delta_set_required_field():
    with pytest.raises(ValidationError):
        FallbackDeltaSet()
    f = FallbackDeltaSet(fallback_delta_c=1.5)
    assert f.fallback_delta_c == 1.5


def test_fallback_delta_set_range():
    FallbackDeltaSet(fallback_delta_c=-5.0)
    FallbackDeltaSet(fallback_delta_c=5.0)
    with pytest.raises(ValidationError):
        FallbackDeltaSet(fallback_delta_c=6.0)


# ─── Route registration ────────────────────────────────────────
def _get_brooder_routes():
    """Return list of (method, path, handler_name) for brooder router.

    The router is mounted under /api/brooder in main.py; we strip that
    prefix here so the assertions stay readable and decoupled from the
    mount path.
    """
    from src.server.routes.brooder import router
    PREFIX = "/api/brooder"
    out = []
    for r in router.routes:
        methods = sorted(r.methods - {"HEAD"})
        for m in methods:
            path = r.path
            if path.startswith(PREFIX):
                path = path[len(PREFIX):]
            out.append((m, path, r.name))
    return out


def test_all_zone_routes_registered():
    """If a route gets renamed or removed, the frontend's API namespace
    breaks — fail CI here, not at runtime in the browser."""
    expected = {
        ("GET",   "/zones"),
        ("GET",   "/zones/{zone_id}"),
        ("POST",  "/zones"),
        ("PUT",   "/zones/{zone_id}"),
        ("DELETE", "/zones/{zone_id}"),
        ("GET",   "/zones/{zone_id}/heaters"),
        ("POST",  "/zones/{zone_id}/heaters"),
        ("GET",   "/zones/{zone_id}/heaters/power"),
        ("PUT",   "/heaters/{heater_id}"),
        ("DELETE", "/heaters/{heater_id}"),
        ("GET",   "/zones/{zone_id}/sensors"),
        ("POST",  "/zones/{zone_id}/sensors"),
        ("PUT",   "/zones/{zone_id}/sensors/{sensor_code}"),
        ("DELETE", "/zones/{zone_id}/sensors/{sensor_code}"),
        ("GET",   "/zones/{zone_id}/members"),
        ("POST",  "/zones/{zone_id}/members"),
        ("DELETE", "/zones/{zone_id}/members/{device_code}"),
        ("GET",   "/zones/{zone_id}/members/available"),
        ("POST",  "/zones/{zone_id}/setpoint"),
        ("POST",  "/zones/{zone_id}/fallback-delta"),
        ("GET",   "/zones/{zone_id}/setpoint-history"),
        ("GET",   "/zones/{zone_id}/telemetry"),
    }
    actual = {(m, p) for (m, p, _name) in _get_brooder_routes()}
    missing = expected - actual
    assert not missing, f"Missing zone routes: {missing}"


def test_legacy_node_routes_still_present():
    """Backward compat — the legacy /nodes/{code}/... routes must remain
    registered. The frontend legacy page depends on them and the
    delegation guards in routes/brooder.py depend on them."""
    legacy = {
        ("GET",   "/nodes"),
        ("GET",   "/nodes/{code}"),
        ("POST",  "/nodes"),
        ("PUT",   "/nodes/{code}"),
        ("DELETE", "/nodes/{code}"),
        ("POST",  "/nodes/{code}/setpoint"),
        ("POST",  "/nodes/{code}/fallback-delta"),
        ("GET",   "/nodes/{code}/telemetry"),
        ("GET",   "/nodes/{code}/setpoint-history"),
        ("GET",   "/nodes/{code}/zone-sensors"),
        ("POST",  "/nodes/{code}/zone-sensors"),
        ("PUT",   "/nodes/{code}/zone-sensors/{sensor_code}"),
        ("DELETE", "/nodes/{code}/zone-sensors/{sensor_code}"),
        ("GET",   "/zone-sensors/available"),
    }
    actual = {(m, p) for (m, p, _name) in _get_brooder_routes()}
    missing = legacy - actual
    assert not missing, f"Missing legacy routes: {missing}"
