import asyncio
import asyncpg
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8')

async def test():
    conn = await asyncpg.connect(
        host='localhost', port=5432, user='cfarm',
        password='cfarm_local_2026', database='cfarm_local'
    )

    # Test Vietnamese
    result = await conn.fetchrow(
        "INSERT INTO barns (id, name, farm_id, active) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
        'barn-02', 'Chuồng Dơi Hồng', 'farm_01'
    )

    print(f"Stored: {result[0]} - {result[1]}")

    # Read it back
    name = await conn.fetchval("SELECT name FROM barns WHERE id = $1", 'barn-02')
    print(f"Read back: {name}")

    await conn.close()

asyncio.run(test())