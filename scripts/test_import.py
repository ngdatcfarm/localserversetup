"""Test import_stock directly with full tracing."""
import asyncio
import sys
sys.path.insert(0, 'C:/Local server')

from src.farm.inventory_service import inventory_service
from src.services.database.db import db

async def test():
    db.configure({
        "host": "localhost",
        "port": 5432,
        "database": "cfarm_local",
        "user": "cfarm",
        "password": "cfarm_local_2026"
    })
    await db.connect()

    try:
        result = await inventory_service.import_stock({
            "warehouse_id": 7,
            "product_id": 3,
            "quantity": 5,
            "unit": "chai",
            "unit_size": 100,
            "unit_size_type": "ml",
            "total_price": 250000,
            "supplier": "Tongwei"
        })
        print("Success:", result)
    except Exception as e:
        print("Error:", e)
        import traceback
        traceback.print_exc()
    finally:
        await db.disconnect()

asyncio.run(test())
