"""Barn Service - Manage farm barns (chuồng)."""

from typing import Optional
from src.services.database.db import db


class BarnService:

    async def list_all(self, farm_id: str = None, active_only: bool = True) -> list[dict]:
        """List barns, optionally filtered by farm_id."""
        query = "SELECT * FROM barns WHERE 1=1"
        params = []

        if farm_id:
            params.append(farm_id)
            query += f" AND farm_id = ${len(params)}"

        if active_only:
            params.append(True)
            query += f" AND active = ${len(params)}"

        query += " ORDER BY id"
        rows = await db.fetch(query, *params)
        return [dict(r) for r in rows]

    async def get(self, barn_id: str) -> Optional[dict]:
        row = await db.fetchrow("SELECT * FROM barns WHERE id = $1", barn_id)
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        """Create a new barn.

        Business rules:
        - id is required and must be unique
        - name is required
        - farm_id defaults to 'farm-01' if not specified
        """
        # Check if barn_id already exists
        existing = await db.fetchval("SELECT 1 FROM barns WHERE id = $1", data.get("id"))
        if existing:
            return {"ok": False, "message": f"Barn with id '{data['id']}' already exists"}

        if not data.get("id"):
            return {"ok": False, "message": "Barn ID is required"}
        if not data.get("name"):
            return {"ok": False, "message": "Barn name is required"}

        row = await db.fetchrow(
            """INSERT INTO barns (id, name, farm_id, capacity, area_sqm, description, active)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *""",
            data["id"],
            data["name"],
            data.get("farm_id", "farm-01"),
            data.get("capacity"),
            data.get("area_sqm"),
            data.get("description"),
            data.get("active", True),
        )
        return {"ok": True, "barn": dict(row)}

    async def update(self, barn_id: str, data: dict) -> dict:
        """Update barn fields. Only non-None values are updated."""
        existing = await self.get(barn_id)
        if not existing:
            return {"ok": False, "message": "Barn not found"}

        await db.execute(
            """UPDATE barns SET
                name = COALESCE($1, name),
                farm_id = COALESCE($2, farm_id),
                capacity = COALESCE($3, capacity),
                area_sqm = COALESCE($4, area_sqm),
                description = COALESCE($5, description),
                active = COALESCE($6, active)
            WHERE id = $7""",
            data.get("name"),
            data.get("farm_id"),
            data.get("capacity"),
            data.get("area_sqm"),
            data.get("description"),
            data.get("active"),
            barn_id,
        )
        return {"ok": True, "barn": await self.get(barn_id)}

    async def delete(self, barn_id: str) -> dict:
        """Delete a barn.

        Business rules:
        - Cannot delete if barn has an active cycle
        """
        # Check for active cycle
        active_cycle = await db.fetchval(
            "SELECT COUNT(*) FROM cycles WHERE barn_id = $1 AND status = 'active'",
            barn_id
        )
        if active_cycle > 0:
            return {
                "ok": False,
                "message": "Cannot delete barn: has an active cycle. Close or delete the cycle first.",
            }

        await db.execute("DELETE FROM barns WHERE id = $1", barn_id)
        return {"ok": True, "message": "Barn deleted"}

    async def get_summary(self, barn_id: str) -> dict:
        """Get barn with active cycle, device count, and farm info."""
        barn = await self.get(barn_id)
        if not barn:
            return None

        cycle = await db.fetchrow(
            """SELECT id, name, initial_count, current_count, start_date,
                      (CURRENT_DATE - start_date) as day_age
            FROM cycles WHERE barn_id = $1 AND status = 'active'
            ORDER BY start_date DESC LIMIT 1""",
            barn_id,
        )
        device_count = await db.fetchval(
            "SELECT COUNT(*) FROM devices WHERE barn_id = $1", barn_id
        )

        # Get farm info
        farm = await db.fetchrow(
            "SELECT id, name FROM farms WHERE id = $1", barn.get("farm_id")
        )

        barn["active_cycle"] = dict(cycle) if cycle else None
        barn["device_count"] = device_count
        barn["farm"] = dict(farm) if farm else None
        return barn


barn_service = BarnService()
