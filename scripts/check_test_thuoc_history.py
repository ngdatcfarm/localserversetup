"""Check Test Thuoc transaction history."""
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

    prod_id = await db.fetchval("SELECT id FROM products WHERE name = 'Test Thuoc'")
    wh_id = 7

    print('=== Transaction history in order ===')
    txns = await db.fetch(
        "SELECT id, transaction_type, quantity, unit_size, unit_size_type FROM inventory_transactions WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id",
        prod_id, wh_id
    )

    running = 0
    for t in txns:
        qty = float(t['quantity'])
        size_str = t['unit_size'] or '0'
        size = float(size_str)
        stype = t['unit_size_type'] or ''

        if t['transaction_type'] == 'import':
            if size > 0 and stype in ('g', 'ml', 'kg'):
                if qty < size:
                    added = qty * size
                    note = 'NEW: raw qty x size'
                else:
                    added = qty
                    note = 'OLD: qty already base units'
            else:
                added = qty
                note = 'NO unit_size'
            running += added
            size_display = f"{size_str}{stype}" if stype else "none"
            print(f"id={t['id']:3d}: import {qty:8.1f} size={size_display:10s} added={added:8.1f} running={running:12.1f} [{note}]")
        elif t['transaction_type'] == 'export':
            running -= abs(qty)
            print(f"id={t['id']:3d}: export  {abs(qty):8.1f} running={running:12.1f}")

    print()
    print(f'Final expected: {running}')
    print(f'Database actual: {await db.fetchval("SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2", wh_id, prod_id)}')

    await db.disconnect()

asyncio.run(check())