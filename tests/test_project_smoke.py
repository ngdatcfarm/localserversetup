import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub cv2 to avoid system-level OpenCV shared library dependency in CI/container.
fake_cv2 = types.SimpleNamespace(
    CAP_FFMPEG=0,
    CAP_PROP_BUFFERSIZE=0,
    CAP_PROP_FRAME_WIDTH=3,
    CAP_PROP_FRAME_HEIGHT=4,
    CAP_PROP_FPS=5,
    cuda=types.SimpleNamespace(getCudaEnabledDeviceCount=lambda: 0),
)
sys.modules.setdefault("cv2", fake_cv2)

from src.models.camera import CameraConfig
from src.services.storage.config_service import ConfigService
from src.cameras.ptz.ptz_controller import PTZController
import importlib
cm = importlib.import_module("src.cameras.capture.camera_manager")


def make_camera(camera_id: str = "cam1") -> CameraConfig:
    return CameraConfig(
        id=camera_id,
        name="Test Cam",
        ip="192.168.1.10",
        port=554,
        username="admin",
        password="pa ss@word",
        rtsp_path="/stream1",
        enabled=True,
        stream_type="main",
    )


def test_camera_config_rtsp_url_encodes_password():
    cam = make_camera()
    assert cam.rtsp_url == "rtsp://admin:pa%20ss%40word@192.168.1.10:554/stream1"


def test_config_service_crud(tmp_path: Path):
    config_path = tmp_path / "cameras.yaml"
    svc = ConfigService(str(config_path))

    cam = make_camera("cam_crud")
    svc.add_camera(cam)
    loaded = svc.get_camera("cam_crud")
    assert loaded is not None
    assert loaded.id == "cam_crud"

    updated = cam.model_copy(update={"name": "Updated name"})
    svc.update_camera(updated)
    assert svc.get_camera("cam_crud").name == "Updated name"

    assert svc.delete_camera("cam_crud") is True
    assert svc.get_camera("cam_crud") is None


def test_ptz_build_payload_shape():
    ctrl = PTZController("192.168.1.20", "u", "p")
    payload = ctrl._build_payload(cmd=1026, speed=4)
    assert payload["PTZCmd"] == 1026
    assert payload["Para1"] == 4
    assert payload["Para2"] == 4


class _FakeClient:
    def __init__(self, *args, **kwargs):
        self.stats = type("Stats", (), {
            "connected": True,
            "fps": 12.3,
            "frame_count": 42,
            "decode_method": "cpu",
            "width": 1920,
            "height": 1080,
            "error": None,
        })()

    def connect(self):
        return True

    def start(self):
        return None

    def disconnect(self):
        return None


def test_camera_manager_add_start_status_remove(monkeypatch):
    monkeypatch.setattr(cm, "RTSPClient", _FakeClient)

    manager = cm.CameraManager()
    cam = make_camera("cam_mgr")

    assert manager.add_camera(cam) is True

    status = manager.get_status("cam_mgr")
    assert status["id"] == "cam_mgr"
    assert status["online"] is True
    assert status["resolution"] == "1920x1080"

    assert manager.remove_camera("cam_mgr") is True
    assert manager.get_camera("cam_mgr") is None


def test_sync_check_endpoint_shape(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    import importlib

    sync_route = importlib.import_module("src.server.routes.sync")

    fake_cfg = SimpleNamespace(
        config_path=Path("config/cameras.yaml"),
        get_cameras=lambda: [make_camera("cam_a"), make_camera("cam_b")],
    )
    fake_mgr = SimpleNamespace(get_all_cameras=lambda: {"cam_a": object()})

    monkeypatch.setattr(sync_route, "config_service", fake_cfg)
    monkeypatch.setattr(sync_route, "camera_manager", fake_mgr)

    result = asyncio.run(sync_route.sync_check())

    assert result["ok"] is True
    assert result["database"]["type"] == "yaml"
    assert result["counts"]["configured_cameras"] == 2
    assert result["counts"]["runtime_cameras"] == 1
    assert result["camera_ids"]["configured"] == ["cam_a", "cam_b"]


def test_no_git_conflict_markers_in_source_tree():
    root = Path(__file__).resolve().parents[1]
    scanned = 0
    for pattern in ("src/**/*.py", "src/**/*.html"):
        for file_path in root.glob(pattern):
            scanned += 1
            content = file_path.read_text(encoding="utf-8")
            assert "<<<<<<<" not in content, f"Conflict marker found in {file_path}"
            assert ">>>>>>>" not in content, f"Conflict marker found in {file_path}"
            assert "\n=======\n" not in content, f"Conflict marker separator found in {file_path}"


# ── Care Calendar Heatmap smoke tests ─────────────────
# Mock the database + care_service so we can test the route handlers
# directly without a real DB or auth session.
import asyncio as _asyncio
from types import SimpleNamespace as _SimpleNamespace
import importlib as _importlib

_farm_route = _importlib.import_module("src.server.routes.farm")


def test_care_calendar_route_default_month(monkeypatch):
    """GET /api/farm/care/calendar?cycle_id=1 returns dict with cycle_start, today_hcm, days."""
    fake_days = [
        {"date": "2026-09-01", "has_feed_sang": True, "has_feed_chieu": False,
         "has_med_sang": True, "has_med_chieu": False, "has_mixed_med": False,
         "mixed_med_count": 0, "death_count": 0, "water_liters": None, "in_range": True},
        {"date": "2026-09-02", "has_feed_sang": False, "has_feed_chieu": False,
         "has_med_sang": False, "has_med_chieu": False, "has_mixed_med": False,
         "mixed_med_count": 0, "death_count": 0, "water_liters": None, "in_range": True},
    ]
    fake_meta = {"cycle_start": "2026-08-25", "cycle_end": None, "today_hcm": "2026-09-08"}

    async def _fake_get_calendar(cycle_id, month):
        return {"cycle_id": cycle_id, **fake_meta, "days": fake_days}

    async def _fake_fetchrow(query, *args):
        # Return cycle row for the existence check
        return _SimpleNamespace(id=args[0] if args else 1)

    monkeypatch.setattr(_farm_route.care_service, "get_calendar", _fake_get_calendar)
    monkeypatch.setattr(_farm_route.db, "fetchrow", _fake_fetchrow)

    result = _asyncio.run(_farm_route.get_care_calendar(cycle_id=1, month="2026-09-01"))

    assert result["cycle_id"] == 1
    assert result["cycle_start"] == "2026-08-25"
    assert result["today_hcm"] == "2026-09-08"
    assert isinstance(result["days"], list)
    assert len(result["days"]) == 2
    assert result["days"][0]["date"] == "2026-09-01"
    assert result["days"][0]["in_range"] is True


def test_care_calendar_route_invalid_month(monkeypatch):
    """Bad month format raises HTTPException 400."""
    from fastapi import HTTPException

    async def _fake_fetchrow(query, *args):
        return _SimpleNamespace(id=args[0] if args else 1)

    monkeypatch.setattr(_farm_route.db, "fetchrow", _fake_fetchrow)

    raised = None
    try:
        _asyncio.run(_farm_route.get_care_calendar(cycle_id=1, month="not-a-date"))
    except HTTPException as e:
        raised = e
    assert raised is not None
    assert raised.status_code == 400


def test_care_day_route_returns_bucketed_lists(monkeypatch):
    """GET /api/farm/care/day returns sang/chieu buckets for each care type."""
    fake_detail = {
        "date": "2026-09-08",
        "feeds_sang": [{"id": 1, "meal": "sang", "product_name": "Cám 311", "quantity": 12.5, "notes": None}],
        "feeds_chieu": [],
        "meds_sang": [{"id": 10, "shift": "sang", "method": "feed", "med_type": "vaccine",
                       "custom_name": "Newcastle", "quantity": 5, "unit": "ml",
                       "notes": None, "purpose": "phòng bệnh", "product_name": None}],
        "meds_chieu": [],
        "mixed_med_sang": [{"id": 10, "shift": "sang", "method": "feed", "med_type": "vaccine",
                            "custom_name": "Newcastle", "quantity": 5, "unit": "ml",
                            "notes": None, "purpose": "phòng bệnh", "product_name": None}],
        "mixed_med_chieu": [],
        "deaths": [],
        "water_sang": [{"id": 20, "shift": "sang", "consumption_liters": 8.0, "medicated": False, "notes": None}],
        "water_chieu": [],
    }

    async def _fake_get_day_detail(cycle_id, date_iso):
        return fake_detail

    async def _fake_fetchrow(query, *args):
        return _SimpleNamespace(id=args[0] if args else 1)

    monkeypatch.setattr(_farm_route.care_service, "get_day_detail", _fake_get_day_detail)
    monkeypatch.setattr(_farm_route.db, "fetchrow", _fake_fetchrow)

    result = _asyncio.run(_farm_route.get_care_day_detail(cycle_id=11, date="2026-09-08"))

    assert result["date"] == "2026-09-08"
    assert len(result["feeds_sang"]) == 1
    assert result["feeds_sang"][0]["product_name"] == "Cám 311"
    assert len(result["mixed_med_sang"]) == 1
    assert result["mixed_med_sang"][0]["custom_name"] == "Newcastle"
    assert len(result["deaths"]) == 0
    assert len(result["water_sang"]) == 1


def test_care_day_route_invalid_date(monkeypatch):
    """Bad date format raises HTTPException 400."""
    from fastapi import HTTPException

    async def _fake_fetchrow(query, *args):
        return _SimpleNamespace(id=args[0] if args else 1)

    monkeypatch.setattr(_farm_route.db, "fetchrow", _fake_fetchrow)

    raised = None
    try:
        _asyncio.run(_farm_route.get_care_day_detail(cycle_id=11, date="2026/09/08"))
    except HTTPException as e:
        raised = e
    assert raised is not None
    assert raised.status_code == 400


# ── /api/farm/medication-aliases/resolve (Layer 1) ──────────────────

_ma_route = _importlib.import_module("src.server.routes.medication_aliases")


def test_medication_resolve_exact_alias(monkeypatch):
    """POST /medication-aliases/resolve with an approved alias returns exact match."""
    async def _fake_fetchrow(query, *args):
        return {
            "canonical_medication_id": 5,
            "canonical_name": "Vitamin C",
            "unit": "g",
            "category": "vitamin",
        }

    async def _fake_fetch(query, *args):
        return []  # empty catalog — only alias exact match returned

    monkeypatch.setattr(_ma_route.db, "fetchrow", _fake_fetchrow)
    monkeypatch.setattr(_ma_route.db, "fetch", _fake_fetch)

    result = _asyncio.run(_ma_route.resolve_medication_name(
        _SimpleNamespace(text="vit c 500mg", limit=3)
    ))
    assert result["exact"]["canonical_name"] == "Vitamin C"
    assert result["exact"]["medication_id"] == 5
    assert result["exact"]["unit"] == "g"
    assert result["exact"]["category"] == "vitamin"  # used by frontend auto-fill
    assert result["suggestions"] == []


def test_medication_resolve_levenshtein(monkeypatch):
    """Typo within 2 chars → catalog fuzzy match in suggestions."""
    async def _fake_fetchrow(query, *args):
        return None  # no alias

    async def _fake_fetch(query, *args):
        return [{
            "id": 10, "name": "Amoxicillin", "unit": "g", "category": "antibiotic",
        }]

    monkeypatch.setattr(_ma_route.db, "fetchrow", _fake_fetchrow)
    monkeypatch.setattr(_ma_route.db, "fetch", _fake_fetch)

    result = _asyncio.run(_ma_route.resolve_medication_name(
        _SimpleNamespace(text="Amoxicilin", limit=3)  # 1 char off
    ))
    assert result["exact"] is None
    assert any(s["canonical_name"] == "Amoxicillin" for s in result["suggestions"])
    # Score: d=1 → 1.0 - 0.25 = 0.75
    sugg = next(s for s in result["suggestions"] if s["canonical_name"] == "Amoxicillin")
    assert sugg["score"] == 0.75
    assert sugg["reason"] == "fuzzy"


def test_medication_resolve_too_short(monkeypatch):
    """text < 3 chars → empty result, no DB hit."""
    called = {"n": 0}

    async def _count(*a, **kw):
        called["n"] += 1
        return []

    monkeypatch.setattr(_ma_route.db, "fetchrow", _count)
    monkeypatch.setattr(_ma_route.db, "fetch", _count)

    result = _asyncio.run(_ma_route.resolve_medication_name(
        _SimpleNamespace(text="ab", limit=3)
    ))
    assert result == {"exact": None, "suggestions": []}
    assert called["n"] == 0  # DB never touched


# ── /api/farm/medication-aliases/auto-suggest-catalog ───────────────


def test_auto_suggest_catalog_excludes_aliased_and_catalog(monkeypatch):
    """Repeated free-text names not in catalog / not aliased → returned as suggestions."""
    from datetime import date as _date

    calls = {"fetch_seq": 0}

    async def _fake_fetch(query, *args):
        calls["fetch_seq"] += 1
        seq = calls["fetch_seq"]
        if seq == 1:  # distinct custom_name aggregation
            return [
                {"custom_name": "Vitamin C", "usage_count": 5,
                 "first_used": _date(2026, 1, 1), "last_used": _date(2026, 9, 1),
                 "unit": "g", "category": "vitamin"},
                {"custom_name": "Vitamiin C", "usage_count": 3,
                 "first_used": _date(2026, 1, 2), "last_used": _date(2026, 8, 25),
                 "unit": "g", "category": "vitamin"},
            ]
        if seq == 2:  # catalog fetch
            return [{"id": 99, "name": "Amoxicillin"}]
        if seq == 3:  # aliases fetch
            return [{"alias_name": "metronidazol"}]
        # variants fetch — return only the variant matching the input arg
        input_name = args[0] if args else ""
        if input_name.strip().lower() == "vitamin c":
            return [{"custom_name": "Vitamin C"}]
        return [{"custom_name": "Vitamiin C"}]

    monkeypatch.setattr(_ma_route.db, "fetch", _fake_fetch)

    result = _asyncio.run(_ma_route.auto_suggest_catalog(min_usage=2, limit=10))
    assert "suggestions" in result
    # "Vitamin C" and "Vitamiin C" normalize to different strings → 2 distinct suggestions
    assert len(result["suggestions"]) == 2
    sugg0 = result["suggestions"][0]
    # Highest usage first ("Vitamin C" with 5)
    assert sugg0["canonical_name"] == "Vitamin C"
    assert sugg0["usage_count"] == 5
    assert sugg0["unit"] == "g"
    assert sugg0["category"] == "vitamin"
    assert sugg0["variants"] == ["Vitamin C"]
    sugg1 = result["suggestions"][1]
    assert sugg1["canonical_name"] == "Vitamiin C"
    assert sugg1["usage_count"] == 3


def test_auto_suggest_catalog_empty(monkeypatch):
    """No repeated free-text → empty suggestions."""
    async def _empty(*a, **kw):
        return []

    monkeypatch.setattr(_ma_route.db, "fetch", _empty)
    monkeypatch.setattr(_ma_route.db, "fetchrow", _empty)

    result = _asyncio.run(_ma_route.auto_suggest_catalog(min_usage=2, limit=10))
    assert result["suggestions"] == []
    assert "Chưa có" in result["message"]


# ── /api/farm/medication-aliases/create-from-freetext ──────────────


def test_create_from_freetext_happy_path(monkeypatch):
    """Create medication + aliases + backfill in one transaction."""
    async def _fake_fetchval(query, *args):
        return None  # no name conflict

    class _FakeRecord(dict):
        """asyncpg.Record-compatible: both dict and attribute access."""
        def __getattr__(self, key):
            try:
                return self[key]
            except KeyError:
                raise AttributeError(key)

    class _FakeConn:
        """Fake asyncpg connection with fetchrow/execute methods."""
        async def fetchrow(self, query, *args):
            return _FakeRecord(id=42)

        async def execute(self, query, *args):
            return "UPDATE 5"

    class _FakeTxCM:
        """Async context manager for db.transaction()."""
        async def __aenter__(self):
            return _FakeConn()
        async def __aexit__(self, *args):
            return False

    def _fake_transaction():
        return _FakeTxCM()

    monkeypatch.setattr(_ma_route.db, "transaction", _fake_transaction)
    monkeypatch.setattr(_ma_route.db, "fetchval", _fake_fetchval)

    fake_user = {"id": 1}
    req = _SimpleNamespace(
        canonical_name="Vitamin C",
        unit="g",
        category="vitamin",
        variants=["Vitamiin C", "vit c 500mg"],
        update_existing=True,
    )
    result = _asyncio.run(_ma_route.create_from_freetext(req, user=fake_user))
    assert result["ok"] is True
    assert result["medication_id"] == 42
    assert result["canonical_name"] == "Vitamin C"
    # 1 canonical + 2 variants = 3 aliases
    assert result["aliases_created"] == 3
    # 3 backfill updates × 5 rows = 15
    assert result["rows_updated"] == 15


def test_create_from_freetext_duplicate_name(monkeypatch):
    """Existing catalog name → reject with ok=False."""
    async def _fake_fetchval(query, *args):
        return 99  # existing medication id

    monkeypatch.setattr(_ma_route.db, "fetchval", _fake_fetchval)

    req = _SimpleNamespace(
        canonical_name="Vitamin C", unit="g", category="vitamin",
        variants=[], update_existing=True,
    )
    result = _asyncio.run(_ma_route.create_from_freetext(req, user={"id": 1}))
    assert result["ok"] is False
    assert "đã có" in result["message"]


def test_create_from_freetext_empty_name(monkeypatch):
    """Empty canonical_name → reject before any DB call."""
    called = {"n": 0}

    async def _count(*a, **kw):
        called["n"] += 1
        return None

    monkeypatch.setattr(_ma_route.db, "fetchval", _count)

    req = _SimpleNamespace(
        canonical_name="   ", unit=None, category=None,
        variants=[], update_existing=True,
    )
    result = _asyncio.run(_ma_route.create_from_freetext(req, user={"id": 1}))
    assert result["ok"] is False
    assert "bắt buộc" in result["message"]
    assert called["n"] == 0  # DB never touched
