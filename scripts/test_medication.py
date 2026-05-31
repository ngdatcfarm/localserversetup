"""Test log_medication directly."""
import asyncio
import sys
from datetime import date
sys.path.insert(0, 'C:/Local server')

from src.farm.care_service import care_service
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
        result = await care_service.log_medication({
            "cycle_id": 12,
            "barn_id": "barn-04",
            "med_date": date(2026, 5, 12),
            "med_type": "medicine",
            "quantity": 5,
            "product_id": 3
        })
        print("Success:", result)
    except Exception as e:
        print("Error:", e)
        import traceback
        traceback.print_exc()
    finally:
        await db.disconnect()

asyncio.run(test())
