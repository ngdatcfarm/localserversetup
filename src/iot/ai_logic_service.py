"""AI Logic Service - Execute multi-step automation sequences."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from src.services.database.db import db
from src.services.storage.recording_service import recording_service
from src.services.storage.snapshot_service import snapshot_service
from src.cameras.ptz.ptz_controller import get_ptz_controller
from src.services.storage.config_service import ConfigService
from src.ai.ai_counting_service import ai_counting_service
from src.ai.density_counting_service import density_counting_service

logger = logging.getLogger(__name__)


class AILogicService:
    """Execute multi-step automation sequences (AI Logic rules)."""

    def __init__(self):
        self._running = False

    # ── Schedule Evaluation ─────────────────────────────

    async def start(self):
        """Start the AI logic schedule evaluation loop."""
        self._running = True
        asyncio.create_task(self._loop())
        logger.info("AILogicService started (eval every 30s)")

    async def stop(self):
        self._running = False

    async def _loop(self):
        """Check scheduled rules every 30 seconds."""
        while self._running:
            try:
                await self._evaluate_schedules()
            except Exception as e:
                logger.error(f"AI Logic loop error: {e}")
            await asyncio.sleep(30)

    async def _evaluate_schedules(self):
        """Check cron-based rules and fire if due."""
        if not db.pool:
            return

        rows = await db.fetch(
            """SELECT * FROM ai_logic_rules
            WHERE enabled = TRUE AND trigger_type = 'schedule'
            AND cron_expression IS NOT NULL"""
        )

        now = datetime.now(timezone.utc)
        from croniter import croniter

        for rule in rows:
            try:
                cron = croniter(rule["cron_expression"], now)
                prev_fire = cron.get_prev(datetime)
                last = rule["last_triggered_at"]
                if last is None or last < prev_fire:
                    seconds_since = (now - prev_fire).total_seconds()
                    if seconds_since < 60:  # within the current minute window
                        await self.execute_rule(rule["id"])
            except Exception as e:
                logger.error(f"AI Logic rule {rule['id']} cron error: {e}")

    # ── Execution ───────────────────────────────────────

    async def execute_rule(self, rule_id: int) -> dict:
        """Execute a rule's steps in order."""
        rule = await db.fetchrow("SELECT * FROM ai_logic_rules WHERE id = $1", rule_id)
        if not rule:
            return {"success": False, "message": f"Rule {rule_id} not found"}

        # Check cooldown
        now = datetime.now(timezone.utc)
        last = rule["last_triggered_at"]
        cooldown = rule["cooldown_seconds"] or 60
        if last and (now - last).total_seconds() < cooldown:
            logger.info(f"AI Logic rule #{rule_id} skipped - cooldown active")
            return {"success": False, "message": "Cooldown active"}

        # Load steps ordered by step_order
        steps = await db.fetch(
            "SELECT * FROM ai_logic_steps WHERE rule_id = $1 ORDER BY step_order",
            rule_id,
        )
        if not steps:
            return {"success": False, "message": "No steps defined"}

        logger.info(f"AI Logic rule #{rule_id} '{rule['name']}' executing {len(steps)} steps")

        results = []
        for step in steps:
            try:
                result = await self._execute_step(dict(step))
                results.append(result)
            except Exception as e:
                logger.error(f"Step {step['id']} error: {e}")
                results.append({"step_id": step["id"], "success": False, "error": str(e)})

        # Update last_triggered_at
        await db.execute(
            "UPDATE ai_logic_rules SET last_triggered_at = NOW() WHERE id = $1",
            rule_id,
        )

        all_ok = all(r.get("success", False) for r in results)
        return {
            "success": all_ok,
            "rule_id": rule_id,
            "rule_name": rule["name"],
            "steps_executed": len(results),
            "results": results,
        }

    async def _execute_step(self, step: dict) -> dict:
        """Execute a single step based on action_type."""
        action = step["action_type"]
        camera_id = step["camera_id"]
        config = step["config"] or {}

        if action == "goto_preset":
            return await self._do_goto_preset(camera_id, step["preset_id"])
        elif action == "record_video":
            return await self._do_record_video(camera_id, step["duration_seconds"] or 10)
        elif action == "record_snapshot":
            return await self._do_record_snapshot(camera_id, config)
        elif action == "count_objects":
            return await self._do_count_objects(camera_id, step.get("preset_id"), config)
        elif action == "count_density":
            return await self._do_count_density(camera_id, step.get("preset_id"), config)
        elif action == "wait":
            return await self._do_wait(step["duration_seconds"] or 5)
        elif action == "stop_recording":
            return await self._do_stop_recording(camera_id)
        else:
            return {"success": False, "message": f"Unknown action: {action}"}

    async def _do_goto_preset(self, camera_id: str, preset_id: int) -> dict:
        """Move camera to a preset position."""
        if not camera_id or not preset_id:
            return {"success": False, "message": "camera_id and preset_id required for goto_preset"}

        config_service = ConfigService()
        camera = config_service.get_camera(camera_id)
        if not camera:
            return {"success": False, "message": f"Camera {camera_id} not found"}

        controller = get_ptz_controller(camera)
        if not controller:
            return {"success": False, "message": "PTZ controller not available"}

        result = await controller.goto_preset(preset_id)
        logger.info(f"AI Logic goto_preset: cam={camera_id} preset={preset_id} → {result}")
        return {"success": result.get("ok", False), "action": "goto_preset", "camera_id": camera_id, "preset_id": preset_id}

    async def _do_record_video(self, camera_id: str, duration_seconds: int) -> dict:
        """Start recording, wait, then stop."""
        if not camera_id:
            return {"success": False, "message": "camera_id required for record_video"}

        recording_service.start_recording(camera_id)
        logger.info(f"AI Logic record_video: cam={camera_id} started, waiting {duration_seconds}s")
        await asyncio.sleep(duration_seconds)
        recording_service.stop_recording(camera_id)
        logger.info(f"AI Logic record_video: cam={camera_id} stopped after {duration_seconds}s")
        return {"success": True, "action": "record_video", "camera_id": camera_id, "duration_seconds": duration_seconds}

    async def _do_record_snapshot(self, camera_id: str, config: dict) -> dict:
        """Take a snapshot (or count snapshots at interval)."""
        if not camera_id:
            return {"success": False, "message": "camera_id required for record_snapshot"}

        from src.cameras.capture.camera_manager import camera_manager
        import cv2
        from pathlib import Path
        from datetime import datetime as dt

        count = config.get("count", 1)
        interval = config.get("interval_sec", 2)

        snapshot_dir = Path("data/snapshots")
        snapshot_dir.mkdir(parents=True, exist_ok=True)

        camera_info = camera_manager.get_camera(camera_id)
        if not camera_info or not camera_info.client:
            return {"success": False, "message": f"Camera {camera_id} not available"}

        results = []
        for i in range(count):
            raw_frame = camera_info.client.get_latest_frame()
            if raw_frame is None:
                results.append({"success": False, "message": "No frame"})
                continue

            jpeg_bytes = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
            ts = dt.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{camera_id}_{ts}_{i+1}.jpg"
            filepath = snapshot_dir / filename
            Path(filepath).write_bytes(jpeg_bytes)
            results.append({"success": True, "path": str(filepath)})

            if i < count - 1 and interval > 0:
                await asyncio.sleep(interval)

        all_ok = all(r.get("success", False) for r in results)
        return {
            "success": all_ok,
            "action": "record_snapshot",
            "camera_id": camera_id,
            "count": count,
            "results": results,
        }

    async def _do_count_objects(self, camera_id: str, preset_id: int = None, config: dict = None) -> dict:
        """
        Capture burst snapshots and count objects using YOLOv8.

        Config:
            snapshot_count: number of frames to capture (default 5)
            snapshot_interval: seconds between captures (default 0.5)
            count_method: "max" | "avg" | "single" (default "max")
            class_filter: list of COCO class IDs (default [14] = bird)
            threshold: count threshold to compare
            operator: comparison operator (">", "<", ">=", "<=", "==")
            target_count: the count value for threshold comparison
        """
        config = config or {}
        snapshot_count = config.get("snapshot_count", 5)
        snapshot_interval = config.get("snapshot_interval", 0.5)
        count_method = config.get("count_method", "max")
        class_filter = config.get("class_filter", [14])  # COCO bird class
        threshold = config.get("threshold", 0)
        operator = config.get("operator", ">")
        target_count = config.get("target_count", threshold)

        # Always goto preset 1 before capturing
        preset_id = preset_id or 1
        preset_result = await self._do_goto_preset(camera_id, preset_id)
        if not preset_result.get("success"):
            logger.warning(f"count_objects: preset goto failed, continuing anyway")

        # Capture burst snapshots using snapshot_service
        logger.info(f"AI Logic count_objects: capturing {snapshot_count} frames from {camera_id}")
        burst_results = await snapshot_service.capture_burst(
            camera_id=camera_id,
            count=snapshot_count,
            interval_sec=snapshot_interval,
        )

        # Collect image paths
        image_paths = [r["path"] for r in burst_results if r.get("success") and r.get("path")]
        if not image_paths:
            return {
                "success": False,
                "action": "count_objects",
                "message": "No snapshots captured",
                "count": 0,
            }

        # Run YOLOv8 inference
        count_result = ai_counting_service.count_from_paths(
            image_paths=image_paths,
            class_filter=class_filter,
            count_method=count_method,
        )

        # Compare against threshold
        triggered = self._compare_count(count_result.count, operator, target_count)

        logger.info(
            f"AI Logic count_objects: {count_result.count} objects "
            f"({operator} {target_count} = {triggered})"
        )

        return {
            "success": True,
            "action": "count_objects",
            "count": count_result.count,
            "frame_counts": count_result.frame_counts,
            "images_processed": count_result.images_processed,
            "method": count_result.method,
            "threshold": target_count,
            "operator": operator,
            "triggered": triggered,
            "snapshot_paths": image_paths,
        }

    async def _do_count_density(self, camera_id: str, preset_id: int = None, config: dict = None) -> dict:
        """
        Count objects using density/pixel analysis (no ML model needed).

        Config:
            snapshot_count: number of frames to capture (default 5)
            snapshot_interval: seconds between captures (default 0.5)
            count_method: "max" | "avg" | "single" (default "max")
            avg_pixels_per_object: calibration value (default 3000)
            threshold: count threshold
            operator: comparison operator
            lower_hsv: HSV lower bound for color segmentation
            upper_hsv: HSV upper bound for color segmentation
        """
        config = config or {}
        snapshot_count = config.get("snapshot_count", 5)
        snapshot_interval = config.get("snapshot_interval", 0.5)
        count_method = config.get("count_method", "max")
        avg_pixels = config.get("avg_pixels_per_object", 3000)
        threshold = config.get("threshold", 0)
        operator = config.get("operator", ">")

        # Goto preset first
        preset_id = preset_id or 1
        preset_result = await self._do_goto_preset(camera_id, preset_id)
        if not preset_result.get("success"):
            logger.warning(f"count_density: preset goto failed, continuing anyway")

        # Capture burst
        burst_results = await snapshot_service.capture_burst(
            camera_id=camera_id,
            count=snapshot_count,
            interval_sec=snapshot_interval,
        )

        # Collect image paths
        image_paths = [r["path"] for r in burst_results if r.get("success") and r.get("path")]
        if not image_paths:
            return {
                "success": False,
                "action": "count_density",
                "message": "No snapshots captured",
                "count": 0,
            }

        # Run density counting
        density_result = density_counting_service.count_from_paths(
            image_paths=image_paths,
            config={**config, "avg_pixels_per_object": avg_pixels},
            method=count_method,
        )

        # Compare against threshold
        triggered = self._compare_count(density_result.estimated_count, operator, threshold)

        logger.info(
            f"AI Logic count_density: {density_result.estimated_count} estimated "
            f"({operator} {threshold} = {triggered})"
        )

        return {
            "success": True,
            "action": "count_density",
            "count": density_result.estimated_count,
            "total_pixels": density_result.total_pixels,
            "contour_count": density_result.contour_count,
            "pixel_percentage": density_result.pixel_percentage,
            "method": count_method,
            "avg_pixels_per_object": avg_pixels,
            "threshold": threshold,
            "operator": operator,
            "triggered": triggered,
            "snapshot_paths": image_paths,
            "frames_analyzed": len(image_paths),
        }

    def _compare_count(self, count: int, operator: str, threshold: int) -> bool:
        """Compare count against threshold."""
        if operator == ">":
            return count > threshold
        elif operator == ">=":
            return count >= threshold
        elif operator == "<":
            return count < threshold
        elif operator == "<=":
            return count <= threshold
        elif operator == "==":
            return count == threshold
        return False

    async def _do_wait(self, duration_seconds: int) -> dict:
        """Delay between steps."""
        logger.info(f"AI Logic wait: sleeping {duration_seconds}s")
        await asyncio.sleep(duration_seconds)
        return {"success": True, "action": "wait", "duration_seconds": duration_seconds}

    async def _do_stop_recording(self, camera_id: str) -> dict:
        """Stop active recording."""
        if camera_id:
            recording_service.stop_recording(camera_id)
            logger.info(f"AI Logic stop_recording: cam={camera_id}")
            return {"success": True, "action": "stop_recording", "camera_id": camera_id}
        else:
            recording_service.stop_all()
            logger.info("AI Logic stop_recording: all cameras")
            return {"success": True, "action": "stop_recording", "camera_id": "all"}

    # ── CRUD ─────────────────────────────────────────────

    async def list_rules(self) -> list[dict]:
        rows = await db.fetch("SELECT * FROM ai_logic_rules ORDER BY name")
        return [dict(r) for r in rows]

    async def get_rule(self, rule_id: int) -> Optional[dict]:
        row = await db.fetchrow("SELECT * FROM ai_logic_rules WHERE id = $1", rule_id)
        if not row:
            return None
        rule = dict(row)
        steps = await db.fetch(
            "SELECT * FROM ai_logic_steps WHERE rule_id = $1 ORDER BY step_order",
            rule_id,
        )
        rule["steps"] = [dict(s) for s in steps]
        return rule

    async def create_rule(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO ai_logic_rules
            (name, description, enabled, trigger_type, cron_expression, cooldown_seconds)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING *""",
            data["name"],
            data.get("description"),
            data.get("enabled", True),
            data["trigger_type"],
            data.get("cron_expression"),
            data.get("cooldown_seconds", 60),
        )
        rule = dict(row)

        # Insert steps
        steps_data = data.get("steps", [])
        for i, step in enumerate(steps_data):
            await db.execute(
                """INSERT INTO ai_logic_steps
                (rule_id, step_order, action_type, camera_id, preset_id, duration_seconds, config)
                VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                rule["id"], i + 1, step["action_type"], step.get("camera_id"),
                step.get("preset_id"), step.get("duration_seconds", 0), step.get("config", {}),
            )

        return await self.get_rule(rule["id"])

    async def update_rule(self, rule_id: int, data: dict) -> dict:
        await db.execute(
            """UPDATE ai_logic_rules SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                enabled = COALESCE($3, enabled),
                trigger_type = COALESCE($4, trigger_type),
                cron_expression = COALESCE($5, cron_expression),
                cooldown_seconds = COALESCE($6, cooldown_seconds),
                updated_at = NOW()
            WHERE id = $7""",
            data.get("name"), data.get("description"), data.get("enabled"),
            data.get("trigger_type"), data.get("cron_expression"),
            data.get("cooldown_seconds"), rule_id,
        )

        # Update steps if provided
        if "steps" in data:
            await db.execute("DELETE FROM ai_logic_steps WHERE rule_id = $1", rule_id)
            for i, step in enumerate(data["steps"]):
                await db.execute(
                    """INSERT INTO ai_logic_steps
                    (rule_id, step_order, action_type, camera_id, preset_id, duration_seconds, config)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                    rule_id, i + 1, step["action_type"], step.get("camera_id"),
                    step.get("preset_id"), step.get("duration_seconds", 0), step.get("config", {}),
                )

        return await self.get_rule(rule_id)

    async def delete_rule(self, rule_id: int) -> bool:
        result = await db.execute("DELETE FROM ai_logic_rules WHERE id = $1", rule_id)
        return result == "DELETE 1"

    async def toggle_rule(self, rule_id: int, enabled: bool) -> dict:
        await db.execute(
            "UPDATE ai_logic_rules SET enabled = $1, updated_at = NOW() WHERE id = $2",
            enabled, rule_id,
        )
        return {"ok": True, "enabled": enabled}


ai_logic_service = AILogicService()