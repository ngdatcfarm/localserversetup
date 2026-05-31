"""Test delete import transaction for BMD."""
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
        prod_id = await db.fetchval("SELECT id FROM products WHERE name = 'BMD'")
        print(f"BMD product_id = {prod_id}")

        # Check inventory before
        before = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = 4 AND product_id = $1",
            prod_id
        )
        print(f"Before delete: inventory quantity = {before}")

        # Find the import transaction
        txn = await db.fetchrow(
            "SELECT * FROM inventory_transactions WHERE warehouse_id = 4 AND product_id = $1 AND transaction_type = 'import'",
            prod_id
        )
        if txn:
            print(f"Import txn: id={txn['id']} qty={txn['quantity']} unit_size={txn['unit_size']}{txn['unit_size_type']}")
            print(f"  txn['unit_size'] type = {type(txn['unit_size'])}, value = {repr(txn['unit_size'])}")
            print(f"  txn['unit_size_type'] = {repr(txn['unit_size_type'])}")

            # Test the conversion logic
            qty = abs(txn['quantity'])
            unit_size_str = txn.get('unit_size')
            unit_size_type = txn.get('unit_size_type')

            print(f"  qty (abs) = {qty}")
            print(f"  unit_size_str = {repr(unit_size_str)}")
            print(f"  unit_size_type = {repr(unit_size_type)}")

            if unit_size_str and unit_size_type in ('g', 'ml', 'kg'):
                unit_size = abs(float(unit_size_str))
                print(f"  unit_size (float) = {unit_size}")
                if qty < unit_size:
                    print(f"  qty < unit_size, would convert: {qty} * {unit_size} = {qty * unit_size}")
                else:
                    print(f"  qty >= unit_size, no conversion needed")

            # Now delete the transaction
            print(f"\nDeleting transaction id={txn['id']}...")
            result = await inventory_service.delete_transaction(txn['id'])
            print(f"Delete result: {result}")

            # Check after
            after = await db.fetchval(
                "SELECT quantity FROM inventory WHERE warehouse_id = 4 AND product_id = $1",
                prod_id
            )
            print(f"After delete: inventory quantity = {after}")
        else:
            print("No import transaction found for BMD at warehouse 4")

    finally:
        await db.disconnect()

asyncio.run(test())