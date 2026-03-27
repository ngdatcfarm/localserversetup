"""Health Service - Health notes and weight sessions."""

from src.services.database.db import db


class HealthService:

    # ── Health Notes ─────────────────────────────────

    async def list_notes(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT * FROM health_notes
            WHERE cycle_id = $1 ORDER BY recorded_at DESC""",
            cycle_id,
        )
        return [dict(r) for r in rows]

    async def create_note(self, data: dict) -> dict:
        day_age = None
        if data.get("cycle_id"):
            cycle = await db.fetchrow(
                "SELECT start_date FROM cycles WHERE id = $1", data["cycle_id"]
            )
            if cycle and data.get("recorded_at"):
                from datetime import date as dt_date
                rec = data["recorded_at"] if isinstance(data["recorded_at"], dt_date) else dt_date.fromisoformat(str(data["recorded_at"])[:10])
                day_age = (rec - cycle["start_date"]).days

        row = await db.fetchrow(
            """INSERT INTO health_notes
            (cycle_id, recorded_at, day_age, severity, symptoms,
             resolved, image_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
            data["cycle_id"], data.get("recorded_at"), day_age,
            data.get("severity", "low"), data.get("symptoms"),
            data.get("resolved", False), data.get("image_path"),
        )
        return {"ok": True, "note": dict(row)}

    async def resolve_note(self, note_id: int) -> dict:
        row = await db.fetchrow(
            """UPDATE health_notes SET resolved = TRUE, resolved_at = NOW()
            WHERE id = $1 RETURNING *""",
            note_id,
        )
        if not row:
            return {"ok": False, "message": "Note not found"}
        return {"ok": True, "note": dict(row)}

    async def delete_note(self, note_id: int) -> dict:
        await db.execute("DELETE FROM health_notes WHERE id = $1", note_id)
        return {"ok": True}

    # ── Weight Sessions ──────────────────────────────

    async def list_weight_sessions(self, cycle_id: int) -> list[dict]:
        rows = await db.fetch(
            """SELECT ws.*, (SELECT COUNT(*) FROM weight_details wd WHERE wd.session_id = ws.id) as detail_count
            FROM weight_sessions ws
            WHERE ws.cycle_id = $1 ORDER BY ws.weighed_at DESC""",
            cycle_id,
        )
        return [dict(r) for r in rows]

    async def create_weight_session(self, data: dict) -> dict:
        day_age = None
        if data.get("cycle_id"):
            cycle = await db.fetchrow(
                "SELECT start_date FROM cycles WHERE id = $1", data["cycle_id"]
            )
            if cycle and data.get("weighed_at"):
                from datetime import date as dt_date
                w_date = data["weighed_at"] if isinstance(data["weighed_at"], dt_date) else dt_date.fromisoformat(str(data["weighed_at"])[:10])
                day_age = (w_date - cycle["start_date"]).days

        row = await db.fetchrow(
            """INSERT INTO weight_sessions
            (cycle_id, day_age, sample_count, avg_weight_g, note, weighed_at)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
            data["cycle_id"], day_age, data.get("sample_count", 0),
            data.get("avg_weight_g"), data.get("note"), data.get("weighed_at"),
        )
        session_id = row["id"]

        # Insert weight details if provided
        details = data.get("details", [])
        if details:
            total_weight = 0
            for d in details:
                await db.execute(
                    """INSERT INTO weight_details (session_id, weight_g, gender)
                    VALUES ($1, $2, $3)""",
                    session_id, d["weight_g"], d.get("gender"),
                )
                total_weight += d["weight_g"]

            # Recalculate avg
            avg = total_weight / len(details) if details else 0
            await db.execute(
                """UPDATE weight_sessions SET sample_count = $2, avg_weight_g = $3
                WHERE id = $1""",
                session_id, len(details), avg,
            )

        return {"ok": True, "session": dict(row)}

    async def get_weight_session(self, session_id: int) -> dict | None:
        row = await db.fetchrow(
            "SELECT * FROM weight_sessions WHERE id = $1", session_id
        )
        if not row:
            return None
        session = dict(row)
        details = await db.fetch(
            "SELECT * FROM weight_details WHERE session_id = $1 ORDER BY id",
            session_id,
        )
        session["details"] = [dict(d) for d in details]
        return session

    async def delete_weight_session(self, session_id: int) -> dict:
        await db.execute("DELETE FROM weight_details WHERE session_id = $1", session_id)
        await db.execute("DELETE FROM weight_sessions WHERE id = $1", session_id)
        return {"ok": True}


health_service = HealthService()
