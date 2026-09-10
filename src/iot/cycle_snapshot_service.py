"""
Cycle Daily Snapshots Service
==============================

Aggregates daily data for each active cycle into a snapshot.
This data is crucial for future ML training.

Data aggregated:
- Sensor readings (avg, min, max, std)
- Care records (feeds, deaths, medications, weights)
- Cycle metadata (day_age, counts, mortality rate)
- Barn environment state

Usage:
    python cycle_snapshot_service.py run      # Run now
    python cycle_snapshot_service.py schedule  # Setup nightly cron
"""

import json
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


# Snapshot schema version
SCHEMA_VERSION = "1.0"

# Vietnam timezone (UTC+7) — server + farm both run in VN,
# so "today" and sensor day boundaries should follow VN local time.
VN_TZ = timezone(timedelta(hours=7))


class CycleSnapshotService:
    """
    Service to create daily snapshots for all active cycles.
    Snapshots are used for ML training and historical analysis.
    """

    async def create_snapshot(self, cycle_id: int, snapshot_date: str = None) -> dict:
        """
        Create a daily snapshot for a specific cycle.

        Args:
            cycle_id: Cycle ID
            snapshot_date: Date for snapshot (YYYY-MM-DD), defaults to today

        Returns:
            dict with snapshot data or error
        """
        if snapshot_date is None:
            snapshot_date = datetime.now(VN_TZ).strftime("%Y-%m-%d")

        try:
            # Get cycle info
            cycle = await db.fetchrow(
                """SELECT c.*, b.name as barn_name
                FROM cycles c
                JOIN barns b ON c.barn_id = b.id
                WHERE c.id = $1""",
                cycle_id
            )
            if not cycle:
                return {"ok": False, "error": f"Cycle {cycle_id} not found"}

            # Get sensor data aggregated
            sensor_data = await self._get_sensor_aggregates(
                cycle["barn_id"], cycle_id, snapshot_date
            )

            # Get care records aggregated
            care_data = await self._get_care_aggregates(cycle_id, snapshot_date)

            # Get weight data
            weight_data = await self._get_weight_aggregates(cycle_id, snapshot_date)

            # Get environment state
            env_data = await self._get_environment_state(
                cycle["barn_id"], cycle_id, snapshot_date
            )

            # Calculate derived metrics
            day_age = self._calculate_day_age(cycle["start_date"], snapshot_date)
            mortality_rate = self._calculate_mortality_rate(
                cycle["initial_count"], cycle["current_count"]
            )
            # Compute stage from day_age rather than copying from cycles.stage:
            # cycle.stage column is set once at create and never updated, so a
            # 5-month-old cycle still shows 'chick'. Use the day_age directly
            # for the snapshot — it's always in sync with reality.
            stage = self._compute_stage(day_age)

            # Build snapshot
            snapshot = {
                "cycle_id": cycle_id,
                "barn_id": cycle["barn_id"],
                "barn_name": cycle["barn_name"],
                "snapshot_date": snapshot_date,
                "day_age": day_age,
                "stage": stage,

                # Bird counts
                "initial_count": cycle["initial_count"],
                "current_count": cycle["current_count"],
                "deaths_today": care_data.get("total_deaths", 0),
                "mortality_rate_pct": mortality_rate,

                # Sensor data
                "sensors": {
                    "temperature": sensor_data.get("temperature", {}),
                    "humidity": sensor_data.get("humidity", {}),
                    "mq137_raw": sensor_data.get("mq137_raw", {}),
                    "mq135_raw": sensor_data.get("mq135_raw", {}),
                    "light": sensor_data.get("light", {}),
                    "co2": sensor_data.get("co2", {}),
                },

                # Care data
                "care": {
                    "feed_kg": care_data.get("total_feed_kg", 0),
                    "medication_count": care_data.get("total_medications", 0),
                    "water_liters": care_data.get("total_water", 0),
                    "sales_count": care_data.get("total_sales", 0),
                },

                # Weight data
                "weight": {
                    "avg_weight_g": weight_data.get("avg_weight", 0),
                    "sample_count": weight_data.get("sample_count", 0),
                    "uniformity_pct": weight_data.get("uniformity", 0),
                    "min_weight_g": weight_data.get("min_weight", 0),
                    "max_weight_g": weight_data.get("max_weight", 0),
                },

                # Environment
                "environment": env_data,

                # Metadata
                "created_at": datetime.now(timezone.utc).isoformat(),
                "schema_version": SCHEMA_VERSION,
            }

            # Insert or update snapshot
            from datetime import date as date_type
            snapshot_date_db = date_type.fromordinal(datetime.strptime(snapshot["snapshot_date"], "%Y-%m-%d").date().toordinal())
            await db.execute(
                """INSERT INTO cycle_daily_snapshots (
                    cycle_id, snapshot_date, day_age, stage,
                    initial_count, current_count, deaths_today, mortality_rate_pct,
                    sensor_data, care_data, weight_data, environment_data,
                    metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                ON CONFLICT (cycle_id, snapshot_date)
                DO UPDATE SET
                    day_age = EXCLUDED.day_age,
                    stage = EXCLUDED.stage,
                    current_count = EXCLUDED.current_count,
                    deaths_today = EXCLUDED.deaths_today,
                    mortality_rate_pct = EXCLUDED.mortality_rate_pct,
                    sensor_data = EXCLUDED.sensor_data,
                    care_data = EXCLUDED.care_data,
                    weight_data = EXCLUDED.weight_data,
                    environment_data = EXCLUDED.environment_data,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()""",
                snapshot["cycle_id"],
                snapshot_date_db,
                snapshot["day_age"],
                snapshot["stage"],
                snapshot["initial_count"],
                snapshot["current_count"],
                snapshot["deaths_today"],
                snapshot["mortality_rate_pct"],
                json.dumps(snapshot["sensors"]),
                json.dumps(snapshot["care"]),
                json.dumps(snapshot["weight"]),
                json.dumps(snapshot["environment"]),
                json.dumps({"schema_version": SCHEMA_VERSION, "breed": cycle.get("breed")}),
            )

            logger.info(f"Created snapshot for cycle {cycle_id} on {snapshot_date}")
            return {"ok": True, "snapshot": snapshot}

        except Exception as e:
            logger.error(f"Error creating snapshot for cycle {cycle_id}: {e}")
            return {"ok": False, "error": str(e)}

    async def create_all_snapshots(self, snapshot_date: str = None) -> dict:
        """
        Create snapshots for all active cycles.

        Args:
            snapshot_date: Date for snapshots (YYYY-MM-DD), defaults to today

        Returns:
            dict with results
        """
        if snapshot_date is None:
            snapshot_date = datetime.now(VN_TZ).strftime("%Y-%m-%d")

        # Get all active cycles
        active_cycles = await db.fetch(
            "SELECT id, barn_id, name FROM cycles WHERE status = $1", "active"
        )

        results = []
        for cycle in active_cycles:
            result = await self.create_snapshot(cycle["id"], snapshot_date)
            results.append({
                "cycle_id": cycle["id"],
                "cycle_name": cycle["name"],
                "status": "ok" if result["ok"] else "error",
                "error": result.get("error")
            })

        success = sum(1 for r in results if r["status"] == "ok")
        logger.info(f"Snapshot run: {success}/{len(results)} cycles completed")

        return {
            "ok": True,
            "date": snapshot_date,
            "total_cycles": len(results),
            "successful": success,
            "failed": len(results) - success,
            "results": results
        }

    async def _get_sensor_aggregates(self, barn_id: str, cycle_id: int, date: str) -> dict:
        """Get aggregated sensor data for a day.

        Day boundaries are interpreted in VN local time (UTC+7): [00:00, next-day 00:00).
        Sensor rows whose `time` falls in that half-open interval are included.
        Using a half-open interval avoids missing the last second of the day and
        avoids double-counting the boundary if ESP32 publishes exactly at 00:00.

        Why we do NOT filter zero/negative values:
        ------------------------------------------
        MQ-series gas sensors (mq135_raw, mq137_raw) read near zero in clean air
        — a 0 ADC reading is a legitimate measurement, not noise. The absolute
        value (avg) tells you the typical level, but the *variation around it*
        (std, range) is what reveals whether the sensor is actually responding
        to environmental changes. A stuck sensor that reports the same value
        24h a day will have std≈0 and range≈0, which itself is a recognizable
        pattern in downstream ML — filtering zeros would silently destroy that
        signal. Same logic applies to all sensor types.

        Each sensor returns its own scale (ppm, °C, %, raw ADC etc.). We capture
        both location (avg, min, max) and variability (std, range, cv) so the
        ML pipeline can use either or both.
        """
        from datetime import datetime as dt
        date_obj = dt.strptime(date, "%Y-%m-%d").date()
        start_dt = dt.combine(date_obj, dt.min.time()).replace(tzinfo=VN_TZ)
        end_dt = start_dt + timedelta(days=1)

        # `co2` and `light` are pre-wired for forward-compatibility: if any
        # sensor publishes them later, snapshots pick them up automatically
        # without code change. Empty days produce no entry (intentional).
        sensor_types = [
            "temperature", "humidity",
            "mq137_raw", "mq135_raw",
            "co2", "light",
        ]
        result = {}

        for sensor_type in sensor_types:
            agg = await db.fetchrow(
                """SELECT
                    AVG(value) as avg_value,
                    MIN(value) as min_value,
                    MAX(value) as max_value,
                    STDDEV(value) as std_value,
                    COUNT(*) as sample_count
                FROM sensor_data
                WHERE barn_id = $1
                    AND sensor_type = $2
                    AND time >= $3
                    AND time < $4""",
                barn_id, sensor_type, start_dt, end_dt
            )

            if agg and agg["sample_count"] > 0:
                # Pull raw values once; coercion '' or None → 0 is intentional
                avg = float(agg["avg_value"] or 0)
                mn = float(agg["min_value"] or 0)
                mx = float(agg["max_value"] or 0)
                std = float(agg["std_value"] or 0)
                # Coefficient of variation: relative variability, scale-free.
                # 0/0 when avg is 0 (e.g. sensor stuck at zero) — left as 0.
                cv = round((std / avg) * 100, 2) if avg != 0 else 0
                result[sensor_type] = {
                    "avg":     round(avg, 2),
                    "min":     round(mn, 2),
                    "max":     round(mx, 2),
                    "std":     round(std, 2),
                    # Variation emphasis: range = full spread, cv = relative.
                    # These make "did the sensor actually move today?" trivially
                    # visible to the ML pipeline and to dashboards.
                    "range":   round(mx - mn, 2),
                    "cv":      cv,
                    "samples": agg["sample_count"],
                }

        return result

    async def _get_care_aggregates(self, cycle_id: int, date: str) -> dict:
        """Get aggregated care records for a day."""
        from datetime import datetime as dt
        date_obj = dt.strptime(date, "%Y-%m-%d").date()
        result = {
            "total_feed_kg": 0,
            "total_deaths": 0,
            "total_medications": 0,
            "total_water": 0,
            "total_sales": 0,
        }

        # Feed
        feed = await db.fetchval(
            """SELECT COALESCE(SUM(quantity), 0) FROM care_feeds
            WHERE cycle_id = $1 AND feed_date = $2""",
            cycle_id, date_obj
        )
        result["total_feed_kg"] = float(feed or 0)

        # Deaths
        deaths = await db.fetchval(
            """SELECT COALESCE(SUM(count), 0) FROM care_deaths
            WHERE cycle_id = $1 AND death_date = $2""",
            cycle_id, date_obj
        )
        result["total_deaths"] = int(deaths or 0)

        # Medications
        meds = await db.fetchval(
            """SELECT COUNT(*) FROM care_medications
            WHERE cycle_id = $1 AND med_date = $2""",
            cycle_id, date_obj
        )
        result["total_medications"] = int(meds or 0)

        # Water
        water = await db.fetchval(
            """SELECT COALESCE(SUM(consumption_liters), 0) FROM care_water_logs
            WHERE cycle_id = $1 AND water_date = $2""",
            cycle_id, date_obj
        )
        result["total_water"] = float(water or 0)

        # Sales
        sales = await db.fetchval(
            """SELECT COALESCE(SUM(count), 0) FROM care_sales
            WHERE cycle_id = $1 AND sale_date = $2""",
            cycle_id, date_obj
        )
        result["total_sales"] = int(sales or 0)

        return result

    async def _get_weight_aggregates(self, cycle_id: int, date: str) -> dict:
        """Get weight data for the day."""
        from datetime import datetime as dt
        date_obj = dt.strptime(date, "%Y-%m-%d").date()
        weight = await db.fetchrow(
            """SELECT
                AVG(total_weight / NULLIF(sample_count, 0)) as avg_weight,
                SUM(sample_count) as total_samples,
                MIN(min_weight) as min_weight,
                MAX(max_weight) as max_weight,
                AVG(uniformity) as avg_uniformity
            FROM care_weights
            WHERE cycle_id = $1 AND weigh_date = $2""",
            cycle_id, date_obj
        )

        if weight and weight["avg_weight"]:
            return {
                "avg_weight": round(weight["avg_weight"], 2),
                "sample_count": int(weight["total_samples"] or 0),
                "min_weight": round(weight["min_weight"], 2) if weight["min_weight"] else 0,
                "max_weight": round(weight["max_weight"], 2) if weight["max_weight"] else 0,
                "uniformity": round(weight["avg_uniformity"], 2) if weight["avg_uniformity"] else 0,
            }

        return {"avg_weight": 0, "sample_count": 0, "min_weight": 0, "max_weight": 0, "uniformity": 0}

    async def _get_environment_state(self, barn_id: str, cycle_id: int, date: str) -> dict:
        """Get barn environment state.

        Queries:
        - latest device heartbeat (wifi rssi, uptime) — best-effort signal of
          whether the barn's primary controller is online right now;
        - latest curtain_configs row by last_moved_at — only populated if the
          barn has at least one curtain configured. Barns without curtains
          return curtain_state=None (intentional; do not synthesize).
        """
        # Get latest device states for this barn
        latest = await db.fetchrow(
            """SELECT
                d.wifi_rssi,
                d.uptime_seconds
            FROM devices d
            WHERE d.barn_id = $1
            ORDER BY d.last_heartbeat_at DESC
            LIMIT 1""",
            barn_id
        )

        # Get latest curtain state for this barn. A barn may have multiple
        # curtains; we surface only the most-recently-moved one. If the barn
        # has none configured, the result is None (do not fabricate state).
        curtain = await db.fetchrow(
            """SELECT current_position, moving_state, last_moved_at,
                      moving_target_pct, moving_started_at, moving_duration_seconds
               FROM curtain_configs
               WHERE barn_id = $1
               ORDER BY last_moved_at DESC NULLS LAST, curtain_code
               LIMIT 1""",
            barn_id
        )
        curtain_state = None
        if curtain:
            curtain_state = {
                "current_position":       curtain["current_position"],
                "moving_state":           curtain["moving_state"],
                "moving_target_pct":      curtain["moving_target_pct"],
                # Surface ISO strings (JSONB-safe) instead of datetime objects
                "last_moved_at":          curtain["last_moved_at"].isoformat() if curtain["last_moved_at"] else None,
                "moving_started_at":      curtain["moving_started_at"].isoformat() if curtain["moving_started_at"] else None,
                "moving_duration_seconds": curtain["moving_duration_seconds"],
            }

        return {
            "wifi_rssi": latest["wifi_rssi"] if latest else None,
            "uptime_hours": round(latest["uptime_seconds"] / 3600, 1) if latest and latest["uptime_seconds"] else 0,
            "curtain_state": curtain_state,
        }

    def _calculate_day_age(self, start_date, snapshot_date) -> int:
        """Calculate day age from start date."""
        try:
            start = datetime.strptime(str(start_date)[:10], "%Y-%m-%d").date()
            snapshot = datetime.strptime(snapshot_date, "%Y-%m-%d").date()
            return max(0, (snapshot - start).days)
        except:
            return 0

    def _calculate_mortality_rate(self, initial_count, current_count) -> float:
        """Calculate mortality rate percentage."""
        if not initial_count or initial_count == 0:
            return 0
        deaths = initial_count - (current_count or 0)
        return round((deaths / initial_count) * 100, 2)

    def _compute_stage(self, day_age: int) -> str:
        """Derive broiler stage from day_age using industry conventions.

        Stages (broiler, standard):
          - chick / brooding : day 1-7   (post-hatch, heat lamp required)
          - starter          : day 8-21  (rapid growth, starter feed)
          - grower           : day 22-35 (continued growth, grower feed)
          - finisher         : day 36+   (final grow-out, finisher feed)

        Why we compute from day_age instead of copying from cycles.stage:
        The ``cycles.stage`` column is set once at create-time and never
        updated by the app, so a 5-month-old batch still shows 'chick'.
        Every snapshot uses day_age instead — always in sync with reality.
        """
        if day_age is None or day_age < 1:
            return "unknown"
        if day_age <= 7:
            return "chick"
        if day_age <= 21:
            return "starter"
        if day_age <= 35:
            return "grower"
        return "finisher"


# Singleton
_snapshot_service: Optional[CycleSnapshotService] = None


def get_snapshot_service() -> CycleSnapshotService:
    global _snapshot_service
    if _snapshot_service is None:
        _snapshot_service = CycleSnapshotService()
    return _snapshot_service


async def run_snapshot(date: str = None) -> dict:
    """Convenience function to run snapshots."""
    service = get_snapshot_service()
    return await service.create_all_snapshots(date)


async def _backfill_snapshots(days_back: int) -> int:
    """One-shot backfill at scheduler startup.

    For each cycle (active + closed), find days in [start_date, today)
    that have no snapshot row yet and create one. Idempotent via UPSERT.

    Returns the number of snapshots created.
    """
    from datetime import date as date_cls

    if days_back <= 0:
        return 0

    today = datetime.now(VN_TZ).date()
    cutoff = today - timedelta(days=days_back)

    # All cycles — both active and closed. Closed cycles still need
    # historical snapshots so cycle-summary KPIs work for past batches.
    cycles = await db.fetch("SELECT id, start_date FROM cycles")
    if not cycles:
        return 0

    service = get_snapshot_service()
    created = 0

    for c in cycles:
        cycle_start = c["start_date"]
        if isinstance(cycle_start, str):
            cycle_start = date_cls.fromisoformat(cycle_start)
        if cycle_start is None or cycle_start >= today:
            continue
        if cycle_start < cutoff:
            cycle_start = cutoff

        # Find which days already have snapshots for this cycle
        snap_rows = await db.fetch(
            """SELECT snapshot_date FROM cycle_daily_snapshots
               WHERE cycle_id = $1
                 AND snapshot_date >= $2
                 AND snapshot_date < $3""",
            c["id"], cycle_start, today,
        )
        existing = {r["snapshot_date"] for r in snap_rows}

        # Walk day by day and fill missing
        d = cycle_start
        while d < today:
            if d not in existing:
                try:
                    result = await service.create_snapshot(c["id"], d.isoformat())
                    if result.get("ok"):
                        created += 1
                        logger.info(f"Backfilled snapshot: cycle={c['id']} date={d.isoformat()}")
                    else:
                        logger.warning(
                            f"Backfill skipped cycle={c['id']} date={d.isoformat()}: "
                            f"{result.get('error')}"
                        )
                except Exception as e:
                    logger.warning(f"Backfill failed cycle={c['id']} date={d.isoformat()}: {e}")
            d += timedelta(days=1)

    return created


async def start_snapshot_scheduler(
    hour: int = 0,
    minute: int = 30,
    backfill_days: int = 30,
) -> None:
    """Long-running asyncio task: create daily snapshots for all active cycles.

    Schedule (VN local time, UTC+7):
    - On startup: backfill up to `backfill_days` of missing snapshots for all cycles.
    - Every day at `hour:minute`: snapshot for "yesterday VN" (the day that just
      ended), so any care logs from that day are already in the DB.
    - The task is cancellable; raises asyncio.CancelledError to exit cleanly.

    Wire into main.py startup with:
        task = asyncio.create_task(start_snapshot_scheduler())
        app.state.snapshot_task = task
    And cancel in shutdown.
    """
    logger.info(
        f"Snapshot scheduler starting: daily at {hour:02d}:{minute:02d} VN, "
        f"backfill={backfill_days} days"
    )

    # One-shot backfill at startup. Idempotent via UPSERT.
    if backfill_days > 0:
        try:
            n = await _backfill_snapshots(backfill_days)
            logger.info(f"Snapshot backfill complete: {n} snapshot(s) created")
        except Exception as e:
            logger.error(f"Snapshot backfill failed: {e}", exc_info=True)

    while True:
        try:
            now = datetime.now(VN_TZ)
            target_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if now >= target_today:
                target = target_today + timedelta(days=1)
            else:
                target = target_today

            sleep_seconds = (target - now).total_seconds()
            logger.info(
                f"Next snapshot run at {target.isoformat()} "
                f"(in {sleep_seconds:.0f}s, sleep={sleep_seconds/3600:.1f}h)"
            )
            await asyncio.sleep(sleep_seconds)

            # Snapshot for the day that just ended in VN local time.
            snapshot_date = (datetime.now(VN_TZ) - timedelta(days=1)).strftime("%Y-%m-%d")
            result = await run_snapshot(snapshot_date)
            logger.info(
                f"Daily snapshot for {snapshot_date}: "
                f"{result.get('successful', 0)}/{result.get('total_cycles', 0)} cycles"
            )

        except asyncio.CancelledError:
            logger.info("Snapshot scheduler cancelled — exiting")
            raise
        except Exception as e:
            # Don't tight-loop on persistent errors — back off 60s.
            logger.error(f"Snapshot scheduler error: {e}", exc_info=True)
            await asyncio.sleep(60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "run":
        # Run snapshots now
        result = asyncio.run(run_snapshot())
        print(f"Snapshot run completed: {result['successful']}/{result['total_cycles']} cycles")
    elif cmd == "schedule":
        # Would setup cron job
        print("To schedule, add to crontab: 0 0 * * * python /path/to/cycle_snapshot_service.py run")
    else:
        print(f"Unknown command: {cmd}")