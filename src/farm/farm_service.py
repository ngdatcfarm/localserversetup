"""Farm Service - Manage farms (nông trại)."""

from typing import Optional
from src.services.database.db import db


class FarmService:

    async def list_all(self, active_only: bool = True) -> list[dict]:
        """List all farms."""
        if active_only:
            rows = await db.fetch(
                "SELECT * FROM farms WHERE active = TRUE ORDER BY created_at DESC"
            )
        else:
            rows = await db.fetch("SELECT * FROM farms ORDER BY created_at DESC")
        return [dict(r) for r in rows]

    async def get(self, farm_id: str) -> Optional[dict]:
        """Get farm by ID."""
        row = await db.fetchrow("SELECT * FROM farms WHERE id = $1", farm_id)
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        """Create a new farm.

        Business rules:
        - id is required and must be unique
        - name is required
        - active defaults to TRUE
        """
        # Check if farm_id already exists
        existing = await db.fetchval("SELECT 1 FROM farms WHERE id = $1", data.get("id"))
        if existing:
            return {"ok": False, "message": f"Farm with id '{data['id']}' already exists"}

        # Check required fields
        if not data.get("id"):
            return {"ok": False, "message": "Farm ID is required"}
        if not data.get("name"):
            return {"ok": False, "message": "Farm name is required"}

        row = await db.fetchrow(
            """INSERT INTO farms (id, name, address, contact_name, contact_phone,
                                 contact_email, notes, active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *""",
            data["id"],
            data["name"],
            data.get("address"),
            data.get("contact_name"),
            data.get("contact_phone"),
            data.get("contact_email"),
            data.get("notes"),
            data.get("active", True),
        )
        return {"ok": True, "farm": dict(row)}

    async def update(self, farm_id: str, data: dict) -> dict:
        """Update farm fields.

        Only updates non-None values (partial update).
        """
        existing = await self.get(farm_id)
        if not existing:
            return {"ok": False, "message": "Farm not found"}

        await db.execute(
            """UPDATE farms SET
                name = COALESCE($1, name),
                address = COALESCE($2, address),
                contact_name = COALESCE($3, contact_name),
                contact_phone = COALESCE($4, contact_phone),
                contact_email = COALESCE($5, contact_email),
                notes = COALESCE($6, notes),
                active = COALESCE($7, active)
            WHERE id = $8""",
            data.get("name"),
            data.get("address"),
            data.get("contact_name"),
            data.get("contact_phone"),
            data.get("contact_email"),
            data.get("notes"),
            data.get("active"),
            farm_id,
        )
        updated = await self.get(farm_id)
        return {"ok": True, "farm": updated}

    async def delete(self, farm_id: str) -> dict:
        """Delete a farm.

        Business rules:
        - Cannot delete if farm has any barns
        """
        # Check if farm has barns
        barn_count = await db.fetchval(
            "SELECT COUNT(*) FROM barns WHERE farm_id = $1", farm_id
        )
        if barn_count > 0:
            return {
                "ok": False,
                "message": f"Cannot delete farm: has {barn_count} barn(s). Delete barns first.",
            }

        # Check if farm has warehouses
        warehouse_count = await db.fetchval(
            "SELECT COUNT(*) FROM warehouses WHERE farm_id = $1", farm_id
        )
        if warehouse_count > 0:
            return {
                "ok": False,
                "message": f"Cannot delete farm: has {warehouse_count} warehouse(s). Delete warehouses first.",
            }

        await db.execute("DELETE FROM farms WHERE id = $1", farm_id)
        return {"ok": True, "message": "Farm deleted"}

    async def get_summary(self, farm_id: str) -> Optional[dict]:
        """Get farm with barn count and warehouse count."""
        farm = await self.get(farm_id)
        if not farm:
            return None

        barn_count = await db.fetchval(
            "SELECT COUNT(*) FROM barns WHERE farm_id = $1", farm_id
        )
        active_barn_count = await db.fetchval(
            "SELECT COUNT(*) FROM barns WHERE farm_id = $1 AND active = TRUE", farm_id
        )
        warehouse_count = await db.fetchval(
            "SELECT COUNT(*) FROM warehouses WHERE farm_id = $1", farm_id
        )

        return {
            **farm,
            "barn_count": barn_count,
            "active_barn_count": active_barn_count,
            "warehouse_count": warehouse_count,
        }


# Singleton instance
farm_service = FarmService()
