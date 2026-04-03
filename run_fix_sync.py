"""Fix sync compatibility - run migrations directly."""
import asyncio
import asyncpg

async def main():
    # Connect as postgres (superuser)
    dsn = "postgresql://postgres:postgres@localhost:5432/cfarm_local"

    try:
        conn = await asyncpg.connect(dsn)
        print("Connected as postgres!")

        # Add updated_at to barns
        try:
            await conn.execute("ALTER TABLE barns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
            print("✓ barns.updated_at added")
        except Exception as e:
            print(f"✗ barns: {e}")

        # Add updated_at to cycles
        try:
            await conn.execute("ALTER TABLE cycles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()")
            print("✓ cycles.updated_at added")
        except Exception as e:
            print(f"✗ cycles: {e}")

        await conn.close()
        print("Done!")

    except Exception as e:
        print(f"Connection error: {e}")

if __name__ == "__main__":
    asyncio.run(main())