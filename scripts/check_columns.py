import asyncio
from src.services.database.db import db

async def check():
    cols = await db.fetch(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_transactions'"
    )
    for c in cols:
        print(c)

asyncio.run(check())