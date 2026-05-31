"""Script to update product codes to match feed type codes."""
import asyncio
import asyncpg

DSN = "postgresql://cfarm:cfarm_local_2026@localhost:5432/cfarm_local"


async def fix():
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)

    print("Connected, updating products...")

    # Map: product_id -> new_code
    updates = [
        (5, '311H'),
        (6, '311'),
        (7, '312'),
        (8, '313'),
        (3, 'Test Thuoc'),
        (4, 'Vitamin C'),
    ]

    async with pool.acquire() as conn:
        for prod_id, new_code in updates:
            result = await conn.execute(
                'UPDATE products SET code = $1 WHERE id = $2',
                new_code, prod_id
            )
            print(f"Product {prod_id} -> {new_code}: {result}")

        # Verify
        rows = await conn.fetch("SELECT id, code, name, product_type FROM products ORDER BY product_type, id")
        for r in rows:
            print(f"  {r['id']}: {r['code']} - {r['name']} ({r['product_type']})")

    await pool.close()
    print("Done!")


if __name__ == '__main__':
    asyncio.run(fix())
