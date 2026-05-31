"""Check if BMD migration worked properly."""
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
        print("=== BMD transactions calculation ===")

        # Calculate what inventory SHOULD be
        rows = await db.fetch("""
            SELECT
                t.warehouse_id,
                t.product_id,
                SUM(CASE WHEN t.transaction_type = 'import'
                    THEN CASE WHEN t.unit_size IS NOT NULL AND t.unit_size_type IN ('g', 'ml', 'kg')
                        THEN t.quantity * t.unit_size::numeric
                        ELSE t.quantity END
                    ELSE 0 END) as total_imported,
                SUM(CASE WHEN t.transaction_type = 'export'
                    THEN ABS(t.quantity)
                    ELSE 0 END) as total_exported,
                SUM(CASE WHEN t.transaction_type = 'import'
                    THEN CASE WHEN t.unit_size IS NOT NULL AND t.unit_size_type IN ('g', 'ml', 'kg')
                        THEN t.quantity * t.unit_size::numeric
                        ELSE t.quantity END
                    ELSE -ABS(t.quantity) END) as expected_inventory
            FROM inventory_transactions t
            JOIN products p ON t.product_id = p.id
            WHERE p.name = 'BMD'
            GROUP BY t.warehouse_id, t.product_id
        """)

        for r in rows:
            print(f"Warehouse {r['warehouse_id']}:")
            print(f"  Total imported (base units): {r['total_imported']}")
            print(f"  Total exported: {r['total_exported']}")
            print(f"  Expected inventory: {r['expected_inventory']}")

        print()
        print("=== ACTUAL inventory ===")
        inv = await db.fetch("""
            SELECT i.warehouse_id, i.quantity, w.name
            FROM inventory i
            JOIN warehouses w ON i.warehouse_id = w.id
            JOIN products p ON i.product_id = p.id
            WHERE p.name = 'BMD'
        """)
        for i in inv:
            print(f"  Warehouse {i['warehouse_id']} ({i['name']}): {i['quantity']}")

    finally:
        await db.disconnect()

asyncio.run(check())