"""Fix sync compatibility - add missing columns as postgres."""
import asyncio
import asyncpg
from urllib.parse import quote_plus

async def main():
    password = "Abc@@123"
    encoded_password = quote_plus(password)
    dsn = f"postgresql://postgres:{encoded_password}@127.0.0.1:5432/cfarm_local"

    conn = await asyncpg.connect(dsn)
    print("Connected as postgres!")

    # Add missing columns to cycles
    cols = [
        ("end_date", "DATE"),
        ("start_date_actual", "DATE"),
    ]

    for col_name, col_type in cols:
        try:
            await conn.execute(f"ALTER TABLE cycles ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            print(f"[OK] cycles.{col_name} added")
        except Exception as e:
            print(f"[ERR] cycles.{col_name}: {e}")

    # Add missing columns to barns
    barn_cols = [
        ("barn_type", "VARCHAR(50)"),
    ]

    for col_name, col_type in barn_cols:
        try:
            await conn.execute(f"ALTER TABLE barns ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
            print(f"[OK] barns.{col_name} added")
        except Exception as e:
            print(f"[ERR] barns.{col_name}: {e}")

    await conn.close()
    print("\nDone!")

asyncio.run(main())