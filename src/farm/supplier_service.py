"""Supplier Service - Supplier management."""

from src.services.database.db import db


class SupplierService:

    async def list_all(self, status: str = None) -> list[dict]:
        if status:
            rows = await db.fetch(
                "SELECT * FROM suppliers WHERE status = $1 ORDER BY name", status
            )
        else:
            rows = await db.fetch("SELECT * FROM suppliers ORDER BY name")
        return [dict(r) for r in rows]

    async def get(self, supplier_id: int) -> dict | None:
        row = await db.fetchrow("SELECT * FROM suppliers WHERE id = $1", supplier_id)
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO suppliers (name, phone, address, note, status)
            VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            data["name"], data.get("phone"), data.get("address"),
            data.get("note"), data.get("status", "active"),
        )
        return {"ok": True, "supplier": dict(row)}

    async def update(self, supplier_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE suppliers SET
                name = COALESCE($2, name),
                phone = COALESCE($3, phone),
                address = COALESCE($4, address),
                note = COALESCE($5, note),
                status = COALESCE($6, status)
            WHERE id = $1 RETURNING *""",
            supplier_id, data.get("name"), data.get("phone"),
            data.get("address"), data.get("note"), data.get("status"),
        )
        if not row:
            return {"ok": False, "message": "Supplier not found"}
        return {"ok": True, "supplier": dict(row)}

    async def delete(self, supplier_id: int) -> dict:
        await db.execute("DELETE FROM suppliers WHERE id = $1", supplier_id)
        return {"ok": True}


supplier_service = SupplierService()
