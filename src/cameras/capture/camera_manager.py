"""Camera Manager - Quản lý nhiều camera."""

import logging
from typing import Dict, Optional
from dataclasses import dataclass

from .rtsp_client import RTSPClient, StreamStats, test_connection
from src.models.camera import CameraConfig

logger = logging.getLogger(__name__)


@dataclass
class CameraInfo:
    """Camera runtime info."""
    config: CameraConfig
    client: Optional[RTSPClient] = None
    stats: Optional[StreamStats] = None
    enabled: bool = True


class CameraManager:
    """Quản lý nhiều camera."""

    def __init__(self):
        self._cameras: Dict[str, CameraInfo] = {}

    def add_camera(self, config: CameraConfig) -> bool:
        """Thêm camera và bắt đầu stream."""
        if config.id in self._cameras:
            logger.warning(f"Camera {config.id} already exists")
            return False

        camera_info = CameraInfo(config=config, enabled=config.enabled)
        self._cameras[config.id] = camera_info

        if config.enabled:
            self._start_camera(config.id)

        logger.info(f"Added camera: {config.id}")
        return True

    def remove_camera(self, camera_id: str) -> bool:
        """Xóa camera."""
        if camera_id not in self._cameras:
            return False

        self._stop_camera(camera_id)
        del self._cameras[camera_id]
        logger.info(f"Removed camera: {camera_id}")
        return True

    def get_camera(self, camera_id: str) -> Optional[CameraInfo]:
        """Lấy thông tin camera."""
        return self._cameras.get(camera_id)

    def get_all_cameras(self) -> Dict[str, CameraInfo]:
        """Lấy tất cả camera."""
        return self._cameras

    def start_camera(self, camera_id: str) -> bool:
        """Bắt đầu stream từ camera."""
        return self._start_camera(camera_id)

    def stop_camera(self, camera_id: str) -> bool:
        """Dừng stream từ camera."""
        return self._stop_camera(camera_id)

    def _start_camera(self, camera_id: str) -> bool:
        """Internal: Bắt đầu camera."""
        if camera_id not in self._cameras:
            return False

        camera_info = self._cameras[camera_id]
        config = camera_info.config

        # Create RTSP client
        client = RTSPClient(
            camera_id=camera_id,
            rtsp_url=config.rtsp_url,
            on_frame=lambda frame, stats: self._on_frame(camera_id, frame, stats)
        )

        # Connect
        if not client.connect():
            logger.error(f"Failed to connect to camera {camera_id}")
            camera_info.stats = client.stats
            return False

        # Start reading
        client.start()
        camera_info.client = client
        camera_info.stats = client.stats
        camera_info.enabled = True

        logger.info(f"Started camera: {camera_id}")
        return True

    def _stop_camera(self, camera_id: str) -> bool:
        """Internal: Dừng camera."""
        if camera_id not in self._cameras:
            return False

        camera_info = self._cameras[camera_id]

        if camera_info.client is not None:
            camera_info.client.disconnect()
            camera_info.client = None

        camera_info.enabled = False
        logger.info(f"Stopped camera: {camera_id}")
        return True

    def _on_frame(self, camera_id: str, frame, stats: StreamStats):
        """Callback khi có frame mới."""
        # Store frame for MJPEG streaming if callback is registered
        if hasattr(self, '_external_callback') and self._external_callback:
            try:
                self._external_callback(camera_id, frame, stats)
            except:
                pass

    def set_frame_callback(self, callback):
        """Set callback for frame processing."""
        self._external_callback = callback

    def register_frame_callback(self, callback):
        """Register external frame callback."""
        self._external_callback = callback

    def test_connection(self, camera_id: str) -> dict:
        """Test kết nối camera."""
        if camera_id not in self._cameras:
            return {"success": False, "message": "Camera not found"}

        config = self._cameras[camera_id].config
        return test_connection(config.rtsp_url)

    def get_status(self, camera_id: str) -> Optional[dict]:
        """Lấy trạng thái camera."""
        if camera_id not in self._cameras:
            return None

        camera_info = self._cameras[camera_id]
        stats = camera_info.stats

        if stats is None:
            return {
                "id": camera_id,
                "online": False,
                "enabled": camera_info.enabled,
                "fps": 0,
                "message": "Not started"
            }

        return {
            "id": camera_id,
            "online": stats.connected,
            "enabled": camera_info.enabled,
            "fps": round(stats.fps, 2),
            "frame_count": stats.frame_count,
            "error": stats.error
        }

    def get_all_status(self) -> list:
        """Lấy trạng thái tất cả camera."""
        return [
            self.get_status(camera_id)
            for camera_id in self._cameras.keys()
        ]


# Global camera manager instance
camera_manager = CameraManager()
