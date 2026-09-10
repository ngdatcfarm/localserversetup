"""
Centralized timezone helpers for CFarm.

Storage convention
------------------
CFarm stores all TIMESTAMPTZ columns as UTC. PostgreSQL session timezone is
'UTC' (cfarm-db container runs UTC; we deliberately do NOT change container TZ
because that would make `now()::date` return HCM date and break cloud-sync and
any cron logic that filters by UTC day).

Display convention
------------------
The farm is physically located in Vietnam (UTC+7). Any user-facing time
display MUST be converted to Asia/Ho_Chi_Minh before showing. Filenames that
embed a date (e.g. ``snapshot_YYYY-MM-DD_HH-MM-SS.jpg``) should also use HCM
so that a frame captured at 23:00 HCM lands in the HCM-day folder, not UTC-day.

Rules for new code
------------------
1. DB writes to TIMESTAMPTZ columns: use ``now_utc()`` or pass aware UTC
   datetime. Never pass naive ``datetime.now()`` to asyncpg for TIMESTAMPTZ.
2. Filenames, display strings, ML hour-of-day features: use ``now_hcm()``.
3. epoch ``.timestamp()`` is TZ-agnostic — no helper needed.
"""

from datetime import datetime, timezone, timedelta


# Vietnam timezone — fixed offset UTC+7 (no DST).
VN_TZ = timezone(timedelta(hours=7))


def now_utc() -> datetime:
    """Aware UTC datetime. Use for any DB TIMESTAMPTZ column write."""
    return datetime.now(timezone.utc)


def now_hcm() -> datetime:
    """Aware Asia/Ho_Chi_Minh datetime. Use for filenames, display, ML features."""
    return datetime.now(VN_TZ)


def to_hcm(dt: datetime) -> datetime:
    """Convert aware datetime to HCM. Naive datetimes returned unchanged."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(VN_TZ)