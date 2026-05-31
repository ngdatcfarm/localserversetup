"""Migrate old medication inventory to base units.

This script converts existing inventory quantities for medication products
that have unit_size defined in inventory_transactions.

Run this ONCE to fix legacy data after the import_stock fix.
"""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from src.services.database.db import db

async def migrate():
    db.configure({
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026"
    })
    await db.connect()

    try:
        print("=== MIGRATION: Convert medication inventory to base units ===\n")

        # Get all medication inventory records
        meds = await db.fetch("""
            SELECT i.warehouse_id, i.product_id, i.quantity, p.name, p.product_type, p.unit,
                   w.name as warehouse_name
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            JOIN warehouses w ON i.warehouse_id = w.id
            WHERE p.product_type IN ('medication', 'medicine')
            ORDER BY w.name, p.name
        """)

        if not meds:
            print("No medication inventory found.")
            return

        print(f"Found {len(meds)} medication inventory records:\n")

        for inv in meds:
            wh_id = inv['warehouse_id']
            prod_id = inv['product_id']
            current_qty = float(inv['quantity'] or 0)

            # Get the unit_size from the most recent import transaction
            txn = await db.fetchrow("""
                SELECT unit_size, unit_size_type
                FROM inventory_transactions
                WHERE warehouse_id = $1 AND product_id = $2
                AND unit_size IS NOT NULL
                AND unit_size_type IN ('g', 'ml', 'kg')
                AND transaction_type = 'import'
                ORDER BY created_at DESC
                LIMIT 1
            """, wh_id, prod_id)

            if txn and txn['unit_size']:
                unit_size = float(txn['unit_size'])
                unit_type = txn['unit_size_type']
                # Calculate expected base units
                # But we need to figure out if current qty is already converted or not

                # Get total imported qty and total unit_size context
                total_imported = await db.fetchval("""
                    SELECT SUM(quantity::numeric)
                    FROM inventory_transactions
                    WHERE warehouse_id = $1 AND product_id = $2
                    AND transaction_type = 'import'
                """, wh_id, prod_id) or 0

                # Get total base units from imports WITH unit_size
                base_imported = await db.fetchval("""
                    SELECT SUM(quantity * unit_size::numeric)
                    FROM inventory_transactions
                    WHERE warehouse_id = $1 AND product_id = $2
                    AND transaction_type = 'import'
                    AND unit_size IS NOT NULL
                    AND unit_size_type IN ('g', 'ml', 'kg')
                """, wh_id, prod_id) or 0

                # Get total exported base units
                total_exported = await db.fetchval("""
                    SELECT SUM(ABS(quantity::numeric))
                    FROM inventory_transactions
                    WHERE warehouse_id = $1 AND product_id = $2
                    AND transaction_type = 'export'
                """, wh_id, prod_id) or 0

                expected_current = float(base_imported) - float(total_exported)

                print(f"  {inv['warehouse_name']} / {inv['name']}")
                print(f"    Current inventory: {current_qty}")
                print(f"    Total imported (packages): {total_imported}")
                print(f"    Total base units imported: {base_imported}")
                print(f"    Total exported: {total_exported}")
                print(f"    Expected inventory: {expected_current}")
                print(f"    Unit size: {unit_size}{unit_type}")

                if current_qty != expected_current and current_qty > 0:
                    # Only migrate if there's a difference (indicating old data)
                    if unit_size > 0:
                        # Check if current qty looks like package count
                        # If current_qty is much smaller than base_imported, it's likely still in packages
                        ratio = base_imported / current_qty if current_qty > 0 else 0

                        if ratio > 1.5:  # Seems to be packages, not base units
                            print(f"    -> MIGRATING: {current_qty} packages x {unit_size}{unit_type} = {expected_current} base units")
                            await db.execute("""
                                UPDATE inventory SET quantity = $1, updated_at = NOW()
                                WHERE warehouse_id = $2 AND product_id = $3
                            """, expected_current, wh_id, prod_id)
                        else:
                            print(f"    -> Ratio={ratio:.2f}, appears already in base units, skipping")
                        print()
                else:
                    print(f"    -> OK, no migration needed")
                    print()

        print("=== MIGRATION COMPLETE ===\n")

        # Verify results
        print("Verification - Current medication inventory:")
        verify = await db.fetch("""
            SELECT i.warehouse_id, i.product_id, i.quantity, p.name, p.unit,
                   w.name as warehouse_name
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            JOIN warehouses w ON i.warehouse_id = w.id
            WHERE p.product_type IN ('medication', 'medicine')
            ORDER BY w.name, p.name
        """)
        for v in verify:
            print(f"  {v['warehouse_name']} / {v['name']}: {v['quantity']} {v['unit'] or ''}")

    except Exception as e:
        print("Error:", e)
        import traceback
        traceback.print_exc()
    finally:
        await db.disconnect()

asyncio.run(migrate())