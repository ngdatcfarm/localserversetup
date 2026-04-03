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
<<<<<<< ours
=======


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
>>>>>>> theirs
