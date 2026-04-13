"""Bat control service - manages bat state, movement, and logging via database."""

import asyncio
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from src.services.database.db import db
from src.iot.mqtt_client import mqtt_client

logger = __import__('logging').getLogger(__name__)


class BatService:
    """Manages all bats - state tracking, MQTT commands, and logging."""

    # In-memory state for active movements (keyed by bat_id)
    _active_movements: dict[int, dict] = {}
    _timers: dict[int, threading.Timer] = {}
    _lock = threading.Lock()

    # ── CRUD ──────────────────────────────────────────

    async def list_by_barn(self, barn_id: str) -> list[dict]:
        """Get all bats for a barn with device info."""
        rows = await db.fetch(
            """SELECT b.*, d.mqtt_topic as device_topic, d.name as device_name,
                      d.is_online, d.wifi_rssi
               FROM bats b
               LEFT JOIN devices d ON b.device_id = d.id
               WHERE b.barn_id = $1
               ORDER BY b.id""",
            barn_id,
        )
        result = []
        for r in rows:
            bat = dict(r)
            # Get current active movement if any
            with self._lock:
                active = self._active_movements.get(bat['id'])
            if active:
                bat['moving_state'] = active['direction']  # 'up' or 'down'
                bat['moving_started_at'] = active['started_at'].isoformat()
                bat['moving_duration'] = active['duration']
                bat['elapsed_seconds'] = time.time() - active['started_at']
            else:
                bat['moving_state'] = 'stopped'
                bat['moving_started_at'] = None
                bat['moving_duration'] = None
                bat['elapsed_seconds'] = 0
            result.append(bat)
        return result

    async def get(self, bat_id: int) -> Optional[dict]:
        """Get single bat by ID."""
        row = await db.fetchrow(
            """SELECT b.*, d.mqtt_topic as device_topic, d.name as device_name,
                      d.is_online, d.wifi_rssi
               FROM bats b
               LEFT JOIN devices d ON b.device_id = d.id
               WHERE b.id = $1""",
            bat_id,
        )
        return dict(row) if row else None

    async def update(self, bat_id: int, data: dict) -> dict:
        """Update bat configuration."""
        result = await db.execute(
            """UPDATE bats SET
                name = COALESCE($1, name),
                device_id = COALESCE($2, device_id),
                up_relay_channel = COALESCE($3, up_relay_channel),
                down_relay_channel = COALESCE($4, down_relay_channel),
                auto_enabled = COALESCE($5, auto_enabled),
                timeout_seconds = COALESCE($6, timeout_seconds),
                position = COALESCE($7, position)
            WHERE id = $8""",
            data.get("name"), data.get("device_id"),
            data.get("up_relay_channel"), data.get("down_relay_channel"),
            data.get("auto_enabled"), data.get("timeout_seconds"),
            data.get("position"), bat_id,
        )
        return {"ok": True}

    # ── Movement Commands ──────────────────────────────

    async def move_up(self, bat_id: int) -> dict:
        """Start bat moving UP."""
        return await self._move(bat_id, "up")

    async def move_down(self, bat_id: int) -> dict:
        """Start bat moving DOWN."""
        return await self._move(bat_id, "down")

    async def stop(self, bat_id: int) -> dict:
        """Stop bat movement."""
        return await self._stop(bat_id)

    async def _move(self, bat_id: int, direction: str) -> dict:
        """Internal move handler."""
        bat = await self.get(bat_id)
        if not bat:
            return {"ok": False, "message": "Bat not found"}

        if not bat['device_id']:
            return {"ok": False, "message": "Bat has no device configured"}

        if not bat['device_topic']:
            return {"ok": False, "message": "Device has no MQTT topic"}

        if bat['is_online'] != True:
            return {"ok": False, "message": f"Device offline"}

        # Determine relay channels
        up_channel = bat['up_relay_channel']
        down_channel = bat['down_relay_channel']
        active_channel = up_channel if direction == "up" else down_channel
        inactive_channel = down_channel if direction == "up" else up_channel

        # Safety: turn OFF inactive channel first (prevent both ON)
        mqtt_client.send_relay_command(bat['device_topic'], inactive_channel, "off")
        time.sleep(0.1)  # Small delay for safety

        # Turn ON active channel
        sent = mqtt_client.send_relay_command(bat['device_topic'], active_channel, "on")
        if not sent:
            return {"ok": False, "message": "MQTT send failed"}

        timeout_seconds = bat.get('timeout_seconds', 210)

        # Get current cycle_id if any
        cycle_id = await self._get_active_cycle_id(bat['barn_id'])

        # Update database position
        await db.execute(
            "UPDATE bats SET position = $1, updated_at = NOW() WHERE id = $2",
            direction, bat_id
        )

        # Start movement tracking
        started_at = datetime.now(timezone.utc)
        with self._lock:
            # Cancel any existing timer
            existing_timer = self._timers.pop(bat_id, None)
            if existing_timer:
                existing_timer.cancel()

            self._active_movements[bat_id] = {
                'direction': direction,
                'started_at': time.time(),
                'duration': timeout_seconds,
                'device_topic': bat['device_topic'],
                'active_channel': active_channel,
                'inactive_channel': inactive_channel,
                'cycle_id': cycle_id,
                'log_id': None,  # Will be set after log insert
            }

            # Insert bat_log record
            log_id = await db.fetchval(
                """INSERT INTO bat_logs (bat_id, cycle_id, action, started_at)
                   VALUES ($1, $2, $3, $4) RETURNING id""",
                bat_id, cycle_id, direction, started_at
            )
            self._active_movements[bat_id]['log_id'] = log_id

        # Schedule auto-stop
        self._schedule_stop(bat_id, timeout_seconds)

        return {
            "ok": True,
            "bat_id": bat_id,
            "direction": direction,
            "started_at": started_at.isoformat(),
            "timeout_seconds": timeout_seconds,
            "cycle_id": cycle_id,
            "log_id": log_id,
        }

    async def _stop(self, bat_id: int) -> dict:
        """Stop bat movement."""
        bat = await self.get(bat_id)
        if not bat:
            return {"ok": False, "message": "Bat not found"}

        with self._lock:
            active = self._active_movements.pop(bat_id, None)

        if not active:
            return {"ok": True, "message": "Bat was not moving"}

        # Cancel timer
        timer = self._timers.pop(bat_id, None)
        if timer:
            timer.cancel()

        # Turn OFF both channels
        mqtt_client.send_relay_command(active['device_topic'], active['active_channel'], "off")
        mqtt_client.send_relay_command(active['device_topic'], active['inactive_channel'], "off")

        # Calculate duration
        ended_at = datetime.now(timezone.utc)
        duration_seconds = int(time.time() - active['started_at'])

        # Update log
        await db.execute(
            """UPDATE bat_logs SET
                   duration_seconds = $1, ended_at = $2
               WHERE id = $3""",
            duration_seconds, ended_at, active['log_id']
        )

        # Update bat position to stopped
        await db.execute(
            "UPDATE bats SET position = 'stopped', updated_at = NOW() WHERE id = $1",
            bat_id
        )

        return {
            "ok": True,
            "duration_seconds": duration_seconds,
            "ended_at": ended_at.isoformat(),
        }

    def _schedule_stop(self, bat_id: int, delay_seconds: float):
        """Schedule automatic stop after timeout."""
        def _auto_stop():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(self._stop(bat_id))
                finally:
                    loop.close()
                logger.info(f"Bat {bat_id} auto-stopped after {delay_seconds}s timeout")
            except Exception as e:
                logger.error(f"Bat {bat_id} auto-stop error: {e}")

        with self._lock:
            # Cancel existing timer for this bat
            existing = self._timers.pop(bat_id, None)
            if existing:
                existing.cancel()

            timer = threading.Timer(delay_seconds, _auto_stop)
            timer.daemon = True
            timer.start()
            self._timers[bat_id] = timer

    async def _get_active_cycle_id(self, barn_id: str) -> Optional[int]:
        """Get active cycle ID for barn, or None if no active cycle."""
        cycle_id = await db.fetchval(
            """SELECT id FROM cycles
               WHERE barn_id = $1 AND status = 'active'
               LIMIT 1""",
            barn_id
        )
        return cycle_id

    # ── Logs ─────────────────────────────────────────

    async def get_logs(self, bat_id: int, limit: int = 50) -> list[dict]:
        """Get bat movement history."""
        rows = await db.fetch(
            """SELECT bl.*, c.name as cycle_name
               FROM bat_logs bl
               LEFT JOIN cycles c ON bl.cycle_id = c.id
               WHERE bl.bat_id = $1
               ORDER BY bl.started_at DESC
               LIMIT $2""",
            bat_id, limit
        )
        return [dict(r) for r in rows]

    async def get_logs_by_barn(self, barn_id: int, limit: int = 100) -> list[dict]:
        """Get bat movement history for all bats in a barn."""
        rows = await db.fetch(
            """SELECT bl.*, b.code as bat_code, b.name as bat_name,
                      c.name as cycle_name
               FROM bat_logs bl
               JOIN bats b ON bl.bat_id = b.id
               LEFT JOIN cycles c ON bl.cycle_id = c.id
               WHERE b.barn_id = $1
               ORDER BY bl.started_at DESC
               LIMIT $2""",
            barn_id, limit
        )
        return [dict(r) for r in rows]


# Module-level singleton
bat_service = BatService()
