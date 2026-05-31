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
from datetime import datetime, timezone, timedelta
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)


# Snapshot schema version
SCHEMA_VERSION = "1.0"


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
            snapshot_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

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

            # Build snapshot
            snapshot = {
                "cycle_id": cycle_id,
                "barn_id": cycle["barn_id"],
                "barn_name": cycle["barn_name"],
                "snapshot_date": snapshot_date,
                "day_age": day_age,
                "stage": cycle.get("stage", "unknown"),

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
            snapshot_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

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
        """Get aggregated sensor data for a day."""
        from datetime import datetime as dt
        start_time = dt.strptime(f"{date} 00:00:00", "%Y-%m-%d %H:%M:%S")
        end_time = dt.strptime(f"{date} 23:59:59", "%Y-%m-%d %H:%M:%S")

        sensor_types = ["temperature", "humidity", "mq137_raw", "mq135_raw"]
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
                    AND time <= $4""",
                barn_id, sensor_type, start_time, end_time
            )

            if agg and agg["sample_count"] > 0:
                result[sensor_type] = {
                    "avg": round(agg["avg_value"], 2) if agg["avg_value"] else 0,
                    "min": round(agg["min_value"], 2) if agg["min_value"] else 0,
                    "max": round(agg["max_value"], 2) if agg["max_value"] else 0,
                    "std": round(agg["std_value"], 2) if agg["std_value"] else 0,
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
        """Get barn environment state."""
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

        return {
            "wifi_rssi": latest["wifi_rssi"] if latest else None,
            "uptime_hours": round(latest["uptime_seconds"] / 3600, 1) if latest and latest["uptime_seconds"] else 0,
            "curtain_state": None,
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