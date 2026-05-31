"""Test delete_transaction for Test Thuoc."""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.services.database.db import db
from src.farm.inventory_service import inventory_service

async def test():
    db.configure({
        'host': 'localhost', 'port': 5432, 'database': 'cfarm_local',
        'user': 'cfarm', 'password': 'cfarm_local_2026'
    })
    await db.connect()

    try:
        prod_id = await db.fetchval("SELECT id FROM products WHERE name = 'Test Thuoc'")
        wh_id = 7

        # Get current inventory
        before = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            wh_id, prod_id
        )
        print(f"Before: inventory = {before}")

        # Find an import transaction with unit_size
        txn = await db.fetchrow(
            """SELECT * FROM inventory_transactions
               WHERE product_id = $1 AND warehouse_id = $2 AND transaction_type = 'import' AND unit_size IS NOT NULL
               ORDER BY id DESC LIMIT 1""",
            prod_id, wh_id
        )

        if txn:
            print(f"\nTransaction to delete:")
            print(f"  id={txn['id']}")
            print(f"  quantity={txn['quantity']}")
            print(f"  unit_size={txn['unit_size']}{txn['unit_size_type']}")

            # Simulate the logic
            qty = abs(txn['quantity'])
            print(f"  abs(qty) = {qty}")

            if txn.get('unit_size') and txn.get('unit_size_type') in ('g', 'ml', 'kg'):
                unit_size = abs(float(txn['unit_size']))
                print(f"  unit_size = {unit_size}")
                if qty < unit_size:
                    print(f"  qty < unit_size: would convert to {qty * unit_size}")
                else:
                    print(f"  qty >= unit_size: no conversion, qty = {qty}")

            print(f"\nDeleting transaction {txn['id']}...")
            result = await inventory_service.delete_transaction(txn['id'])
            print(f"Result: {result}")

            # Check after
            after = await db.fetchval(
                "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
                wh_id, prod_id
            )
            print(f"After: inventory = {after}")
            print(f"Change: {before} - {after} = {before - after}")
        else:
            print("No import transaction found")

    finally:
        await db.disconnect()

asyncio.run(test())