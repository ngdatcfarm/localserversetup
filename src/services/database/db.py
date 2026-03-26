"""Database connection manager using asyncpg."""

import logging
from typing import Optional
import asyncpg

logger = logging.getLogger(__name__)


class Database:
    """Async PostgreSQL/TimescaleDB connection pool."""

    _instance: Optional["Database"] = None

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.dsn = ""

    @classmethod
    def get_instance(cls) -> "Database":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def configure(self, config: dict):
        """Configure from YAML database section."""
        host = config.get("host", "localhost")
        port = config.get("port", 5432)
        dbname = config.get("database", "cfarm_local")
        user = config.get("user", "cfarm")
        password = config.get("password", "cfarm_local_2026")
        self.dsn = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"

    async def connect(self):
        """Create connection pool."""
        if not self.dsn:
            logger.warning("DB: No DSN configured, skipping")
            return

        try:
            self.pool = await asyncpg.create_pool(
                self.dsn,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            logger.info(f"DB: Connected to TimescaleDB")
        except Exception as e:
            logger.error(f"DB: Connection failed - {e}")

    async def disconnect(self):
        """Close connection pool."""
        if self.pool:
            await self.pool.close()
            logger.info("DB: Disconnected")

    async def execute(self, query: str, *args):
        """Execute a query (INSERT, UPDATE, DELETE)."""
        if not self.pool:
            logger.warning("DB: Not connected")
            return None
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args) -> list:
        """Fetch multiple rows."""
        if not self.pool:
            return []
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args):
        """Fetch a single row."""
        if not self.pool:
            return None
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args):
        """Fetch a single value."""
        if not self.pool:
            return None
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)


# Module-level singleton
db = Database.get_instance()
