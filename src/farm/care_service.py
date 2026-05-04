"""Care Service - Daily farm operations (cho ăn, tử vong, thuốc, cân)."""

from datetime import date
from typing import Optional
from src.services.database.db import db
from src.farm.inventory_service import inventory_service
from src.sync.sync_service import sync_service


class CareService:

    # ── Feed Logs (Cho ăn) ────────────────────────────

    async def log_feed(self, data: dict) -> dict:
        """Log a feeding event and deduct from warehouse.

        Validates:
        - warehouse_type must be 'feed' or have warehouse_type 'mixed'
        - If warehouse_id not provided, auto-lookup from barn_default_warehouses
        - Product product_type must be 'feed'
        - Warehouse must be active
        """
        barn_id = data.get("barn_id")
        warehouse_id = data.get("warehouse_id")
        product_id = data.get("product_id")

        # ── Auto-lookup default warehouse if not specified ──
        if not warehouse_id and barn_id:
            try:
                default_wh = await inventory_service.get_default_warehouse(barn_id, "feed")
                if default_wh:
                    warehouse_id = default_wh["warehouse_id"]
                    data = {**data, "warehouse_id": warehouse_id}
            except Exception:
                # barn_default_warehouses table may not exist - skip auto-lookup
                pass

        # ── Validate warehouse if specified or resolved ──
        if warehouse_id:
            warehouse = await inventory_service.get_warehouse(warehouse_id)
            if not warehouse:
                return {"ok": False, "message": f"Warehouse {warehouse_id} not found"}
            if not warehouse.get("active"):
                return {"ok": False, "message": "Warehouse is not active"}
            if warehouse.get("warehouse_type") not in ("feed", "mixed"):
                return {"ok": False, "message": f"Warehouse type '{warehouse['warehouse_type']}' is not valid for feed operations. Must be 'feed' or 'mixed'."}

        # ── Validate product type matches ──
        if product_id:
            product = await db.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
            if not product:
                return {"ok": False, "message": f"Product {product_id} not found"}
            if product.get("product_type") not in ("feed", None):
                return {"ok": False, "message": f"Product type '{product['product_type']}' is not valid for feed operations. Must be 'feed'."}

        # Deduct from warehouse if specified
        if warehouse_id and product_id:
            result = await inventory_service.export_stock({
                "warehouse_id": warehouse_id,
                "product_id": product_id,
                "quantity": data["quantity"],
                "reference_type": "feed_log",
                "notes": f"Cho ăn {barn_id} {data.get('feed_date', '')}",
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
        try:
            await sync_service.queue_change("care_feeds", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

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
        try:
            await sync_service.queue_change("care_deaths", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

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
        """Log a medication/vaccination event and deduct from warehouse.

        Validates:
        - warehouse_type must be 'medication' or have warehouse_type 'mixed'
        - If warehouse_id not provided, auto-lookup from barn_default_warehouses
        - Product product_type must be 'medication' or 'medicine'
        - Warehouse must be active
        """
        barn_id = data.get("barn_id")
        warehouse_id = data.get("warehouse_id")
        product_id = data.get("product_id")

        # ── Auto-lookup default warehouse if not specified ──
        if not warehouse_id and barn_id:
            try:
                default_wh = await inventory_service.get_default_warehouse(barn_id, "medication")
                if default_wh:
                    warehouse_id = default_wh["warehouse_id"]
                    data = {**data, "warehouse_id": warehouse_id}
            except Exception:
                # barn_default_warehouses table may not exist - skip auto-lookup
                pass

        # ── Validate warehouse if specified or resolved ──
        if warehouse_id:
            warehouse = await inventory_service.get_warehouse(warehouse_id)
            if not warehouse:
                return {"ok": False, "message": f"Warehouse {warehouse_id} not found"}
            if not warehouse.get("active"):
                return {"ok": False, "message": "Warehouse is not active"}
            if warehouse.get("warehouse_type") not in ("medication", "mixed"):
                return {"ok": False, "message": f"Warehouse type '{warehouse['warehouse_type']}' is not valid for medication operations. Must be 'medication' or 'mixed'."}

        # ── Validate product type matches ──
        if product_id:
            product = await db.fetchrow("SELECT * FROM products WHERE id = $1", product_id)
            if not product:
                return {"ok": False, "message": f"Product {product_id} not found"}
            if product.get("product_type") not in ("medication", "medicine", None):
                return {"ok": False, "message": f"Product type '{product['product_type']}' is not valid for medication operations. Must be 'medication' or 'medicine'."}

        # Deduct from warehouse if specified
        if warehouse_id and product_id and data.get("quantity"):
            result = await inventory_service.export_stock({
                "warehouse_id": warehouse_id,
                "product_id": product_id,
                "quantity": data["quantity"],
                "reference_type": "medication",
                "notes": f"{data.get('med_type', '')} {barn_id}",
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
        try:
            await sync_service.queue_change("care_medications", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

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

        # Get samples array (individual bird weights in grams)
        samples = data.get("samples", [])
        gender = data.get("gender", "mixed")  # 'male', 'female', 'mixed'

        # If individual samples provided, calculate aggregates
        if samples:
            total_weight = sum(s["weight_g"] for s in samples)
            sample_count = len(samples)

            # Calculate gender-specific stats if gender markers present
            male_samples = [s for s in samples if s.get("gender") == "male"]
            female_samples = [s for s in samples if s.get("gender") == "female"]

            sample_male = len(male_samples)
            sample_female = len(female_samples)
            total_weight_male = sum(s["weight_g"] for s in male_samples) if male_samples else None
            total_weight_female = sum(s["weight_g"] for s in female_samples) if female_samples else None

            # Calculate min/max/uniformity from all samples
            weights = [s["weight_g"] for s in samples]
            min_weight = min(weights) if weights else None
            max_weight = max(weights) if weights else None

            # Uniformity: % of birds within ±10% of avg
            avg_weight = total_weight / sample_count if sample_count > 0 else 0
            if avg_weight > 0:
                within_range = sum(1 for w in weights if abs(w - avg_weight) / avg_weight <= 0.10)
                uniformity = (within_range / sample_count * 100) if sample_count > 0 else 0
            else:
                uniformity = 0
        else:
            # Use aggregate values from form
            total_weight = data.get("total_weight", 0)
            sample_count = data.get("sample_count", 0)
            min_weight = data.get("min_weight")
            max_weight = data.get("max_weight")
            uniformity = data.get("uniformity")
            sample_male = data.get("sample_male", 0)
            sample_female = data.get("sample_female", 0)
            total_weight_male = data.get("total_weight_male")
            total_weight_female = data.get("total_weight_female")

        row = await db.fetchrow(
            """INSERT INTO care_weights
            (cycle_id, barn_id, weigh_date, sample_count, total_weight,
             min_weight, max_weight, uniformity, day_age, notes,
             gender, sample_male, sample_female, total_weight_male, total_weight_female)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *""",
            data["cycle_id"], data["barn_id"], data["weigh_date"],
            sample_count, total_weight,
            min_weight, max_weight, uniformity, day_age, data.get("notes"),
            gender, sample_male, sample_female, total_weight_male, total_weight_female,
        )

        weight_id = row["id"]

        # Insert individual samples if provided
        if samples:
            for s in samples:
                await db.execute(
                    """INSERT INTO weight_samples (weight_id, weight_g, gender)
                    VALUES ($1, $2, $3)""",
                    weight_id, s["weight_g"], s.get("gender"),
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
            "gender": row.get("gender"),
            "sample_male": row.get("sample_male"),
            "sample_female": row.get("sample_female"),
            "avg_weight_male": row.get("avg_weight_male"),
            "avg_weight_female": row.get("avg_weight_female"),
        }
        try:
            await sync_service.queue_change("weight_sessions", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

        return {"ok": True, "weight": dict(row)}

    async def get_weights(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM care_weights WHERE cycle_id = $1
            ORDER BY weigh_date DESC""",
            cycle_id,
        )
        weights = []
        for r in rows:
            w = dict(r)
            # Get individual samples if any
            samples = await db.fetch(
                "SELECT * FROM weight_samples WHERE weight_id = $1 ORDER BY id", r["id"]
            )
            w["samples"] = [dict(s) for s in samples]
            weights.append(w)
        return weights

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
        try:
            await sync_service.queue_change("care_sales", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

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

    # ── Water Logs (Nước uống) ───────────────────────────

    async def log_water(self, data: dict) -> dict:
        """Log water consumption."""
        row = await db.fetchrow(
            """INSERT INTO care_water_logs
            (cycle_id, barn_id, water_date, shift, consumption_liters, medicated, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
            data["cycle_id"],
            data["barn_id"],
            data["water_date"],
            data.get("shift", "all_day"),
            data.get("consumption_liters"),
            data.get("medicated", False),
            data.get("notes"),
        )

        # Queue sync to cloud - convert Decimal to float for JSON serialization
        from decimal import Decimal
        def to_float(val):
            if val is None:
                return None
            if isinstance(val, Decimal):
                return float(val)
            return val

        payload = {
            "id": int(row["id"]),
            "cycle_id": int(row["cycle_id"]),
            "barn_id": row["barn_id"],
            "water_date": row["water_date"].isoformat() if row.get("water_date") else None,
            "shift": row["shift"],
            "consumption_liters": to_float(row["consumption_liters"]),
            "medicated": bool(row["medicated"]),
            "notes": row.get("notes"),
        }
        try:
            await sync_service.queue_change("care_water_logs", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

        return {"ok": True, "water": dict(row)}

    async def get_water_logs(self, cycle_id: int, days: int = 30) -> list[dict]:
        """Get water logs for a cycle."""
        rows = await db.fetch(
            """SELECT * FROM care_water_logs WHERE cycle_id = $1
            ORDER BY water_date DESC, created_at DESC LIMIT $2""",
            cycle_id, days * 2,  # ~2 logs per day
        )
        return [dict(r) for r in rows]

    async def delete_water(self, water_id: int) -> dict:
        """Delete a water log."""
        water = await db.fetchrow("SELECT * FROM care_water_logs WHERE id = $1", water_id)
        if not water:
            return {"ok": False, "message": "Water log not found"}

        await db.execute("DELETE FROM care_water_logs WHERE id = $1", water_id)
        return {"ok": True, "message": "Water log deleted"}

    # ── Health Notes (Ghi nhận sức khỏe) ─────────────────

    async def log_health(self, data: dict) -> dict:
        """Log health observations with flags."""
        import json
        health_flags = data.get("health_flags", [])
        # Convert list to JSON string for JSONB column
        health_flags_json = json.dumps(health_flags) if isinstance(health_flags, list) else health_flags

        row = await db.fetchrow(
            """INSERT INTO health_notes
            (cycle_id, barn_id, recorded_at, day_age, severity, symptoms, health_flags, resolved)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *""",
            data["cycle_id"],
            data.get("barn_id"),
            data.get("recorded_at", date.today()),
            data.get("day_age"),
            data.get("severity", "normal"),
            data.get("symptoms"),
            health_flags_json,
            False,
        )

        # Queue sync to cloud - health_flags from JSONB needs parsing
        from decimal import Decimal
        def to_float(val):
            if val is None:
                return None
            if isinstance(val, Decimal):
                return float(val)
            return val

        # Parse health_flags if it's a string
        flags = row["health_flags"]
        if isinstance(flags, str):
            flags = json.loads(flags) if flags else []

        payload = {
            "id": int(row["id"]),
            "cycle_id": int(row["cycle_id"]),
            "barn_id": row["barn_id"],
            "recorded_at": row["recorded_at"].isoformat() if row.get("recorded_at") else None,
            "day_age": row["day_age"],
            "severity": row["severity"],
            "symptoms": row["symptoms"],
            "health_flags": flags,
            "resolved": bool(row["resolved"]),
        }
        try:
            await sync_service.queue_change("health_notes", row["id"], "insert", payload)
        except Exception:
            pass  # Sync may fail if cloud not reachable

        return {"ok": True, "health": dict(row)}

    async def get_health_notes(self, cycle_id: int, days: int = 30) -> list[dict]:
        """Get health notes for a cycle."""
        rows = await db.fetch(
            """SELECT * FROM health_notes WHERE cycle_id = $1
            ORDER BY recorded_at DESC LIMIT $2""",
            cycle_id, days,
        )
        return [dict(r) for r in rows]

    async def resolve_health_note(self, note_id: int) -> dict:
        """Mark a health note as resolved."""
        from datetime import datetime
        row = await db.fetchrow(
            """UPDATE health_notes SET resolved = TRUE, resolved_at = $1
            WHERE id = $2 RETURNING *""",
            datetime.utcnow(), note_id,
        )
        if not row:
            return {"ok": False, "message": "Health note not found"}
        return {"ok": True, "health": dict(row)}


care_service = CareService()
