"""Curtain (Bạt) control service - manages curtain state and movement."""

import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from src.iot.mqtt_client import mqtt_client


@dataclass
class CurtainConfig:
    """Single curtain configuration."""
    id: str
    name: str
    barn_name: str = ""
    device_topic: str = ""  # MQTT topic e.g. "cfarm/barn1"
    up_channel: int = 1
    down_channel: int = 2
    full_up_seconds: float = 60.0
    full_down_seconds: float = 60.0
    current_position: int = 0  # 0-100%
    moving_state: str = "idle"  # idle, moving_up, moving_down
    moving_target: Optional[int] = None
    moving_started_at: Optional[float] = None
    moving_duration: Optional[float] = None


class CurtainService:
    """Manages all curtains - state tracking and MQTT commands."""

    def __init__(self):
        self._curtains: dict[str, CurtainConfig] = {}
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def load_from_config(self, curtains_config: list[dict]):
        """Load curtain configs from YAML."""
        with self._lock:
            self._curtains.clear()
            for c in curtains_config:
                curtain = CurtainConfig(
                    id=c["id"],
                    name=c["name"],
                    barn_name=c.get("barn_name", ""),
                    device_topic=c.get("device_topic", ""),
                    up_channel=c.get("up_channel", 1),
                    down_channel=c.get("down_channel", 2),
                    full_up_seconds=c.get("full_up_seconds", 60),
                    full_down_seconds=c.get("full_down_seconds", 60),
                    current_position=c.get("current_position", 0),
                )

    def get_all(self) -> list[dict]:
        """Get all curtains with real-time position."""
        with self._lock:
            result = []
            for c in self._curtains.values():
                pos = self._calculate_position(c)
                result.append({
                    "id": c.id,
                    "name": c.name,
                    "barn_name": c.barn_name,
                    "position": pos,
                    "moving_state": c.moving_state,
                    "target": c.moving_target,
                    "device_topic": c.device_topic,
                    "up_channel": c.up_channel,
                    "down_channel": c.down_channel,
                    "full_up_seconds": c.full_up_seconds,
                    "full_down_seconds": c.full_down_seconds,
                })
            return result

    def get_status(self, curtain_id: str) -> Optional[dict]:
        """Get single curtain status."""
        with self._lock:
            c = self._curtains.get(curtain_id)
            if not c:
                return None
            pos = self._calculate_position(c)
            return {
                "id": c.id,
                "name": c.name,
                "position": pos,
                "moving_state": c.moving_state,
                "target": c.moving_target,
            }

    def move_to(self, curtain_id: str, target_pct: int) -> dict:
        """Move curtain to target position (0-100%)."""
        target_pct = max(0, min(100, target_pct))

        with self._lock:
            c = self._curtains.get(curtain_id)
            if not c:
                return {"ok": False, "message": "Curtain not found"}

            # Stop if currently moving
            current_pos = self._stop_internal(c)

            diff = target_pct - current_pos
            if diff == 0:
                return {"ok": True, "position": current_pos, "target": target_pct, "duration": 0}

            # Calculate direction and duration
            if diff > 0:
                duration = abs(diff) / 100 * c.full_down_seconds
                channel = c.down_channel
                direction = "down"
                move_state = "moving_down"
            else:
                duration = abs(diff) / 100 * c.full_up_seconds
                channel = c.up_channel
                direction = "up"
                move_state = "moving_up"

            # Send MQTT relay ON
            sent = mqtt_client.send_relay_command(c.device_topic, channel, "on")
            if not sent:
                return {"ok": False, "message": "MQTT send failed"}

            # Update state
            c.moving_state = move_state
            c.moving_target = target_pct
            c.moving_started_at = time.time()
            c.moving_duration = duration

            # Schedule relay OFF after duration
            self._schedule_off(c, channel, duration)

            return {
                "ok": True,
                "position": current_pos,
                "target": target_pct,
                "direction": direction,
                "duration": round(duration, 1),
            }

    def stop(self, curtain_id: str) -> dict:
        """Stop curtain immediately."""
        with self._lock:
            c = self._curtains.get(curtain_id)
            if not c:
                return {"ok": False, "message": "Curtain not found"}

            pos = self._stop_internal(c)
            return {"ok": True, "position": pos}

    def _stop_internal(self, c: CurtainConfig) -> int:
        """Stop curtain and return current position. Must hold lock."""
        pos = self._calculate_position(c)

        if c.moving_state != "idle":
            channel = c.up_channel if c.moving_state == "moving_up" else c.down_channel
            mqtt_client.send_relay_command(c.device_topic, channel, "off")

        # Cancel scheduled timer
        timer = self._timers.pop(c.id, None)
        if timer:
            timer.cancel()

        # Reset state
        c.current_position = pos
        c.moving_state = "idle"
        c.moving_target = None
        c.moving_started_at = None
        c.moving_duration = None

        return pos

    def _calculate_position(self, c: CurtainConfig) -> int:
        """Calculate real-time position based on movement elapsed time."""
        if c.moving_state == "idle" or not c.moving_started_at or not c.moving_duration:
            return c.current_position

        elapsed = time.time() - c.moving_started_at
        if c.moving_duration <= 0:
            return c.current_position

        ratio = min(1.0, elapsed / c.moving_duration)
        from_pos = c.current_position
        to_pos = c.moving_target or c.current_position
        diff = to_pos - from_pos

        return max(0, min(100, from_pos + int(round(diff * ratio))))

    def _schedule_off(self, c: CurtainConfig, channel: int, duration: float):
        """Schedule relay OFF after duration."""
        # Cancel existing timer
        timer = self._timers.pop(c.id, None)
        if timer:
            timer.cancel()

        def _off():
            with self._lock:
                mqtt_client.send_relay_command(c.device_topic, channel, "off")
                c.current_position = c.moving_target or c.current_position
                c.moving_state = "idle"
                c.moving_target = None
                c.moving_started_at = None
                c.moving_duration = None
                self._timers.pop(c.id, None)

        t = threading.Timer(duration, _off)
        t.daemon = True
        t.start()
        self._timers[c.id] = t

    def add_curtain(self, config: dict) -> dict:
        """Add a new curtain."""
        with self._lock:
            cid = config["id"]
            if cid in self._curtains:
                return {"ok": False, "message": f"Curtain {cid} already exists"}
            self._curtains[cid] = CurtainConfig(
                id=cid,
                name=config["name"],
                barn_name=config.get("barn_name", ""),
                device_topic=config.get("device_topic", ""),
                up_channel=config.get("up_channel", 1),
                down_channel=config.get("down_channel", 2),
                full_up_seconds=config.get("full_up_seconds", 60),
                full_down_seconds=config.get("full_down_seconds", 60),
                current_position=config.get("current_position", 0),
            )
            return {"ok": True}

    def remove_curtain(self, curtain_id: str) -> bool:
        """Remove a curtain."""
        with self._lock:
            c = self._curtains.pop(curtain_id, None)
            if c:
                timer = self._timers.pop(curtain_id, None)
                if timer:
                    timer.cancel()
                return True
            return False

    def update_curtain(self, curtain_id: str, config: dict) -> dict:
        """Update curtain configuration."""
        with self._lock:
            c = self._curtains.get(curtain_id)
            if not c:
                return {"ok": False, "message": "Curtain not found"}

            c.name = config.get("name", c.name)
            c.barn_name = config.get("barn_name", c.barn_name)
            c.device_topic = config.get("device_topic", c.device_topic)
            c.up_channel = config.get("up_channel", c.up_channel)
            c.down_channel = config.get("down_channel", c.down_channel)
            c.full_up_seconds = config.get("full_up_seconds", c.full_up_seconds)
            c.full_down_seconds = config.get("full_down_seconds", c.full_down_seconds)
            return {"ok": True}


# Module-level singleton
curtain_service = CurtainService()
