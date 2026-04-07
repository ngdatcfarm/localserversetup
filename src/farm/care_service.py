"""Care Service - Daily farm operations (cho ăn, tử vong, thuốc, cân)."""

from datetime import date
from typing import Optional
from src.services.database.db import db
from src.farm.inventory_service import inventory_service
from src.sync.sync_service import sync_service


class CareService:

    # ── Feed Logs (Cho ăn) ────────────────────────────

    async def log_feed(self, data: dict) -> dict:
        """Log a feeding event and deduct from warehouse."""
        # Deduct from warehouse if specified
        if data.get("warehouse_id") and data.get("product_id"):
            result = await inventory_service.export_stock({
                "warehouse_id": data["warehouse_id"],
                "product_id": data["product_id"],
                "quantity": data["quantity"],
                "reference_type": "feed_log",
                "notes": f"Cho ăn {data.get('barn_id', '')} {data.get('feed_date', '')}",
            })
            if not result["ok"]:
                return result

        row = await db.fetchrow(
            """INSERT INTO care_feeds
            (cycle_id, barn_id, feed_date, meal, product_id, quantity, remaining,
             warehouse_id, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["feed_date"],
            data.get("meal", "all_day"), data.get("product_id"),
            data["quantity"], data.get("remaining"),
            data.get("warehouse_id"), data.get("notes"),
        )

        # Queue sync to cloud - map local field names to cloud schema
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "feed_date": row["feed_date"].isoformat() if row.get("feed_date") else None,
            "session": row["meal"],  # local 'meal' -> cloud 'session'
            "product_id": row["product_id"],
            "feed_type_id": row.get("feed_type_id"),
            "quantity": row["quantity"],
            "bags": row.get("bags"),
            "kg_actual": row.get("kg_actual"),
            "remaining_pct": row.get("remaining_pct"),
            "remaining": row.get("remaining"),
            "warehouse_id": row.get("warehouse_id"),
            "notes": row.get("notes"),
        }
        await sync_service.queue_change("care_feeds", row["id"], "insert", payload)

        return {"ok": True, "feed": dict(row)}

    async def get_feeds(self, cycle_id: int, days: int = 30) -> list[dict]:
        rows = await db.fetch(
            """SELECT cf.*, p.name as product_name
            FROM care_feeds cf
            LEFT JOIN products p ON cf.product_id = p.id
            WHERE cf.cycle_id = $1
            ORDER BY cf.feed_date DESC, cf.created_at DESC
            LIMIT $2""",
            cycle_id, days * 4,  # ~4 meals per day
        )
        return [dict(r) for r in rows]

    async def get_daily_feed_summary(self, cycle_id: int, days: int = 30) -> list[dict]:
        rows = await db.fetch(
            """SELECT feed_date, SUM(quantity) as total_kg,
                      SUM(remaining) as total_remaining,
                      COUNT(*) as meal_count
            FROM care_feeds WHERE cycle_id = $1
            GROUP BY feed_date
            ORDER BY feed_date DESC LIMIT $2""",
            cycle_id, days,
        )
        return [dict(r) for r in rows]

    # ── Mortality (Tử vong) ───────────────────────────

    async def log_death(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO care_deaths
            (cycle_id, barn_id, death_date, count, cause, symptoms, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["death_date"],
            data["count"], data.get("cause"), data.get("symptoms"),
            data.get("notes"),
        )

        # Update current_count in cycle
        await db.execute(
            "UPDATE cycles SET current_count = current_count - $1, updated_at = NOW() WHERE id = $2",
            data["count"], data["cycle_id"],
        )

        # Queue sync to cloud - map local field names to cloud schema
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "death_date": row["death_date"].isoformat() if row.get("death_date") else None,
            "quantity": row["count"],  # local 'count' -> cloud 'quantity'
            "reason": row["cause"],     # local 'cause' -> cloud 'reason'
            "symptoms": row.get("symptoms"),
            "notes": row.get("notes"),
        }
        await sync_service.queue_change("care_deaths", row["id"], "insert", payload)

        return {"ok": True, "death": dict(row)}

    async def get_deaths(self, cycle_id: int, days: int = 30) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM care_deaths WHERE cycle_id = $1
            ORDER BY death_date DESC LIMIT $2""",
            cycle_id, days,
        )
        return [dict(r) for r in rows]

    async def get_daily_death_summary(self, cycle_id: int, days: int = 30) -> list[dict]:
        rows = await db.fetch(
            """SELECT death_date, SUM(count) as total_deaths,
                      array_agg(DISTINCT cause) FILTER (WHERE cause IS NOT NULL) as causes
            FROM care_deaths WHERE cycle_id = $1
            GROUP BY death_date
            ORDER BY death_date DESC LIMIT $2""",
            cycle_id, days,
        )
        return [dict(r) for r in rows]

    # ── Medication (Thuốc/Vaccine) ────────────────────

    async def log_medication(self, data: dict) -> dict:
        # Deduct from warehouse if specified
        if data.get("warehouse_id") and data.get("product_id") and data.get("quantity"):
            result = await inventory_service.export_stock({
                "warehouse_id": data["warehouse_id"],
                "product_id": data["product_id"],
                "quantity": data["quantity"],
                "reference_type": "medication",
                "notes": f"{data.get('med_type', '')} {data.get('barn_id', '')}",
            })
            if not result["ok"]:
                return result

        row = await db.fetchrow(
            """INSERT INTO care_medications
            (cycle_id, barn_id, med_date, med_type, product_id, quantity,
             method, warehouse_id, purpose, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["med_date"],
            data["med_type"], data.get("product_id"), data.get("quantity"),
            data.get("method"), data.get("warehouse_id"),
            data.get("purpose"), data.get("notes"),
        )

        # Queue sync to cloud - map local field names to cloud schema
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "med_date": row["med_date"].isoformat() if row.get("med_date") else None,
            "med_type": row["med_type"],
            "medication_id": row.get("product_id"),  # local product_id -> cloud medication_id
            "medication_name": row.get("medication_name"),
            "quantity": row["quantity"],
            "dosage": row.get("dosage"),
            "unit": row.get("unit"),
            "method": row.get("method"),
            "warehouse_id": row.get("warehouse_id"),
            "purpose": row.get("purpose"),
            "notes": row.get("notes"),
        }
        await sync_service.queue_change("care_medications", row["id"], "insert", payload)

        return {"ok": True, "medication": dict(row)}

    async def get_medications(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT cm.*, p.name as product_name
            FROM care_medications cm
            LEFT JOIN products p ON cm.product_id = p.id
            WHERE cm.cycle_id = $1
            ORDER BY cm.med_date DESC""",
            cycle_id,
        )
        return [dict(r) for r in rows]

    # ── Weight Sampling (Cân trọng lượng) ─────────────

    async def log_weight(self, data: dict) -> dict:
        day_age = None
        cycle = await db.fetchrow(
            "SELECT start_date FROM cycles WHERE id = $1", data["cycle_id"]
        )
        if cycle:
            day_age = (data["weigh_date"] - cycle["start_date"]).days

        row = await db.fetchrow(
            """INSERT INTO care_weights
            (cycle_id, barn_id, weigh_date, sample_count, total_weight,
             min_weight, max_weight, uniformity, day_age, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["weigh_date"],
            data["sample_count"], data["total_weight"],
            data.get("min_weight"), data.get("max_weight"),
            data.get("uniformity"), day_age, data.get("notes"),
        )

        # Update next weight reminder
        reminder = await db.fetchrow(
            "SELECT * FROM weight_reminders WHERE cycle_id = $1 AND enabled = TRUE",
            data["cycle_id"],
        )
        if reminder:
            from datetime import timedelta
            next_date = data["weigh_date"] + timedelta(days=reminder["remind_every_days"])
            await db.execute(
                "UPDATE weight_reminders SET next_remind_date = $1 WHERE id = $2",
                next_date, reminder["id"],
            )

        # Queue sync to cloud
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "weigh_date": row["weigh_date"].isoformat() if row.get("weigh_date") else None,
            "day_age": row["day_age"],
            "sample_count": row["sample_count"],
            "total_weight": row["total_weight"],
            "min_weight": row.get("min_weight"),
            "max_weight": row.get("max_weight"),
            "uniformity": row.get("uniformity"),
            "notes": row.get("notes"),
        }
        await sync_service.queue_change("weight_sessions", row["id"], "insert", payload)

        return {"ok": True, "weight": dict(row)}

    async def get_weights(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM care_weights WHERE cycle_id = $1
            ORDER BY weigh_date DESC""",
            cycle_id,
        )
        return [dict(r) for r in rows]

    async def get_weight_reminders(self, cycle_id: int = None) -> list[dict]:
        """Get upcoming weight reminders."""
        if cycle_id:
            rows = await db.fetch(
                """SELECT wr.*, c.name as cycle_name, c.barn_id
                FROM weight_reminders wr
                JOIN cycles c ON wr.cycle_id = c.id
                WHERE wr.cycle_id = $1 AND wr.enabled = TRUE""",
                cycle_id,
            )
        else:
            rows = await db.fetch(
                """SELECT wr.*, c.name as cycle_name, c.barn_id
                FROM weight_reminders wr
                JOIN cycles c ON wr.cycle_id = c.id
                WHERE wr.enabled = TRUE AND c.status = 'active'
                ORDER BY wr.next_remind_date"""
            )
        return [dict(r) for r in rows]

    async def update_weight_reminder(self, cycle_id: int, data: dict) -> dict:
        await db.execute(
            """UPDATE weight_reminders SET
                remind_every_days = COALESCE($1, remind_every_days),
                next_remind_date = COALESCE($2, next_remind_date),
                enabled = COALESCE($3, enabled)
            WHERE cycle_id = $4""",
            data.get("remind_every_days"), data.get("next_remind_date"),
            data.get("enabled"), cycle_id,
        )
        return {"ok": True}

    # ── Sales (Xuất bán) ──────────────────────────────

    async def log_sale(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO care_sales
            (cycle_id, barn_id, sale_date, count, total_weight, avg_weight,
             unit_price, total_amount, buyer, sale_type, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["sale_date"],
            data["count"], data.get("total_weight"), data.get("avg_weight"),
            data.get("unit_price"), data.get("total_amount"),
            data.get("buyer"), data.get("sale_type", "sale"), data.get("notes"),
        )

        # Update current_count
        await db.execute(
            "UPDATE cycles SET current_count = current_count - $1, updated_at = NOW() WHERE id = $2",
            data["count"], data["cycle_id"],
        )

        # Queue sync to cloud - map local field names to cloud schema
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "sale_date": row["sale_date"].isoformat() if row.get("sale_date") else None,
            "quantity": row["count"],       # local 'count' -> cloud 'quantity'
            "weight_kg": row["total_weight"],  # local 'total_weight' -> cloud 'weight_kg'
            "price_per_kg": row["unit_price"],  # local 'unit_price' -> cloud 'price_per_kg'
            "total_amount": row.get("total_amount"),
            "gender": row.get("gender"),
            "avg_weight": row.get("avg_weight"),
            "buyer": row.get("buyer"),
            "sale_type": row.get("sale_type"),
            "notes": row.get("notes"),
        }
        await sync_service.queue_change("care_sales", row["id"], "insert", payload)

        return {"ok": True, "sale": dict(row)}

    async def get_sales(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            "SELECT * FROM care_sales WHERE cycle_id = $1 ORDER BY sale_date DESC",
            cycle_id,
        )
        return [dict(r) for r in rows]

    # ── Delete Care Logs ──────────────────────────────

    async def delete_feed(self, feed_id: int) -> dict:
        """Delete a feed log. Restores inventory if warehouse/product specified."""
        feed = await db.fetchrow("SELECT * FROM care_feeds WHERE id = $1", feed_id)
        if not feed:
            return {"ok": False, "message": "Feed log not found"}

        # Restore inventory if warehouse_id and product_id specified
        if feed.get("warehouse_id") and feed.get("product_id") and feed.get("quantity"):
            await db.execute(
                """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
                feed["warehouse_id"], feed["product_id"], feed["quantity"],
            )

        await db.execute("DELETE FROM care_feeds WHERE id = $1", feed_id)
        return {"ok": True, "message": "Feed log deleted"}

    async def delete_death(self, death_id: int) -> dict:
        """Delete a death log. Restores current_count to cycle."""
        death = await db.fetchrow("SELECT * FROM care_deaths WHERE id = $1", death_id)
        if not death:
            return {"ok": False, "message": "Death log not found"}

        # Restore current_count to cycle
        await db.execute(
            "UPDATE cycles SET current_count = current_count + $1, updated_at = NOW() WHERE id = $2",
            death["count"], death["cycle_id"],
        )

        await db.execute("DELETE FROM care_deaths WHERE id = $1", death_id)
        return {"ok": True, "message": "Death log deleted"}

    async def delete_medication(self, med_id: int) -> dict:
        """Delete a medication log. Restores inventory if warehouse/product specified."""
        med = await db.fetchrow("SELECT * FROM care_medications WHERE id = $1", med_id)
        if not med:
            return {"ok": False, "message": "Medication log not found"}

        # Restore inventory if warehouse_id and product_id and quantity specified
        if med.get("warehouse_id") and med.get("product_id") and med.get("quantity"):
            await db.execute(
                """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
                med["warehouse_id"], med["product_id"], med["quantity"],
            )

        await db.execute("DELETE FROM care_medications WHERE id = $1", med_id)
        return {"ok": True, "message": "Medication log deleted"}

    async def delete_weight(self, weight_id: int) -> dict:
        """Delete a weight log."""
        weight = await db.fetchrow("SELECT * FROM care_weights WHERE id = $1", weight_id)
        if not weight:
            return {"ok": False, "message": "Weight log not found"}

        await db.execute("DELETE FROM care_weights WHERE id = $1", weight_id)
        return {"ok": True, "message": "Weight log deleted"}

    async def delete_sale(self, sale_id: int) -> dict:
        """Delete a sale log. Restores current_count to cycle."""
        sale = await db.fetchrow("SELECT * FROM care_sales WHERE id = $1", sale_id)
        if not sale:
            return {"ok": False, "message": "Sale log not found"}

        # Restore current_count to cycle
        await db.execute(
            "UPDATE cycles SET current_count = current_count + $1, updated_at = NOW() WHERE id = $2",
            sale["count"], sale["cycle_id"],
        )

        await db.execute("DELETE FROM care_sales WHERE id = $1", sale_id)
        return {"ok": True, "message": "Sale log deleted"}


care_service = CareService()
