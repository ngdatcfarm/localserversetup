"""Check Test Thuoc transactions."""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.services.database.db import db

async def check():
    db.configure({
        'host': 'localhost', 'port': 5432, 'database': 'cfarm_local',
        'user': 'cfarm', 'password': 'cfarm_local_2026'
    })
    await db.connect()

    try:
        prod_id = await db.fetchval("SELECT id FROM products WHERE name = 'Test Thuoc'")
        print(f"Test Thuoc product_id = {prod_id}")

        print("=== ALL Test Thuoc transactions ===")
        txns = await db.fetch(
            """SELECT id, warehouse_id, transaction_type, quantity, unit_size, unit_size_type, created_at
               FROM inventory_transactions WHERE product_id = $1 ORDER BY id""",
            prod_id
        )
        for t in txns:
            print(f"  id={t['id']} wh={t['warehouse_id']} type={t['transaction_type']} qty={t['quantity']} size={t['unit_size']}{t['unit_size_type']}")

        print()
        print("=== Calculating per warehouse ===")

        # Get warehouses
        whs = await db.fetch("SELECT DISTINCT warehouse_id FROM inventory_transactions WHERE product_id = $1", prod_id)
        for wh in whs:
            wh_id = wh['warehouse_id']
            wh_name = await db.fetchval("SELECT name FROM warehouses WHERE id = $1", wh_id)

            txns = await db.fetch(
                """SELECT transaction_type, quantity, unit_size, unit_size_type
                   FROM inventory_transactions WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id""",
                prod_id, wh_id
            )

            total = 0
            print(f"Warehouse {wh_id} ({wh_name}):")
            for t in txns:
                if t['transaction_type'] == 'import':
                    if t['unit_size'] and t['unit_size_type'] in ('g', 'ml', 'kg'):
                        added = float(t['quantity']) * float(t['unit_size'])
                        total += added
                        print(f"  import: {t['quantity']} * {t['unit_size']}{t['unit_size_type']} = {added}")
                    else:
                        total += float(t['quantity'])
                        print(f"  import: {t['quantity']} (no unit_size)")
                elif t['transaction_type'] == 'export':
                    exported = abs(float(t['quantity']))
                    total -= exported
                    print(f"  export: -{exported}")

            print(f"  Total: {total}")

    finally:
        await db.disconnect()

asyncio.run(check())