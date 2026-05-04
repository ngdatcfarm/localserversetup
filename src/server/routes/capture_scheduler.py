"""Capture Scheduler Service - Automated dataset collection on schedule."""

import asyncio
import logging
from datetime import datetime, date, timedelta
from typing import Optional
from pathlib import Path
import cv2

from src.services.database.db import db
from src.services.storage.config_service import ConfigService

logger = logging.getLogger(__name__)

DATASET_DIR = Path("E:/AI/Dataset")
DATASET_DIR.mkdir(parents=True, exist_ok=True)


def capture_frame_direct(camera_id: str) -> tuple:
    """Capture a single frame directly via RTSP using OpenCV."""
    config_svc = ConfigService()
    camera = config_svc.get_camera(camera_id)
    if not camera:
        return None, None

    rtsp_url = f"rtsp://{camera.username}:{camera.password}@{camera.ip}:{camera.port}{camera.rtsp_path}"
    cap = cv2.VideoCapture(rtsp_url)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        return None, None

    return frame, camera


class CaptureSchedulerService:
    """Manage scheduled captures for dataset building."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._check_interval = 30  # Check every 30 seconds

    async def create_schedule(
        self,
        name: str,
        camera_id: str,
        preset_id: int,
        schedule_hours: list[int] = None,
        shots_per_capture: int = 10,
        interval_seconds: float = 2.0,
        total_days: int = 3,
    ) -> dict:
        """Create a new capture schedule."""
        if schedule_hours is None:
            schedule_hours = [6, 11, 15, 19]

        # Calculate next capture time
        now = datetime.now()
        next_capture = self._get_next_capture_time(schedule_hours, date.today())

        row = await db.fetchrow("""
            INSERT INTO capture_schedules
            (name, camera_id, preset_id, schedule_hours, shots_per_capture,
             interval_seconds, total_days, next_capture_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        """, name, camera_id, preset_id, schedule_hours, shots_per_capture,
            interval_seconds, total_days, next_capture)

        return dict(row)

    async def get_schedules(self, enabled_only: bool = False) -> list:
        """Get all capture schedules."""
        query = "SELECT * FROM capture_schedules WHERE 1=1"
        if enabled_only:
            query += " AND enabled = TRUE"
        query += " ORDER BY created_at DESC"
        return await db.fetch(query)

    async def get_schedule(self, schedule_id: int) -> Optional[dict]:
        """Get a single schedule by ID."""
        return await db.fetchrow(
            "SELECT * FROM capture_schedules WHERE id = $1", schedule_id
        )

    async def update_schedule(self, schedule_id: int, **kwargs) -> dict:
        """Update schedule settings."""
        allowed_fields = [
            'name', 'shots_per_capture', 'interval_seconds',
            'total_days', 'enabled', 'is_running'
        ]
        set_clause = []
        values = []
        idx = 1

        for field in allowed_fields:
            if field in kwargs:
                set_clause.append(f"{field} = ${idx}")
                values.append(kwargs[field])
                idx += 1

        if not set_clause:
            return await self.get_schedule(schedule_id)

        values.append(schedule_id)
        query = f"""
            UPDATE capture_schedules
            SET {', '.join(set_clause)}, updated_at = NOW()
            WHERE id = ${idx}
            RETURNING *
        """
        return await db.fetchrow(query, *values)

    async def delete_schedule(self, schedule_id: int) -> bool:
        """Delete a capture schedule."""
        result = await db.execute(
            "DELETE FROM capture_schedules WHERE id = $1", schedule_id
        )
        return result == "DELETE 1"

    async def start_schedule(self, schedule_id: int) -> bool:
        """Start a capture schedule."""
        await db.execute(
            "UPDATE capture_schedules SET is_running = TRUE WHERE id = $1",
            schedule_id
        )
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._run_scheduler())
        return True

    async def stop_schedule(self, schedule_id: int) -> bool:
        """Stop a capture schedule."""
        await db.execute(
            "UPDATE capture_schedules SET is_running = FALSE WHERE id = $1",
            schedule_id
        )
        # Check if any schedule is still running
        running = await db.fetchval(
            "SELECT COUNT(*) FROM capture_schedules WHERE is_running = TRUE"
        )
        if running == 0:
            self._running = False
        return True

    async def run_capture_now(self, schedule_id: int) -> dict:
        """Run a capture immediately (manual trigger)."""
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return {"success": False, "message": "Schedule not found"}

        result = await self._execute_capture(schedule)

        # Update stats
        await db.execute("""
            UPDATE capture_schedules
            SET last_capture_at = NOW(),
                total_captures = total_captures + 1,
                total_images = total_images + $1
            WHERE id = $2
        """, result["images_captured"], schedule_id)

        return result

    def _get_next_capture_time(
        self,
        schedule_hours: list[int],
        target_date: date
    ) -> datetime:
        """Calculate next capture time based on schedule hours."""
        now = datetime.now()

        # Check today first
        for hour in sorted(schedule_hours):
            capture_time = datetime(
                target_date.year, target_date.month, target_date.day,
                hour, 0, 0
            )
            if capture_time > now:
                return capture_time

        # Otherwise tomorrow
        tomorrow = target_date + timedelta(days=1)
        return datetime(
            tomorrow.year, tomorrow.month, tomorrow.day,
            sorted(schedule_hours)[0], 0, 0
        )

    async def _execute_capture(self, schedule: dict) -> dict:
        """Execute a single capture operation."""
        camera_id = schedule["camera_id"]
        preset_id = schedule["preset_id"]
        shots = schedule["shots_per_capture"]
        interval = schedule["interval_seconds"]

        captured = []
        errors = []

        # Move to preset if needed
        try:
            from src.cameras.ptz.ptz_controller import get_ptz_controller
            from src.services.storage.config_service import ConfigService
            config_svc = ConfigService()
            camera = config_svc.get_camera(camera_id)
            if camera:
                controller = get_ptz_controller(camera)
                if controller:
                    await controller.goto_preset(preset_id)
                    await asyncio.sleep(2)
        except Exception as e:
            logger.warning(f"PTZ movement failed: {e}")

        # Capture shots
        for i in range(shots):
            frame, _ = capture_frame_direct(camera_id)
            if frame is None:
                errors.append(f"Shot {i}: failed to capture")
                continue

            # Save image
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"sched_p{preset_id}_{timestamp}_{i:02d}.jpg"
            filepath = DATASET_DIR / filename
            cv2.imwrite(str(filepath), frame)

            # Get dimensions and save to DB
            h, w = frame.shape[:2]
            try:
                row = await db.fetchrow("""
                    INSERT INTO ml_dataset_images (filename, filepath, original_width, original_height, label_status)
                    VALUES ($1, $2, $3, $4, 'unlabeled') RETURNING id
                """, filename, str(filepath), w, h)
                captured.append({"id": row["id"], "filename": filename})
            except Exception as e:
                errors.append(f"DB insert error: {e}")

            # Wait before next shot
            if i < shots - 1:
                await asyncio.sleep(interval)

        # Log the capture
        await db.execute("""
            INSERT INTO capture_logs (schedule_id, capture_time, preset_id, images_captured, errors)
            VALUES ($1, NOW(), $2, $3, $4)
        """, schedule["id"], preset_id, len(captured), "; ".join(errors) if errors else None)

        return {
            "success": True,
            "images_captured": len(captured),
            "errors": errors if errors else None,
        }

    async def _run_scheduler(self):
        """Main scheduler loop."""
        logger.info("Capture scheduler started")

        while self._running:
            try:
                now = datetime.now()

                # Find schedules that need to run
                schedules = await db.fetch("""
                    SELECT * FROM capture_schedules
                    WHERE enabled = TRUE
                    AND is_running = TRUE
                    AND next_capture_at <= $1
                    AND (start_date + (total_days || ' days')::interval) > $1
                """, now)

                for schedule in schedules:
                    # Calculate next capture
                    schedule_hours = schedule["schedule_hours"] or [6, 11, 15, 19]
                    next_capture = self._get_next_capture_time(schedule_hours, now.date())

                    # Execute capture
                    logger.info(f"Scheduled capture running for schedule {schedule['id']}")
                    result = await self._execute_capture(schedule)

                    # Update schedule
                    await db.execute("""
                        UPDATE capture_schedules
                        SET last_capture_at = NOW(),
                            next_capture_at = $1,
                            total_captures = total_captures + 1,
                            total_images = total_images + $2
                        WHERE id = $3
                    """, next_capture, result["images_captured"], schedule["id"])

            except Exception as e:
                logger.error(f"Scheduler error: {e}")

            await asyncio.sleep(self._check_interval)

        logger.info("Capture scheduler stopped")

    async def get_schedule_stats(self, schedule_id: int) -> dict:
        """Get statistics for a schedule."""
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return {}

        logs = await db.fetch("""
            SELECT * FROM capture_logs
            WHERE schedule_id = $1
            ORDER BY capture_time DESC
            LIMIT 10
        """, schedule_id)

        # Calculate expected captures
        start = schedule["start_date"]
        if isinstance(start, str):
            start = date.fromisoformat(start)
        days_running = (date.today() - start).days + 1
        expected_captures = len(schedule["schedule_hours"] or [6, 11, 15, 19]) * days_running

        return {
            "schedule": dict(schedule),
            "recent_logs": [dict(l) for l in logs],
            "days_running": days_running,
            "expected_captures": expected_captures,
            "completion_pct": min(100, (schedule["total_captures"] / expected_captures * 100)) if expected_captures else 0,
        }


capture_scheduler = CaptureSchedulerService()