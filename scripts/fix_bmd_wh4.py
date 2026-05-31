"""Fix BMD inventory at warehouse 4 (Kho thuốc trại 9).

The migration script incorrectly calculated this because it didn't properly
handle warehouse-specific totals.
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
        prod_id = await db.fetchval("SELECT id FROM products WHERE name = 'BMD'")
        wh_4 = 4
        wh_7 = 7

        print("=== BMD at Warehouse 4 (Kho thuốc trại 9) ===")

        # Get transactions
        txns = await db.fetch(
            "SELECT id, transaction_type, quantity, unit_size, unit_size_type FROM inventory_transactions WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id",
            prod_id, wh_4
        )
        print("Transactions:")
        for t in txns:
            print(f"  id={t['id']} type={t['transaction_type']} qty={t['quantity']} size={t['unit_size']}{t['unit_size_type']}")

        # Calculate expected
        total_imported = 0
        total_exported = 0
        for t in txns:
            if t['transaction_type'] == 'import':
                if t['unit_size'] and t['unit_size_type'] in ('g', 'ml', 'kg'):
                    total_imported += float(t['quantity']) * float(t['unit_size'])
                else:
                    total_imported += float(t['quantity'])
            elif t['transaction_type'] == 'export':
                total_exported += abs(float(t['quantity']))

        expected = total_imported - total_exported
        print(f"Total imported: {total_imported}")
        print(f"Total exported: {total_exported}")
        print(f"Expected inventory: {expected}")

        # Current
        current = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            wh_4, prod_id
        )
        print(f"Current inventory: {current}")

        # Fix it
        if current != expected:
            print(f"Fixing inventory from {current} to {expected}...")
            await db.execute(
                "UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE warehouse_id = $2 AND product_id = $3",
                expected, wh_4, prod_id
            )
            print("Fixed!")
        else:
            print("No fix needed")

        print()
        print("=== Verification ===")
        inv = await db.fetch("""
            SELECT i.warehouse_id, i.quantity, w.name
            FROM inventory i
            JOIN warehouses w ON i.warehouse_id = w.id
            WHERE i.product_id = $1
            ORDER BY i.warehouse_id
        """, prod_id)
        for i in inv:
            print(f"  Warehouse {i['warehouse_id']} ({i['name']}): {i['quantity']}")

    finally:
        await db.disconnect()

asyncio.run(fix())