"""Fix all medication inventory to match transaction history.

Uses correct logic:
- If quantity < unit_size: NEW format (package count) → quantity × unit_size
- If quantity >= unit_size: OLD format (already base units) → quantity as-is
"""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.services.database.db import db

async def fix():
    db.configure({
        'host': 'localhost', 'port': 5432, 'database': 'cfarm_local',
        'user': 'cfarm', 'password': 'cfarm_local_2026'
    })
    await db.connect()

    try:
        print("=== Fixing all medication inventory ===\n")

        # Get all medications
        meds = await db.fetch(
            "SELECT id, name FROM products WHERE product_type IN ('medication', 'medicine')"
        )

        for med in meds:
            prod_id = med['id']
            prod_name = med['name']

            # Get all warehouses for this product
            warehouses = await db.fetch(
                "SELECT DISTINCT warehouse_id FROM inventory_transactions WHERE product_id = $1",
                prod_id
            )

            for wh in warehouses:
                wh_id = wh['warehouse_id']
                wh_name = await db.fetchval(
                    "SELECT name FROM warehouses WHERE id = $1", wh_id
                )

                # Calculate from transactions using correct logic
                txns = await db.fetch(
                    """SELECT transaction_type, quantity, unit_size, unit_size_type
                       FROM inventory_transactions
                       WHERE product_id = $1 AND warehouse_id = $2
                       ORDER BY id""",
                    prod_id, wh_id
                )

                total = 0
                for t in txns:
                    qty = float(t['quantity'])
                    size_str = t['unit_size'] or '0'
                    size = float(size_str)
                    stype = t['unit_size_type'] or ''

                    if t['transaction_type'] == 'import':
                        if size > 0 and stype in ('g', 'ml', 'kg'):
                            # NEW format: qty < size means package count
                            # OLD format: qty >= size means already base units
                            if qty < size:
                                total += qty * size
                            else:
                                total += qty
                        else:
                            total += qty
                    elif t['transaction_type'] == 'export':
                        total -= abs(qty)

                # Get current inventory
                current = await db.fetchval(
                    "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
                    wh_id, prod_id
                )

                if current is None:
                    current = 0

                diff = abs(float(current) - total)
                if diff > 0.01:
                    print(f"  {wh_name} / {prod_name}: {current} -> {total} (diff={diff})")
                    await db.execute(
                        "UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE warehouse_id = $2 AND product_id = $3",
                        total, wh_id, prod_id
                    )
                else:
                    print(f"  {wh_name} / {prod_name}: {current} = OK")

        print("\n=== FINAL VERIFICATION ===")
        inv = await db.fetch("""
            SELECT i.warehouse_id, i.quantity, p.name, w.name as wh_name
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            JOIN warehouses w ON i.warehouse_id = w.id
            WHERE p.product_type IN ('medication', 'medicine')
            ORDER BY p.name, w.name
        """)
        for i in inv:
            print(f"  {i['wh_name']} / {i['name']}: {i['quantity']}")

    finally:
        await db.disconnect()

asyncio.run(fix())