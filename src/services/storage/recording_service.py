"""Recording Service - Ghi hình camera theo segment."""

import cv2
import os
import subprocess
import shutil
import time
import logging
import threading
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional
from dataclasses import dataclass, field
from src.utils.timezone import now_hcm

logger = logging.getLogger(__name__)

# Default segment duration: 10 minutes
DEFAULT_SEGMENT_DURATION = 600
DEFAULT_RECORDING_DIR = "F:\\Camera"

# Suppress console window allocation when shelling out to ffmpeg.exe (and any
# other console app). Without this, Windows briefly spawns a conhost.exe every
# time we run ffmpeg for faststart remux — visible as a flashing terminal.
# Same fix as scripts/guardian.py and scripts/guardian_watchdog.py.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)


# ── ffmpeg discovery (for faststart remux) ────────────────────────────────
# We prefer the ffmpeg binary bundled with `imageio-ffmpeg` (no system PATH
# dependency, cross-platform). If that isn't installed we fall back to the
# system ffmpeg, then to a no-op.
_FFMPEG_EXE: Optional[str] = None
try:
    import imageio_ffmpeg
    _FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
    if not os.path.exists(_FFMPEG_EXE):
        _FFMPEG_EXE = None
except Exception:
    _FFMPEG_EXE = None

if _FFMPEG_EXE is None:
    _FFMPEG_EXE = shutil.which("ffmpeg")

if _FFMPEG_EXE:
    logger.info(f"RecordingService: faststart remux enabled (ffmpeg={_FFMPEG_EXE})")
else:
    logger.warning(
        "RecordingService: ffmpeg not found (imageio-ffmpeg not installed and "
        "no system ffmpeg on PATH). MP4 faststart remux is DISABLED — browser "
        "playback will require buffering the entire segment before seeking. "
        "Install imageio-ffmpeg to enable."
    )


def _remux_faststart(filepath: str, camera_id: str) -> None:
    """Remux an MP4 to add the faststart flag (move `moov` atom to head).

    Runs in a background daemon thread. Failure is non-fatal — the original
    file is kept intact if anything goes wrong.

    Why this matters: OpenCV's `cv2.VideoWriter` writes `moov` (the MP4
    metadata + sample index) at the END of the file. Browsers need `moov`
    before they can play or seek, so without this remux the user has to wait
    for the whole 10-minute segment to download before the first frame shows.
    `ffmpeg -movflags +faststart` is a stream copy (lossless, ~1s for a 1GB
    file) that just relocates the metadata box.
    """
    if not _FFMPEG_EXE:
        return  # ffmpeg not available — already warned at module load
    try:
        tmp_path = filepath + ".remux.mp4"
        # -c copy: stream copy (no re-encode → lossless, fast)
        # -movflags +faststart: write moov at start of file
        cmd = [
            _FFMPEG_EXE, "-y", "-hide_banner", "-loglevel", "error",
            "-i", filepath,
            "-c", "copy",
            "-movflags", "+faststart",
            tmp_path,
        ]
        result = subprocess.run(cmd, timeout=300, capture_output=True, text=True, creationflags=NO_WINDOW)
        if result.returncode != 0:
            logger.warning(
                f"[{camera_id}] faststart remux failed (rc={result.returncode}): "
                f"{result.stderr.strip()[:200]}"
            )
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            return
        # Atomic replace: only swap the temp file in if it's actually present
        # and non-empty. This guarantees we never leave a half-written file
        # in the recordings directory.
        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
            os.replace(tmp_path, filepath)
            logger.info(f"[{camera_id}] faststart remux OK: {filepath}")
        else:
            logger.warning(f"[{camera_id}] faststart remux produced empty file, keeping original")
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
    except subprocess.TimeoutExpired:
        logger.warning(f"[{camera_id}] faststart remux timed out (>300s) for {filepath}")
    except Exception as e:
        logger.error(f"[{camera_id}] faststart remux error: {e}")


@dataclass
class RecordingStats:
    """Recording statistics per camera."""
    recording: bool = False
    file_path: str = ""
    segment_start: float = 0
    frames_written: int = 0
    total_segments: int = 0
    total_size_mb: float = 0


class CameraRecorder:
    """Handles recording for a single camera."""

    def __init__(self, camera_id: str, base_dir: str, segment_duration: int = DEFAULT_SEGMENT_DURATION):
        self.camera_id = camera_id
        self.base_dir = Path(base_dir)
        self.segment_duration = segment_duration

        self._writer: Optional[cv2.VideoWriter] = None
        self._lock = threading.Lock()
        self._recording = False
        self._segment_start = 0.0
        self._current_file = ""
        self._frame_size = (0, 0)
        self._fps = 15  # Default, updated from stream stats

        self.stats = RecordingStats()

    def start(self):
        """Start recording."""
        self._recording = True
        self.stats.recording = True
        logger.info(f"[{self.camera_id}] Recording started")

    def stop(self):
        """Stop recording."""
        self._recording = False
        self.stats.recording = False
        with self._lock:
            self._close_writer()
        logger.info(f"[{self.camera_id}] Recording stopped")

    def on_frame(self, frame, stats):
        """Frame callback - write frame to video file."""
        if not self._recording:
            return

        with self._lock:
            now = time.time()

            # Check if we need a new segment
            if self._writer is None or (now - self._segment_start >= self.segment_duration):
                self._close_writer()
                self._open_new_segment(frame, stats)

            if self._writer is not None:
                try:
                    # Resize frame if dimensions changed
                    h, w = frame.shape[:2]
                    if (w, h) != self._frame_size:
                        frame = cv2.resize(frame, self._frame_size)
                    self._writer.write(frame)
                    self.stats.frames_written += 1
                except Exception as e:
                    logger.error(f"[{self.camera_id}] Write frame error: {e}")

    def _open_new_segment(self, frame, stats):
        """Open a new video segment file."""
        try:
            # HCM-local so day_dir groups by farm-day, not UTC-day
            now = now_hcm()
            # Directory structure: base_dir/camera_id/YYYY-MM-DD/
            day_dir = self.base_dir / self.camera_id / now.strftime("%Y-%m-%d")
            day_dir.mkdir(parents=True, exist_ok=True)

            # Filename: HH-MM-SS.mp4
            filename = now.strftime("%H-%M-%S") + ".mp4"
            filepath = day_dir / filename

            h, w = frame.shape[:2]
            self._frame_size = (w, h)

            # Use actual FPS from stream stats
            if stats and stats.fps > 0:
                self._fps = min(int(stats.fps), 30)

            # Use mp4v codec for broad compatibility
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self._writer = cv2.VideoWriter(str(filepath), fourcc, self._fps, self._frame_size)

            if not self._writer.isOpened():
                logger.error(f"[{self.camera_id}] Failed to open video writer: {filepath}")
                self._writer = None
                return

            self._segment_start = time.time()
            self._current_file = str(filepath)
            self.stats.file_path = self._current_file
            self.stats.total_segments += 1

            logger.info(f"[{self.camera_id}] New segment: {filepath}")

        except Exception as e:
            logger.error(f"[{self.camera_id}] Open segment error: {e}")
            self._writer = None

    def _close_writer(self):
        """Close current video writer."""
        if self._writer is not None:
            closed_file = self._current_file
            try:
                self._writer.release()
                # Update total size
                if closed_file and os.path.exists(closed_file):
                    size_mb = os.path.getsize(closed_file) / (1024 * 1024)
                    self.stats.total_size_mb += size_mb
            except Exception as e:
                logger.error(f"[{self.camera_id}] Close writer error: {e}")
            finally:
                self._writer = None
                self._current_file = ""

            # Remux the just-closed segment in a background thread so the
            # `moov` atom is moved to the head of the file (faststart).
            # Without this, browsers must download the whole file before they
            # can play or seek — the "khung hình bị nhiễu / đứng hình" symptom.
            if closed_file and os.path.exists(closed_file):
                threading.Thread(
                    target=_remux_faststart,
                    args=(closed_file, self.camera_id),
                    daemon=True,
                    name=f"faststart-{self.camera_id}",
                ).start()


class RecordingService:
    """Manages recording for all cameras."""

    def __init__(self, recording_dir: str = DEFAULT_RECORDING_DIR, segment_duration: int = DEFAULT_SEGMENT_DURATION):
        self.recording_dir = recording_dir
        self.segment_duration = segment_duration
        self._recorders: Dict[str, CameraRecorder] = {}
        self._lock = threading.Lock()

    def update_settings(self, recording_dir: str = None, segment_duration: int = None):
        """Update recording settings."""
        if recording_dir is not None:
            self.recording_dir = recording_dir
        if segment_duration is not None:
            self.segment_duration = segment_duration

    def on_frame(self, camera_id: str, frame, stats):
        """Frame callback from CameraManager."""
        recorder = self._recorders.get(camera_id)
        if recorder and recorder.stats.recording:
            recorder.on_frame(frame, stats)

    def start_recording(self, camera_id: str) -> bool:
        """Start recording for a camera."""
        with self._lock:
            if camera_id not in self._recorders:
                self._recorders[camera_id] = CameraRecorder(
                    camera_id, self.recording_dir, self.segment_duration
                )
            recorder = self._recorders[camera_id]
            if recorder.stats.recording:
                return True  # Already recording
            recorder.start()
            return True

    def stop_recording(self, camera_id: str) -> bool:
        """Stop recording for a camera."""
        recorder = self._recorders.get(camera_id)
        if recorder:
            recorder.stop()
            return True
        return False

    def stop_all(self):
        """Stop all recordings."""
        for recorder in self._recorders.values():
            recorder.stop()

    def is_recording(self, camera_id: str) -> bool:
        """Check if camera is recording."""
        recorder = self._recorders.get(camera_id)
        return recorder.stats.recording if recorder else False

    def get_stats(self, camera_id: str) -> Optional[dict]:
        """Get recording stats for a camera."""
        recorder = self._recorders.get(camera_id)
        if not recorder:
            return {"recording": False, "frames_written": 0, "total_segments": 0, "total_size_mb": 0}
        return {
            "recording": recorder.stats.recording,
            "file_path": recorder.stats.file_path,
            "frames_written": recorder.stats.frames_written,
            "total_segments": recorder.stats.total_segments,
            "total_size_mb": round(recorder.stats.total_size_mb, 2),
        }

    def get_all_stats(self) -> dict:
        """Get recording stats for all cameras."""
        return {cid: self.get_stats(cid) for cid in self._recorders}

    def get_recordings(self, camera_id: str = None, date: str = None) -> list:
        """List recorded files. Optionally filter by camera_id and date."""
        recordings = []
        base = Path(self.recording_dir)

        if not base.exists():
            return recordings

        # Determine which camera dirs to scan
        if camera_id:
            cam_dirs = [base / camera_id] if (base / camera_id).exists() else []
        else:
            cam_dirs = [d for d in base.iterdir() if d.is_dir()]

        for cam_dir in cam_dirs:
            cid = cam_dir.name
            # Determine which date dirs to scan
            if date:
                date_dirs = [cam_dir / date] if (cam_dir / date).exists() else []
            else:
                date_dirs = sorted([d for d in cam_dir.iterdir() if d.is_dir()], reverse=True)

            for date_dir in date_dirs:
                date_str = date_dir.name
                files = sorted(date_dir.glob("*.mp4"), reverse=True)
                for f in files:
                    size_mb = f.stat().st_size / (1024 * 1024)
                    recordings.append({
                        "camera_id": cid,
                        "date": date_str,
                        "time": f.stem.replace("-", ":"),
                        "filename": f.name,
                        "path": str(f),
                        "size_mb": round(size_mb, 2),
                    })

        return recordings

    def get_settings(self) -> dict:
        """Get current recording settings."""
        # Calculate total storage usage
        total_size = 0
        base = Path(self.recording_dir)
        if base.exists():
            for f in base.rglob("*.mp4"):
                total_size += f.stat().st_size

        return {
            "recording_dir": self.recording_dir,
            "segment_duration": self.segment_duration,
            "total_storage_mb": round(total_size / (1024 * 1024), 2),
            "total_storage_gb": round(total_size / (1024 * 1024 * 1024), 2),
        }


# Global instance
recording_service = RecordingService()
