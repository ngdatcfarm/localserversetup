"""Test delete_transaction for old format transaction (qty=5, unit_size=100)."""
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
        # Transaction 38 has qty=5, unit_size=100ml (old format)
        txn = await db.fetchrow("SELECT * FROM inventory_transactions WHERE id = 38")
        print("Transaction 38:")
        print(f"  quantity = {txn['quantity']}")
        print(f"  unit_size = {txn['unit_size']}")
        print(f"  unit_size_type = {txn['unit_size_type']}")

        qty = abs(txn['quantity'])
        print(f"  abs(qty) = {qty}")

        if txn.get('unit_size') and txn.get('unit_size_type') in ('g', 'ml', 'kg'):
            unit_size = abs(float(txn['unit_size']))
            print(f"  unit_size = {unit_size}")
            if qty < unit_size:
                print(f"  qty < unit_size: WILL convert to {qty * unit_size}")
            else:
                print(f"  qty >= unit_size: no conversion, qty = {qty}")

        # Check inventory before
        prod_id = 3
        wh_id = 7
        before = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            wh_id, prod_id
        )
        print(f"  Before inventory: {before}")

        # Delete txn 38
        print(f"  Deleting transaction 38...")
        result = await inventory_service.delete_transaction(38)
        print(f"  Result: {result}")

        after = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            wh_id, prod_id
        )
        print(f"  After inventory: {after}")
        print(f"  Expected change: 500 (base units)")
        print(f"  Actual change: {before - after}")

    finally:
        await db.disconnect()

asyncio.run(test())