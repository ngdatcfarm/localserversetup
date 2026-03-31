"""Cloud Sync Service - Bidirectional sync between local server and cfarm.vn cloud."""

import asyncio
import logging
import hashlib
import time
import urllib.parse
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
            text = resp.text.strip()
            if not text:
                return {}
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
            await self._log_sync("push", len(synced_ids), "ok")
            logger.info(f"Pushed {len(synced_ids)} items to cloud")
            return len(synced_ids)

        except Exception as e:
            logger.error(f"Push to cloud failed: {e}")
            await self._log_sync("push", 0, "error", str(e))
            return 0

    # ── Pull: Cloud → Local ──────────────────────────

    async def pull_from_cloud(self):
        """Pull changes from cloud to local."""
        try:
            last_sync = self._last_sync_at or "2000-01-01T00:00:00Z"
            since_encoded = urllib.parse.quote(last_sync, safe='')
            result = await self.cloud_request("GET",
                f"/api/sync/changes?since={since_encoded}")

            items = result.get("items", [])
            if not items:
                return 0

            applied = 0
            errors = []
            for item in items:
                try:
                    await self._apply_cloud_change(item)
                    applied += 1
                except Exception as e:
                    err_msg = f"{item.get('table','?')}#{item.get('payload',{}).get('id','?')}: {e}"
                    logger.error(f"Failed to apply cloud change: {err_msg}")
                    errors.append(err_msg)

            self._sync_stats["pulled"] += applied
            status = "ok" if not errors else "partial"
            err_log = "; ".join(errors[:5]) if errors else None
            await self._log_sync("pull", applied, status, err_log)
            logger.info(f"Pulled {applied} items from cloud ({len(errors)} errors)")
            return applied

        except Exception as e:
            logger.error(f"Pull from cloud failed: {e}")
            await self._log_sync("pull", 0, "error", str(e))
            return 0

    # ── Type Casting Helpers ───────────────────────────

    @staticmethod
    def _to_dt(val):
        """Convert ISO string to datetime or None."""
        if val is None or val == '':
            return None
        if isinstance(val, datetime):
            return val
        try:
            # Handle ISO format with timezone
            from dateutil.parser import parse as dt_parse
            return dt_parse(val)
        except Exception:
            try:
                # Fallback: manual parse common formats
                for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                    try:
                        return datetime.strptime(val, fmt)
                    except ValueError:
                        continue
            except Exception:
                pass
        return None

    @staticmethod
    def _to_int(val):
        """Convert to int or None."""
        if val is None or val == '':
            return None
        return int(val)

    @staticmethod
    def _to_float(val):
        """Convert to float or None."""
        if val is None or val == '':
            return None
        return float(val)

    @staticmethod
    def _to_bool(val):
        """Convert to bool."""
        if val is None:
            return False
        if isinstance(val, bool):
            return val
        if isinstance(val, (int, float)):
            return val != 0
        return str(val).lower() in ('true', '1', 'yes')

    async def _apply_cloud_change(self, item: dict):
        """Apply a single change from cloud to local database."""
        table = item.get("table")
        action = item.get("action")
        payload = item.get("payload", {})

        # Map cloud tables to local handlers
        handlers = {
            "barns": self._sync_barns,
            "cycles": self._sync_cycles,
            "cycle_splits": self._sync_cycle_splits,
            "feed_brands": self._sync_feed_brands,
            "feed_types": self._sync_feed_types,
            "medications": self._sync_medications,
            "suppliers": self._sync_suppliers,
            "vaccine_programs": self._sync_vaccine_programs,
            "vaccine_program_items": self._sync_vaccine_program_items,
            "vaccine_schedules": self._sync_vaccine_schedules,
            "care_feeds": self._sync_care_feeds,
            "care_deaths": self._sync_care_deaths,
            "care_medications": self._sync_care_medications,
            "weight_sessions": self._sync_weight_sessions,
            "care_sales": self._sync_care_sales,
            "health_notes": self._sync_health_notes,
            "devices": self._sync_devices,
            "notification_rules": self._sync_notification_rules,
        }

        handler = handlers.get(table)
        if handler:
            await handler(action, payload)
        else:
            logger.debug(f"No handler for table: {table}")

    async def _sync_barns(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO barns (id, number, name, length_m, width_m, height_m, status, note, created_at)
                VALUES ($1::text, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    number=$2, name=$3, length_m=$4, width_m=$5, height_m=$6, status=$7, note=$8""",
                str(p["id"]), self._to_int(p.get("number")), p["name"],
                self._to_float(p.get("length_m")), self._to_float(p.get("width_m")),
                self._to_float(p.get("height_m")), p.get("status", "active"),
                p.get("note"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM barns WHERE id = $1", str(p["id"]))

    async def _sync_cycles(self, action: str, p: dict):
        if action in ("insert", "update"):
            # Map cloud field names to local: initial_quantity->initial_count, current_quantity->current_count
            initial = self._to_int(p.get("initial_quantity") or p.get("initial_count"))
            current = self._to_int(p.get("current_quantity") or p.get("current_count"))
            await db.execute(
                """INSERT INTO cycles (id, barn_id, code, name, breed, start_date, expected_end_date, end_date,
                    initial_count, current_count, status, notes,
                    parent_cycle_id, split_date, season, flock_source,
                    male_quantity, female_quantity, purchase_price, stage,
                    vaccine_program_id, final_quantity, total_sold_weight_kg, total_revenue, close_reason,
                    created_at)
                VALUES ($1, $2::text, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
                    COALESCE($26, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    barn_id=$2::text, code=$3, name=$4, breed=$5,
                    start_date=$6, expected_end_date=$7, end_date=$8,
                    initial_count=$9, current_count=$10, status=$11, notes=$12,
                    parent_cycle_id=$13, split_date=$14, season=$15, flock_source=$16,
                    male_quantity=$17, female_quantity=$18, purchase_price=$19, stage=$20,
                    vaccine_program_id=$21, final_quantity=$22, total_sold_weight_kg=$23,
                    total_revenue=$24, close_reason=$25""",
                self._to_int(p["id"]), str(p["barn_id"]), p.get("code"),
                p.get("name", p.get("code", "")), p.get("breed"),
                self._to_dt(p.get("start_date")), self._to_dt(p.get("expected_end_date")),
                self._to_dt(p.get("end_date")),
                initial, current,
                p.get("status", "active"), p.get("notes") or p.get("note"),
                self._to_int(p.get("parent_cycle_id")), self._to_dt(p.get("split_date")),
                p.get("season"), p.get("flock_source"),
                self._to_int(p.get("male_quantity")), self._to_int(p.get("female_quantity")),
                self._to_float(p.get("purchase_price")), p.get("stage", "chick"),
                self._to_int(p.get("vaccine_program_id")), self._to_int(p.get("final_quantity")),
                self._to_float(p.get("total_sold_weight_kg")), self._to_float(p.get("total_revenue")),
                p.get("close_reason"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycles WHERE id = $1", self._to_int(p["id"]))

    async def _sync_cycle_splits(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO cycle_splits (id, from_cycle_id, to_cycle_id, quantity, split_date, note, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    from_cycle_id=$2, to_cycle_id=$3, quantity=$4, split_date=$5, note=$6""",
                self._to_int(p["id"]), self._to_int(p["from_cycle_id"]),
                self._to_int(p["to_cycle_id"]), self._to_int(p["quantity"]),
                self._to_dt(p.get("split_date")), p.get("note"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycle_splits WHERE id = $1", self._to_int(p["id"]))

    async def _sync_feed_brands(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO feed_brands (id, name, kg_per_bag, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, kg_per_bag=$3, note=$4, status=$5""",
                self._to_int(p["id"]), p["name"], self._to_float(p.get("kg_per_bag")),
                p.get("note"), p.get("status", "active"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM feed_brands WHERE id = $1", self._to_int(p["id"]))

    async def _sync_feed_types(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO feed_types (id, feed_brand_id, code, price_per_bag, name, suggested_stage, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET feed_brand_id=$2, code=$3, price_per_bag=$4, name=$5, suggested_stage=$6, note=$7, status=$8""",
                self._to_int(p["id"]), self._to_int(p.get("feed_brand_id")), p.get("code"),
                self._to_float(p.get("price_per_bag")), p.get("name", p.get("code", "")),
                p.get("suggested_stage"), p.get("note"), p.get("status", "active"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM feed_types WHERE id = $1", self._to_int(p["id"]))

    async def _sync_medications(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO medications (id, name, unit, category, manufacturer, price_per_unit, recommended_dose, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, unit=$3, category=$4, manufacturer=$5, price_per_unit=$6, recommended_dose=$7, note=$8, status=$9""",
                self._to_int(p["id"]), p["name"], p.get("unit"), p.get("category"),
                p.get("manufacturer"), self._to_float(p.get("price_per_unit")),
                p.get("recommended_dose"), p.get("note"),
                p.get("status", "active"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM medications WHERE id = $1", self._to_int(p["id"]))

    async def _sync_suppliers(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO suppliers (id, name, phone, address, note, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, phone=$3, address=$4, note=$5, status=$6""",
                self._to_int(p["id"]), p["name"], p.get("phone"), p.get("address"),
                p.get("note"), p.get("status", "active"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM suppliers WHERE id = $1", self._to_int(p["id"]))

    async def _sync_vaccine_programs(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO vaccine_programs (id, name, note, active, created_at)
                VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
                ON CONFLICT (id) DO UPDATE SET name=$2, note=$3, active=$4""",
                self._to_int(p["id"]), p["name"], p.get("note"),
                self._to_bool(p.get("active", True)), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM vaccine_programs WHERE id = $1", self._to_int(p["id"]))

    async def _sync_vaccine_program_items(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO vaccine_program_items (id, program_id, vaccine_brand_id, vaccine_name, day_age, method, remind_days, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET program_id=$2, vaccine_name=$4, day_age=$5, method=$6, remind_days=$7, sort_order=$8""",
                self._to_int(p["id"]), self._to_int(p["program_id"]),
                self._to_int(p.get("vaccine_brand_id")), p["vaccine_name"],
                self._to_int(p["day_age"]), p.get("method"),
                self._to_int(p.get("remind_days", 1)), self._to_int(p.get("sort_order", 0)),
            )
        elif action == "delete":
            await db.execute("DELETE FROM vaccine_program_items WHERE id = $1", self._to_int(p["id"]))

    async def _sync_notification_rules(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO notification_rules (id, code, label, level, enabled, interval_min, send_at_hour, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (id) DO UPDATE SET code=$2, label=$3, level=$4, enabled=$5, interval_min=$6, send_at_hour=$7, updated_at=NOW()""",
                p["id"], p["code"], p.get("label"), p.get("level", "blue"),
                p.get("enabled", True), p.get("interval_min", 1440), p.get("send_at_hour"),
            )

    async def _sync_vaccine_schedules(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO vaccine_schedules (id, cycle_id, program_item_id, vaccine_name, day_age_target,
                    scheduled_date, method, done, done_at, skipped, skip_reason, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
                ON CONFLICT (id) DO UPDATE SET vaccine_name=$4, day_age_target=$5,
                    scheduled_date=$6, method=$7, done=$8, done_at=$9, skipped=$10, skip_reason=$11""",
                p["id"], p["cycle_id"], p.get("program_item_id"), p["vaccine_name"],
                p.get("day_age_target"), self._to_dt(p.get("scheduled_date")), p.get("method"),
                p.get("done", False), self._to_dt(p.get("done_at")), p.get("skipped", False),
                p.get("skip_reason"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM vaccine_schedules WHERE id = $1", p["id"])

    async def _sync_care_feeds(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_feeds (id, cycle_id, barn_id, feed_date, meal,
                    product_id, feed_type_id, quantity, bags, kg_actual, remaining_pct,
                    remaining, session, warehouse_id, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, NOW()))
                ON CONFLICT (id) DO UPDATE SET feed_date=$4, meal=$5, product_id=$6,
                    feed_type_id=$7, quantity=$8, bags=$9, kg_actual=$10, remaining_pct=$11,
                    remaining=$12, session=$13, warehouse_id=$14, notes=$15""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("feed_date")),
                p.get("meal"), self._to_int(p.get("product_id")),
                self._to_int(p.get("feed_type_id")), self._to_float(p.get("quantity")),
                self._to_float(p.get("bags")), self._to_float(p.get("kg_actual")),
                self._to_float(p.get("remaining_pct")), self._to_float(p.get("remaining")),
                p.get("session") or p.get("feed_session"), self._to_int(p.get("warehouse_id")),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_feeds WHERE id = $1", self._to_int(p["id"]))

    async def _sync_care_deaths(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_deaths (id, cycle_id, barn_id, death_date, count, quantity,
                    cause, reason, death_category, symptoms, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
                ON CONFLICT (id) DO UPDATE SET death_date=$4, count=$5, quantity=$6,
                    cause=$7, reason=$8, death_category=$9, symptoms=$10, notes=$11""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("death_date")),
                self._to_int(p.get("count")), self._to_int(p.get("quantity") or p.get("count")),
                p.get("cause"), p.get("reason"), p.get("death_category"),
                p.get("symptoms"), p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_deaths WHERE id = $1", self._to_int(p["id"]))

    async def _sync_care_medications(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_medications (id, cycle_id, barn_id, med_date, med_type,
                    product_id, medication_id, medication_name, quantity, dosage, unit,
                    method, warehouse_id, purpose, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, NOW()))
                ON CONFLICT (id) DO UPDATE SET med_date=$4, med_type=$5, product_id=$6,
                    medication_id=$7, medication_name=$8, quantity=$9, dosage=$10, unit=$11,
                    method=$12, warehouse_id=$13, purpose=$14, notes=$15""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("med_date")),
                p.get("med_type", "medication"), self._to_int(p.get("product_id")),
                self._to_int(p.get("medication_id")), p.get("medication_name") or p.get("product_name"),
                self._to_float(p.get("quantity")), self._to_float(p.get("dosage")),
                p.get("unit"), p.get("method"),
                self._to_int(p.get("warehouse_id")), p.get("purpose"),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_medications WHERE id = $1", self._to_int(p["id"]))

    async def _sync_weight_sessions(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO weight_sessions (id, cycle_id, day_age, sample_count,
                    avg_weight_g, note, weighed_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET day_age=$3, sample_count=$4,
                    avg_weight_g=$5, note=$6, weighed_at=$7""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                self._to_int(p.get("day_age")), self._to_int(p.get("sample_count")),
                self._to_float(p.get("avg_weight_g")),
                p.get("note") or p.get("notes"),
                self._to_dt(p.get("weighed_at") or p.get("weigh_date")),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM weight_sessions WHERE id = $1", self._to_int(p["id"]))

    async def _sync_care_sales(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_sales (id, cycle_id, barn_id, sale_date, count, total_weight,
                    avg_weight, unit_price, price_per_kg, total_amount, gender, buyer,
                    sale_type, weight_kg, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, COALESCE($16, NOW()))
                ON CONFLICT (id) DO UPDATE SET sale_date=$4, count=$5, total_weight=$6,
                    avg_weight=$7, unit_price=$8, price_per_kg=$9, total_amount=$10,
                    gender=$11, buyer=$12, sale_type=$13, weight_kg=$14, notes=$15""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("sale_date")),
                self._to_int(p.get("count")), self._to_float(p.get("total_weight")),
                self._to_float(p.get("avg_weight")), self._to_float(p.get("unit_price")),
                self._to_float(p.get("price_per_kg")), self._to_float(p.get("total_amount")),
                p.get("gender"), p.get("buyer"),
                p.get("sale_type", "sale"), self._to_float(p.get("weight_kg")),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_sales WHERE id = $1", self._to_int(p["id"]))

    async def _sync_health_notes(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO health_notes (id, cycle_id, day_age, recorded_at, symptoms,
                    severity, resolved, resolved_at, image_path, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET day_age=$3, recorded_at=$4, symptoms=$5,
                    severity=$6, resolved=$7, resolved_at=$8, image_path=$9""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                self._to_int(p.get("day_age")), self._to_dt(p.get("recorded_at")),
                p.get("symptoms"), p.get("severity"), self._to_bool(p.get("resolved", False)),
                self._to_dt(p.get("resolved_at")), p.get("image_path"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM health_notes WHERE id = $1", self._to_int(p["id"]))

    async def _sync_devices(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO devices (id, device_code, name, device_type_id, barn_id,
                    mqtt_topic, is_online, firmware_version, ip_address, last_heartbeat_at,
                    notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
                ON CONFLICT (id) DO UPDATE SET device_code=$2, name=$3, device_type_id=$4,
                    barn_id=$5, mqtt_topic=$6, is_online=$7, firmware_version=$8,
                    ip_address=$9, last_heartbeat_at=$10, notes=$11""",
                self._to_int(p["id"]), p["device_code"], p.get("name"),
                self._to_int(p.get("device_type_id")), p.get("barn_id"),
                p.get("mqtt_topic", ""), self._to_bool(p.get("is_online", False)),
                p.get("firmware_version"), p.get("ip_address"),
                self._to_dt(p.get("last_heartbeat_at") or p.get("last_seen")),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM devices WHERE id = $1", self._to_int(p["id"]))

    # ── Sync Log ─────────────────────────────────────

    async def _log_sync(self, direction: str, count: int, status: str, error_msg: str = None):
        """Log sync operation to sync_log table."""
        try:
            await db.execute(
                "INSERT INTO sync_log (direction, items_count, status, error_msg) VALUES ($1, $2, $3, $4)",
                direction, count, status, error_msg,
            )
        except Exception:
            pass  # Don't fail sync because of logging

    async def get_sync_logs(self, limit: int = 20) -> list[dict]:
        """Get recent sync log entries."""
        rows = await db.fetch(
            "SELECT * FROM sync_log ORDER BY created_at DESC LIMIT $1", limit
        )
        return [dict(r) for r in rows]

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
        cycle_count = 0
        while self._running:
            try:
                # Push local changes to cloud
                await self.push_to_cloud()

                # Pull cloud changes to local
                await self.pull_from_cloud()

                # Push sensor data every 5 cycles (5 * interval seconds)
                cycle_count += 1
                if cycle_count % 5 == 0:
                    try:
                        from src.sync.sensor_sync import sensor_sync
                        await sensor_sync.push_sensor_summary()
                        await sensor_sync.push_device_states()
                    except Exception as e:
                        logger.error(f"Sensor sync error: {e}")

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

    async def initial_full_sync(self) -> dict:
        """Perform initial full sync - pull all config data from cloud.

        Used when connecting to cloud for the first time to populate
        local DB with feed brands, feed types, medications, etc.
        """
        if not self.config["cloud_url"]:
            return {"error": "Cloud URL not configured"}

        try:
            result = await self.cloud_request("GET", "/api/sync/changes?since=2000-01-01T00:00:00Z")
            items = result.get("items", [])
            applied = 0
            errors = []
            for item in items:
                try:
                    await self._apply_cloud_change(item)
                    applied += 1
                except Exception as e:
                    err_msg = f"{item.get('table','?')}#{item.get('payload',{}).get('id','?')}: {e}"
                    logger.error(f"Full sync apply error: {err_msg}")
                    errors.append(err_msg)

            # Also push all local data to cloud
            pushed = await self.push_to_cloud()

            self._last_sync_at = datetime.now(timezone.utc).isoformat()
            err_log = "; ".join(errors[:5]) if errors else None
            await self._log_sync("pull", applied, "ok" if not errors else "partial", err_log)

            return {"pulled": applied, "pushed": pushed, "errors": len(errors),
                    "error_details": errors[:5]}

        except Exception as e:
            logger.error(f"Initial full sync failed: {e}")
            return {"error": str(e)}


sync_service = SyncService()
