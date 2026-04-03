"""Medication Service - Medication catalog management."""

from src.services.database.db import db


class MedicationService:

    async def list_all(self, category: str = None, status: str = None) -> list[dict]:
        conditions = []
        params = []
        idx = 1
        if category:
            conditions.append(f"category = ${idx}")
            params.append(category)
            idx += 1
        if status:
            conditions.append(f"status = ${idx}")
            params.append(status)
            idx += 1
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await db.fetch(
            f"SELECT * FROM medications {where} ORDER BY category, name", *params
        )
        return [dict(r) for r in rows]

    async def get(self, med_id: int) -> dict | None:
        row = await db.fetchrow("SELECT * FROM medications WHERE id = $1", med_id)
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO medications
            (name, unit, category, manufacturer, price_per_unit,
             recommended_dose, note, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *""",
            data["name"], data.get("unit"), data.get("category"),
            data.get("manufacturer"), data.get("price_per_unit"),
            data.get("recommended_dose"), data.get("note"),
            data.get("status", "active"),
        )
        return {"ok": True, "medication": dict(row)}

    async def update(self, med_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE medications SET
                name = COALESCE($2, name),
                unit = COALESCE($3, unit),
                category = COALESCE($4, category),
                manufacturer = COALESCE($5, manufacturer),
                price_per_unit = COALESCE($6, price_per_unit),
                recommended_dose = COALESCE($7, recommended_dose),
                note = COALESCE($8, note),
                status = COALESCE($9, status)
            WHERE id = $1 RETURNING *""",
            med_id, data.get("name"), data.get("unit"),
            data.get("category"), data.get("manufacturer"),
            data.get("price_per_unit"), data.get("recommended_dose"),
            data.get("note"), data.get("status"),
        )
        if not row:
            return {"ok": False, "message": "Medication not found"}
        return {"ok": True, "medication": dict(row)}

    async def delete(self, med_id: int) -> dict:
        in_use = await db.fetchval(
            "SELECT COUNT(*) FROM care_medications WHERE medication_id = $1", med_id
        )
        if in_use:
            return {"ok": False, "message": f"Medication in use by {in_use} records"}
        await db.execute("DELETE FROM medications WHERE id = $1", med_id)
        return {"ok": True}


medication_service = MedicationService()
