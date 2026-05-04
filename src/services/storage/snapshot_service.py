"""Snapshot Service - Burst capture, storage, and auto-cleanup."""

import asyncio
import cv2
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Optional

from src.cameras.capture.camera_manager import camera_manager
from src.services.storage.config_service import ConfigService

logger = logging.getLogger(__name__)

# Default snapshot storage - E:\AI\Snapshots
DEFAULT_SNAPSHOT_DIR = "E:\\AI\\Snapshots"
DEFAULT_RETENTION_DAYS = 7


class SnapshotService:
    """Handles burst snapshot capture with auto-cleanup."""

    def __init__(self, snapshot_dir: str = DEFAULT_SNAPSHOT_DIR, retention_days: int = DEFAULT_RETENTION_DAYS):
        self.snapshot_dir = Path(snapshot_dir)
        self.retention_days = retention_days
        self.config_service = ConfigService()

    def update_settings(self, snapshot_dir: str = None, retention_days: int = None):
        """Update snapshot settings."""
        if snapshot_dir:
            self.snapshot_dir = Path(snapshot_dir)
        if retention_days is not None:
            self.retention_days = retention_days

    def _get_camera_info(self, camera_id: str):
        """Get camera info from camera manager."""
        return camera_manager.get_camera(camera_id)

    def capture_single(self, camera_id: str) -> Optional[bytes]:
        """Capture a single frame as JPEG bytes."""
        cam = self._get_camera_info(camera_id)
        if not cam or not cam.client:
            logger.error(f"[{camera_id}] Camera not available for snapshot")
            return None

        raw_frame = cam.client.get_latest_frame()
        if raw_frame is None:
            logger.error(f"[{camera_id}] No frame available")
            return None

        # Encode to JPEG
        encode_ok, jpeg_buf = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not encode_ok:
            return None

        return jpeg_buf.tobytes()

    async def capture_burst(
        self,
        camera_id: str,
        count: int = 5,
        interval_sec: float = 0.5,
        prefix: str = None
    ) -> list[dict]:
        """
        Capture multiple frames (burst) at intervals.

        Returns list of {path, success, filename} for each capture.
        """
        cam = self._get_camera_info(camera_id)
        if not cam or not cam.client:
            logger.error(f"[{camera_id}] Camera not available for burst")
            return []

        now = datetime.now()
        prefix = prefix or now.strftime("%H-%M-%S")
        day_str = now.strftime("%Y-%m-%d")

        # Ensure directory exists: snapshot_dir/camera_id/YYYY-MM-DD/
        save_dir = self.snapshot_dir / camera_id / day_str
        save_dir.mkdir(parents=True, exist_ok=True)

        results = []
        for i in range(count):
            raw_frame = cam.client.get_latest_frame()
            if raw_frame is None:
                results.append({
                    "index": i,
                    "success": False,
                    "message": "No frame",
                    "path": None,
                    "filename": None,
                })
                if i < count - 1:
                    await asyncio.sleep(interval_sec)
                continue

            # Encode to JPEG
            encode_ok, jpeg_buf = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not encode_ok:
                results.append({
                    "index": i,
                    "success": False,
                    "message": "Encode failed",
                    "path": None,
                    "filename": None,
                })
                if i < count - 1:
                    await asyncio.sleep(interval_sec)
                continue

            # Save to disk
            filename = f"{prefix}_{i+1}.jpg"
            filepath = save_dir / filename

            try:
                filepath.write_bytes(jpeg_buf.tobytes())
                results.append({
                    "index": i,
                    "success": True,
                    "path": str(filepath),
                    "filename": filename,
                    "size_bytes": len(jpeg_buf.tobytes()),
                })
                logger.info(f"[{camera_id}] Snapshot {i+1}/{count} saved: {filename}")
            except Exception as e:
                logger.error(f"[{camera_id}] Snapshot save error: {e}")
                results.append({
                    "index": i,
                    "success": False,
                    "message": str(e),
                    "path": None,
                    "filename": filename,
                })

            # Wait before next capture (except for last frame)
            if i < count - 1 and interval_sec > 0:
                await asyncio.sleep(interval_sec)

        return results

    def capture_single_sync(self, camera_id: str) -> Optional[str]:
        """Capture single frame synchronously (non-async)."""
        jpeg_bytes = self.capture_single(camera_id)
        if not jpeg_bytes:
            return None

        now = datetime.now()
        day_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")

        save_dir = self.snapshot_dir / camera_id / day_str
        save_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{time_str}.jpg"
        filepath = save_dir / filename

        try:
            filepath.write_bytes(jpeg_bytes)
            return str(filepath)
        except Exception as e:
            logger.error(f"[{camera_id}] Snapshot save error: {e}")
            return None

    def cleanup_old(self) -> dict:
        """Delete snapshots older than retention_days."""
        if not self.snapshot_dir.exists():
            return {"deleted": 0, "errors": 0}

        cutoff = datetime.now().timestamp() - (self.retention_days * 86400)
        deleted = 0
        errors = 0

        for filepath in self.snapshot_dir.rglob("*.jpg"):
            try:
                if filepath.stat().st_mtime < cutoff:
                    filepath.unlink()
                    deleted += 1
            except Exception as e:
                logger.error(f"Cleanup error for {filepath}: {e}")
                errors += 1

        if deleted:
            logger.info(f"Snapshot cleanup: deleted {deleted} files, {errors} errors")

        return {"deleted": deleted, "errors": errors, "retention_days": self.retention_days}

    def get_storage_info(self) -> dict:
        """Get snapshot storage stats."""
        total_size = 0
        file_count = 0

        if self.snapshot_dir.exists():
            for f in self.snapshot_dir.rglob("*.jpg"):
                total_size += f.stat().st_size
                file_count += 1

        return {
            "snapshot_dir": str(self.snapshot_dir),
            "retention_days": self.retention_days,
            "total_files": file_count,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_size_gb": round(total_size / (1024 * 1024 * 1024), 2),
        }


# Global instance
snapshot_service = SnapshotService()