"""Care Service - Daily farm operations (cho ăn, tử vong, thuốc, cân).

Decoupled from inventory: care is a pure log (notebook). No automatic
stock deduction. Inventory module operates independently.
"""

import asyncio
from datetime import date
from typing import Optional
from src.services.database.db import db
from src.sync.sync_service import sync_service
from src.utils.timezone import now_hcm


class CareService:

    # ── Feed Logs (Cho ăn) ────────────────────────────

    async def log_feed(self, data: dict) -> dict:
        """Log a feeding event (pure log, no inventory deduction)."""
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

    async def get_feeds(self, cycle_id: int, days: int = 30,
                        date_from: str = None, date_to: str = None) -> list[dict]:
        params = [cycle_id]
        idx = 2
        date_filter = ""
        if date_from:
            date_filter += f" AND cf.feed_date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1
        if date_to:
            date_filter += f" AND cf.feed_date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1
        params.append(days * 4)
        rows = await db.fetch(
            f"""SELECT cf.*, p.name as product_name
            FROM care_feeds cf
            LEFT JOIN products p ON cf.product_id = p.id
            WHERE cf.cycle_id = $1{date_filter}
            ORDER BY cf.feed_date DESC, cf.created_at DESC
            LIMIT ${idx}""",
            *params,
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
        async with db.transaction() as conn:
            row = await conn.fetchrow(
                """INSERT INTO care_deaths
                (cycle_id, barn_id, death_date, count, cause, symptoms, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
                data["cycle_id"], data["barn_id"], data["death_date"],
                data["count"], data.get("cause"), data.get("symptoms"),
                data.get("notes"),
            )
            await conn.execute(
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

    async def get_deaths(self, cycle_id: int, days: int = 30,
                         date_from: str = None, date_to: str = None) -> list[dict]:
        params = [cycle_id]
        idx = 2
        date_filter = ""
        if date_from:
            date_filter += f" AND death_date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1
        if date_to:
            date_filter += f" AND death_date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1
        params.append(days)
        rows = await db.fetch(
            f"""SELECT * FROM care_deaths WHERE cycle_id = $1{date_filter}
            ORDER BY death_date DESC LIMIT ${idx}""",
            *params,
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
        """Log a medication/vaccination event (pure log, no inventory deduction).

        Save-time alias normalization: after INSERT, if `custom_name` matches an
        approved alias, atomically set medication_id + medication_name so the row
        counts as canonical in queries — prevents free-text drift.
        """
        async with db.transaction() as conn:
            row = await conn.fetchrow(
                """INSERT INTO care_medications
                (cycle_id, barn_id, med_date, med_type, product_id, quantity,
                 method, warehouse_id, purpose, notes, unit, custom_name, shift)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *""",
                data["cycle_id"], data["barn_id"], data["med_date"],
                data["med_type"], data.get("product_id"), data.get("quantity"),
                data.get("method"), data.get("warehouse_id"),
                data.get("purpose"), data.get("notes"),
                data.get("unit"), data.get("custom_name"), data.get("shift"),
            )

            # Save-time alias normalization (skip if product_id already set)
            custom_name = (data.get("custom_name") or "").strip()
            if custom_name and not data.get("product_id"):
                alias = await conn.fetchrow("""
                    SELECT mna.canonical_medication_id, m.name AS canonical_name
                    FROM medication_name_aliases mna
                    JOIN medications m ON m.id = mna.canonical_medication_id
                    WHERE LOWER(TRIM(mna.alias_name)) = LOWER($1)
                      AND mna.approved_by IS NOT NULL
                    LIMIT 1
                """, custom_name)
                if alias:
                    await conn.execute("""
                        UPDATE care_medications
                        SET medication_id = $1, medication_name = $2
                        WHERE id = $3
                    """, alias["canonical_medication_id"], alias["canonical_name"], row["id"])
                    # Refresh row dict so payload sent to sync has linked IDs
                    row["medication_id"] = alias["canonical_medication_id"]
                    row["medication_name"] = alias["canonical_name"]

        # Queue sync to cloud - map local field names to cloud schema
        payload = {
            "id": row["id"],
            "cycle_id": row["cycle_id"],
            "barn_id": row["barn_id"],
            "med_date": row["med_date"].isoformat() if row.get("med_date") else None,
            "med_type": row["med_type"],
            "medication_id": row.get("medication_id") or row.get("product_id"),
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

    async def get_medications(self, cycle_id: int,
                              date_from: str = None, date_to: str = None) -> list[dict]:
        params = [cycle_id]
        idx = 2
        date_filter = ""
        if date_from:
            date_filter += f" AND cm.med_date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1
        if date_to:
            date_filter += f" AND cm.med_date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1
        rows = await db.fetch(
            f"""SELECT cm.*, p.name as product_name
            FROM care_medications cm
            LEFT JOIN products p ON cm.product_id = p.id
            WHERE cm.cycle_id = $1{date_filter}
            ORDER BY cm.med_date DESC""",
            *params,
        )
        return [dict(r) for r in rows]

    # ── Weight Sampling (Cân trọng lượng) ─────────────

    async def log_weight(self, data: dict) -> dict:
        from datetime import timedelta

        # Get samples array (individual bird weights in grams)
        samples = data.get("samples", [])
        gender = data.get("gender", "mixed")  # 'male', 'female', 'mixed'

        async with db.transaction() as conn:
            # Calculate day_age from cycle start
            day_age = None
            cycle = await conn.fetchrow(
                "SELECT start_date FROM cycles WHERE id = $1", data["cycle_id"]
            )
            if cycle:
                day_age = (data["weigh_date"] - cycle["start_date"]).days

            # If individual samples provided, calculate aggregates
            if samples:
                total_weight = sum(s["weight_g"] for s in samples)
                sample_count = len(samples)

                male_samples = [s for s in samples if s.get("gender") == "male"]
                female_samples = [s for s in samples if s.get("gender") == "female"]

                sample_male = len(male_samples)
                sample_female = len(female_samples)
                total_weight_male = sum(s["weight_g"] for s in male_samples) if male_samples else None
                total_weight_female = sum(s["weight_g"] for s in female_samples) if female_samples else None

                weights = [s["weight_g"] for s in samples]
                min_weight = min(weights) if weights else None
                max_weight = max(weights) if weights else None

                avg_weight = total_weight / sample_count if sample_count > 0 else 0
                if avg_weight > 0:
                    within_range = sum(1 for w in weights if abs(w - avg_weight) / avg_weight <= 0.10)
                    uniformity = (within_range / sample_count * 100) if sample_count > 0 else 0
                else:
                    uniformity = 0
            else:
                total_weight = data.get("total_weight", 0)
                sample_count = data.get("sample_count", 0)
                min_weight = data.get("min_weight")
                max_weight = data.get("max_weight")
                uniformity = data.get("uniformity")
                sample_male = data.get("sample_male", 0)
                sample_female = data.get("sample_female", 0)
                total_weight_male = data.get("total_weight_male")
                total_weight_female = data.get("total_weight_female")

            row = await conn.fetchrow(
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
                    await conn.execute(
                        """INSERT INTO weight_samples (weight_id, weight_g, gender)
                        VALUES ($1, $2, $3)""",
                        weight_id, s["weight_g"], s.get("gender"),
                    )

            # Update next weight reminder
            reminder = await conn.fetchrow(
                "SELECT * FROM weight_reminders WHERE cycle_id = $1 AND enabled = TRUE",
                data["cycle_id"],
            )
            if reminder:
                next_date = data["weigh_date"] + timedelta(days=reminder["remind_every_days"])
                await conn.execute(
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
            "total_weight_male": row.get("total_weight_male"),
            "total_weight_female": row.get("total_weight_female"),
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
        async with db.transaction() as conn:
            row = await conn.fetchrow(
                """INSERT INTO care_sales
                (cycle_id, barn_id, sale_date, count, total_weight, avg_weight,
                 unit_price, total_amount, buyer, sale_type, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *""",
                data["cycle_id"], data["barn_id"], data["sale_date"],
                data["count"], data.get("total_weight"), data.get("avg_weight"),
                data.get("unit_price"), data.get("total_amount"),
                data.get("buyer"), data.get("sale_type", "sale"), data.get("notes"),
            )
            await conn.execute(
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
        """Delete a feed log."""
        feed = await db.fetchrow("SELECT * FROM care_feeds WHERE id = $1", feed_id)
        if not feed:
            return {"ok": False, "message": "Feed log not found"}

        await db.execute("DELETE FROM care_feeds WHERE id = $1", feed_id)
        return {"ok": True, "message": "Feed log deleted"}

    async def delete_death(self, death_id: int) -> dict:
        """Delete a death log. Restores current_count to cycle."""
        death = await db.fetchrow("SELECT * FROM care_deaths WHERE id = $1", death_id)
        if not death:
            return {"ok": False, "message": "Death log not found"}

        async with db.transaction() as conn:
            await conn.execute(
                "UPDATE cycles SET current_count = current_count + $1, updated_at = NOW() WHERE id = $2",
                death["count"], death["cycle_id"],
            )
            await conn.execute("DELETE FROM care_deaths WHERE id = $1", death_id)
        return {"ok": True, "message": "Death log deleted"}

    async def delete_medication(self, med_id: int) -> dict:
        """Delete a medication log."""
        med = await db.fetchrow("SELECT * FROM care_medications WHERE id = $1", med_id)
        if not med:
            return {"ok": False, "message": "Medication log not found"}

        await db.execute("DELETE FROM care_medications WHERE id = $1", med_id)
        return {"ok": True, "message": "Medication log deleted"}

    async def delete_weight(self, weight_id: int) -> dict:
        """Delete a weight log and its individual samples."""
        weight = await db.fetchrow("SELECT * FROM care_weights WHERE id = $1", weight_id)
        if not weight:
            return {"ok": False, "message": "Weight log not found"}

        async with db.transaction() as conn:
            await conn.execute("DELETE FROM weight_samples WHERE weight_id = $1", weight_id)
            await conn.execute("DELETE FROM care_weights WHERE id = $1", weight_id)
        return {"ok": True, "message": "Weight log deleted"}

    async def delete_sale(self, sale_id: int) -> dict:
        """Delete a sale log. Restores current_count to cycle."""
        sale = await db.fetchrow("SELECT * FROM care_sales WHERE id = $1", sale_id)
        if not sale:
            return {"ok": False, "message": "Sale log not found"}

        async with db.transaction() as conn:
            await conn.execute(
                "UPDATE cycles SET current_count = current_count + $1, updated_at = NOW() WHERE id = $2",
                sale["count"], sale["cycle_id"],
            )
            await conn.execute("DELETE FROM care_sales WHERE id = $1", sale_id)
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

    async def get_water_logs(self, cycle_id: int, days: int = 30,
                             date_from: str = None, date_to: str = None) -> list[dict]:
        """Get water logs for a cycle."""
        params = [cycle_id]
        idx = 2
        date_filter = ""
        if date_from:
            date_filter += f" AND water_date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1
        if date_to:
            date_filter += f" AND water_date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1
        params.append(days * 2)
        rows = await db.fetch(
            f"""SELECT * FROM care_water_logs WHERE cycle_id = $1{date_filter}
            ORDER BY water_date DESC, created_at DESC LIMIT ${idx}""",
            *params,
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

    async def get_health_notes(self, cycle_id: int, days: int = 30,
                               date_from: str = None, date_to: str = None) -> list[dict]:
        """Get health notes for a cycle."""
        params = [cycle_id]
        idx = 2
        date_filter = ""
        if date_from:
            date_filter += f" AND recorded_at::date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1
        if date_to:
            date_filter += f" AND recorded_at::date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1
        params.append(days)
        rows = await db.fetch(
            f"""SELECT * FROM health_notes WHERE cycle_id = $1{date_filter}
            ORDER BY recorded_at DESC LIMIT ${idx}""",
            *params,
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

    async def delete_health(self, note_id: int) -> dict:
        """Delete a health note."""
        note = await db.fetchrow("SELECT * FROM health_notes WHERE id = $1", note_id)
        if not note:
            return {"ok": False, "message": "Health note not found"}
        await db.execute("DELETE FROM health_notes WHERE id = $1", note_id)
        return {"ok": True, "message": "Health note deleted"}

    # ── Medication Suggestions ─────────────────────────

    async def get_medication_suggestions(self, barn_id: str, limit: int = 20) -> list[dict]:
        """Get distinct medication names used in a barn, ordered by most recent."""
        rows = await db.fetch(
            """SELECT COALESCE(custom_name, p.name, 'Thuốc') AS name,
                      cm.med_type, cm.method, cm.unit,
                      MAX(cm.med_date) AS last_used,
                      COUNT(*) AS use_count
            FROM care_medications cm
            LEFT JOIN products p ON cm.product_id = p.id
            WHERE cm.barn_id = $1
            GROUP BY COALESCE(custom_name, p.name, 'Thuốc'), cm.med_type, cm.method, cm.unit
            ORDER BY MAX(cm.med_date) DESC
            LIMIT $2""",
            barn_id, limit,
        )
        return [dict(r) for r in rows]

    # ── Timeline (UNION ALL across care tables) ────────

    async def get_timeline(self, cycle_id: int, type_filter: str = None,
                           date_from: str = None, date_to: str = None,
                           limit: int = 100) -> list[dict]:
        """Get a merged timeline of all care events for a cycle."""
        params = [cycle_id]
        idx = 2

        # Build date filter fragments
        date_frag_feed = ""
        date_frag_death = ""
        date_frag_med = ""
        date_frag_water = ""
        date_frag_health = ""
        date_frag_sale = ""

        if date_from:
            date_frag_feed = f" AND cf.feed_date >= ${idx}"
            date_frag_death = f" AND cd.death_date >= ${idx}"
            date_frag_med = f" AND cm.med_date >= ${idx}"
            date_frag_water = f" AND cw.water_date >= ${idx}"
            date_frag_health = f" AND hn.recorded_at >= ${idx}"
            date_frag_sale = f" AND cs.sale_date >= ${idx}"
            params.append(date.fromisoformat(date_from))
            idx += 1

        if date_to:
            date_frag_feed += f" AND cf.feed_date <= ${idx}"
            date_frag_death += f" AND cd.death_date <= ${idx}"
            date_frag_med += f" AND cm.med_date <= ${idx}"
            date_frag_water += f" AND cw.water_date <= ${idx}"
            date_frag_health += f" AND hn.recorded_at <= ${idx}"
            date_frag_sale += f" AND cs.sale_date <= ${idx}"
            params.append(date.fromisoformat(date_to))
            idx += 1

        # UNION ALL query — each sub-select aliases columns to a common set
        type_wheres = {
            "feed": "feed",
            "medication": "medication",
            "death": "death",
            "water": "water",
            "health": "health",
            "sale": "sale",
        }

        # Build individual SELECTs
        selects = []

        if not type_filter or type_filter == "feed":
            selects.append(f"""
                SELECT cf.id, 'feed' AS type, cf.feed_date AS entry_date, cf.created_at,
                       cf.product_id, cf.quantity, cf.notes, cf.barn_id,
                       NULL::text AS med_type, NULL::text AS custom_name, NULL::text AS unit,
                       NULL::int AS count, NULL::text AS cause, NULL::text AS severity,
                       cf.meal AS shift, NULL::text AS symptoms,
                       NULL::float AS consumption_liters, NULL::bool AS medicated,
                       NULL::float AS total_weight, NULL::float AS unit_price,
                       NULL::text AS buyer
                FROM care_feeds cf
                WHERE cf.cycle_id = $1{date_frag_feed}
            """)

        if not type_filter or type_filter == "death":
            selects.append(f"""
                SELECT cd.id, 'death' AS type, cd.death_date AS entry_date, cd.created_at,
                       NULL::int AS product_id, NULL::float AS quantity, cd.notes, cd.barn_id,
                       NULL::text AS med_type, NULL::text AS custom_name, NULL::text AS unit,
                       cd.count, cd.cause, NULL::text AS severity,
                       NULL::text AS shift, cd.symptoms,
                       NULL::float AS consumption_liters, NULL::bool AS medicated,
                       NULL::float AS total_weight, NULL::float AS unit_price,
                       NULL::text AS buyer
                FROM care_deaths cd
                WHERE cd.cycle_id = $1{date_frag_death}
            """)

        if not type_filter or type_filter == "medication":
            selects.append(f"""
                SELECT cm.id, 'medication' AS type, cm.med_date AS entry_date, cm.created_at,
                       cm.product_id, cm.quantity, cm.notes, cm.barn_id,
                       cm.med_type, cm.custom_name, cm.unit,
                       NULL::int AS count, NULL::text AS cause, NULL::text AS severity,
                       cm.shift, NULL::text AS symptoms,
                       NULL::float AS consumption_liters, NULL::bool AS medicated,
                       NULL::float AS total_weight, NULL::float AS unit_price,
                       NULL::text AS buyer
                FROM care_medications cm
                WHERE cm.cycle_id = $1{date_frag_med}
            """)

        if not type_filter or type_filter == "water":
            selects.append(f"""
                SELECT cw.id, 'water' AS type, cw.water_date AS entry_date, cw.created_at,
                       NULL::int AS product_id, NULL::float AS quantity, cw.notes, cw.barn_id,
                       NULL::text AS med_type, NULL::text AS custom_name, NULL::text AS unit,
                       NULL::int AS count, NULL::text AS cause, NULL::text AS severity,
                       cw.shift, NULL::text AS symptoms,
                       cw.consumption_liters, cw.medicated,
                       NULL::float AS total_weight, NULL::float AS unit_price,
                       NULL::text AS buyer
                FROM care_water_logs cw
                WHERE cw.cycle_id = $1{date_frag_water}
            """)

        if not type_filter or type_filter == "health":
            selects.append(f"""
                SELECT hn.id, 'health' AS type, hn.recorded_at AS entry_date, hn.created_at,
                       NULL::int AS product_id, NULL::float AS quantity, hn.symptoms AS notes, hn.barn_id,
                       NULL::text AS med_type, NULL::text AS custom_name, NULL::text AS unit,
                       NULL::int AS count, NULL::text AS cause, hn.severity,
                       NULL::text AS shift, hn.symptoms,
                       NULL::float AS consumption_liters, NULL::bool AS medicated,
                       NULL::float AS total_weight, NULL::float AS unit_price,
                       NULL::text AS buyer
                FROM health_notes hn
                WHERE hn.cycle_id = $1{date_frag_health}
            """)

        if not type_filter or type_filter == "sale":
            selects.append(f"""
                SELECT cs.id, 'sale' AS type, cs.sale_date AS entry_date, cs.created_at,
                       NULL::int AS product_id, NULL::float AS quantity, cs.notes, cs.barn_id,
                       NULL::text AS med_type, NULL::text AS custom_name, NULL::text AS unit,
                       cs.count, NULL::text AS cause, NULL::text AS severity,
                       NULL::text AS shift, NULL::text AS symptoms,
                       NULL::float AS consumption_liters, NULL::bool AS medicated,
                       cs.total_weight, cs.unit_price,
                       cs.buyer
                FROM care_sales cs
                WHERE cs.cycle_id = $1{date_frag_sale}
            """)

        if not selects:
            return []

        union_sql = " UNION ALL ".join(selects)
        sql = f"SELECT * FROM ({union_sql}) AS timeline ORDER BY entry_date DESC, created_at DESC LIMIT ${idx}"
        params.append(limit)

        rows = await db.fetch(sql, *params)

        # Enrich with product names
        product_ids = {r["product_id"] for r in rows if r.get("product_id")}
        product_names = {}
        if product_ids:
            p_rows = await db.fetch(
                "SELECT id, name FROM products WHERE id = ANY($1)", list(product_ids)
            )
            product_names = {r["id"]: r["name"] for r in p_rows}

        result = []
        for r in rows:
            d = dict(r)
            d["entry_date"] = d["entry_date"].isoformat() if d.get("entry_date") else None
            d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
            if d.get("product_id") and d["product_id"] in product_names:
                d["product_name"] = product_names[d["product_id"]]
            result.append(d)

        return result

    # ── Calendar Heatmap ───────────────────────────────

    async def get_calendar(self, cycle_id: int, month: str) -> dict:
        """Return per-day classification for a calendar heatmap.

        `month` is an ISO date string (any day in the target month, e.g.
        '2026-09-01'). All four care tables are aggregated per-day for the
        month, then bucketed by [cycle.start_date, COALESCE(end_date, today_HCM)].

        Returns: dict with 'cycle_start', 'range_end', 'days' (list of
        day dicts with classification booleans).
        """
        # asyncpg needs a Python date object (not str), despite the
        # SQL $2::date cast. Convert here so the bind works.
        month_date = date.fromisoformat(month)

        rows = await db.fetch(
            """
            WITH cycle AS (
                SELECT id, start_date, actual_end_date FROM cycles WHERE id = $1
            ),
            date_range AS (
                SELECT
                    date_trunc('month', ($2::date))::date AS month_start,
                    (date_trunc('month', ($2::date)) + INTERVAL '1 month'
                        - INTERVAL '1 day')::date AS month_end,
                    cycle.start_date AS cycle_start,
                    COALESCE(cycle.actual_end_date,
                             (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS range_end
                FROM cycle
            ),
            feed_days AS (
                SELECT feed_date AS d,
                       BOOL_OR(meal IN ('sang','all_day')) AS has_feed_sang,
                       BOOL_OR(meal = 'chieu') AS has_feed_chieu
                FROM care_feeds
                WHERE cycle_id = $1
                  AND feed_date BETWEEN (SELECT month_start FROM date_range)
                                    AND (SELECT month_end FROM date_range)
                GROUP BY feed_date
            ),
            med_days AS (
                SELECT med_date AS d,
                       BOOL_OR(shift IN ('sang','all_day')) AS has_med_sang,
                       BOOL_OR(shift = 'chieu') AS has_med_chieu,
                       BOOL_OR(method = 'feed') AS has_mixed_med,
                       COUNT(*) FILTER (WHERE method = 'feed') AS mixed_med_count
                FROM care_medications
                WHERE cycle_id = $1
                  AND med_date BETWEEN (SELECT month_start FROM date_range)
                                    AND (SELECT month_end FROM date_range)
                GROUP BY med_date
            ),
            death_days AS (
                SELECT death_date AS d, SUM(count)::int AS death_count
                FROM care_deaths
                WHERE cycle_id = $1
                  AND death_date BETWEEN (SELECT month_start FROM date_range)
                                    AND (SELECT month_end FROM date_range)
                GROUP BY death_date
            ),
            water_days AS (
                SELECT water_date AS d,
                       SUM(consumption_liters)::numeric AS water_liters
                FROM care_water_logs
                WHERE cycle_id = $1
                  AND water_date BETWEEN (SELECT month_start FROM date_range)
                                    AND (SELECT month_end FROM date_range)
                GROUP BY water_date
            ),
            month_grid AS (
                SELECT generate_series(
                    (SELECT month_start FROM date_range),
                    (SELECT month_end FROM date_range),
                    INTERVAL '1 day'
                )::date AS d
            )
            SELECT to_char(mg.d, 'YYYY-MM-DD') AS date,
                   COALESCE(fd.has_feed_sang,false) AS has_feed_sang,
                   COALESCE(fd.has_feed_chieu,false) AS has_feed_chieu,
                   COALESCE(md.has_med_sang,false) AS has_med_sang,
                   COALESCE(md.has_med_chieu,false) AS has_med_chieu,
                   COALESCE(md.has_mixed_med,false) AS has_mixed_med,
                   COALESCE(md.mixed_med_count,0) AS mixed_med_count,
                   COALESCE(dd.death_count,0) AS death_count,
                   wd.water_liters,
                   (mg.d >= (SELECT cycle_start FROM date_range)
                    AND mg.d <= (SELECT range_end FROM date_range)) AS in_range
            FROM month_grid mg
            LEFT JOIN feed_days fd ON fd.d = mg.d
            LEFT JOIN med_days md ON md.d = mg.d
            LEFT JOIN death_days dd ON dd.d = mg.d
            LEFT JOIN water_days wd ON wd.d = mg.d
            ORDER BY mg.d
            """,
            cycle_id, month_date,
        )

        # Convert rows → dict, dec/water safely to float for JSON
        from decimal import Decimal
        days = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("water_liters"), Decimal):
                d["water_liters"] = float(d["water_liters"])
            days.append(d)

        # Get cycle bounds for client (single round-trip)
        meta = await db.fetchrow(
            "SELECT start_date, actual_end_date FROM cycles WHERE id = $1",
            cycle_id,
        )
        return {
            "cycle_id": cycle_id,
            "cycle_start": meta["start_date"].isoformat() if meta else None,
            "cycle_end": meta["actual_end_date"].isoformat() if meta and meta["actual_end_date"] else None,
            "today_hcm": now_hcm().date().isoformat(),
            "days": days,
        }

    async def get_day_detail(self, cycle_id: int, date_iso: str) -> dict:
        """Return feeds/meds/deaths/water for one calendar day, bucketed by shift.

        Each list is split into sang (morning) / chieu (afternoon) buckets.
        Medications with method='feed' (trộn cám) are surfaced separately as
        mixed_med_sang / mixed_med_chieu so the UI can render them in a
        highlighted block.
        """
        d = date.fromisoformat(date_iso)

        feeds_task = db.fetch(
            """SELECT cf.id, cf.meal, cf.quantity, cf.notes,
                      p.name AS product_name
            FROM care_feeds cf
            LEFT JOIN products p ON cf.product_id = p.id
            WHERE cf.cycle_id = $1 AND cf.feed_date = $2
            ORDER BY cf.created_at""",
            cycle_id, d,
        )
        meds_task = db.fetch(
            """SELECT cm.id, cm.shift, cm.method, cm.med_type, cm.custom_name,
                      cm.quantity, cm.unit, cm.notes, cm.purpose,
                      p.name AS product_name
            FROM care_medications cm
            LEFT JOIN products p ON cm.product_id = p.id
            WHERE cm.cycle_id = $1 AND cm.med_date = $2
            ORDER BY cm.created_at""",
            cycle_id, d,
        )
        deaths_task = db.fetch(
            """SELECT id, count, cause, symptoms, notes
            FROM care_deaths
            WHERE cycle_id = $1 AND death_date = $2
            ORDER BY created_at""",
            cycle_id, d,
        )
        water_task = db.fetch(
            """SELECT id, shift, consumption_liters, medicated, notes
            FROM care_water_logs
            WHERE cycle_id = $1 AND water_date = $2
            ORDER BY created_at""",
            cycle_id, d,
        )

        feeds_raw, meds_raw, deaths_raw, water_raw = await asyncio.gather(
            feeds_task, meds_task, deaths_task, water_task,
        )

        from decimal import Decimal
        def _water_clean(w):
            wd = dict(w)
            if isinstance(wd.get("consumption_liters"), Decimal):
                wd["consumption_liters"] = float(wd["consumption_liters"])
            return wd

        # Bucket feeds: 'sang' (sang/all_day) vs 'chieu'
        feeds_sang, feeds_chieu = [], []
        for f in feeds_raw:
            meal = f["meal"]
            if meal == "chieu":
                feeds_chieu.append(dict(f))
            else:
                feeds_sang.append(dict(f))

        # Bucket meds + extract mixed_med (trộn cám)
        meds_sang, meds_chieu = [], []
        mixed_med_sang, mixed_med_chieu = [], []
        for m in meds_raw:
            md = dict(m)
            shift = md["shift"]
            is_mixed = md.get("method") == "feed"
            if shift == "chieu":
                meds_chieu.append(md)
                if is_mixed:
                    mixed_med_chieu.append(md)
            else:
                meds_sang.append(md)
                if is_mixed:
                    mixed_med_sang.append(md)

        # Bucket water: shift IN (sang/all_day) → sang, 'chieu' → chieu
        water_sang, water_chieu = [], []
        for w in water_raw:
            wd = _water_clean(w)
            if wd["shift"] == "chieu":
                water_chieu.append(wd)
            else:
                water_sang.append(wd)

        return {
            "date": d.isoformat(),
            "feeds_sang": feeds_sang,
            "feeds_chieu": feeds_chieu,
            "meds_sang": meds_sang,
            "meds_chieu": meds_chieu,
            "mixed_med_sang": mixed_med_sang,
            "mixed_med_chieu": mixed_med_chieu,
            "deaths": [dict(r) for r in deaths_raw],
            "water_sang": water_sang,
            "water_chieu": water_chieu,
        }


care_service = CareService()
