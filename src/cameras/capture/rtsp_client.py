"""RTSP Client - Kết nối và đọc stream từ camera IP với GPU acceleration."""

import cv2
import threading
import time
import logging
from typing import Optional, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Detect CUDA/NVDEC availability
_cuda_available = False
try:
    if cv2.cuda.getCudaEnabledDeviceCount() > 0:
        _cuda_available = True
        logger.info(f"CUDA available: {cv2.cuda.getCudaEnabledDeviceCount()} device(s)")
except AttributeError:
    pass

_cudacodec_available = False
if _cuda_available:
    try:
        # Check if cudacodec module exists (requires opencv-contrib with CUDA)
        _cudacodec_available = hasattr(cv2, 'cudacodec')
        if _cudacodec_available:
            logger.info("NVDEC hardware decoding available via cudacodec")
    except Exception:
        pass

logger.info(f"GPU status: CUDA={_cuda_available}, NVDEC={_cudacodec_available}")


@dataclass
class StreamStats:
    """Stream statistics."""
    fps: float = 0.0
    frame_count: int = 0
    bytes_read: int = 0
    connected: bool = False
    error: Optional[str] = None
    decode_method: str = "cpu"  # "cpu" or "nvdec"
    width: int = 0
    height: int = 0


class RTSPClient:
    """RTSP Client sử dụng OpenCV với GPU acceleration (NVDEC)."""

    def __init__(
        self,
        camera_id: str,
        rtsp_url: str,
        on_frame: Optional[Callable] = None,
        reconnect: bool = True,
        reconnect_interval: int = 5,
        use_gpu: bool = True,
        resize_width: int = 0,
        resize_height: int = 0,
    ):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.on_frame = on_frame
        self.reconnect = reconnect
        self.reconnect_interval = reconnect_interval
        self.use_gpu = use_gpu and _cuda_available
        self.resize_width = resize_width
        self.resize_height = resize_height

        self._cap = None  # cv2.VideoCapture or cv2.cudacodec.VideoReader
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._lock = threading.Lock()
        self._using_nvdec = False

        self.stats = StreamStats()
        self._last_frame_time = time.time()
        self._frame_times: list[float] = []

        # Latest frame cache for snapshot/streaming
        self._latest_frame = None
        self._frame_lock = threading.Lock()

    def connect(self) -> bool:
        """Kết nối đến camera. Ưu tiên NVDEC, fallback CPU."""
        with self._lock:
            self._release_capture()

            # Try NVDEC first
            if self.use_gpu and _cudacodec_available:
                if self._connect_nvdec():
                    return True
                logger.warning(f"NVDEC failed for {self.camera_id}, falling back to CPU")

            # Fallback: CPU decode with optimized settings
            return self._connect_cpu()

    def _connect_nvdec(self) -> bool:
        """Kết nối bằng NVDEC hardware decoder."""
        try:
            logger.info(f"[{self.camera_id}] Connecting via NVDEC: {self.rtsp_url}")
            self._cap = cv2.cudacodec.createVideoReader(self.rtsp_url)

            # Test read
            ret, gpu_frame = self._cap.nextFrame()
            if not ret:
                self._cap = None
                return False

            h, w = gpu_frame.size()[:2] if hasattr(gpu_frame, 'size') else (0, 0)
            logger.info(f"[{self.camera_id}] NVDEC connected: {w}x{h}")

            self._using_nvdec = True
            self.stats.connected = True
            self.stats.error = None
            self.stats.decode_method = "nvdec"
            self.stats.width = w
            self.stats.height = h
            return True

        except Exception as e:
            logger.warning(f"[{self.camera_id}] NVDEC connect error: {e}")
            self._cap = None
            return False

    def _connect_cpu(self) -> bool:
        """Kết nối bằng CPU decode (FFmpeg backend)."""
        try:
            logger.info(f"[{self.camera_id}] Connecting via CPU: {self.rtsp_url}")

            # Suppress noisy FFmpeg swscaler warnings
            import os
            os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")

            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)

            # Optimize buffer to reduce latency
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # Force even dimensions to avoid swscaler "Slice parameters" warnings
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w % 2 != 0 or h % 2 != 0:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, w - (w % 2))
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h - (h % 2))
                logger.info(f"[{self.camera_id}] Adjusted dimensions: {w}x{h} -> {w - (w % 2)}x{h - (h % 2)}")

            if not cap.isOpened():
                self.stats.error = "Failed to open stream"
                self.stats.connected = False
                return False

            self._cap = cap
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)

            logger.info(f"[{self.camera_id}] CPU connected: {w}x{h} @ {fps}fps")

            self._using_nvdec = False
            self.stats.connected = True
            self.stats.error = None
            self.stats.decode_method = "cpu"
            self.stats.width = w
            self.stats.height = h
            return True

        except Exception as e:
            self.stats.error = str(e)
            self.stats.connected = False
            logger.error(f"[{self.camera_id}] CPU connect error: {e}")
            return False

    def _release_capture(self):
        """Release current capture safely."""
        if self._cap is not None:
            try:
                if not self._using_nvdec:
                    self._cap.release()
            except Exception:
                pass
            self._cap = None
            self._using_nvdec = False

    def disconnect(self):
        """Ngắt kết nối."""
        self._running = False

        if self._thread is not None:
            self._thread.join(timeout=3)
            self._thread = None

        with self._lock:
            self._release_capture()

        self.stats.connected = False
        logger.info(f"[{self.camera_id}] Disconnected")

    def start(self):
        """Bắt đầu đọc stream."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"[{self.camera_id}] Stream reader started")

    def _read_loop(self):
        """Loop đọc frames từ stream."""
        consecutive_failures = 0
        max_failures = 30

        while self._running:
            with self._lock:
                cap = self._cap

            if cap is None:
                time.sleep(1)
                continue

            try:
                frame = self._read_frame(cap)

                if frame is None:
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures and self.reconnect:
                        logger.info(f"[{self.camera_id}] Reconnecting after {consecutive_failures} failures...")
                        self.connect()
                        consecutive_failures = 0
                    time.sleep(0.1)
                    continue

                consecutive_failures = 0
                self.stats.frame_count += 1

                # Resize if configured (reduces CPU load for JPEG encode later)
                if self.resize_width > 0 and self.resize_height > 0:
                    frame = self._resize_frame(frame)

                # Update FPS
                self._update_fps()

                # Cache latest frame
                with self._frame_lock:
                    self._latest_frame = frame

                # Fire callback
                if self.on_frame is not None:
                    self.on_frame(frame, self.stats)

            except Exception as e:
                logger.error(f"[{self.camera_id}] Read error: {e}")
                time.sleep(0.1)

    def _read_frame(self, cap):
        """Read a frame - handles both NVDEC and CPU capture."""
        if self._using_nvdec:
            ret, gpu_frame = cap.nextFrame()
            if not ret:
                return None
            # Download from GPU to CPU (numpy array)
            return gpu_frame.download()
        else:
            ret, frame = cap.read()
            return frame if ret else None

    def _resize_frame(self, frame):
        """Resize frame, using CUDA if available."""
        if _cuda_available and self.use_gpu:
            try:
                gpu_frame = cv2.cuda_GpuMat()
                gpu_frame.upload(frame)
                gpu_resized = cv2.cuda.resize(gpu_frame, (self.resize_width, self.resize_height))
                return gpu_resized.download()
            except Exception:
                pass
        return cv2.resize(frame, (self.resize_width, self.resize_height))

    def _update_fps(self):
        """Update FPS calculation."""
        current_time = time.time()
        self._frame_times.append(current_time)
        # Keep only last 1 second of frame times
        cutoff = current_time - 1.0
        self._frame_times = [t for t in self._frame_times if t > cutoff]
        if len(self._frame_times) > 1:
            self.stats.fps = len(self._frame_times) / (current_time - self._frame_times[0])
        self._last_frame_time = current_time

    def get_latest_frame(self):
        """Get the latest cached frame (non-blocking)."""
        with self._frame_lock:
            return self._latest_frame

    def get_frame(self) -> Optional[any]:
        """Lấy một frame (blocking read)."""
        with self._lock:
            cap = self._cap
        if cap is None:
            return None
        return self._read_frame(cap)

    def is_connected(self) -> bool:
        """Kiểm tra trạng thái kết nối."""
        with self._lock:
            if self._cap is None:
                return False
            if self._using_nvdec:
                return self.stats.connected
            return self._cap.isOpened() and self.stats.connected


def test_connection(rtsp_url: str, timeout: int = 5) -> dict:
    """Test kết nối RTSP (ưu tiên NVDEC)."""
    result = {
        "success": False,
        "message": "",
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "decode_method": "cpu"
    }

    # Try NVDEC
    if _cudacodec_available:
        try:
            reader = cv2.cudacodec.createVideoReader(rtsp_url)
            ret, gpu_frame = reader.nextFrame()
            if ret:
                frame = gpu_frame.download()
                h, w = frame.shape[:2]
                result["success"] = True
                result["message"] = "Connected via NVDEC (GPU)"
                result["width"] = w
                result["height"] = h
                result["decode_method"] = "nvdec"
                return result
        except Exception:
            pass

    # Fallback CPU
    try:
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            result["message"] = "Cannot open stream"
            return result

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

        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()

        result["success"] = True
        result["message"] = "Connected via CPU (FFmpeg)"
        result["width"] = w
        result["height"] = h
        result["fps"] = fps
        result["decode_method"] = "cpu"
        return result

    except Exception as e:
        result["message"] = str(e)
        return result
