"""Standalone migration script using asyncpg directly."""
import asyncio
import asyncpg
import sys
from pathlib import Path

DSN = "postgresql://cfarm:cfarm_local_2026@localhost:5434/cfarm_local"
MIGRATION_FILE = "scripts/042_ai_logic_tables.sql"

async def migrate():
    conn = await asyncpg.connect(DSN)
    print('Connected to DB')

    # Read and execute migration SQL
    sql_path = Path(MIGRATION_FILE)
    if not sql_path.exists():
        print(f'Migration file not found: {MIGRATION_FILE}')
        sys.exit(1)

    sql = sql_path.read_text()
    print(f'Executing: {MIGRATION_FILE}')

    try:
        await conn.execute(sql)
        print('Migration executed OK')
    except Exception as e:
        print(f'Migration error: {e}')
        sys.exit(1)

    # Verify tables exist
    tables = await conn.fetch("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('ai_logic_rules', 'ai_logic_steps')
        ORDER BY table_name
    """)
    print(f'Tables created: {[t["table_name"] for t in tables]}')

    await conn.close()

asyncio.run(migrate())