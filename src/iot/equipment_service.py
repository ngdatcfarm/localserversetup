"""Equipment service - manages equipment types, equipment instances, and channel assignments."""

from datetime import datetime, timezone
from typing import Optional

from src.services.database.db import db

logger = __import__('logging').getLogger(__name__)


class EquipmentService:
    """Manages equipment CRUD and device channel assignments."""

    # ── Equipment Types ─────────────────────────────

    async def list_equipment_types(self) -> list[dict]:
        """Get all equipment types."""
        rows = await db.fetch("""
            SELECT et.*, p.name as product_name
            FROM equipment_types et
            LEFT JOIN products p ON et.product_id = p.id
            ORDER BY et.name
        """)
        return [dict(r) for r in rows]

    async def get_equipment_type(self, type_id: int) -> Optional[dict]:
        """Get single equipment type."""
        row = await db.fetchrow("""
            SELECT et.*, p.name as product_name
            FROM equipment_types et
            LEFT JOIN products p ON et.product_id = p.id
            WHERE et.id = $1
        """, type_id)
        return dict(row) if row else None

    async def create_equipment_type(self, data: dict) -> dict:
        """Create new equipment type."""
        result = await db.fetchval("""
            INSERT INTO equipment_types (code, name, product_id, power_watts, voltage_v,
                                         current_amp, mqtt_protocol, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        """,
            data.get('code'), data.get('name'), data.get('product_id'),
            data.get('power_watts'), data.get('voltage_v'), data.get('current_amp'),
            data.get('mqtt_protocol'), data.get('description')
        )
        return {"ok": True, "id": result}

    async def update_equipment_type(self, type_id: int, data: dict) -> dict:
        """Update equipment type."""
        result = await db.execute("""
            UPDATE equipment_types SET
                code = COALESCE($1, code),
                name = COALESCE($2, name),
                product_id = COALESCE($3, product_id),
                power_watts = COALESCE($4, power_watts),
                voltage_v = COALESCE($5, voltage_v),
                current_amp = COALESCE($6, current_amp),
                mqtt_protocol = COALESCE($7, mqtt_protocol),
                description = COALESCE($8, description)
            WHERE id = $9
        """,
            data.get('code'), data.get('name'), data.get('product_id'),
            data.get('power_watts'), data.get('voltage_v'), data.get('current_amp'),
            data.get('mqtt_protocol'), data.get('description'), type_id
        )
        return {"ok": True}

    async def delete_equipment_type(self, type_id: int) -> dict:
        """Delete equipment type (check if equipment exists)."""
        count = await db.fetchval(
            "SELECT COUNT(*) FROM equipment WHERE equipment_type_id = $1", type_id
        )
        if count > 0:
            return {"ok": False, "message": f"Cannot delete: {count} equipment items exist"}
        await db.execute("DELETE FROM equipment_types WHERE id = $1", type_id)
        return {"ok": True}

    # ── Equipment ──────────────────────────────────

    async def list_equipment(self, barn_id: Optional[str] = None,
                             equipment_type_id: Optional[int] = None) -> list[dict]:
        """Get equipment list with optional filters."""
        query = """
            SELECT e.*, et.name as type_name, et.mqtt_protocol,
                   d.name as device_name, d.mqtt_topic as device_topic
            FROM equipment e
            LEFT JOIN equipment_types et ON e.equipment_type_id = et.id
            LEFT JOIN devices d ON e.device_id = d.id
            WHERE 1=1
        """
        params = []
        if barn_id:
            params.append(barn_id)
            query += f" AND e.barn_id = ${len(params)}"
        if equipment_type_id:
            params.append(equipment_type_id)
            query += f" AND e.equipment_type_id = ${len(params)}"
        query += " ORDER BY e.name"

        rows = await db.fetch(query, *params)
        return [dict(r) for r in rows]

    async def get_equipment(self, equipment_id: int) -> Optional[dict]:
        """Get single equipment with details."""
        row = await db.fetchrow("""
            SELECT e.*, et.name as type_name, et.mqtt_protocol,
                   d.name as device_name, d.mqtt_topic as device_topic
            FROM equipment e
            LEFT JOIN equipment_types et ON e.equipment_type_id = et.id
            LEFT JOIN devices d ON e.device_id = d.id
            WHERE e.id = $1
        """, equipment_id)
        return dict(row) if row else None

    async def create_equipment(self, data: dict) -> dict:
        """Create new equipment instance."""
        result = await db.fetchval("""
            INSERT INTO equipment (barn_id, equipment_type_id, name, equipment_type,
                                  model, serial_no, power_watts, status, install_date,
                                  warranty_until, purchase_price, maintenance_interval_days, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
        """,
            data.get('barn_id'), data.get('equipment_type_id'), data.get('name'),
            data.get('equipment_type'), data.get('model'), data.get('serial_no'),
            data.get('power_watts'), data.get('status', 'active'), data.get('install_date'),
            data.get('warranty_until'), data.get('purchase_price'),
            data.get('maintenance_interval_days'), data.get('notes')
        )
        return {"ok": True, "id": result}

    async def update_equipment(self, equipment_id: int, data: dict) -> dict:
        """Update equipment instance."""
        result = await db.execute("""
            UPDATE equipment SET
                barn_id = COALESCE($1, barn_id),
                equipment_type_id = COALESCE($2, equipment_type_id),
                name = COALESCE($3, name),
                equipment_type = COALESCE($4, equipment_type),
                model = COALESCE($5, model),
                serial_no = COALESCE($6, serial_no),
                power_watts = COALESCE($7, power_watts),
                status = COALESCE($8, status),
                install_date = COALESCE($9, install_date),
                warranty_until = COALESCE($10, warranty_until),
                purchase_price = COALESCE($11, purchase_price),
                maintenance_interval_days = COALESCE($12, maintenance_interval_days),
                notes = COALESCE($13, notes)
            WHERE id = $14
        """,
            data.get('barn_id'), data.get('equipment_type_id'), data.get('name'),
            data.get('equipment_type'), data.get('model'), data.get('serial_no'),
            data.get('power_watts'), data.get('status'), data.get('install_date'),
            data.get('warranty_until'), data.get('purchase_price'),
            data.get('maintenance_interval_days'), data.get('notes'), equipment_id
        )
        return {"ok": True}

    async def delete_equipment(self, equipment_id: int) -> dict:
        """Delete equipment (check for active channel assignment)."""
        equip = await self.get_equipment(equipment_id)
        if not equip:
            return {"ok": False, "message": "Equipment not found"}
        if equip.get('device_id'):
            return {"ok": False, "message": "Remove device assignment first"}
        await db.execute("DELETE FROM equipment WHERE id = $1", equipment_id)
        return {"ok": True}

    # ── Channel Assignment ─────────────────────────

    async def assign_channel(self, equipment_id: int, device_id: int,
                             channel_number: int, changed_by: str = "system") -> dict:
        """Assign equipment to a device relay channel."""
        equip = await self.get_equipment(equipment_id)
        if not equip:
            return {"ok": False, "message": "Equipment not found"}

        # Check device exists
        device = await db.fetchrow(
            "SELECT id, mqtt_topic FROM devices WHERE id = $1", device_id
        )
        if not device:
            return {"ok": False, "message": "Device not found"}

        # Update equipment with device and channel
        await db.execute("""
            UPDATE equipment SET device_id = $1, channel_number = $2
            WHERE id = $3
        """, device_id, channel_number, equipment_id)

        # Log assignment
        await db.execute("""
            INSERT INTO equipment_assignment_log (device_channel_id, equipment_id, action, changed_by)
            VALUES ($1, $2, 'assign', $3)
        """, channel_number, equipment_id, changed_by)

        return {
            "ok": True,
            "equipment_id": equipment_id,
            "device_id": device_id,
            "channel_number": channel_number,
            "mqtt_topic": dict(device)['mqtt_topic']
        }

    async def unassign_channel(self, equipment_id: int, changed_by: str = "system") -> dict:
        """Remove equipment from device channel."""
        equip = await self.get_equipment(equipment_id)
        if not equip:
            return {"ok": False, "message": "Equipment not found"}

        old_device_id = equip.get('device_id')
        old_channel = equip.get('channel_number')

        await db.execute("""
            UPDATE equipment SET device_id = NULL, channel_number = NULL
            WHERE id = $1
        """, equipment_id)

        if old_device_id:
            await db.execute("""
                INSERT INTO equipment_assignment_log (device_channel_id, equipment_id, action, changed_by)
                VALUES ($1, $2, 'unassign', $3)
            """, old_channel or 0, equipment_id, changed_by)

        return {"ok": True, "message": "Unassigned from device"}

    async def get_assignment_logs(self, equipment_id: int, limit: int = 50) -> list[dict]:
        """Get assignment history for equipment."""
        rows = await db.fetch("""
            SELECT l.*, d.name as device_name, d.mqtt_topic
            FROM equipment_assignment_log l
            LEFT JOIN devices d ON l.device_channel_id = d.id
            WHERE l.equipment_id = $1
            ORDER BY l.changed_at DESC
            LIMIT $2
        """, equipment_id, limit)
        return [dict(r) for r in rows]

    # ── Command Log ──────────────────────────────────

    async def log_command(self, equipment_id: int, command: str, value: int = None,
                          triggered_by: str = "system") -> dict:
        """Log a command sent to equipment."""
        equip = await self.get_equipment(equipment_id)
        result = await db.execute("""
            INSERT INTO equipment_command_log (equipment_id, device_channel_id, command, value, triggered_by)
            VALUES ($1, $2, $3, $4, $5)
        """,
            equipment_id, equip.get('channel_number') if equip else None,
            command, value, triggered_by
        )
        return {"ok": True}

    async def get_command_logs(self, equipment_id: int, limit: int = 50) -> list[dict]:
        """Get command history for equipment."""
        rows = await db.fetch("""
            SELECT * FROM equipment_command_log
            WHERE equipment_id = $1
            ORDER BY recorded_at DESC
            LIMIT $2
        """, equipment_id, limit)
        return [dict(r) for r in rows]


# Module-level singleton
equipment_service = EquipmentService()