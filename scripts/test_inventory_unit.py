"""Test medication inventory unit tracking - full flow test."""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')

from src.farm.inventory_service import inventory_service
from src.farm.care_service import care_service
from src.services.database.db import db

async def test_medication_unit_flow():
    """Test: import with unit_size -> export -> delete_transaction"""
    db.configure({
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026"
    })
    await db.connect()

    WAREHOUSE_ID = 7
    PRODUCT_ID = 3

    try:
        # Clean slate
        print("=== CLEAN SLATE ===")
        await db.execute(
            """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES ($1, $2, 0, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET quantity = 0, updated_at = NOW()""",
            WAREHOUSE_ID, PRODUCT_ID,
        )

        initial = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Initial inventory: {initial}")

        # 1. IMPORT WITH UNIT_SIZE
        print("\n=== TEST 1: IMPORT with unit_size ===")
        print("Importing: 5 chai x 100ml = 500ml total")
        import_result = await inventory_service.import_stock({
            "warehouse_id": WAREHOUSE_ID,
            "product_id": PRODUCT_ID,
            "quantity": 5,
            "unit": "chai",
            "unit_size": 100,
            "unit_size_type": "ml",
            "total_price": 250000,
            "supplier": "Test Supplier"
        })
        print(f"Import result: {import_result}")

        after_import = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Inventory after import: {after_import} (expected: 500)")

        txn = await db.fetchrow(
            """SELECT * FROM inventory_transactions
            WHERE warehouse_id = $1 AND product_id = $2 AND transaction_type = 'import'
            ORDER BY id DESC LIMIT 1""",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Transaction record: quantity={txn['quantity']}, unit={txn['unit']}, unit_size={txn['unit_size']}, unit_size_type={txn['unit_size_type']}")

        assert after_import == 500, f"FAIL: Expected 500, got {after_import}"
        print("TEST 1: PASSED")

        # 2. EXPORT (base units)
        print("\n=== TEST 2: EXPORT base units ===")
        print("Exporting: 150ml (should leave 350ml)")
        export_result = await inventory_service.export_stock({
            "warehouse_id": WAREHOUSE_ID,
            "product_id": PRODUCT_ID,
            "quantity": 150,
            "notes": "Test export 150ml"
        })
        print(f"Export result: {export_result}")

        after_export = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Inventory after export: {after_export} (expected: 350)")

        assert after_export == 350, f"FAIL: Expected 350, got {after_export}"
        print("TEST 2: PASSED")

        # 3. DELETE EXPORT TRANSACTION (should restore 150ml)
        print("\n=== TEST 3: DELETE export transaction ===")
        export_txn = await db.fetchrow(
            """SELECT * FROM inventory_transactions
            WHERE warehouse_id = $1 AND product_id = $2 AND transaction_type = 'export'
            ORDER BY id DESC LIMIT 1""",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Export txn to delete: id={export_txn['id']}, quantity={export_txn['quantity']}")

        delete_export_result = await inventory_service.delete_transaction(export_txn['id'])
        print(f"Delete export result: {delete_export_result}")

        after_delete_export = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Inventory after delete export: {after_delete_export} (expected: 500)")

        assert after_delete_export == 500, f"FAIL: Expected 500, got {after_delete_export}"
        print("TEST 3: PASSED")

        # 4. IMPORT without unit_size (feeds - should still work as before)
        print("\n=== TEST 4: IMPORT without unit_size (feeds) ===")
        import_feed = await inventory_service.import_stock({
            "warehouse_id": WAREHOUSE_ID,
            "product_id": PRODUCT_ID,
            "quantity": 10,
            "unit": "bao",
            "total_price": 500000,
            "supplier": "Feed Supplier"
        })
        print(f"Import feed result: {import_feed}")

        after_feed_import = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            WAREHOUSE_ID, PRODUCT_ID
        )
        print(f"Inventory after feed import: {after_feed_import} (expected: 510)")

        assert after_feed_import == 510, f"FAIL: Expected 510, got {after_feed_import}"
        print("TEST 4: PASSED")

        print("\n=== ALL TESTS PASSED ===")
        return True

    except AssertionError as e:
        print(f"ASSERTION FAILURE: {e}")
        return False
    except Exception as e:
        print("Error:", e)
        import traceback
        traceback.print_exc()
        return False
    finally:
        await db.disconnect()

asyncio.run(test_medication_unit_flow())