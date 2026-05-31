"""Debug conversion for Test Thuoc id=56."""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.services.database.db import db

async def debug():
    db.configure({
        'host': 'localhost', 'port': 5432, 'database': 'cfarm_local',
        'user': 'cfarm', 'password': 'cfarm_local_2026'
    })
    await db.connect()

    try:
        txn = await db.fetchrow(
            "SELECT * FROM inventory_transactions WHERE id = 56"
        )
        print(f"Transaction 56:")
        print(f"  quantity = {repr(txn['quantity'])} (type: {type(txn['quantity'])})")
        print(f"  unit_size = {repr(txn['unit_size'])} (type: {type(txn['unit_size'])})")
        print(f"  unit_size_type = {repr(txn['unit_size_type'])}")

        # Simulate delete_transaction logic
        qty = abs(txn['quantity'])
        print(f"  abs(quantity) = {qty}")

        unit_size_str = txn.get('unit_size')
        unit_size_type = txn.get('unit_size_type')

        if unit_size_str and unit_size_type in ('g', 'ml', 'kg'):
            print(f"  -> unit_size is valid for conversion")
            unit_size = abs(float(unit_size_str))
            print(f"  -> unit_size (float) = {unit_size}")
            if qty < unit_size:
                print(f"  -> qty < unit_size: would convert {qty} * {unit_size} = {qty * unit_size}")
            else:
                print(f"  -> qty >= unit_size: NO conversion, qty stays {qty}")
        else:
            print(f"  -> unit_size NOT valid for conversion")

    finally:
        await db.disconnect()

asyncio.run(debug())