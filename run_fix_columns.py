"""Fix sync columns - simple ALTER statements."""
import asyncio
import asyncpg
from urllib.parse import quote_plus

async def main():
    password = "Abc@@123"
    encoded_password = quote_plus(password)
    dsn = f"postgresql://postgres:{encoded_password}@127.0.0.1:5432/cfarm_local"

    conn = await asyncpg.connect(dsn)
    print("Connected!")

    # Simple ALTER statements
    statements = [
        "ALTER TABLE barns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
        "ALTER TABLE cycles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
    ]

    for stmt in statements:
        try:
            await conn.execute(stmt)
            print(f"OK: {stmt[:50]}...")
        except Exception as e:
            print(f"Error: {e}")

    await conn.close()
    print("Done!")

asyncio.run(main())