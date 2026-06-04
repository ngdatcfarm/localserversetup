import asyncio
import sys
sys.path.insert(0, 'E:/CFarm')

from src.services.database.db import db

async def run():
    print('Connecting to DB...')
    await db.connect()
    print('Connected')

    # Check medication_unit_specs
    specs = await db.fetch('SELECT * FROM medication_unit_specs')
    print('=== Medication Unit Specs ===')
    for s in specs:
        print(f"  product_id:{s['product_id']} {s['package_unit']} {s['package_size']}{s['base_unit']}")

    # Check products base_unit
    products = await db.fetch("SELECT id, name, base_unit FROM products WHERE id IN (3,4,9,10,11)")
    print('\n=== Products base_unit ===')
    for p in products:
        print(f"  ID {p['id']}: {p['name']} - base_unit: {p['base_unit']}")

    await db.disconnect()
    print('\nDone')

asyncio.run(run())