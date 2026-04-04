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
            # Reference data (Cloud → Local pull)
            "farms": self._sync_farms,
            "suppliers": self._sync_suppliers,
            "products": self._sync_products,
            "feed_brands": self._sync_feed_brands,
            "feed_types": self._sync_feed_types,
            "medications": self._sync_medications,
            "vaccine_programs": self._sync_vaccine_programs,
            "vaccine_program_items": self._sync_vaccine_program_items,
            "device_types": self._sync_device_types,
            "equipment_types": self._sync_equipment_types,
            "sensor_types": self._sync_sensor_types,
            # Infrastructure (Cloud → Local pull)
            "barns": self._sync_barns,
            "warehouses": self._sync_warehouses,
            "warehouse_zones": self._sync_warehouse_zones,
            "devices": self._sync_devices,
            "device_channels": self._sync_device_channels,
            "equipment": self._sync_equipment,
            "sensors": self._sync_sensors,
            # Operational (Cloud → Local pull)
            "cycles": self._sync_cycles,
            "cycle_splits": self._sync_cycle_splits,
            "cycle_daily_snapshots": self._sync_cycle_daily_snapshots,
            "cycle_feed_programs": self._sync_cycle_feed_programs,
            "cycle_feed_program_items": self._sync_cycle_feed_program_items,
            "cycle_feed_stages": self._sync_cycle_feed_stages,
            "care_feeds": self._sync_care_feeds,
            "care_deaths": self._sync_care_deaths,
            "care_medications": self._sync_care_medications,
            "care_sales": self._sync_care_sales,
            "care_litters": self._sync_care_litters,
            "care_expenses": self._sync_care_expenses,
            "care_weights": self._sync_care_weights,
            "weight_samples": self._sync_weight_samples,
            "weight_reminders": self._sync_weight_reminders,
            "feed_trough_checks": self._sync_feed_trough_checks,
            "health_notes": self._sync_health_notes,
            "vaccine_schedules": self._sync_vaccine_schedules,
            "curtain_configs": self._sync_curtain_configs,
            # Inventory (Cloud → Local pull)
            "inventory": self._sync_inventory,
            "inventory_transactions": self._sync_inventory_transactions,
            "inventory_alerts": self._sync_inventory_alerts,
            "inventory_snapshots": self._sync_inventory_snapshots,
            "stock_valuation": self._sync_stock_valuation,
            "purchase_orders": self._sync_purchase_orders,
            "purchase_order_items": self._sync_purchase_order_items,
            # Time-series (Cloud → Local pull)
            "sensor_data": self._sync_sensor_data,
            "sensor_alerts": self._sync_sensor_alerts,
            "sensor_daily_summary": self._sync_sensor_daily_summary,
            "sensor_threshold_configs": self._sync_sensor_threshold_configs,
            "sensor_calibrations": self._sync_sensor_calibrations,
            "sensor_maintenance_log": self._sync_sensor_maintenance_log,
            # Device telemetry (Cloud ← Local push, pulled periodically)
            "device_states": self._sync_device_states,
            "device_state_log": self._sync_device_state_log,
            "device_commands": self._sync_device_commands,
            "device_telemetry": self._sync_device_telemetry,
            "device_alerts": self._sync_device_alerts,
            "device_config_versions": self._sync_device_config_versions,
            # Legacy
            "firmwares": self._sync_firmwares,
            "notification_rules": self._sync_notification_rules,
            "weight_sessions": self._sync_weight_sessions,
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
                    mqtt_topic, is_online, firmware_version, firmware_id, ip_address, last_heartbeat_at,
                    notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW()))
                ON CONFLICT (id) DO UPDATE SET device_code=$2, name=$3, device_type_id=$4,
                    barn_id=$5, mqtt_topic=$6, is_online=$7, firmware_version=$8,
                    firmware_id=$9, ip_address=$10, last_heartbeat_at=$11, notes=$12""",
                self._to_int(p["id"]), p["device_code"], p.get("name"),
                self._to_int(p.get("device_type_id")), p.get("barn_id"),
                p.get("mqtt_topic", ""), self._to_bool(p.get("is_online", False)),
                p.get("firmware_version"), self._to_int(p.get("firmware_id")),
                p.get("ip_address"),
                self._to_dt(p.get("last_heartbeat_at") or p.get("last_seen")),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM devices WHERE id = $1", self._to_int(p["id"]))

    async def _sync_firmwares(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO firmwares (id, device_type_code, version, filename,
                    file_size, checksum, changelog, is_latest, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_type_code=$2, version=$3, filename=$4,
                    file_size=$5, checksum=$6, changelog=$7, is_latest=$8""",
                self._to_int(p["id"]), p["device_type_code"], p["version"],
                p["filename"], self._to_int(p["file_size"]),
                p["checksum"], p.get("changelog", ""),
                self._to_bool(p.get("is_latest", False)),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM firmwares WHERE id = $1", self._to_int(p["id"]))

    # ═══════════════════════════════════════════════════════════════════════════
    # NEW TABLE HANDLERS (Cloud → Local pull)
    # ═══════════════════════════════════════════════════════════════════════════

    # ── Reference Data ──────────────────────────────────

    async def _sync_farms(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO farms (id, name, address, contact_name, contact_phone, contact_email, notes, active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    name=$2, address=$3, contact_name=$4, contact_phone=$5,
                    contact_email=$6, notes=$7, active=$8""",
                str(p["id"]), p.get("name"), p.get("address"),
                p.get("contact_name"), p.get("contact_phone"), p.get("contact_email"),
                p.get("notes"), self._to_bool(p.get("active", True)),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM farms WHERE id = $1", str(p["id"]))

    async def _sync_products(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO products (id, code, name, product_type, unit, supplier_id,
                    price_per_unit, min_stock_alert, reorder_point, barcode, description, active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, NOW()), NOW())
                ON CONFLICT (id) DO UPDATE SET
                    code=$2, name=$3, product_type=$4, unit=$5, supplier_id=$6,
                    price_per_unit=$7, min_stock_alert=$8, reorder_point=$9,
                    barcode=$10, description=$11, active=$12, updated_at=NOW()""",
                self._to_int(p["id"]), p.get("code"), p.get("name"),
                p.get("product_type"), p.get("unit"), self._to_int(p.get("supplier_id")),
                self._to_float(p.get("price_per_unit")), self._to_float(p.get("min_stock_alert")),
                self._to_float(p.get("reorder_point")), p.get("barcode"),
                p.get("description"), self._to_bool(p.get("active", True)),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM products WHERE id = $1", self._to_int(p["id"]))

    async def _sync_warehouses(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO warehouses (id, farm_id, barn_id, code, name, warehouse_type,
                    is_central, address, length_m, width_m, height_m, capacity_kg, status, note, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    farm_id=$2, barn_id=$3, code=$4, name=$5, warehouse_type=$6,
                    is_central=$7, address=$8, length_m=$9, width_m=$10, height_m=$11,
                    capacity_kg=$12, status=$13, note=$14""",
                str(p["id"]), p.get("farm_id"), p.get("barn_id"),
                p.get("code"), p.get("name"), p.get("warehouse_type"),
                self._to_bool(p.get("is_central", False)), p.get("address"),
                self._to_float(p.get("length_m")), self._to_float(p.get("width_m")),
                self._to_float(p.get("height_m")), self._to_float(p.get("capacity_kg")),
                p.get("status", "active"), p.get("note"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM warehouses WHERE id = $1", str(p["id"]))

    async def _sync_warehouse_zones(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO warehouse_zones (id, warehouse_id, name, zone_type, created_at)
                VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    warehouse_id=$2, name=$3, zone_type=$4""",
                self._to_int(p["id"]), p.get("warehouse_id"), p.get("name"),
                p.get("zone_type"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM warehouse_zones WHERE id = $1", self._to_int(p["id"]))

    async def _sync_purchase_orders(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO purchase_orders (id, supplier_id, order_number, order_date,
                    expected_delivery_date, total_amount, status, note, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    supplier_id=$2, order_number=$3, order_date=$4,
                    expected_delivery_date=$5, total_amount=$6, status=$7, note=$8""",
                self._to_int(p["id"]), self._to_int(p.get("supplier_id")),
                p.get("order_number"), self._to_dt(p.get("order_date")),
                self._to_dt(p.get("expected_delivery_date")),
                self._to_float(p.get("total_amount")), p.get("status", "pending"),
                p.get("note"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM purchase_orders WHERE id = $1", self._to_int(p["id"]))

    async def _sync_purchase_order_items(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO purchase_order_items (id, purchase_order_id, product_id,
                    quantity, unit_price, received_quantity, line_total)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    purchase_order_id=$2, product_id=$3,
                    quantity=$4, unit_price=$5, received_quantity=$6, line_total=$7""",
                self._to_int(p["id"]), self._to_int(p.get("purchase_order_id")),
                self._to_int(p.get("product_id")), self._to_float(p.get("quantity")),
                self._to_float(p.get("unit_price")), self._to_float(p.get("received_quantity")),
                self._to_float(p.get("line_total")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM purchase_order_items WHERE id = $1", self._to_int(p["id"]))

    # ── Infrastructure ──────────────────────────────────

    async def _sync_device_types(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_types (id, code, name, mqtt_protocol, relay_count, config_template, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    code=$2, name=$3, mqtt_protocol=$4, relay_count=$5, config_template=$6""",
                self._to_int(p["id"]), p.get("code"), p.get("name"),
                p.get("mqtt_protocol"), self._to_int(p.get("relay_count")),
                p.get("config_template"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_types WHERE id = $1", self._to_int(p["id"]))

    async def _sync_equipment_types(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO equipment_types (id, code, name, category, mqtt_protocol, config_schema, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    code=$2, name=$3, category=$4, mqtt_protocol=$5, config_schema=$6""",
                self._to_int(p["id"]), p.get("code"), p.get("name"),
                p.get("category"), p.get("mqtt_protocol"),
                p.get("config_schema"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM equipment_types WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_types(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_types (id, code, name, unit, data_type, typical_range, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    code=$2, name=$3, unit=$4, data_type=$5, typical_range=$6""",
                self._to_int(p["id"]), p.get("code"), p.get("name"),
                p.get("unit"), p.get("data_type", "numeric"),
                p.get("typical_range"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_types WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_channels(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_channels (id, device_id, channel_index, channel_type,
                    function, equipment_id, relay_type, pwm_frequency, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, channel_index=$3, channel_type=$4,
                    function=$5, equipment_id=$6, relay_type=$7, pwm_frequency=$8""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                self._to_int(p.get("channel_index")), p.get("channel_type"),
                p.get("function"), self._to_int(p.get("equipment_id")),
                p.get("relay_type"), self._to_int(p.get("pwm_frequency")),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_channels WHERE id = $1", self._to_int(p["id"]))

    async def _sync_equipment(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO equipment (id, barn_id, equipment_type_id, name, equipment_type,
                    model, serial_no, power_watts, status, install_date, warranty_until,
                    purchase_price, runtime_hours, energy_consumption_kwh, maintenance_interval_days,
                    notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    barn_id=$2, equipment_type_id=$3, name=$4, equipment_type=$5,
                    model=$6, serial_no=$7, power_watts=$8, status=$9,
                    install_date=$10, warranty_until=$11, purchase_price=$12,
                    runtime_hours=$13, energy_consumption_kwh=$14, maintenance_interval_days=$15, notes=$16""",
                self._to_int(p["id"]), p.get("barn_id"), self._to_int(p.get("equipment_type_id")),
                p.get("name"), p.get("equipment_type"), p.get("model"), p.get("serial_no"),
                self._to_int(p.get("power_watts")), p.get("status", "active"),
                self._to_dt(p.get("install_date")), self._to_dt(p.get("warranty_until")),
                self._to_float(p.get("purchase_price")), self._to_float(p.get("runtime_hours")),
                self._to_float(p.get("energy_consumption_kwh")),
                self._to_int(p.get("maintenance_interval_days")), p.get("notes"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM equipment WHERE id = $1", self._to_int(p["id"]))

    async def _sync_equipment_parts(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO equipment_parts (id, equipment_id, part_name, part_code,
                    replacement_interval_hours, last_replaced_at, next_replacement_at, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET
                    equipment_id=$2, part_name=$3, part_code=$4,
                    replacement_interval_hours=$5, last_replaced_at=$6, next_replacement_at=$7, notes=$8""",
                self._to_int(p["id"]), self._to_int(p.get("equipment_id")),
                p.get("part_name"), p.get("part_code"),
                self._to_int(p.get("replacement_interval_hours")),
                self._to_dt(p.get("last_replaced_at")),
                self._to_dt(p.get("next_replacement_at")), p.get("notes"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM equipment_parts WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensors(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensors (id, sensor_type_id, barn_id, device_id, name, location,
                    calibration_date, reading_interval_seconds, status, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_type_id=$2, barn_id=$3, device_id=$4, name=$5, location=$6,
                    calibration_date=$7, reading_interval_seconds=$8, status=$9, notes=$10""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_type_id")),
                p.get("barn_id"), self._to_int(p.get("device_id")),
                p.get("name"), p.get("location"),
                self._to_dt(p.get("calibration_date")),
                self._to_int(p.get("reading_interval_seconds", 60)),
                p.get("status", "active"), p.get("notes"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensors WHERE id = $1", self._to_int(p["id"]))

    # ── Care & Operational Records ───────────────────────

    async def _sync_care_litters(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_litters (id, cycle_id, barn_id, litter_date, litter_type,
                    product_id, quantity_kg, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, barn_id=$3, litter_date=$4, litter_type=$5,
                    product_id=$6, quantity_kg=$7, notes=$8""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("litter_date")),
                p.get("litter_type"), self._to_int(p.get("product_id")),
                self._to_float(p.get("quantity_kg")), p.get("notes"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_litters WHERE id = $1", self._to_int(p["id"]))

    async def _sync_care_expenses(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_expenses (id, cycle_id, barn_id, expense_date, expense_type,
                    amount, description, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, barn_id=$3, expense_date=$4, expense_type=$5,
                    amount=$6, description=$7""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("expense_date")),
                p.get("expense_type"), self._to_float(p.get("amount")),
                p.get("description"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_expenses WHERE id = $1", self._to_int(p["id"]))

    async def _sync_care_weights(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO care_weights (id, cycle_id, barn_id, day_age, sample_count,
                    avg_weight_g, weighed_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, barn_id=$3, day_age=$4, sample_count=$5,
                    avg_weight_g=$6, weighed_at=$7""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_int(p.get("day_age")),
                self._to_int(p.get("sample_count")), self._to_float(p.get("avg_weight_g")),
                self._to_dt(p.get("weighed_at")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM care_weights WHERE id = $1", self._to_int(p["id"]))

    async def _sync_weight_samples(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO weight_samples (id, session_id, weight_g, created_at)
                VALUES ($1, $2, $3, COALESCE($4, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    session_id=$2, weight_g=$3""",
                self._to_int(p["id"]), self._to_int(p.get("session_id")),
                self._to_int(p.get("weight_g")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM weight_samples WHERE id = $1", self._to_int(p["id"]))

    async def _sync_weight_reminders(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO weight_reminders (id, cycle_id, barn_id, remind_date, reminded, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, barn_id=$3, remind_date=$4, reminded=$5""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_dt(p.get("remind_date")),
                self._to_bool(p.get("reminded", False)),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM weight_reminders WHERE id = $1", self._to_int(p["id"]))

    async def _sync_feed_trough_checks(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO feed_trough_checks (id, cycle_id, barn_id, ref_feed_id,
                    remaining_pct, checked_at, notes)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, barn_id=$3, ref_feed_id=$4,
                    remaining_pct=$5, checked_at=$6, notes=$7""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("barn_id"), self._to_int(p.get("ref_feed_id")),
                self._to_int(p.get("remaining_pct")), self._to_dt(p.get("checked_at")),
                p.get("notes"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM feed_trough_checks WHERE id = $1", self._to_int(p["id"]))

    async def _sync_curtain_configs(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO curtain_configs (id, curtain_code, name, barn_id, width_m, height_m,
                    fabric_type, motor_power_watts, device_id, up_channel, down_channel,
                    full_up_seconds, full_down_seconds, current_position, auto_control_enabled,
                    min_position, max_position, wind_speed_max_kmh, note, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE($20, NOW()), NOW())
                ON CONFLICT (id) DO UPDATE SET
                    curtain_code=$2, name=$3, barn_id=$4, width_m=$5, height_m=$6,
                    fabric_type=$7, motor_power_watts=$8, device_id=$9, up_channel=$10, down_channel=$11,
                    full_up_seconds=$12, full_down_seconds=$13, current_position=$14, auto_control_enabled=$15,
                    min_position=$16, max_position=$17, wind_speed_max_kmh=$18, note=$19, updated_at=NOW()""",
                self._to_int(p["id"]), p.get("curtain_code"), p.get("name"), p.get("barn_id"),
                self._to_float(p.get("width_m")), self._to_float(p.get("height_m")),
                p.get("fabric_type"), self._to_int(p.get("motor_power_watts")),
                self._to_int(p.get("device_id")), self._to_int(p.get("up_channel")),
                self._to_int(p.get("down_channel")),
                self._to_float(p.get("full_up_seconds", 60)), self._to_float(p.get("full_down_seconds", 60)),
                self._to_int(p.get("current_position", 0)), self._to_bool(p.get("auto_control_enabled", False)),
                self._to_int(p.get("min_position", 0)), self._to_int(p.get("max_position", 100)),
                self._to_float(p.get("wind_speed_max_kmh")), p.get("note"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM curtain_configs WHERE id = $1", self._to_int(p["id"]))

    # ── Cycle Feed Programs ──────────────────────────────

    async def _sync_cycle_feed_programs(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO cycle_feed_programs (id, cycle_id, feed_brand_id, name, created_at)
                VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, feed_brand_id=$3, name=$4""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                self._to_int(p.get("feed_brand_id")), p.get("name"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycle_feed_programs WHERE id = $1", self._to_int(p["id"]))

    async def _sync_cycle_feed_program_items(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO cycle_feed_program_items (id, cycle_feed_program_id, inventory_item_id, stage, status, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_feed_program_id=$2, inventory_item_id=$3, stage=$4, status=$5""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_feed_program_id")),
                self._to_int(p.get("inventory_item_id")), p.get("stage"),
                p.get("status", "active"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycle_feed_program_items WHERE id = $1", self._to_int(p["id"]))

    async def _sync_cycle_feed_stages(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO cycle_feed_stages (id, cycle_id, stage, primary_feed_type_id,
                    mix_feed_type_id, mix_ratio, effective_date, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, stage=$3, primary_feed_type_id=$4,
                    mix_feed_type_id=$5, mix_ratio=$6, effective_date=$7""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                p.get("stage"), self._to_int(p.get("primary_feed_type_id")),
                self._to_int(p.get("mix_feed_type_id")), self._to_int(p.get("mix_ratio")),
                self._to_dt(p.get("effective_date")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycle_feed_stages WHERE id = $1", self._to_int(p["id"]))

    async def _sync_cycle_daily_snapshots(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO cycle_daily_snapshots (id, cycle_id, date, day_age, alive_male,
                    alive_female, alive_total, bird_days_cumulative, feed_poured_kg, feed_consumed_kg,
                    feed_cumulative_kg, avg_weight_g, biomass_kg, weight_produced_kg, fcr,
                    mortality_count, sales_count, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, COALESCE($18, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    cycle_id=$2, date=$3, day_age=$4, alive_male=$5,
                    alive_female=$6, alive_total=$7, bird_days_cumulative=$8,
                    feed_poured_kg=$9, feed_consumed_kg=$10, feed_cumulative_kg=$11,
                    avg_weight_g=$12, biomass_kg=$13, weight_produced_kg=$14, fcr=$15,
                    mortality_count=$16, sales_count=$17""",
                self._to_int(p["id"]), self._to_int(p.get("cycle_id")),
                self._to_dt(p.get("date")), self._to_int(p.get("day_age")),
                self._to_int(p.get("alive_male")), self._to_int(p.get("alive_female")),
                self._to_int(p.get("alive_total")), self._to_float(p.get("bird_days_cumulative")),
                self._to_float(p.get("feed_poured_kg")), self._to_float(p.get("feed_consumed_kg")),
                self._to_float(p.get("feed_cumulative_kg")), self._to_float(p.get("avg_weight_g")),
                self._to_float(p.get("biomass_kg")), self._to_float(p.get("weight_produced_kg")),
                self._to_float(p.get("fcr")), self._to_int(p.get("mortality_count")),
                self._to_int(p.get("sales_count")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM cycle_daily_snapshots WHERE id = $1", self._to_int(p["id"]))

    # ── Inventory ─────────────────────────────────────

    async def _sync_inventory(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO inventory (id, warehouse_id, product_id, batch_number,
                    quantity, reserved_quantity, expiry_date, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), NOW())
                ON CONFLICT (id) DO UPDATE SET
                    warehouse_id=$2, product_id=$3, batch_number=$4,
                    quantity=$5, reserved_quantity=$6, expiry_date=$7, updated_at=NOW()""",
                self._to_int(p["id"]), p.get("warehouse_id"),
                self._to_int(p.get("product_id")), p.get("batch_number"),
                self._to_float(p.get("quantity")), self._to_float(p.get("reserved_quantity")),
                self._to_dt(p.get("expiry_date")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM inventory WHERE id = $1", self._to_int(p["id"]))

    async def _sync_inventory_transactions(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO inventory_transactions (id, product_id, warehouse_id, txn_type,
                    quantity, reference_type, reference_id, barn_id, cycle_id,
                    unit_price, total_amount, recorded_at, note)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO UPDATE SET
                    product_id=$2, warehouse_id=$3, txn_type=$4,
                    quantity=$5, reference_type=$6, reference_id=$7,
                    barn_id=$8, cycle_id=$9, unit_price=$10, total_amount=$11, recorded_at=$12, note=$13""",
                self._to_int(p["id"]), self._to_int(p.get("product_id")),
                p.get("warehouse_id"), p.get("txn_type"),
                self._to_float(p.get("quantity")), p.get("reference_type"),
                self._to_int(p.get("reference_id")), p.get("barn_id"),
                self._to_int(p.get("cycle_id")), self._to_float(p.get("unit_price")),
                self._to_float(p.get("total_amount")), self._to_dt(p.get("recorded_at")),
                p.get("note"),
            )
        elif action == "delete":
            await db.execute("DELETE FROM inventory_transactions WHERE id = $1", self._to_int(p["id"]))

    async def _sync_inventory_alerts(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO inventory_alerts (id, inventory_id, alert_type, message,
                    acknowledged, acknowledged_by, acknowledged_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    inventory_id=$2, alert_type=$3, message=$4,
                    acknowledged=$5, acknowledged_by=$6, acknowledged_at=$7""",
                self._to_int(p["id"]), self._to_int(p.get("inventory_id")),
                p.get("alert_type"), p.get("message"),
                self._to_bool(p.get("acknowledged", False)), p.get("acknowledged_by"),
                self._to_dt(p.get("acknowledged_at")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM inventory_alerts WHERE id = $1", self._to_int(p["id"]))

    async def _sync_inventory_snapshots(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO inventory_snapshots (id, warehouse_id, snapshot_date,
                    total_items, total_quantity, total_value, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    warehouse_id=$2, snapshot_date=$3,
                    total_items=$4, total_quantity=$5, total_value=$6""",
                self._to_int(p["id"]), p.get("warehouse_id"),
                self._to_dt(p.get("snapshot_date")), self._to_int(p.get("total_items")),
                self._to_float(p.get("total_quantity")), self._to_float(p.get("total_value")),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM inventory_snapshots WHERE id = $1", self._to_int(p["id"]))

    async def _sync_stock_valuation(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO stock_valuation (id, warehouse_id, product_id, valuation_date,
                    quantity, unit_cost, total_value, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    warehouse_id=$2, product_id=$3, valuation_date=$4,
                    quantity=$5, unit_cost=$6, total_value=$7""",
                self._to_int(p["id"]), p.get("warehouse_id"),
                self._to_int(p.get("product_id")), self._to_dt(p.get("valuation_date")),
                self._to_float(p.get("quantity")), self._to_float(p.get("unit_cost")),
                self._to_float(p.get("total_value")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM stock_valuation WHERE id = $1", self._to_int(p["id"]))

    # ── Sensor Data ────────────────────────────────────

    async def _sync_sensor_data(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_data (id, sensor_id, barn_id, cycle_id, day_age,
                    sensor_type, value, quality, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, barn_id=$3, cycle_id=$4, day_age=$5,
                    sensor_type=$6, value=$7, quality=$8, recorded_at=$9""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                p.get("barn_id"), self._to_int(p.get("cycle_id")),
                self._to_int(p.get("day_age")), p.get("sensor_type"),
                self._to_float(p.get("value")), p.get("quality", "good"),
                self._to_dt(p.get("recorded_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_data WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_alerts(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_alerts (id, sensor_id, barn_id, alert_type, threshold_value,
                    actual_value, acknowledged, acknowledged_by, acknowledged_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, barn_id=$3, alert_type=$4, threshold_value=$5,
                    actual_value=$6, acknowledged=$7, acknowledged_by=$8, acknowledged_at=$9""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                p.get("barn_id"), p.get("alert_type"),
                self._to_float(p.get("threshold_value")), self._to_float(p.get("actual_value")),
                self._to_bool(p.get("acknowledged", False)), p.get("acknowledged_by"),
                self._to_dt(p.get("acknowledged_at")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_alerts WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_daily_summary(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_daily_summary (id, sensor_id, barn_id, date, day_age,
                    avg_value, min_value, max_value, sample_count, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, barn_id=$3, date=$4, day_age=$5,
                    avg_value=$6, min_value=$7, max_value=$8, sample_count=$9""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                p.get("barn_id"), self._to_dt(p.get("date")),
                self._to_int(p.get("day_age")), self._to_float(p.get("avg_value")),
                self._to_float(p.get("min_value")), self._to_float(p.get("max_value")),
                self._to_int(p.get("sample_count")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_daily_summary WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_threshold_configs(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_threshold_configs (id, sensor_id, alert_type,
                    threshold_value, enabled, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, alert_type=$3, threshold_value=$4, enabled=$5""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                p.get("alert_type"), self._to_float(p.get("threshold_value")),
                self._to_bool(p.get("enabled", True)), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_threshold_configs WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_calibrations(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_calibrations (id, sensor_id, calibration_date,
                    reference_value, actual_value, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, calibration_date=$3,
                    reference_value=$4, actual_value=$5, notes=$6""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                self._to_dt(p.get("calibration_date")),
                self._to_float(p.get("reference_value")), self._to_float(p.get("actual_value")),
                p.get("notes"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_calibrations WHERE id = $1", self._to_int(p["id"]))

    async def _sync_sensor_maintenance_log(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO sensor_maintenance_log (id, sensor_id, maintenance_type,
                    performed_by, performed_at, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    sensor_id=$2, maintenance_type=$3,
                    performed_by=$4, performed_at=$5, notes=$6""",
                self._to_int(p["id"]), self._to_int(p.get("sensor_id")),
                p.get("maintenance_type"), p.get("performed_by"),
                self._to_dt(p.get("performed_at")), p.get("notes"),
                self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM sensor_maintenance_log WHERE id = $1", self._to_int(p["id"]))

    # ── Device State / Telemetry (Cloud ← Local push) ───

    async def _sync_device_states(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_states (id, device_id, channel_index, state, value, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, channel_index=$3, state=$4, value=$5, updated_at=NOW()""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                self._to_int(p.get("channel_index")), p.get("state", "off"),
                self._to_int(p.get("value", 0)),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_states WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_state_log(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_state_log (id, device_id, channel_index, old_state,
                    new_state, old_value, new_value, triggered_by, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, channel_index=$3, old_state=$4,
                    new_state=$5, old_value=$6, new_value=$7, triggered_by=$8, recorded_at=$9""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                self._to_int(p.get("channel_index")), p.get("old_state"),
                p.get("new_state"), self._to_int(p.get("old_value")),
                self._to_int(p.get("new_value")), p.get("triggered_by"),
                self._to_dt(p.get("recorded_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_state_log WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_commands(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_commands (id, device_id, command, channel_index, value,
                    priority, expires_at, response_payload, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, command=$3, channel_index=$4, value=$5,
                    priority=$6, expires_at=$7, response_payload=$8, status=$9""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                p.get("command"), self._to_int(p.get("channel_index")),
                self._to_int(p.get("value")), self._to_int(p.get("priority", 5)),
                self._to_dt(p.get("expires_at")), p.get("response_payload"),
                p.get("status", "pending"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_commands WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_telemetry(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_telemetry (id, device_id, raw_payload, parsed_data, recorded_at)
                VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, raw_payload=$3, parsed_data=$4, recorded_at=$5""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                p.get("raw_payload"), p.get("parsed_data"),
                self._to_dt(p.get("recorded_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_telemetry WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_alerts(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_alerts (id, device_id, alert_type, message,
                    acknowledged, acknowledged_by, acknowledged_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, alert_type=$3, message=$4,
                    acknowledged=$5, acknowledged_by=$6, acknowledged_at=$7""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                p.get("alert_type"), p.get("message"),
                self._to_bool(p.get("acknowledged", False)), p.get("acknowledged_by"),
                self._to_dt(p.get("acknowledged_at")), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_alerts WHERE id = $1", self._to_int(p["id"]))

    async def _sync_device_config_versions(self, action: str, p: dict):
        if action in ("insert", "update"):
            await db.execute(
                """INSERT INTO device_config_versions (id, device_id, config_version,
                    config_hash, config_payload, created_at)
                VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
                ON CONFLICT (id) DO UPDATE SET
                    device_id=$2, config_version=$3,
                    config_hash=$4, config_payload=$5""",
                self._to_int(p["id"]), self._to_int(p.get("device_id")),
                self._to_int(p.get("config_version")), p.get("config_hash"),
                p.get("config_payload"), self._to_dt(p.get("created_at")),
            )
        elif action == "delete":
            await db.execute("DELETE FROM device_config_versions WHERE id = $1", self._to_int(p["id"]))

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

        Cloud commands (priority 3) are rejected if a LOCAL/MANUAL command
        (priority 1-2) has an active lock on the device/channel.
        """
        cmd_type = command.get("type")
        payload = command.get("payload", {})

        if cmd_type == "relay":
            from src.iot.mqtt_client import mqtt_client
            from src.iot.command_coordinator import command_coordinator, CommandRequest

            device_code = payload.get("device_code")
            channel = payload.get("channel")
            state = payload.get("state")  # "on" or "off"
            duration = payload.get("duration")

            # Look up device to get device_id and channel_id
            device = await db.fetchrow(
                "SELECT id, mqtt_topic FROM devices WHERE device_code = $1", device_code
            )
            if not device:
                return {"ok": False, "reason": "device_not_found", "message": f"Unknown device: {device_code}"}

            channel_row = await db.fetchrow(
                "SELECT id FROM device_channels WHERE device_id = $1 AND channel_number = $2",
                device["id"], channel,
            )
            if not channel_row:
                return {"ok": False, "reason": "channel_not_found", "message": f"Unknown channel: {channel}"}

            # Check for active local/manual lock
            has_local = await command_coordinator.check_pending_local(
                device["id"], channel_row["id"]
            )
            if has_local:
                return {
                    "ok": False,
                    "reason": "local_control_active",
                    "message": "Local command in progress, cloud command rejected",
                }

            # Execute via command coordinator
            req = CommandRequest(
                device_id=device["id"],
                channel_id=channel_row["id"],
                command_type=state,
                payload={"ch": channel, "state": state, "duration": duration} if duration else {"ch": channel, "state": state},
                source="cloud",
                requires_ack=True,
            )
            result = await command_coordinator.execute(req)

            if result.ok:
                return {"ok": True, "executed": "relay", "device": device_code, "command_id": result.command_id}
            else:
                return {"ok": False, "reason": result.reason, "message": result.message}

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
