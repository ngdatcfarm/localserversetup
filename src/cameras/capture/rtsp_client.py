"""RTSP Client - Kết nối và đọc stream từ camera IP."""

import cv2
import threading
import time
import logging
from typing import Optional, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class StreamStats:
    """Stream statistics."""
    fps: float = 0.0
    frame_count: int = 0
    bytes_read: int = 0
    connected: bool = False
    error: Optional[str] = None


class RTSPClient:
    """RTSP Client sử dụng OpenCV."""

    def __init__(
        self,
        camera_id: str,
        rtsp_url: str,
        on_frame: Optional[Callable] = None,
        reconnect: bool = True,
        reconnect_interval: int = 5
    ):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.on_frame = on_frame
        self.reconnect = reconnect
        self.reconnect_interval = reconnect_interval

        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()

        self.stats = StreamStats()
        self._last_frame_time = time.time()
        self._frame_times = []

    def connect(self) -> bool:
        """Kết nối đến camera."""
        with self._lock:
            try:
                # Close existing connection
                if self._cap is not None:
                    self._cap.release()
                    self._cap = None

                logger.info(f"Connecting to {self.rtsp_url}")

                # Open RTSP stream
                self._cap = cv2.VideoCapture(self.rtsp_url)

                if not self._cap.isOpened():
                    self.stats.error = "Failed to open stream"
                    self.stats.connected = False
                    logger.error(f"Failed to connect to {self.rtsp_url}")
                    return False

                # Get stream info
                width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = self._cap.get(cv2.CAP_PROP_FPS)

                logger.info(f"Connected to {self.camera_id}: {width}x{fps}fps")
                self.stats.connected = True
                self.stats.error = None
                return True

            except Exception as e:
                self.stats.error = str(e)
                self.stats.connected = False
                logger.error(f"Error connecting to {self.rtsp_url}: {e}")
                return False

    def disconnect(self):
        """Ngắt kết nối."""
        self._running = False

        with self._lock:
            if self._thread is not None:
                self._thread.join(timeout=2)
                self._thread = None

            if self._cap is not None:
                self._cap.release()
                self._cap = None

        self.stats.connected = False
        logger.info(f"Disconnected from {self.camera_id}")

    def start(self):
        """Bắt đầu đọc stream."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"Started reading stream from {self.camera_id}")

    def _read_loop(self):
        """Loop đọc frames từ stream."""
        consecutive_failures = 0
        max_failures = 30  # About 30 seconds of failures before reconnect

        while self._running:
            with self._lock:
                cap = self._cap

            if cap is None:
                time.sleep(1)
                continue

            try:
                ret, frame = cap.read()

                if not ret:
                    consecutive_failures += 1
                    logger.warning(f"Failed to read frame from {self.camera_id} ({consecutive_failures}/{max_failures})")

                    if consecutive_failures >= max_failures and self.reconnect:
                        logger.info(f"Reconnecting to {self.camera_id}...")
                        self.connect()
                        consecutive_failures = 0

                    time.sleep(0.1)
                    continue

                consecutive_failures = 0
                self.stats.frame_count += 1

                # Calculate FPS
                current_time = time.time()
                self._frame_times.append(current_time)

                # Keep only last 30 frame times for FPS calculation
                self._frame_times = [t for t in self._frame_times if current_time - t < 1.0]

                if len(self._frame_times) > 1:
                    self.stats.fps = len(self._frame_times) / (current_time - self._frame_times[0])

                self._last_frame_time = current_time

                # Call frame callback
                if self.on_frame is not None:
                    self.on_frame(frame, self.stats)

            except Exception as e:
                logger.error(f"Error reading frame from {self.camera_id}: {e}")
                time.sleep(0.1)

    def get_frame(self) -> Optional[tuple]:
        """Lấy một frame (blocking)."""
        with self._lock:
            cap = self._cap

        if cap is None or not cap.isOpened():
            return None

        ret, frame = cap.read()
        if ret:
            return frame
        return None

    def is_connected(self) -> bool:
        """Kiểm tra trạng thái kết nối."""
        with self._lock:
            cap = self._cap

        if cap is None:
            return False

        return cap.isOpened() and self.stats.connected


def test_connection(rtsp_url: str, timeout: int = 5) -> dict:
    """Test kết nối RTSP."""
    result = {
        "success": False,
        "message": "",
        "width": 0,
        "height": 0,
        "fps": 0.0
    }

    try:
        cap = cv2.VideoCapture(rtsp_url)

        if not cap.isOpened():
            result["message"] = "Cannot open stream"
            return result

        # Wait for first frame
        start_time = time.time()
        frame = None

        while time.time() - start_time < timeout:
            ret, frame = cap.read()
            if ret and frame is not None:
                break
            time.sleep(0.1)

        if frame is None:
            result["message"] = "Timeout waiting for frame"
            cap.release()
            return result

        # Get stream info
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        cap.release()

        result["success"] = True
        result["message"] = "Connected successfully"
        result["width"] = width
        result["height"] = height
        result["fps"] = fps
        return result

    except Exception as e:
        result["message"] = str(e)
        return result
