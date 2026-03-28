"""Cloud Sync Service - Bidirectional sync between local server and cfarm.vn cloud."""

import asyncio
import logging
import hashlib
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from src.services.database.db import db

logger = logging.getLogger(__name__)


class SyncService:
    """Manages bidirectional sync between local server and cloud (cfarm.vn).

    Architecture:
        Local Server (primary) <---> Cloud cfarm.vn (secondary)

    Sync directions:
        1. LOCAL → CLOUD: Push sensor data, device states, care records
        2. CLOUD → LOCAL: Pull farm config (feed types, medications, vaccines...)
        3. CLOUD → LOCAL: Remote commands (relay control, automation triggers)
    """

    def __init__(self):
        self.config = {
            "cloud_url": None,          # e.g. "https://cfarm.vn"
            "api_token": None,          # Token for cloud API auth
            "local_token": None,        # Token cloud uses to call local
            "sync_interval": 60,        # seconds between sync cycles
            "push_batch_size": 100,     # records per push batch
            "enabled": False,
        }
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._client: Optional[httpx.AsyncClient] = None
        self._last_sync_at = None
        self._sync_stats = {"pushed": 0, "pulled": 0, "errors": 0, "last_error": None}

    async def load_config(self):
        """Load sync config from database or config file."""
        try:
            # Try loading from sync_config table (we'll create it)
            rows = await db.fetch("SELECT key, value FROM sync_config")
            for row in rows:
                if row["key"] in self.config:
                    val = row["value"]
                    if row["key"] in ("sync_interval", "push_batch_size"):
                        val = int(val)
                    elif row["key"] == "enabled":
                        val = val.lower() in ("true", "1", "yes")
                    self.config[row["key"]] = val
            logger.info(f"Sync config loaded: enabled={self.config['enabled']}, "
                        f"cloud_url={self.config['cloud_url']}")
        except Exception as e:
            logger.warning(f"Could not load sync config: {e}")

    async def save_config(self, key: str, value: str):
        """Save a sync config value."""
        await db.execute(
            """INSERT INTO sync_config (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()""",
            key, str(value),
        )
        # Update in-memory
        if key in self.config:
            if key in ("sync_interval", "push_batch_size"):
                self.config[key] = int(value)
            elif key == "enabled":
                self.config[key] = str(value).lower() in ("true", "1", "yes")
            else:
                self.config[key] = value

    def get_status(self) -> dict:
        """Get current sync status."""
        return {
            "enabled": self.config["enabled"],
            "running": self._running,
            "cloud_url": self.config["cloud_url"],
            "sync_interval": self.config["sync_interval"],
            "last_sync_at": self._last_sync_at,
            "stats": {**self._sync_stats},
        }

    # ── Authentication ───────────────────────────────

    def verify_token(self, token: str) -> bool:
        """Verify incoming token from cloud."""
        if not self.config["local_token"]:
            return False
        return token == self.config["local_token"]

    def _auth_headers(self) -> dict:
        """Headers for calling cloud API."""
        headers = {"Content-Type": "application/json"}
        if self.config["api_token"]:
            headers["Authorization"] = f"Bearer {self.config['api_token']}"
        return headers

    # ── Cloud API Client ─────────────────────────────

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def cloud_request(self, method: str, path: str, data: dict = None) -> dict:
        """Make authenticated request to cloud API."""
        if not self.config["cloud_url"]:
            raise ValueError("Cloud URL not configured")

        client = await self._get_client()
        url = f"{self.config['cloud_url'].rstrip('/')}{path}"

        try:
            if method == "GET":
                resp = await client.get(url, headers=self._auth_headers())
            elif method == "POST":
                resp = await client.post(url, json=data, headers=self._auth_headers())
            elif method == "PUT":
                resp = await client.put(url, json=data, headers=self._auth_headers())
            else:
                raise ValueError(f"Unsupported method: {method}")

            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Cloud API error {e.response.status_code}: {path}")
            self._sync_stats["errors"] += 1
            self._sync_stats["last_error"] = f"{e.response.status_code} {path}"
            raise
        except Exception as e:
            logger.error(f"Cloud request failed: {e}")
            self._sync_stats["errors"] += 1
            self._sync_stats["last_error"] = str(e)
            raise

    # ── Sync Queue Management ────────────────────────

    async def queue_change(self, table_name: str, record_id: str, action: str, payload: dict):
        """Add a change to the sync queue for pushing to cloud."""
        import json
        await db.execute(
            """INSERT INTO sync_queue (table_name, record_id, action, payload)
            VALUES ($1, $2, $3, $4::jsonb)""",
            table_name, str(record_id), action, json.dumps(payload),
        )

    async def get_pending_queue(self, limit: int = 100) -> list[dict]:
        """Get pending sync queue items."""
        rows = await db.fetch(
            """SELECT * FROM sync_queue
            WHERE synced = FALSE
            ORDER BY created_at ASC LIMIT $1""",
            limit,
        )
        return [dict(r) for r in rows]

    async def mark_synced(self, queue_ids: list[int]):
        """Mark queue items as synced."""
        if not queue_ids:
            return
        await db.execute(
            f"""UPDATE sync_queue SET synced = TRUE, synced_at = NOW()
            WHERE id = ANY($1::int[])""",
            queue_ids,
        )

    # ── Push: Local → Cloud ──────────────────────────

    async def push_to_cloud(self):
        """Push pending changes from local to cloud."""
        items = await self.get_pending_queue(self.config["push_batch_size"])
        if not items:
            return 0

        try:
            result = await self.cloud_request("POST", "/api/sync/receive", {
                "source": "local",
                "items": [{
                    "table": i["table_name"],
                    "record_id": i["record_id"],
                    "action": i["action"],
                    "payload": i["payload"],
                    "created_at": i["created_at"].isoformat() if i.get("created_at") else None,
                } for i in items],
            })

            synced_ids = [i["id"] for i in items]
            await self.mark_synced(synced_ids)
            self._sync_stats["pushed"] += len(synced_ids)
            logger.info(f"Pushed {len(synced_ids)} items to cloud")
            return len(synced_ids)

        except Exception as e:
            logger.error(f"Push to cloud failed: {e}")
            return 0

    # ── Pull: Cloud → Local ──────────────────────────

    async def pull_from_cloud(self):
        """Pull changes from cloud to local."""
        try:
            last_sync = self._last_sync_at or "2000-01-01T00:00:00Z"
            result = await self.cloud_request("GET",
                f"/api/sync/changes?since={last_sync}")

            items = result.get("items", [])
            if not items:
                return 0

            applied = 0
            for item in items:
                try:
                    await self._apply_cloud_change(item)
                    applied += 1
                except Exception as e:
                    logger.error(f"Failed to apply cloud change: {e}")

            self._sync_stats["pulled"] += applied
            logger.info(f"Pulled {applied} items from cloud")
            return applied

        except Exception as e:
            logger.error(f"Pull from cloud failed: {e}")
            return 0

    async def _apply_cloud_change(self, item: dict):
        """Apply a single change from cloud to local database."""
        table = item.get("table")
        action = item.get("action")
        payload = item.get("payload", {})

        # Map cloud tables to local handlers
        handlers = {
            "feed_brands": self._sync_feed_brands,
            "feed_types": self._sync_feed_types,
            "medications": self._sync_medications,
            "suppliers": self._sync_suppliers,
            "vaccine_programs": self._sync_vaccine_programs,
            "vaccine_program_items": self._sync_vaccine_program_items,
            "notification_rules": self._sync_notification_rules,
        }

        handler = handlers.get(table)
        if handler:
            await handler(action, payload)
        else:
            logger.debug(f"No handler for table: {table}")

    async def _sync_feed_brands(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO feed_brands (id, name, kg_per_bag, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, kg_per_bag=$3, note=$4, status=$5""",
                p["id"], p["name"], p.get("kg_per_bag"), p.get("note"), p.get("status", "active"),
                p.get("created_at"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM feed_brands WHERE id = $1", p["id"])

    async def _sync_feed_types(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO feed_types (id, feed_brand_id, code, price_per_bag, name, suggested_stage, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET feed_brand_id=$2, code=$3, price_per_bag=$4, name=$5, suggested_stage=$6, note=$7, status=$8""",
                p["id"], p.get("feed_brand_id"), p.get("code"), p.get("price_per_bag"),
                p["name"], p.get("suggested_stage"), p.get("note"), p.get("status", "active"),
                p.get("created_at"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM feed_types WHERE id = $1", p["id"])

    async def _sync_medications(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO medications (id, name, unit, category, manufacturer, price_per_unit, recommended_dose, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, unit=$3, category=$4, manufacturer=$5, price_per_unit=$6, recommended_dose=$7, note=$8, status=$9""",
                p["id"], p["name"], p.get("unit"), p.get("category"), p.get("manufacturer"),
                p.get("price_per_unit"), p.get("recommended_dose"), p.get("note"),
                p.get("status", "active"), p.get("created_at"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM medications WHERE id = $1", p["id"])

    async def _sync_suppliers(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO suppliers (id, name, phone, address, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, phone=$3, address=$4, note=$5, status=$6""",
                p["id"], p["name"], p.get("phone"), p.get("address"),
                p.get("note"), p.get("status", "active"), p.get("created_at"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM suppliers WHERE id = $1", p["id"])

    async def _sync_vaccine_programs(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO vaccine_programs (id, name, note, active, created_at)
                VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, note=$3, active=$4""",
                p["id"], p["name"], p.get("note"), p.get("active", True), p.get("created_at"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM vaccine_programs WHERE id = $1", p["id"])

    async def _sync_vaccine_program_items(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO vaccine_program_items (id, program_id, vaccine_brand_id, vaccine_name, day_age, method, remind_days, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET program_id=$2, vaccine_name=$4, day_age=$5, method=$6, remind_days=$7, sort_order=$8""",
                p["id"], p["program_id"], p.get("vaccine_brand_id"), p["vaccine_name"],
                p["day_age"], p.get("method"), p.get("remind_days", 1), p.get("sort_order", 0),
            )
        elif action == "delete":
            await db.execute("DELETE FROM vaccine_program_items WHERE id = $1", p["id"])

    async def _sync_notification_rules(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO notification_rules (id, code, label, level, enabled, interval_min, send_at_hour, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (id) DO UPDATE SET code=$2, label=$3, level=$4, enabled=$5, interval_min=$6, send_at_hour=$7, updated_at=NOW()""",
                p["id"], p["code"], p.get("label"), p.get("level", "blue"),
                p.get("enabled", True), p.get("interval_min", 1440), p.get("send_at_hour"),
            )

    # ── Remote Command Execution ─────────────────────

    async def execute_remote_command(self, command: dict) -> dict:
        """Execute a command sent from cloud.

        Command types:
            - relay: Control relay (on/off/timed)
            - curtain: Control curtain (position)
            - automation: Toggle automation rule
            - ping: Ping device
        """
        cmd_type = command.get("type")
        payload = command.get("payload", {})

        if cmd_type == "relay":
            from src.iot.mqtt_client import mqtt_client
            device_code = payload.get("device_code")
            channel = payload.get("channel")
            state = payload.get("state")  # "on" or "off"
            duration = payload.get("duration")

            topic = f"cfarm/{device_code}/cmd"
            cmd_payload = {"ch": channel, "state": state}
            if duration:
                cmd_payload["duration"] = duration

            mqtt_client.publish(topic, cmd_payload)
            return {"ok": True, "executed": "relay", "device": device_code}

        elif cmd_type == "curtain":
            from src.iot.mqtt_client import mqtt_client
            device_code = payload.get("device_code")
            position = payload.get("position")

            topic = f"cfarm/{device_code}/cmd"
            mqtt_client.publish(topic, {"action": "set_position", "to": position})
            return {"ok": True, "executed": "curtain", "device": device_code}

        elif cmd_type == "ping":
            from src.iot.mqtt_client import mqtt_client
            device_code = payload.get("device_code")
            topic = f"cfarm/{device_code}/cmd"
            mqtt_client.publish(topic, {"action": "ping"})
            return {"ok": True, "executed": "ping", "device": device_code}

        else:
            return {"ok": False, "message": f"Unknown command type: {cmd_type}"}

    # ── Background Sync Loop ─────────────────────────

    async def start(self):
        """Start the background sync loop."""
        await self.load_config()
        if not self.config["enabled"]:
            logger.info("Cloud sync is disabled")
            return

        self._running = True
        self._task = asyncio.create_task(self._sync_loop())
        logger.info(f"Cloud sync started (interval={self.config['sync_interval']}s)")

    async def stop(self):
        """Stop the background sync loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        logger.info("Cloud sync stopped")

    async def _sync_loop(self):
        """Main sync loop - runs periodically."""
        while self._running:
            try:
                # Push local changes to cloud
                await self.push_to_cloud()

                # Pull cloud changes to local
                await self.pull_from_cloud()

                self._last_sync_at = datetime.now(timezone.utc).isoformat()

            except Exception as e:
                logger.error(f"Sync cycle error: {e}")
                self._sync_stats["errors"] += 1
                self._sync_stats["last_error"] = str(e)

            await asyncio.sleep(self.config["sync_interval"])

    # ── Manual Sync Trigger ──────────────────────────

    async def sync_now(self) -> dict:
        """Trigger an immediate sync cycle."""
        pushed = await self.push_to_cloud()
        pulled = await self.pull_from_cloud()
        self._last_sync_at = datetime.now(timezone.utc).isoformat()
        return {"pushed": pushed, "pulled": pulled}


sync_service = SyncService()
