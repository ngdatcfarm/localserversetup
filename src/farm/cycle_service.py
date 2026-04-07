"""Cycle Service - Manage farming cycles (đợt nuôi)."""

from datetime import date, timedelta
from typing import Optional
from src.services.database.db import db


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
        # Check if barn exists
        barn = await db.fetchval("SELECT 1 FROM barns WHERE id = $1", data["barn_id"])
        if not barn:
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

        row = await db.fetchrow(
            """INSERT INTO cycles
            (barn_id, name, breed, initial_count, current_count, start_date,
             expected_end_date, notes)
            VALUES ($1, $2, $3, $4, $4, $5, $6, $7) RETURNING *""",
            data["barn_id"], data["name"], data.get("breed"),
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

    async def close(self, cycle_id: int, notes: str = None, force: bool = False) -> dict:
        """Close a cycle (kết thúc đợt nuôi).

        Business rules:
        - If force=False, validates that feeding records exist
        - Updates final_quantity based on initial_count - deaths - sales
        """
        cycle = await self.get(cycle_id)
        if not cycle:
            return {"ok": False, "message": "Cycle not found"}

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

        await db.execute(
            """UPDATE cycles SET
                status = 'closed', actual_end_date = CURRENT_DATE,
                notes = COALESCE($1, notes),
                final_quantity = $2,
                updated_at = NOW()
            WHERE id = $3""",
            notes, final_quantity, cycle_id,
        )
        return {"ok": True, "final_quantity": final_quantity}

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
