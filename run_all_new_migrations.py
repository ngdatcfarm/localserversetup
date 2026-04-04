#!/usr/bin/env python3
"""
Run all new migration scripts (013-031, skipping 015 which already exists)
for the Local PostgreSQL database.

Usage:
    python run_all_new_migrations.py

This script runs all migration scripts in order and reports status.
"""

import asyncio
import asyncpg
import os
import sys
from pathlib import Path

# Database connection settings
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "5432"))
DB_NAME = os.environ.get("DB_NAME", "cfarm_local")
DB_USER = os.environ.get("DB_USER", "cfarm")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "cfarm_local_2026")

# Scripts to run (013-031)
SCRIPTS = [
    "015_add_farms_table.sql",  # Run first - other tables depend on farms
    "013_add_barn_dimensions.sql",
    "014_add_barn_capex.sql",
    "016_add_equipment.sql",
    "017_add_cycle_gender_finance.sql",
    "018_add_weight_samples.sql",
    "019_add_care_expenses.sql",
    "020_add_care_litters.sql",
    "021_add_sensor_tables.sql",
    "022_add_care_death_med_gaps.sql",
    "023_add_care_med_gaps.sql",
    "024_expand_products.sql",
    "025_expand_suppliers.sql",
    "026_add_feed_med_product_fk.sql",
    "027_add_vaccine_product_fk.sql",
    "028_expand_device_types.sql",
    "029_create_equipment_types.sql",
    "030_expand_sync_queue.sql",
    "031_add_version_columns.sql",
]

SCRIPTS_DIR = Path(__file__).parent / "scripts"


async def run_migration(script_name: str, conn: asyncpg.Connection) -> tuple[bool, str]:
    """Run a single migration script."""
    script_path = SCRIPTS_DIR / script_name

    if not script_path.exists():
        return False, f"Script not found: {script_path}"

    try:
        with open(script_path, "r", encoding="utf-8") as f:
            sql = f.read()

        # Execute the SQL
        await conn.execute(sql)

        # Check if it was successful by looking for the DO block notice
        return True, f"Successfully ran {script_name}"
    except Exception as e:
        return False, f"Error in {script_name}: {str(e)}"


async def main():
    """Main entry point."""
    print("=" * 60)
    print("Running Local Server Migrations (013-031)")
    print("=" * 60)
    print()

    # Connect to the database
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME}...")
    try:
        conn = await asyncpg.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
        )
        print("Connected successfully!")
        print()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        sys.exit(1)

    # Run each script in order
    results = []
    for script_name in SCRIPTS:
        print(f"Running {script_name}...", end=" ")
        success, message = await run_migration(script_name, conn)
        print(message)
        results.append((script_name, success, message))

        if not success:
            print(f"  WARNING: {script_name} failed, continuing anyway...")

    # Close the connection
    await conn.close()

    # Print summary
    print()
    print("=" * 60)
    print("Migration Summary")
    print("=" * 60)

    success_count = sum(1 for _, success, _ in results if success)
    fail_count = len(results) - success_count

    for script_name, success, message in results:
        status = "[OK]" if success else "[FAIL]"
        print(f"  {status} {script_name}")

    print()
    print(f"Total: {len(results)} scripts")
    print(f"Successful: {success_count}")
    print(f"Failed: {fail_count}")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
