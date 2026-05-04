"""Vaccine Service - Vaccine programs, items, and schedules."""

import logging
from datetime import date, timedelta
from src.services.database.db import db

logger = logging.getLogger(__name__)


class VaccineService:

    # ── Vaccine Programs ─────────────────────────────

    async def list_programs(self, active_only: bool = True) -> list[dict]:
        if active_only:
            rows = await db.fetch(
                "SELECT * FROM vaccine_programs WHERE active = TRUE ORDER BY name"
            )
        else:
            rows = await db.fetch("SELECT * FROM vaccine_programs ORDER BY name")
        return [dict(r) for r in rows]

    async def get_program(self, program_id: int) -> dict | None:
        row = await db.fetchrow(
            "SELECT * FROM vaccine_programs WHERE id = $1", program_id
        )
        if not row:
            return None
        program = dict(row)
        items = await db.fetch(
            """SELECT * FROM vaccine_program_items
            WHERE program_id = $1 ORDER BY day_age, sort_order""",
            program_id,
        )
        program["items"] = [dict(i) for i in items]
        return program

    async def create_program(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO vaccine_programs (name, note, active)
            VALUES ($1, $2, $3) RETURNING *""",
            data["name"], data.get("note"), data.get("active", True),
        )
        return {"ok": True, "program": dict(row)}

    async def update_program(self, program_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE vaccine_programs SET
                name = COALESCE($2, name),
                note = COALESCE($3, note),
                active = COALESCE($4, active)
            WHERE id = $1 RETURNING *""",
            program_id, data.get("name"), data.get("note"), data.get("active"),
        )
        if not row:
            return {"ok": False, "message": "Program not found"}
        return {"ok": True, "program": dict(row)}

    async def delete_program(self, program_id: int) -> dict:
        await db.execute(
            "DELETE FROM vaccine_program_items WHERE program_id = $1", program_id
        )
        await db.execute("DELETE FROM vaccine_programs WHERE id = $1", program_id)
        return {"ok": True}

    # ── Vaccine Program Items ────────────────────────

    async def add_program_item(self, program_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO vaccine_program_items
            (program_id, vaccine_brand_id, vaccine_name, day_age, method,
             remind_days, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
            program_id, data.get("vaccine_brand_id"), data["vaccine_name"],
            data["day_age"], data.get("method"),
            data.get("remind_days", 1), data.get("sort_order", 0),
        )
        return {"ok": True, "item": dict(row)}

    async def update_program_item(self, item_id: int, data: dict) -> dict:
        row = await db.fetchrow(
            """UPDATE vaccine_program_items SET
                vaccine_name = COALESCE($2, vaccine_name),
                day_age = COALESCE($3, day_age),
                method = COALESCE($4, method),
                remind_days = COALESCE($5, remind_days),
                sort_order = COALESCE($6, sort_order)
            WHERE id = $1 RETURNING *""",
            item_id, data.get("vaccine_name"), data.get("day_age"),
            data.get("method"), data.get("remind_days"), data.get("sort_order"),
        )
        if not row:
            return {"ok": False, "message": "Item not found"}
        return {"ok": True, "item": dict(row)}

    async def delete_program_item(self, item_id: int) -> dict:
        await db.execute("DELETE FROM vaccine_program_items WHERE id = $1", item_id)
        return {"ok": True}

    # ── Vaccine Schedules (per cycle) ────────────────

    async def list_schedules(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM vaccine_schedules
            WHERE cycle_id = $1 ORDER BY scheduled_date, day_age_target""",
            cycle_id,
        )
        return [dict(r) for r in rows]

    async def create_schedule(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO vaccine_schedules
            (cycle_id, vaccine_name, scheduled_date, day_age_target, method,
             dosage, remind_days, vaccine_brand_id, program_item_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *""",
            data["cycle_id"], data["vaccine_name"], data.get("scheduled_date"),
            data.get("day_age_target"), data.get("method"),
            data.get("dosage"), data.get("remind_days", 1),
            data.get("vaccine_brand_id"), data.get("program_item_id"),
        )
        return {"ok": True, "schedule": dict(row)}

    async def apply_program_to_cycle(self, cycle_id: int, program_id: int) -> dict:
        """Generate vaccine schedules for a cycle from a program template."""
        cycle = await db.fetchrow(
            "SELECT start_date FROM cycles WHERE id = $1", cycle_id
        )
        if not cycle:
            return {"ok": False, "message": "Cycle not found"}

        items = await db.fetch(
            "SELECT * FROM vaccine_program_items WHERE program_id = $1 ORDER BY day_age",
            program_id,
        )
        if not items:
            return {"ok": False, "message": "Program has no items"}

        created = 0
        for item in items:
            scheduled = cycle["start_date"] + timedelta(days=item["day_age"])
            await db.execute(
                """INSERT INTO vaccine_schedules
                (cycle_id, vaccine_name, scheduled_date, day_age_target, method,
                 remind_days, vaccine_brand_id, program_item_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                cycle_id, item["vaccine_name"], scheduled, item["day_age"],
                item["method"], item["remind_days"],
                item["vaccine_brand_id"], item["id"],
            )
            created += 1

        # Link program to cycle
        await db.execute(
            "UPDATE cycles SET vaccine_program_id = $1 WHERE id = $2",
            program_id, cycle_id,
        )

        return {"ok": True, "created": created}

    async def mark_done(self, schedule_id: int, notes: str = None) -> dict:
        row = await db.fetchrow(
            """UPDATE vaccine_schedules SET
                done = TRUE, done_at = NOW(), notes = COALESCE($2, notes)
            WHERE id = $1 RETURNING *""",
            schedule_id, notes,
        )
        if not row:
            return {"ok": False, "message": "Schedule not found"}
        return {"ok": True, "schedule": dict(row)}

    async def mark_skipped(self, schedule_id: int, reason: str = None) -> dict:
        row = await db.fetchrow(
            """UPDATE vaccine_schedules SET
                skipped = TRUE, skip_reason = $2
            WHERE id = $1 RETURNING *""",
            schedule_id, reason,
        )
        if not row:
            return {"ok": False, "message": "Schedule not found"}
        return {"ok": True, "schedule": dict(row)}

    async def delete_schedule(self, schedule_id: int) -> dict:
        await db.execute("DELETE FROM vaccine_schedules WHERE id = $1", schedule_id)
        return {"ok": True}

    async def get_upcoming(self, days: int = 7) -> list[dict]:
        """Get upcoming vaccine schedules across all active cycles."""
        rows = await db.fetch(
            """SELECT vs.*, c.code as cycle_code, b.name as barn_name
            FROM vaccine_schedules vs
            JOIN cycles c ON vs.cycle_id = c.id
            LEFT JOIN barns b ON c.barn_id = b.id
            WHERE c.status = 'active' AND vs.done = FALSE AND vs.skipped = FALSE
              AND vs.scheduled_date <= CURRENT_DATE + (($1::text || ' days')::interval)
            ORDER BY vs.scheduled_date""",
            str(days),
        )
        return [dict(r) for r in rows]

    async def get_vaccines_due_for_notification(self) -> list[dict]:
        """Get vaccines that are due for notification (scheduled_date <= today + remind_days, not yet notified)."""
        try:
            rows = await db.fetch(
                """SELECT vs.*, c.code as cycle_code, b.name as barn_name,
                   (vs.scheduled_date - CURRENT_DATE) as days_until,
                   vs.remind_days
                FROM vaccine_schedules vs
                JOIN cycles c ON vs.cycle_id = c.id
                LEFT JOIN barns b ON c.barn_id = b.id
                WHERE c.status = 'active'
                  AND vs.done = FALSE
                  AND vs.skipped = FALSE
                  AND vs.notified_at IS NULL
                  AND vs.scheduled_date <= CURRENT_DATE + (vs.remind_days || ' days')::interval
                ORDER BY vs.scheduled_date""",
            )
            return [dict(r) for r in rows]
        except Exception as e:
            # If notified_at column doesn't exist, fall back to querying without notified filter
            if "notified_at" in str(e) and "does not exist" in str(e):
                logger.warning("vaccine_schedules.notified_at column missing, using fallback query")
                rows = await db.fetch(
                    """SELECT vs.*, c.code as cycle_code, b.name as barn_name,
                       (vs.scheduled_date - CURRENT_DATE) as days_until,
                       vs.remind_days
                    FROM vaccine_schedules vs
                    JOIN cycles c ON vs.cycle_id = c.id
                    LEFT JOIN barns b ON c.barn_id = b.id
                    WHERE c.status = 'active'
                      AND vs.done = FALSE
                      AND vs.skipped = FALSE
                      AND vs.scheduled_date <= CURRENT_DATE + (vs.remind_days || ' days')::interval
                    ORDER BY vs.scheduled_date""",
                )
                return [dict(r) for r in rows]
            raise

    async def mark_notified(self, schedule_id: int):
        """Mark a vaccine schedule as notified."""
        try:
            await db.execute(
                "UPDATE vaccine_schedules SET notified_at = NOW() WHERE id = $1",
                schedule_id,
            )
        except Exception as e:
            if "notified_at" in str(e) and "does not exist" in str(e):
                logger.warning(f"vaccine_schedules.notified_at missing, skipping mark_notified for {schedule_id}")
            else:
                raise


vaccine_service = VaccineService()
