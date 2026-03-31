"""Database management routes - pgAdmin-style interface."""

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Any

from src.services.database.db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/db", tags=["database"])


# Table groupings by functionality
TABLE_GROUPS = {
    "devices": [
        "devices", "device_types", "device_states", "device_channels",
        "device_commands", "device_pings", "device_relay_logs", "device_relay_states",
        "device_state_log", "env_readings", "sensor_data", "sensor_readings"
    ],
    "farm": [
        "barns", "cycles", "cycle_daily_snapshots", "cycle_splits"
    ],
    "feed": [
        "feed_types", "feed_brands", "feed_remaining_checks",
        "cycle_feed_programs", "cycle_feed_program_items", "cycle_feed_stages"
    ],
    "care": [
        "care_feeds", "care_medications", "care_weights", "care_deaths",
        "care_sales", "care_expenses", "care_item_uses"
    ],
    "inventory": [
        "inventory_items", "inventory_purchases", "inventory_sales",
        "inventory_transactions", "inventory_barn_stock"
    ],
    "health": [
        "health_notes", "medications", "vaccine_programs",
        "vaccine_program_items", "vaccine_schedules"
    ],
    "weights": [
        "weight_sessions", "weight_details", "weight_reminders"
    ],
    "automation": [
        "automation_rules", "alert_rules", "alerts", "notification_rules", "notification_logs"
    ],
    "sync": [
        "sync_config", "sync_queue", "sync_log", "api_tokens"
    ],
    "system": [
        "users", "firmwares", "push_subscriptions", "curtain_configs",
        "weather_readings", "products", "suppliers", "warehouses"
    ],
}

GROUP_LABELS = {
    "devices": "Devices & IoT",
    "farm": "Farm (Trại)",
    "feed": "Feed (Thức ăn)",
    "care": "Care (Chăm sóc)",
    "inventory": "Inventory (Kho)",
    "health": "Health (Sức khỏe)",
    "weights": "Weights (Cân)",
    "automation": "Automation",
    "sync": "Sync",
    "system": "System",
}


# ── Request Models ───────────────────────────────────────────────────────

class ExecuteSQL(BaseModel):
    sql: str
    limit: int = 100


# ── Helper Functions ─────────────────────────────────────────────────────

async def get_table_list() -> list[dict]:
    """Get list of all tables in public schema with group info."""
    tables = await db.fetch("""
        SELECT
            table_name,
            (SELECT COUNT(*)::int FROM information_schema.columns c
             WHERE c.table_name = t.table_name AND c.table_schema = t.table_schema) as column_count
        FROM information_schema.tables t
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    result = []
    for row in tables:
        table_name = row['table_name']
        # Find which group this table belongs to
        group = "other"
        for g, tables_in_group in TABLE_GROUPS.items():
            if table_name in tables_in_group:
                group = g
                break
        result.append({
            "table_name": table_name,
            "column_count": row['column_count'],
            "group": group,
            "group_label": GROUP_LABELS.get(group, table_name)
        })
    return result


async def get_grouped_tables() -> dict:
    """Get tables grouped by functionality."""
    tables = await get_table_list()
    groups = {}

    for table in tables:
        group = table['group']
        if group not in groups:
            groups[group] = {
                "key": group,
                "label": GROUP_LABELS.get(group, group.title()),
                "tables": []
            }
        groups[group]["tables"].append({
            "table_name": table['table_name'],
            "column_count": table['column_count']
        })

    # Sort by predefined order
    order = ["devices", "farm", "cycles", "care", "feed", "inventory", "health", "weights", "automation", "sync", "system", "other"]
    result = []
    for key in order:
        if key in groups:
            groups[key]["table_count"] = len(groups[key]["tables"])
            result.append(groups[key])

    # Add any remaining groups
    for key in groups:
        if key not in order:
            groups[key]["table_count"] = len(groups[key]["tables"])
            result.append(groups[key])

    return {"groups": result}


async def get_table_columns(table_name: str) -> list[dict]:
    """Get columns for a table."""
    columns = await db.fetch("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
    """, table_name)
    return [dict(row) for row in columns]


async def get_table_data(table_name: str, limit: int = 100, offset: int = 0) -> list[dict]:
    """Get table data with pagination."""
    # Validate table name to prevent SQL injection
    if not table_name.replace('_', '').isalnum():
        raise HTTPException(400, "Invalid table name")

    rows = await db.fetch(f"""
        SELECT * FROM "{table_name}"
        ORDER BY 1
        LIMIT $1 OFFSET $2
    """, limit, offset)
    return [dict(row) for row in rows]


async def get_table_count(table_name: str) -> int:
    """Get total row count for a table."""
    if not table_name.replace('_', '').isalnum():
        return 0
    return await db.fetchval(f'SELECT COUNT(*) FROM "{table_name}"')


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/tables")
async def list_tables():
    """List all tables."""
    tables = await get_table_list()
    return {"tables": tables}


@router.get("/tables/grouped")
async def list_tables_grouped():
    """List tables grouped by functionality."""
    return await get_grouped_tables()


@router.get("/tables/{table_name}")
async def get_table(table_name: str, limit: int = Query(100, le=1000), offset: int = Query(0, ge=0)):
    """Get table info, columns, and data."""
    columns = await get_table_columns(table_name)
    if not columns:
        raise HTTPException(404, "Table not found")

    count = await get_table_count(table_name)
    rows = await get_table_data(table_name, limit, offset)

    return {
        "table": table_name,
        "columns": columns,
        "rows": rows,
        "count": count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/tables/{table_name}/schema")
async def get_table_schema(table_name: str):
    """Get table schema (columns, constraints, indexes)."""
    columns = await get_table_columns(table_name)

    # Get indexes
    indexes = await db.fetch("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1 AND schemaname = 'public'
    """, table_name)

    # Get foreign keys
    fks = await db.fetch("""
        SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
    """, table_name)

    return {
        "table": table_name,
        "columns": columns,
        "indexes": [dict(row) for row in indexes],
        "foreign_keys": [dict(row) for row in fks],
    }


@router.post("/query")
async def execute_sql(body: ExecuteSQL):
    """Execute raw SQL query."""
    sql = body.sql.strip()

    # Basic safety check - block dangerous commands
    dangerous = ['DROP', 'TRUNCATE', 'DELETE FROM', 'ALTER', 'CREATE', 'INSERT', 'UPDATE', 'GRANT', 'REVOKE']
    sql_upper = sql.upper()

    # Allow SELECT but warn about others
    is_select = sql_upper.startswith('SELECT')
    is_copy = 'COPY' in sql_upper

    if is_select or is_copy:
        try:
            if 'LIMIT' not in sql_upper:
                sql = f"{sql.rstrip(';')} LIMIT {body.limit}"

            rows = await db.fetch(sql)
            return {
                "ok": True,
                "rows": [dict(row) for row in rows],
                "count": len(rows),
            }
        except Exception as e:
            raise HTTPException(400, f"Query error: {str(e)}")
    else:
        # For non-SELECT, show what would be executed
        return {
            "ok": False,
            "warning": "Only SELECT queries are allowed for safety. This query was blocked.",
            "sql": sql,
        }


@router.get("/databases")
async def list_databases():
    """List all databases."""
    dbs = await db.fetch("""
        SELECT datname, datconnlimit
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY datname
    """)
    return {"databases": [dict(row) for row in dbs]}


@router.get("/status")
async def db_status():
    """Get database status and stats."""
    tables = await get_table_list()

    # Get database size
    db_size = await db.fetchval("""
        SELECT pg_size_pretty(pg_database_size(current_database()))
    """)

    # Get total rows across all tables
    total_rows = 0
    for t in tables:
        count = await get_table_count(t['table_name'])
        total_rows += count

    return {
        "connected": db.pool is not None,
        "database": db.dsn.split('@')[-1] if db.dsn else None,
        "size": db_size,
        "tables": len(tables),
        "total_rows": total_rows,
    }
