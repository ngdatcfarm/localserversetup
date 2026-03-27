"""Feed Service - Feed brands and feed types management."""

from src.services.database.db import db


class FeedService:

    # ── Feed Brands ──────────────────────────────────

    async def list_brands(self, status: str = None) -> list[dict]:
        if status:
            rows = await db.fetch(
                "SELECT * FROM feed_brands WHERE status = $1 ORDER BY name", status
            )
        else:
            rows = await db.fetch("SELECT * FROM feed_brands ORDER BY name")
        return [dict(r) for r in rows]

    async def get_brand(self, brand_id: int) -> dict | None:
        row = await db.fetchrow("SELECT * FROM feed_brands WHERE id = $1", brand_id)
        return dict(row) if row else None

    async def create_brand(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO feed_brands (name, kg_per_bag, note, status)
            VALUES ($1, $2, $3, $4) RETURNING *""",
            data["name"], data.get("kg_per_bag"), data.get("note"),
            data.get("status", "active"),
        )
        return {"ok": True, "brand": dict(row)}

    async def update_brand(self, brand_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE feed_brands SET
                name = COALESCE($2, name),
                kg_per_bag = COALESCE($3, kg_per_bag),
                note = COALESCE($4, note),
                status = COALESCE($5, status)
            WHERE id = $1 RETURNING *""",
            brand_id, data.get("name"), data.get("kg_per_bag"),
            data.get("note"), data.get("status"),
        )
        if not row:
            return {"ok": False, "message": "Brand not found"}
        return {"ok": True, "brand": dict(row)}

    async def delete_brand(self, brand_id: int) -> dict:
        in_use = await db.fetchval(
            "SELECT COUNT(*) FROM feed_types WHERE feed_brand_id = $1", brand_id
        )
        if in_use:
            return {"ok": False, "message": f"Brand in use by {in_use} feed types"}
        await db.execute("DELETE FROM feed_brands WHERE id = $1", brand_id)
        return {"ok": True}

    # ── Feed Types ───────────────────────────────────

    async def list_types(self, brand_id: int = None, status: str = None) -> list[dict]:
        conditions = []
        params = []
        idx = 1
        if brand_id:
            conditions.append(f"ft.feed_brand_id = ${idx}")
            params.append(brand_id)
            idx += 1
        if status:
            conditions.append(f"ft.status = ${idx}")
            params.append(status)
            idx += 1
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await db.fetch(
            f"""SELECT ft.*, fb.name as brand_name
            FROM feed_types ft
            LEFT JOIN feed_brands fb ON ft.feed_brand_id = fb.id
            {where} ORDER BY fb.name, ft.code""",
            *params,
        )
        return [dict(r) for r in rows]

    async def get_type(self, type_id: int) -> dict | None:
        row = await db.fetchrow(
            """SELECT ft.*, fb.name as brand_name
            FROM feed_types ft
            LEFT JOIN feed_brands fb ON ft.feed_brand_id = fb.id
            WHERE ft.id = $1""", type_id
        )
        return dict(row) if row else None

    async def create_type(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO feed_types
            (feed_brand_id, code, price_per_bag, name, suggested_stage, note, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
            data.get("feed_brand_id"), data.get("code"), data.get("price_per_bag"),
            data["name"], data.get("suggested_stage"), data.get("note"),
            data.get("status", "active"),
        )
        return {"ok": True, "feed_type": dict(row)}

    async def update_type(self, type_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE feed_types SET
                feed_brand_id = COALESCE($2, feed_brand_id),
                code = COALESCE($3, code),
                price_per_bag = COALESCE($4, price_per_bag),
                name = COALESCE($5, name),
                suggested_stage = COALESCE($6, suggested_stage),
                note = COALESCE($7, note),
                status = COALESCE($8, status)
            WHERE id = $1 RETURNING *""",
            type_id, data.get("feed_brand_id"), data.get("code"),
            data.get("price_per_bag"), data.get("name"),
            data.get("suggested_stage"), data.get("note"), data.get("status"),
        )
        if not row:
            return {"ok": False, "message": "Feed type not found"}
        return {"ok": True, "feed_type": dict(row)}

    async def delete_type(self, type_id: int) -> dict:
        in_use = await db.fetchval(
            "SELECT COUNT(*) FROM care_feeds WHERE feed_type_id = $1", type_id
        )
        if in_use:
            return {"ok": False, "message": f"Feed type in use by {in_use} feed records"}
        await db.execute("DELETE FROM feed_types WHERE id = $1", type_id)
        return {"ok": True}


feed_service = FeedService()
