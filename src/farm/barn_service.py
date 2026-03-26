"""Barn Service - Manage farm barns (chuồng)."""

from typing import Optional
from src.services.database.db import db


class BarnService:

    async def list_all(self, active_only: bool = True) -> list[dict]:
        if active_only:
            rows = await db.fetch(
                "SELECT * FROM barns WHERE active = TRUE ORDER BY id"
            )
        else:
            rows = await db.fetch("SELECT * FROM barns ORDER BY id")
        return [dict(r) for r in rows]

    async def get(self, barn_id: str) -> Optional[dict]:
        row = await db.fetchrow("SELECT * FROM barns WHERE id = $1", barn_id)
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO barns (id, name, capacity, area_sqm, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            data["id"], data["name"], data.get("capacity"),
            data.get("area_sqm"), data.get("description"),
        )
        return {"ok": True, "barn": dict(row)}

    async def update(self, barn_id: str, data: dict) -> dict:
        await db.execute(
            """UPDATE barns SET
                name = COALESCE($1, name),
                capacity = COALESCE($2, capacity),
                area_sqm = COALESCE($3, area_sqm),
                description = COALESCE($4, description),
                active = COALESCE($5, active)
            WHERE id = $6""",
            data.get("name"), data.get("capacity"),
            data.get("area_sqm"), data.get("description"),
            data.get("active"), barn_id,
        )
        return {"ok": True}

    async def get_summary(self, barn_id: str) -> dict:
        """Get barn with active cycle and device count."""
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
        barn["active_cycle"] = dict(cycle) if cycle else None
        barn["device_count"] = device_count
        return barn


barn_service = BarnService()
