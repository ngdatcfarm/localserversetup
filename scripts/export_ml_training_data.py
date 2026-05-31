import asyncio
import csv
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.services.database.db import db

OUTPUT_DIR = Path("E:/AI/Dataset")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


async def export_data():
    db.configure({
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026",
    })
    await db.connect()

    print("Fetching sensor data...")

    rows = await db.fetch("""
        SELECT
            time_bucket('1 hour', time) as hour_ts,
            barn_id,
            sensor_type,
            AVG(value) as avg_value,
            MIN(value) as min_value,
            MAX(value) as max_value,
            COUNT(*) as sample_count
        FROM sensor_data
        WHERE time >= NOW() - INTERVAL '14 days'
        GROUP BY hour_ts, barn_id, sensor_type
        ORDER BY hour_ts, barn_id, sensor_type
    """)

    print(f"Fetched {len(rows)} hourly aggregates")

    data_by_time_barn = {}
    for row in rows:
        ts = row["hour_ts"]
        barn = row["barn_id"]
        key = (ts, barn)
        if key not in data_by_time_barn:
            data_by_time_barn[key] = {
                "timestamp": ts,
                "barn_id": barn,
                "hour": ts.hour,
                "day_of_week": ts.weekday(),
                "day_of_month": ts.day,
            }
        if row["sensor_type"] == "temperature":
            data_by_time_barn[key]["temperature"] = round(row["avg_value"], 2)
        elif row["sensor_type"] == "humidity":
            data_by_time_barn[key]["humidity"] = round(row["avg_value"], 2)
        elif row["sensor_type"] == "mq135_raw":
            data_by_time_barn[key]["mq135"] = round(row["avg_value"], 2)
        elif row["sensor_type"] == "mq137_raw":
            data_by_time_barn[key]["mq137"] = round(row["avg_value"], 2)

    cycles = await db.fetch("""
        SELECT barn_id, name, start_date, initial_count
        FROM cycles
        WHERE status = 'active'
    """)
    barn_cycle_info = {c["barn_id"]: dict(c) for c in cycles}

    result_rows = []
    for (ts, barn), data in data_by_time_barn.items():
        row = {
            "timestamp": data["timestamp"].isoformat(),
            "barn_id": barn,
            "barn_name": barn_cycle_info.get(barn, {}).get("name", barn),
            "hour": data["hour"],
            "day_of_week": data["day_of_week"],
            "day_of_month": data["day_of_month"],
            "temperature": data.get("temperature"),
            "humidity": data.get("humidity"),
            "mq135": data.get("mq135"),
            "mq137": data.get("mq137"),
        }

        cycle_info = barn_cycle_info.get(barn)
        if cycle_info and cycle_info.get("start_date"):
            start = cycle_info["start_date"]
            if isinstance(start, datetime):
                start = start.replace(tzinfo=timezone.utc)
            elif isinstance(start, str):
                start = datetime.fromisoformat(start.replace("Z", "+00:00"))
            else:
                # It's a date object, convert to datetime
                start = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)
            day_age = (data["timestamp"].replace(tzinfo=timezone.utc) - start).days
            row["day_age"] = max(0, day_age)

        result_rows.append(row)

    result_rows.sort(key=lambda x: (x["timestamp"], x["barn_id"]))

    date_str = datetime.now().strftime("%Y-%m-%d")
    output_file = OUTPUT_DIR / f"ml_training_data_{date_str}.csv"

    fieldnames = [
        "timestamp", "barn_id", "barn_name", "hour", "day_of_week", "day_of_month",
        "temperature", "humidity", "mq135", "mq137", "day_age"
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(result_rows)

    print(f"\nExported {len(result_rows)} rows to:")
    print(f"  {output_file}")

    print(f"\nSummary:")
    print(f"  Time range: {result_rows[0]['timestamp']} to {result_rows[-1]['timestamp']}")
    print(f"  Barns: {set(r['barn_id'] for r in result_rows)}")

    temp_count = sum(1 for r in result_rows if r.get("temperature") is not None)
    humidity_count = sum(1 for r in result_rows if r.get("humidity") is not None)
    mq135_count = sum(1 for r in result_rows if r.get("mq135") is not None)
    mq137_count = sum(1 for r in result_rows if r.get("mq137") is not None)

    print(f"  Temperature readings: {temp_count}")
    print(f"  Humidity readings: {humidity_count}")
    print(f"  MQ135 readings: {mq135_count}")
    print(f"  MQ137 readings: {mq137_count}")

    await db.disconnect()
    return str(output_file)


if __name__ == "__main__":
    output = asyncio.run(export_data())
    print(f"\nDone! File: {output}")