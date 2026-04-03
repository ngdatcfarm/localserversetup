import asyncio
import asyncpg
import sys

async def run():
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='cfarm',
            password='cfarm_local_2026',
            database='cfarm_local'
        )

        with open('scripts/012_mother_firmware_and_cycle_link.sql', 'r', encoding='utf-8') as f:
            sql = f.read()

        await conn.execute(sql)
        print("Migration completed!")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

asyncio.run(run())