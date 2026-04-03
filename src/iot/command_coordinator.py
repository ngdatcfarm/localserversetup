"""Command Coordinator - Priority-based hybrid device control.

Priority order: LOCAL (1) > MANUAL (2) > CLOUD (3) > AUTOMATION (4)

LOCAL/MANUAL commands hold a 30s lock that blocks CLOUD and AUTOMATION commands.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from enum import IntEnum
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


class CommandSource(IntEnum):
    """Command source priority (lower = higher priority)."""
    LOCAL = 1       # Physical button/switch on device
    MANUAL = 2      # Dashboard/manual control
    CLOUD = 3       # cfarm.vn remote command
    AUTOMATION = 4  # Scheduled/condition-based rules


@dataclass
class CommandRequest:
    """A device command request."""
    device_id: int
    channel_id: int
    command_type: str  # "on", "off", "stop", "set_position"
    payload: dict
    source: str  # "local", "manual", "cloud", "automation"
    requires_ack: bool = False
    priority: Optional[int] = None

    def __post_init__(self):
        if self.priority is None:
            self.priority = self._source_to_priority(self.source)

    @staticmethod
    def _source_to_priority(source: str) -> int:
        mapping = {
            "local": CommandSource.LOCAL,
            "manual": CommandSource.MANUAL,
            "cloud": CommandSource.CLOUD,
            "automation": CommandSource.AUTOMATION,
        }
        return mapping.get(source.lower(), CommandSource.CLOUD)


@dataclass
class CommandResult:
    """Result of a command execution attempt."""
    ok: bool
    command_id: Optional[int] = None
    sequence_number: Optional[int] = None
    reason: Optional[str] = None
    message: Optional[str] = None


class CommandCoordinator:
    """Coordinates device commands with priority-based locking."""

    LOCK_DURATION_SECONDS = 30

    async def execute(self, req: CommandRequest) -> CommandResult:
        """Execute a device command with priority checking.

        Returns CommandResult with ok=True if command was sent,
        or ok=False if rejected due to lock.
        """
        if not db.pool:
            return CommandResult(ok=False, reason="no_db", message="Database not connected")

        # Get next sequence number for this device
        seq = await self._get_next_sequence(req.device_id)
        if seq is None:
            return CommandResult(ok=False, reason="sequence_error", message="Failed to get sequence number")

        # Check for active lock (only blocks lower-priority sources)
        lock = await self._get_active_lock(req.device_id, req.channel_id)
        if lock and lock["source_priority"] <= req.priority:
            return CommandResult(
                ok=False,
                reason="lock_active",
                message=f"Device locked by {lock['source']} command until {lock['lock_expires_at']}",
            )

        # Set lock for LOCAL/MANUAL commands (priority 1-2)
        if req.priority <= CommandSource.MANUAL:
            lock_result = await self._set_lock(
                req.device_id,
                req.channel_id,
                req.source,
                req.priority,
            )
            if not lock_result:
                return CommandResult(ok=False, reason="lock_error", message="Failed to acquire lock")

        # Insert command record
        command_id = await self._insert_command(req, seq)
        if not command_id:
            return CommandResult(ok=False, reason="insert_error", message="Failed to insert command")

        # Publish to MQTT
        from src.iot.mqtt_client import mqtt_client
        from src.services.database.db import db

        topic, mqtt_payload = await self._build_mqtt_payload(req.device_id, req.channel_id, req, seq, command_id)

        # Publish to LOCAL MQTT broker
        sent = mqtt_client.send_relay_command(
            topic,
            req.payload.get("channel", req.channel_id),
            req.payload.get("state", req.command_type),
            seq=seq,
            cmd_id=command_id,
        )

        # ALSO publish to CLOUD MQTT broker for dual-subscribe ESP32
        # This ensures ESP32 receives command even if local broker is not accessible
        # Cloud/automation commands go to both, LOCAL commands go to local only
        if req.source in ("cloud", "automation"):
            try:
                from src.iot.cloud_mqtt_client import cloud_mqtt_client
                device_code = await db.fetchval(
                    "SELECT device_code FROM devices WHERE id = $1", req.device_id
                )
                if device_code:
                    # Publish to cloud MQTT with device_code
                    if req.command_type in ("on", "off"):
                        cloud_mqtt_client.send_relay_command(
                            device_code,
                            req.payload.get("channel", req.channel_id),
                            req.command_type,
                            seq=seq,
                            cmd_id=command_id,
                        )
                    elif req.command_type == "set_position":
                        cloud_mqtt_client.send_curtain_position(
                            device_code,
                            req.payload.get("position", 50),
                            seq=seq,
                            cmd_id=command_id,
                        )
                    logger.debug(f"Command also published to cloud MQTT for {device_code}")
            except Exception as e:
                logger.warning(f"Failed to publish to cloud MQTT: {e}")

        # Update command status
        status = "sent" if sent else "failed"
        await db.execute(
            "UPDATE device_commands SET status = $1 WHERE id = $2",
            status, command_id,
        )

        if not sent:
            return CommandResult(ok=False, command_id=command_id, reason="mqtt_error", message="MQTT send failed")

        logger.info(
            f"Command executed: device={req.device_id} ch={req.channel_id} "
            f"cmd={req.command_type} source={req.source} seq={seq}"
        )

        return CommandResult(
            ok=True,
            command_id=command_id,
            sequence_number=seq,
            message="Command sent successfully",
        )

    async def check_pending_local(self, device_id: int, channel_id: int) -> bool:
        """Check if there's an active LOCAL/MANUAL command for this device/channel."""
        lock = await self._get_active_lock(device_id, channel_id)
        if not lock:
            return False
        # LOCAL or MANUAL source (priority 1-2)
        return lock["source_priority"] <= CommandSource.MANUAL

    async def _get_active_lock(self, device_id: int, channel_id: int) -> Optional[dict]:
        """Get active lock for device/channel, cleaning up expired ones."""
        if not db.pool:
            return None

        # First clean up expired locks
        await db.execute(
            "DELETE FROM device_command_locks WHERE lock_expires_at IS NOT NULL AND lock_expires_at < NOW()"
        )

        row = await db.fetchrow(
            """SELECT dcl.*, dc.source_priority
            FROM device_command_locks dcl
            JOIN device_commands dc ON dc.id = dcl.locked_by_command_id
            WHERE dcl.device_id = $1 AND dcl.channel_id = $2
            AND (dcl.lock_expires_at IS NULL OR dcl.lock_expires_at > NOW())""",
            device_id, channel_id,
        )
        return dict(row) if row else None

    async def _set_lock(
        self,
        device_id: int,
        channel_id: int,
        source: str,
        source_priority: int,
        command_id: int = None,
    ) -> bool:
        """Set a 30s lock for LOCAL/MANUAL commands."""
        if not db.pool:
            return False

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.LOCK_DURATION_SECONDS)

        await db.execute(
            """INSERT INTO device_command_locks
            (device_id, channel_id, locked_by_command_id, locked_at, lock_expires_at, source)
            VALUES ($1, $2, $3, NOW(), $4, $5)
            ON CONFLICT (device_id, channel_id) DO UPDATE SET
                locked_by_command_id = COALESCE($3, locked_by_command_id),
                locked_at = NOW(),
                lock_expires_at = $4,
                source = $5""",
            device_id, channel_id, command_id, expires_at, source,
        )
        return True

    async def _get_next_sequence(self, device_id: int) -> Optional[int]:
        """Get next sequence number for device (atomic increment)."""
        if not db.pool:
            return None

        try:
            # Insert or update sequence tracker
            row = await db.fetchrow(
                """INSERT INTO device_command_sequences (device_id, last_sequence_number, updated_at)
                VALUES ($1, 1, NOW())
                ON CONFLICT (device_id) DO UPDATE SET
                    last_sequence_number = device_command_sequences.last_sequence_number + 1,
                    updated_at = NOW()
                RETURNING last_sequence_number""",
                device_id,
            )
            return row["last_sequence_number"]
        except Exception as e:
            logger.error(f"Failed to get sequence for device {device_id}: {e}")
            return None

    async def _insert_command(self, req: CommandRequest, seq: int) -> Optional[int]:
        """Insert command record and return ID."""
        if not db.pool:
            return None

        try:
            row = await db.fetchrow(
                """INSERT INTO device_commands
                (device_id, channel_id, command_type, payload, source, source_priority,
                 sequence_number, status, requires_ack, sent_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW())
                RETURNING id""",
                req.device_id,
                req.channel_id,
                req.command_type,
                json.dumps(req.payload),
                req.source,
                req.priority,
                seq,
                req.requires_ack,
            )
            return row["id"] if row else None
        except Exception as e:
            logger.error(f"Failed to insert command: {e}")
            return None

    async def _build_mqtt_payload(
        self, device_id: int, channel_id: int, req: CommandRequest, seq: int, cmd_id: int
    ) -> tuple[str, dict]:
        """Build MQTT topic and payload for command."""
        # Get device mqtt_topic
        topic = await db.fetchval(
            "SELECT mqtt_topic FROM devices WHERE id = $1", device_id
        )
        if not topic:
            topic = f"cfarm/device_{device_id}"

        cmd_topic = f"{topic}/cmd" if not topic.endswith("/cmd") else topic

        payload = {
            "action": "relay",
            "channel": req.payload.get("channel", channel_id),
            "state": req.payload.get("state", req.command_type),
            "seq": seq,
            "cmd_id": cmd_id,
        }

        if req.payload.get("duration"):
            payload["duration"] = req.payload["duration"]

        return cmd_topic, payload

    async def acknowledge_command(self, device_id: int, sequence_number: int) -> bool:
        """Acknowledge a pending command."""
        if not db.pool:
            return False

        result = await db.execute(
            """UPDATE device_commands
            SET status = 'acknowledged', acknowledged_at = NOW()
            WHERE device_id = $1 AND sequence_number = $2 AND status = 'pending'""",
            device_id, sequence_number,
        )
        return "UPDATE 1" in result

    async def retry_command(self, command_id: int) -> CommandResult:
        """Retry a failed command."""
        if not db.pool:
            return CommandResult(ok=False, reason="no_db")

        row = await db.fetchrow(
            "SELECT * FROM device_commands WHERE id = $1", command_id
        )
        if not row:
            return CommandResult(ok=False, reason="not_found")

        if row["retry_count"] >= row["max_retries"]:
            return CommandResult(ok=False, reason="max_retries", message="Max retries exceeded")

        req = CommandRequest(
            device_id=row["device_id"],
            channel_id=row["channel_id"],
            command_type=row["command_type"],
            payload=json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"],
            source=row["source"],
            requires_ack=row["requires_ack"],
        )

        # Increment retry count
        await db.execute(
            "UPDATE device_commands SET retry_count = retry_count + 1 WHERE id = $1",
            command_id,
        )

        return await self.execute(req)


# Module-level singleton
command_coordinator = CommandCoordinator()
