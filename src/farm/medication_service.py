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
            (name, unit, unit_spec, packaging, category, manufacturer, price_per_unit,
             recommended_dose, note, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *""",
            data["name"], data.get("unit"), data.get("unit_spec"), data.get("packaging"),
            data.get("category"), data.get("manufacturer"), data.get("price_per_unit"),
            data.get("recommended_dose"), data.get("note"),
            data.get("status", "active"),
        )
        return {"ok": True, "medication": dict(row)}

    async def update(self, med_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE medications SET
                name = COALESCE($2, name),
                unit = COALESCE($3, unit),
                unit_spec = COALESCE($4, unit_spec),
                packaging = COALESCE($5, packaging),
                category = COALESCE($6, category),
                manufacturer = COALESCE($7, manufacturer),
                price_per_unit = COALESCE($8, price_per_unit),
                recommended_dose = COALESCE($9, recommended_dose),
                note = COALESCE($10, note),
                status = COALESCE($11, status)
            WHERE id = $1 RETURNING *""",
            med_id, data.get("name"), data.get("unit"), data.get("unit_spec"),
            data.get("packaging"), data.get("category"), data.get("manufacturer"),
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
