"""Cycle Service - Manage farming cycles (đợt nuôi)."""

from datetime import date, datetime, timedelta
from typing import Optional
from src.services.database.db import db
from src.sync.sync_service import sync_service
from src.utils.timezone import now_hcm


class CycleService:

    async def list_all(self, barn_id: str = None, status: str = None) -> list[dict]:
        conditions = []
        params = []
        idx = 1

        if barn_id:
            conditions.append(f"c.barn_id = ${idx}")
            params.append(barn_id)
            idx += 1
        if status:
            conditions.append(f"c.status = ${idx}")
            params.append(status)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await db.fetch(
            f"""SELECT c.*, b.name as barn_name,
                       (CURRENT_DATE - c.start_date) as day_age
            FROM cycles c
            LEFT JOIN barns b ON c.barn_id = b.id
            {where}
            ORDER BY c.start_date DESC""",
            *params,
        )
        return [dict(r) for r in rows]

    async def get(self, cycle_id: int) -> Optional[dict]:
        row = await db.fetchrow(
            """SELECT c.*, b.name as barn_name,
                      (CURRENT_DATE - c.start_date) as day_age
            FROM cycles c
            LEFT JOIN barns b ON c.barn_id = b.id
            WHERE c.id = $1""",
            cycle_id,
        )
        return dict(row) if row else None

    async def create(self, data: dict) -> dict:
        # Check if barn exists and get barn name for auto-generation
        barn_row = await db.fetchrow("SELECT id, name FROM barns WHERE id = $1", data["barn_id"])
        if not barn_row:
            return {"ok": False, "message": f"Barn '{data['barn_id']}' not found"}

        # Check if barn already has an active cycle
        active_cycle = await db.fetchval(
            "SELECT COUNT(*) FROM cycles WHERE barn_id = $1 AND status = 'active'",
            data["barn_id"]
        )
        if active_cycle > 0:
            return {
                "ok": False,
                "message": f"Barn '{data['barn_id']}' already has an active cycle. Close or complete it first."
            }

        # Auto-generate name if not provided (HCM-local display string)
        cycle_name = data.get("name")
        if not cycle_name or not cycle_name.strip():
            now = now_hcm()
            cycle_name = f"Lứa {barn_row['name']} {now.strftime('%d/%m/%Y %H:%M')}"

        row = await db.fetchrow(
            """INSERT INTO cycles
            (barn_id, name, breed, initial_count, current_count, start_date,
             expected_end_date, notes)
            VALUES ($1, $2, $3, $4, $4, $5, $6, $7) RETURNING *""",
            data["barn_id"], cycle_name, data.get("breed"),
            data["initial_count"], data["start_date"],
            data.get("expected_end_date"), data.get("notes"),
        )
        # Setup weight reminder
        remind_days = data.get("weight_remind_days", 7)
        next_remind = data["start_date"] + timedelta(days=remind_days)
        await db.execute(
            """INSERT INTO weight_reminders (cycle_id, remind_every_days, next_remind_date)
            VALUES ($1, $2, $3)""",
            row["id"], remind_days, next_remind,
        )
        return {"ok": True, "cycle": dict(row)}

    async def update(self, cycle_id: int, data: dict) -> dict:
        await db.execute(
            """UPDATE cycles SET
                name = COALESCE($1, name),
                breed = COALESCE($2, breed),
                expected_end_date = COALESCE($3, expected_end_date),
                notes = COALESCE($4, notes),
                updated_at = NOW()
            WHERE id = $5""",
            data.get("name"), data.get("breed"),
            data.get("expected_end_date"), data.get("notes"),
            cycle_id,
        )
        return {"ok": True}

    async def close(self, cycle_id: int, end_date: date = None, notes: str = None, force: bool = False) -> dict:
        """Close a cycle (kết thúc đợt nuôi).

        Args:
            cycle_id: Cycle to close
            end_date: User-selected close date (defaults to today)
            notes: Optional close notes (replaces existing notes if provided)
            force: Skip validation checks (no feed records check)

        Returns:
            {"ok": True, "final_quantity": int, "actual_end_date": "YYYY-MM-DD"} on success
            {"ok": False, "message": str} on failure
        """
        cycle = await self.get(cycle_id)
        if not cycle:
            return {"ok": False, "message": "Cycle not found"}
        if cycle.get("status") == "closed":
            return {"ok": False, "message": "Cycle đã được đóng trước đó"}

        # Validate feeds recorded (unless force=True)
        if not force:
            total_feeds = await db.fetchval(
                "SELECT COUNT(*) FROM care_feeds WHERE cycle_id = $1", cycle_id
            ) or 0
            if total_feeds == 0:
                return {
                    "ok": False,
                    "message": "Cycle has no feeding records. Use force=true to close anyway."
                }

            # Check if feeds recorded in last 7 days (if cycle is active > 7 days)
            cycle_age = (date.today() - cycle["start_date"]).days if cycle["start_date"] else 0
            if cycle_age > 7:
                recent_feeds = await db.fetchval(
                    """SELECT COUNT(*) FROM care_feeds
                    WHERE cycle_id = $1 AND feed_date > CURRENT_DATE - INTERVAL '7 days'""",
                    cycle_id
                ) or 0
                if recent_feeds == 0:
                    return {
                        "ok": False,
                        "message": "No feeding records in last 7 days. Use force=true to close anyway."
                    }

        # Calculate final_quantity: initial - deaths - sales
        total_deaths = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_deaths WHERE cycle_id = $1", cycle_id
        ) or 0
        total_sold = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_sales WHERE cycle_id = $1", cycle_id
        ) or 0
        final_quantity = cycle["initial_count"] - total_deaths - total_sold

        # Use user-supplied end_date, default to today
        actual_end = end_date or date.today()

        # Validate end_date >= start_date
        if cycle.get("start_date") and actual_end < cycle["start_date"]:
            return {"ok": False, "message": "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu"}

        async with db.transaction() as conn:
            await conn.execute(
                """UPDATE cycles SET
                    status = 'closed',
                    actual_end_date = $1,
                    notes = COALESCE($2, notes),
                    final_quantity = $3,
                    updated_at = NOW()
                WHERE id = $4""",
                actual_end, notes, final_quantity, cycle_id,
            )

        # Cloud sync — queue status change (fire-and-forget)
        try:
            updated = await self.get(cycle_id)
            await sync_service.queue_change("cycles", cycle_id, "update", dict(updated))
        except Exception:
            pass  # sync may fail offline — never block the close

        return {
            "ok": True,
            "final_quantity": final_quantity,
            "actual_end_date": actual_end.isoformat(),
        }

    async def reopen(self, cycle_id: int, confirm: bool = False) -> dict:
        """Reopen a closed cycle (mở lại đợt nuôi). Admin only.

        Resets status='active', clears actual_end_date and final_quantity.
        Care records (feeds, deaths, sales, etc.) are NOT deleted.

        Args:
            cycle_id: Cycle to reopen
            confirm: Required to be True to actually reopen (safety check)
        """
        cycle = await self.get(cycle_id)
        if not cycle:
            return {"ok": False, "message": "Cycle not found"}
        if cycle.get("status") != "closed":
            return {"ok": False, "message": "Cycle chưa được đóng, không cần mở lại"}
        if not confirm:
            return {
                "ok": False,
                "message": "Cần xác nhận để mở lại. Gọi với confirm=true.",
            }

        async with db.transaction() as conn:
            await conn.execute(
                """UPDATE cycles SET
                    status = 'active',
                    actual_end_date = NULL,
                    final_quantity = NULL,
                    updated_at = NOW()
                WHERE id = $1""",
                cycle_id,
            )

        # Cloud sync — queue status change
        try:
            updated = await self.get(cycle_id)
            await sync_service.queue_change("cycles", cycle_id, "update", dict(updated))
        except Exception:
            pass

        return {"ok": True, "message": "Đã mở lại đợt nuôi"}

    async def get_summary(self, cycle_id: int) -> Optional[dict]:
        """Get aggregate KPIs for a cycle (works for both active & closed).

        Aggregates: deaths, feed (kg), medications, water (L), weight sessions,
        sales (count, kg, revenue), latest weight, mortality rate, FCR, duration.
        """
        cycle = await self.get(cycle_id)
        if not cycle:
            return None

        # Aggregate deaths
        total_deaths = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_deaths WHERE cycle_id = $1", cycle_id
        ) or 0

        # Aggregate feed (kg)
        total_feed = await db.fetchval(
            "SELECT COALESCE(SUM(quantity), 0) FROM care_feeds WHERE cycle_id = $1", cycle_id
        ) or 0

        # Aggregate medications (record count)
        total_meds = await db.fetchval(
            "SELECT COUNT(*) FROM care_medications WHERE cycle_id = $1", cycle_id
        ) or 0

        # Aggregate water (liters)
        total_water = await db.fetchval(
            "SELECT COALESCE(SUM(consumption_liters), 0) FROM care_water_logs WHERE cycle_id = $1", cycle_id
        ) or 0

        # Aggregate weight sessions
        total_weights = await db.fetchval(
            "SELECT COUNT(*) FROM care_weights WHERE cycle_id = $1", cycle_id
        ) or 0

        # Aggregate sales (count, kg, revenue)
        sales_row = await db.fetchrow(
            """SELECT
                COALESCE(SUM(count), 0) AS total_sold,
                COALESCE(SUM(total_weight), 0) AS total_weight_kg,
                COALESCE(SUM(total_amount), 0) AS total_revenue
            FROM care_sales WHERE cycle_id = $1""",
            cycle_id,
        ) or {}
        total_sold = sales_row.get("total_sold") or 0 if hasattr(sales_row, "get") else (sales_row["total_sold"] or 0)
        total_weight_kg = sales_row.get("total_weight_kg") or 0 if hasattr(sales_row, "get") else (sales_row["total_weight_kg"] or 0)
        total_revenue = sales_row.get("total_revenue") or 0 if hasattr(sales_row, "get") else (sales_row["total_revenue"] or 0)

        # Latest weight
        latest_weight = await db.fetchrow(
            """SELECT avg_weight, weigh_date, day_age FROM care_weights
            WHERE cycle_id = $1 ORDER BY weigh_date DESC LIMIT 1""",
            cycle_id,
        )

        # Derived KPIs
        alive = cycle["initial_count"] - total_deaths - total_sold
        mortality_rate = (total_deaths / cycle["initial_count"] * 100) if cycle["initial_count"] > 0 else 0

        # FCR (Feed Conversion Ratio) = total_feed / total_meat_kg
        # Where total_meat_kg = alive_count * avg_weight (latest)
        fcr = None
        if latest_weight and latest_weight["avg_weight"] and alive > 0:
            total_meat_kg = alive * latest_weight["avg_weight"]
            fcr = total_feed / total_meat_kg if total_meat_kg > 0 else None

        # Duration in days
        end_ref = cycle.get("actual_end_date") or date.today()
        duration_days = (end_ref - cycle["start_date"]).days if cycle.get("start_date") else None

        return {
            **cycle,
            "alive_count": alive,
            "total_deaths": total_deaths,
            "total_feed_kg": round(float(total_feed), 1),
            "total_med_count": int(total_meds),
            "total_water_liters": round(float(total_water), 1),
            "total_weight_sessions": int(total_weights),
            "total_sold": int(total_sold),
            "total_weight_kg": round(float(total_weight_kg), 1),
            "total_revenue": round(float(total_revenue), 0),
            "mortality_rate": round(float(mortality_rate), 2),
            "fcr": round(float(fcr), 2) if fcr else None,
            "latest_weight": dict(latest_weight) if latest_weight else None,
            "duration_days": duration_days,
        }

    async def get_dashboard(self, cycle_id: int) -> dict:
        """Get cycle overview with KPIs."""
        cycle = await self.get(cycle_id)
        if not cycle:
            return None

        # Total deaths
        total_deaths = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_deaths WHERE cycle_id = $1",
            cycle_id,
        ) or 0

        # Total feed
        total_feed = await db.fetchval(
            "SELECT COALESCE(SUM(quantity), 0) FROM care_feeds WHERE cycle_id = $1",
            cycle_id,
        ) or 0

        # Latest weight
        latest_weight = await db.fetchrow(
            """SELECT avg_weight, weigh_date, day_age
            FROM care_weights WHERE cycle_id = $1
            ORDER BY weigh_date DESC LIMIT 1""",
            cycle_id,
        )

        # Total sold
        total_sold = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_sales WHERE cycle_id = $1",
            cycle_id,
        ) or 0

        alive = cycle["initial_count"] - total_deaths - total_sold
        mortality_rate = (total_deaths / cycle["initial_count"] * 100) if cycle["initial_count"] > 0 else 0

        # FCR
        fcr = None
        if latest_weight and latest_weight["avg_weight"] and alive > 0:
            total_meat_kg = alive * latest_weight["avg_weight"]
            fcr = total_feed / total_meat_kg if total_meat_kg > 0 else None

        # Today's feed
        today_feed = await db.fetchval(
            "SELECT COALESCE(SUM(quantity), 0) FROM care_feeds WHERE cycle_id = $1 AND feed_date = CURRENT_DATE",
            cycle_id,
        ) or 0

        # Today's deaths
        today_deaths = await db.fetchval(
            "SELECT COALESCE(SUM(count), 0) FROM care_deaths WHERE cycle_id = $1 AND death_date = CURRENT_DATE",
            cycle_id,
        ) or 0

        return {
            **cycle,
            "alive_count": alive,
            "total_deaths": total_deaths,
            "total_sold": total_sold,
            "mortality_rate": round(mortality_rate, 2),
            "total_feed_kg": round(total_feed, 1),
            "fcr": round(fcr, 2) if fcr else None,
            "latest_weight": dict(latest_weight) if latest_weight else None,
            "today_feed_kg": round(today_feed, 1),
            "today_deaths": today_deaths,
            "feed_per_bird_day": round(today_feed * 1000 / alive, 1) if alive > 0 and today_feed > 0 else 0,
        }

    async def get_daily_snapshots(self, cycle_id: int, days: int = 30) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM cycle_daily_snapshots
            WHERE cycle_id = $1
            ORDER BY snapshot_date DESC LIMIT $2""",
            cycle_id, days,
        )
        return [dict(r) for r in rows]


cycle_service = CycleService()
