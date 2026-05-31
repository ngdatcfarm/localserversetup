"""Inventory Service - Warehouse, products, import/export (Kho cám + thuốc)."""

from typing import Optional
from src.services.database.db import db
from src.sync.sync_service import sync_service


class InventoryService:

    # ── Warehouses ────────────────────────────────────

    async def list_warehouses(self, warehouse_type: str = None,
                              barn_id: str = None,
                              farm_id: str = None) -> list[dict]:
        """List warehouses with optional filters."""
        conditions = ["active = TRUE"]
        params = []
        idx = 1

        if warehouse_type:
            conditions.append(f"warehouse_type = ${idx}")
            params.append(warehouse_type)
            idx += 1
        if barn_id:
            conditions.append(f"(barn_id = ${idx} OR barn_id IS NULL)")
            params.append(barn_id)
            idx += 1
        if farm_id:
            conditions.append(f"farm_id = ${idx}")
            params.append(farm_id)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}"
        rows = await db.fetch(
            f"SELECT * FROM warehouses {where} ORDER BY barn_id NULLS FIRST, name",
            *params,
        )
        return [dict(r) for r in rows]

    async def get_warehouse(self, warehouse_id: str) -> Optional[dict]:
        row = await db.fetchrow(
            "SELECT * FROM warehouses WHERE id = $1", warehouse_id
        )
        return dict(row) if row else None

    async def create_warehouse(self, data: dict) -> dict:
        """Create a warehouse.

        Business rules:
        - code must be unique
        - farm_id defaults to 'farm-01'
        - is_central = TRUE if barn_id is NULL
        """
        # Check if code exists
        existing = await db.fetchval(
            "SELECT 1 FROM warehouses WHERE code = $1", data.get("code")
        )
        if existing:
            return {"ok": False, "message": f"Warehouse code '{data['code']}' already exists"}

        if not data.get("code"):
            return {"ok": False, "message": "Warehouse code is required"}
        if not data.get("name"):
            return {"ok": False, "message": "Warehouse name is required"}

        farm_id = data.get("farm_id", "farm-01")
        is_central = data.get("barn_id") is None

        row = await db.fetchrow(
            """INSERT INTO warehouses (code, name, warehouse_type, barn_id, farm_id,
                                     description, is_central, active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *""",
            data["code"],
            data["name"],
            data.get("warehouse_type", "mixed"),
            data.get("barn_id"),
            farm_id,
            data.get("description"),
            is_central,
            data.get("active", True),
        )
        return {"ok": True, "warehouse": dict(row)}

    async def update_warehouse(self, warehouse_id: str, data: dict) -> dict:
        """Update warehouse fields."""
        existing = await self.get_warehouse(warehouse_id)
        if not existing:
            return {"ok": False, "message": "Warehouse not found"}

        # Recalculate is_central if barn_id changes
        barn_id = data.get("barn_id", existing.get("barn_id"))
        is_central = barn_id is None

        await db.execute(
            """UPDATE warehouses SET
                code = COALESCE($1, code),
                name = COALESCE($2, name),
                warehouse_type = COALESCE($3, warehouse_type),
                barn_id = $4,
                farm_id = COALESCE($5, farm_id),
                description = COALESCE($6, description),
                is_central = $7,
                active = COALESCE($8, active)
            WHERE id = $9""",
            data.get("code"),
            data.get("name"),
            data.get("warehouse_type"),
            barn_id,
            data.get("farm_id"),
            data.get("description"),
            is_central,
            data.get("active"),
            warehouse_id,
        )
        return {"ok": True, "warehouse": await self.get_warehouse(warehouse_id)}

    async def delete_warehouse(self, warehouse_id: str) -> dict:
        """Delete a warehouse. Cannot delete if has inventory."""
        inventory_count = await db.fetchval(
            "SELECT COUNT(*) FROM inventory WHERE warehouse_id = $1",
            warehouse_id
        )
        if inventory_count > 0:
            return {
                "ok": False,
                "message": f"Cannot delete: warehouse has {inventory_count} inventory records",
            }

        await db.execute("DELETE FROM warehouses WHERE id = $1", warehouse_id)
        return {"ok": True, "message": "Warehouse deleted"}

    # ── Warehouse Zones ────────────────────────────────

    async def list_warehouse_zones(self, warehouse_id: str = None) -> list[dict]:
        """List warehouse zones."""
        if warehouse_id:
            rows = await db.fetch(
                "SELECT * FROM warehouse_zones WHERE warehouse_id = $1::int ORDER BY name",
                warehouse_id,
            )
        else:
            rows = await db.fetch("SELECT * FROM warehouse_zones ORDER BY warehouse_id, name")
        return [dict(r) for r in rows]

    async def create_warehouse_zone(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO warehouse_zones (warehouse_id, name, zone_type)
            VALUES ($1, $2, $3)
            RETURNING *""",
            data["warehouse_id"],
            data["name"],
            data.get("zone_type", "storage"),
        )
        return {"ok": True, "zone": dict(row)}

    async def delete_warehouse_zone(self, zone_id: int) -> dict:
        await db.execute("DELETE FROM warehouse_zones WHERE id = $1", zone_id)
        return {"ok": True, "message": "Zone deleted"}

    # ── Products ──────────────────────────────────────

    async def list_products(self, product_type: str = None) -> list[dict]:
        if product_type:
            rows = await db.fetch(
                "SELECT * FROM products WHERE product_type = $1 AND active = TRUE ORDER BY name",
                product_type,
            )
        else:
            rows = await db.fetch(
                "SELECT * FROM products WHERE active = TRUE ORDER BY product_type, name"
            )
        return [dict(r) for r in rows]

    async def create_product(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO products (code, name, product_type, unit, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            data["code"], data["name"], data["product_type"],
            data.get("unit", "kg"), data.get("description"),
        )
        return {"ok": True, "product": dict(row)}

    # ── Inventory (Tồn kho) ──────────────────────────

    async def get_stock(self, warehouse_id: int = None,
                        product_type: str = None) -> list[dict]:
        """Get current stock levels."""
        conditions = []
        params = []
        idx = 1

        if warehouse_id:
            conditions.append(f"i.warehouse_id = ${idx}")
            params.append(warehouse_id)
            idx += 1
        if product_type:
            conditions.append(f"p.product_type = ${idx}")
            params.append(product_type)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        rows = await db.fetch(
            f"""SELECT i.*, p.name as product_name, p.code as product_code,
                       p.product_type, p.unit,
                       w.name as warehouse_name, w.barn_id
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            JOIN warehouses w ON i.warehouse_id = w.id
            {where}
            ORDER BY w.barn_id NULLS FIRST, p.name""",
            *params,
        )
        return [dict(r) for r in rows]

    # ── Import (Nhập kho) ─────────────────────────────

    async def _get_kg_per_bag(self, product_id: int) -> Optional[float]:
        """Lấy kg_per_bag từ feed_brands hoặc product."""
        # Thử feed_brands trước (qua product_id link)
        kg = await db.fetchval(
            "SELECT kg_per_bag FROM feed_brands WHERE product_id = $1", product_id
        )
        if kg:
            return float(kg)
        # Thử products.unit (nếu là feed thì có thể lưu kg_per_bag)
        return None

    async def _convert_to_kg(self, product_id: int, quantity: float, unit_size: float, unit_size_type: str) -> float:
        """Convert bao sang kg nếu cần."""
        if unit_size_type == 'bag' and unit_size and unit_size > 0:
            kg_per_bag = await self._get_kg_per_bag(product_id)
            if kg_per_bag:
                return unit_size * kg_per_bag
            # Nếu không tìm thấy kg_per_bag, giả định 25kg/bao
            return unit_size * 25.0
        return quantity

    async def import_stock(self, data: dict) -> dict:
        """Import goods into warehouse."""
        unit_size = data.get("unit_size")
        unit_size_type = data.get("unit_size_type", 'kg')
        product_id = data["product_id"]

        # Nếu nhập bằng bao và có unit_size, tính quantity từ unit_size
        if unit_size_type == 'bag' and unit_size and unit_size > 0:
            quantity_kg = await self._convert_to_kg(product_id, 0, unit_size, unit_size_type)
        else:
            quantity_kg = await self._convert_to_kg(
                product_id, abs(data.get("quantity") or 0), unit_size or abs(data.get("quantity") or 0), unit_size_type
            )

        # Create transaction
        # unit_size must be stored as string since the column is VARCHAR
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, supplier, unit_price, batch_number,
             expiry_date, notes, created_by, unit_size, unit_size_type)
            VALUES ($1, $2, 'import', $3, 'purchase', $4, $5, $6, $7, $8, $9, $10, $11)""",
            data["warehouse_id"], data["product_id"], quantity_kg,
            data.get("supplier"), data.get("unit_price"),
            data.get("batch_number"), data.get("expiry_date"),
            data.get("notes"), data.get("created_by"),
            str(unit_size) if unit_size is not None else None, unit_size_type,
        )

        # Update inventory
        await db.execute(
            """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
            data["warehouse_id"], data["product_id"], quantity_kg,
        )

        # Queue sync to cloud
        payload = {
            "warehouse_id": data["warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "import",
            "quantity": quantity_kg,
            "unit_size": unit_size,
            "unit_size_type": unit_size_type,
            "supplier": data.get("supplier"),
            "unit_price": data.get("unit_price"),
            "batch_number": data.get("batch_number"),
            "expiry_date": data.get("expiry_date"),
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"{data['warehouse_id']}-{data['product_id']}-{quantity_kg}", "import", payload)

        return {"ok": True, "warehouse_id": data["warehouse_id"],
                "product_id": data["product_id"], "imported": quantity_kg, "bags": unit_size if unit_size_type == 'bag' else None}

    # ── Export (Xuất kho) ─────────────────────────────

    async def export_stock(self, data: dict) -> dict:
        """Export goods from warehouse. Returns error if insufficient stock."""
        unit_size = data.get("unit_size")
        unit_size_type = data.get("unit_size_type", 'kg')
        product_id = data["product_id"]

        # Nếu xuất bằng bao và có unit_size, tính quantity từ unit_size
        if unit_size_type == 'bag' and unit_size and unit_size > 0:
            quantity_kg = await self._convert_to_kg(product_id, 0, unit_size, unit_size_type)
        else:
            quantity_kg = await self._convert_to_kg(
                product_id, abs(data.get("quantity") or 0), unit_size or abs(data.get("quantity") or 0), unit_size_type
            )

        # Check stock
        current = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            data["warehouse_id"], data["product_id"],
        )
        if current is None or current < quantity_kg:
            return {"ok": False, "message": f"Không đủ tồn kho (hiện có: {current or 0} kg)"}

        # Create transaction
        # unit_size must be stored as string since the column is VARCHAR
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, reference_id, notes, created_by, unit_size, unit_size_type)
            VALUES ($1, $2, 'export', $3, $4, $5, $6, $7, $8, $9)""",
            data["warehouse_id"], data["product_id"], -quantity_kg,
            data.get("reference_type", "manual"), data.get("reference_id"),
            data.get("notes"), data.get("created_by"),
            str(unit_size) if unit_size is not None else None, unit_size_type,
        )

        # Update inventory
        await db.execute(
            """UPDATE inventory SET quantity = quantity - $3, updated_at = NOW()
            WHERE warehouse_id = $1 AND product_id = $2""",
            data["warehouse_id"], data["product_id"], quantity_kg,
        )

        # Queue sync to cloud
        payload = {
            "warehouse_id": data["warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "export",
            "quantity": -quantity_kg,
            "unit_size": unit_size,
            "unit_size_type": unit_size_type,
            "reference_type": data.get("reference_type", "manual"),
            "reference_id": data.get("reference_id"),
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"{data['warehouse_id']}-{data['product_id']}-{-quantity_kg}", "export", payload)

        return {"ok": True, "exported": quantity_kg, "bags": unit_size if unit_size_type == 'bag' else None}

    # ── Transfer (Chuyển kho) ─────────────────────────

    async def transfer_stock(self, data: dict) -> dict:
        """Transfer goods between warehouses."""
        unit_size = data.get("unit_size")
        unit_size_type = data.get("unit_size_type", 'kg')
        product_id = data["product_id"]

        # Nếu chuyển bằng bao và có unit_size, tính quantity từ unit_size
        if unit_size_type == 'bag' and unit_size and unit_size > 0:
            quantity_kg = await self._convert_to_kg(product_id, 0, unit_size, unit_size_type)
        else:
            quantity_kg = await self._convert_to_kg(
                product_id, abs(data.get("quantity") or 0), unit_size or abs(data.get("quantity") or 0), unit_size_type
            )

        # Check source stock
        current = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            data["from_warehouse_id"], data["product_id"],
        )
        if current is None or current < quantity_kg:
            return {"ok": False, "message": f"Không đủ tồn kho nguồn (hiện có: {current or 0} kg)"}

        # Export from source
        # unit_size must be stored as string since the column is VARCHAR
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, from_warehouse_id, notes, created_by, unit_size, unit_size_type)
            VALUES ($1, $2, 'export', $3, 'transfer', $4, $5, $6, $7, $8)""",
            data["from_warehouse_id"], data["product_id"], -quantity_kg,
            data["from_warehouse_id"], data.get("notes"), data.get("created_by"),
            str(unit_size) if unit_size is not None else None, unit_size_type,
        )
        await db.execute(
            "UPDATE inventory SET quantity = quantity - $3, updated_at = NOW() WHERE warehouse_id = $1 AND product_id = $2",
            data["from_warehouse_id"], data["product_id"], quantity_kg,
        )

        # Import to destination
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, from_warehouse_id, notes, created_by, unit_size, unit_size_type)
            VALUES ($1, $2, 'import', $3, 'transfer', $4, $5, $6, $7, $8)""",
            data["to_warehouse_id"], data["product_id"], quantity_kg,
            data["from_warehouse_id"], data.get("notes"), data.get("created_by"),
            str(unit_size) if unit_size is not None else None, unit_size_type,
        )
        await db.execute(
            """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
            data["to_warehouse_id"], data["product_id"], quantity_kg,
        )

        # Queue sync to cloud (2 transactions: export + import)
        export_payload = {
            "warehouse_id": data["from_warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "export",
            "quantity": -quantity_kg,
            "unit_size": unit_size,
            "unit_size_type": unit_size_type,
            "reference_type": "transfer",
            "from_warehouse_id": data["from_warehouse_id"],
            "notes": data.get("notes"),
        }
        import_payload = {
            "warehouse_id": data["to_warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "import",
            "quantity": quantity_kg,
            "unit_size": unit_size,
            "unit_size_type": unit_size_type,
            "reference_type": "transfer",
            "from_warehouse_id": data["from_warehouse_id"],
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"transfer-{data['from_warehouse_id']}-{data['product_id']}-{-quantity_kg}", "export", export_payload)
        await sync_service.queue_change("inventory_transactions", f"transfer-{data['to_warehouse_id']}-{data['product_id']}-{quantity_kg}", "import", import_payload)

        return {"ok": True, "transferred": quantity_kg, "bags": unit_size if unit_size_type == 'bag' else None}

        return {"ok": True, "transferred": quantity}

    # ── Transaction History ───────────────────────────

    async def get_transactions(self, warehouse_id: int = None,
                               product_id: int = None,
                               limit: int = 50) -> list[dict]:
        conditions = []
        params = []
        idx = 1

        if warehouse_id:
            conditions.append(f"t.warehouse_id = ${idx}")
            params.append(warehouse_id)
            idx += 1
        if product_id:
            conditions.append(f"t.product_id = ${idx}")
            params.append(product_id)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)

        rows = await db.fetch(
            f"""SELECT t.*, p.name as product_name, p.unit,
                       w.name as warehouse_name
            FROM inventory_transactions t
            JOIN products p ON t.product_id = p.id
            JOIN warehouses w ON t.warehouse_id = w.id
            {where}
            ORDER BY t.created_at DESC LIMIT ${idx}""",
            *params,
        )
        return [dict(r) for r in rows]

    # ── Barn Default Warehouses ─────────────────────────────────────────

    async def set_default_warehouse(self, barn_id: str, warehouse_type: str, warehouse_id: int) -> dict:
        """Set the default warehouse for a barn + warehouse_type combination.

        Business rules:
        - warehouse_type must be 'feed' or 'medication'
        - warehouse must be active
        - warehouse_type must match the warehouse's warehouse_type
        """
        if warehouse_type not in ("feed", "medication"):
            return {"ok": False, "message": "warehouse_type must be 'feed' or 'medication'"}

        # Validate warehouse exists and is active
        warehouse = await self.get_warehouse(warehouse_id)
        if not warehouse:
            return {"ok": False, "message": "Warehouse not found"}
        if not warehouse.get("active"):
            return {"ok": False, "message": "Warehouse is not active"}
        if warehouse.get("warehouse_type") not in (warehouse_type, "mixed"):
            return {"ok": False, "message": f"Warehouse type '{warehouse['warehouse_type']}' does not match '{warehouse_type}'"}

        # Validate barn exists
        barn = await db.fetchval("SELECT 1 FROM barns WHERE id = $1", barn_id)
        if not barn:
            return {"ok": False, "message": "Barn not found"}

        row = await db.fetchrow(
            """INSERT INTO barn_default_warehouses (barn_id, warehouse_type, warehouse_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (barn_id, warehouse_type) DO UPDATE SET
                warehouse_id = $3, updated_at = NOW()
            RETURNING *""",
            barn_id, warehouse_type, warehouse_id,
        )
        return {"ok": True, "default_warehouse": dict(row)}

    async def get_default_warehouse(self, barn_id: str, warehouse_type: str) -> Optional[dict]:
        """Get the default warehouse for a barn + warehouse_type."""
        row = await db.fetchrow(
            """SELECT bdw.*, w.name as warehouse_name, w.warehouse_type, w.code as warehouse_code
            FROM barn_default_warehouses bdw
            JOIN warehouses w ON bdw.warehouse_id = w.id
            WHERE bdw.barn_id = $1 AND bdw.warehouse_type = $2""",
            barn_id, warehouse_type,
        )
        return dict(row) if row else None

    async def list_default_warehouses(self, barn_id: str = None) -> list[dict]:
        """List all barn default warehouse assignments."""
        query = """
            SELECT bdw.*, w.name as warehouse_name, w.warehouse_type,
                   w.code as warehouse_code, b.name as barn_name
            FROM barn_default_warehouses bdw
            JOIN warehouses w ON bdw.warehouse_id = w.id
            JOIN barns b ON bdw.barn_id = b.id
        """
        params = []
        if barn_id:
            query += " WHERE bdw.barn_id = $1"
            params.append(barn_id)
        query += " ORDER BY bdw.barn_id, bdw.warehouse_type"

        rows = await db.fetch(query, *params)
        return [dict(r) for r in rows]

    async def delete_default_warehouse(self, barn_id: str, warehouse_type: str) -> dict:
        """Remove a default warehouse assignment."""
        await db.execute(
            "DELETE FROM barn_default_warehouses WHERE barn_id = $1 AND warehouse_type = $2",
            barn_id, warehouse_type,
        )
        return {"ok": True, "message": "Default warehouse removed"}

    # ── Inventory Alerts ────────────────────────────────────────────────

    async def check_low_stock_alerts(self, warehouse_id: int = None, barn_id: str = None) -> list[dict]:
        """Check inventory against min_stock_alert threshold and create/update alerts.

        Uses inventory_alert_rules for threshold overrides when available.
        Returns list of affected inventory items with their alert status.
        """
        # Build query to get inventory with rule overrides
        conditions = ["i.quantity > 0"]
        params = []
        idx = 1

        if warehouse_id:
            conditions.append(f"i.warehouse_id = ${idx}")
            params.append(warehouse_id)
            idx += 1

        # Get inventory items that may need alerts
        # Include items where quantity <= product.min_stock_alert OR quantity <= rule.threshold
        rows = await db.fetch(
            f"""SELECT DISTINCT ON (i.id)
                      i.id as inventory_id, i.warehouse_id, i.product_id,
                      i.quantity,
                      p.name as product_name, p.min_stock_alert, p.unit,
                      w.name as warehouse_name, w.warehouse_type, w.barn_id,
                      r.threshold as rule_threshold,
                      r.severity as rule_severity,
                      r.enabled as rule_enabled,
                      r.frequency_minutes
               FROM inventory i
               JOIN products p ON i.product_id = p.id
               JOIN warehouses w ON i.warehouse_id = w.id
               LEFT JOIN inventory_alert_rules r ON
                   (r.warehouse_id = i.warehouse_id OR r.warehouse_id IS NULL)
                   AND (r.product_id = i.product_id OR r.product_id IS NULL)
                   AND r.alert_type = 'low_stock'
                   AND r.enabled = TRUE
               WHERE ({' AND '.join(conditions)})
                 AND (
                     -- Check against rule threshold if exists
                     (r.threshold IS NOT NULL AND i.quantity <= r.threshold)
                     -- OR check against product min_stock_alert
                     OR (r.threshold IS NULL AND p.min_stock_alert > 0 AND i.quantity <= p.min_stock_alert)
                 )
               ORDER BY i.id""",
            *params,
        )

        triggered_alerts = []
        for row in rows:
            inventory_id = row["inventory_id"]
            current_qty = float(row["quantity"] or 0)

            # Use rule threshold if available, otherwise product min_stock_alert
            rule_threshold = row.get("rule_threshold")
            threshold = float(rule_threshold if rule_threshold is not None else (row["min_stock_alert"] or 0))

            if threshold <= 0:
                continue  # No threshold configured, skip

            # Use rule severity if available, otherwise calculate
            rule_severity = row.get("rule_severity")

            if current_qty == 0:
                severity = rule_severity or "critical"
                alert_type = "out_of_stock"
            elif current_qty <= threshold * 0.5:
                severity = rule_severity or "critical"
                alert_type = "low_stock"
            elif current_qty <= threshold:
                severity = rule_severity or "warning"
                alert_type = "low_stock"
            else:
                severity = "info"
                alert_type = "low_stock"

            # Upsert alert (only if not soft-deleted)
            message = f"{row['product_name']} in {row['warehouse_name']}: {current_qty} {row.get('unit', 'units')} remaining (threshold: {threshold})"

            alert_row = await db.fetchrow(
                """INSERT INTO inventory_alerts
                (warehouse_id, product_id, alert_type, severity, message,
                 current_quantity, threshold_value, acknowledged)
                VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
                ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
                    alert_type = $3, severity = $4, message = $5,
                    current_quantity = $6, threshold_value = $7,
                    acknowledged = FALSE, resolved_at = NULL, deleted_at = NULL, is_enabled = TRUE
                RETURNING *""",
                row["warehouse_id"], row["product_id"],
                alert_type, severity, message, current_qty, threshold,
            )
            triggered_alerts.append({
                "id": alert_row["id"],
                "inventory_id": inventory_id,
                "warehouse_id": row["warehouse_id"],
                "product_id": row["product_id"],
                "product_name": row["product_name"],
                "warehouse_name": row["warehouse_name"],
                "quantity": current_qty,
                "threshold": threshold,
                "alert_type": alert_type,
                "severity": severity,
                "rule_threshold": rule_threshold,
            })

        return triggered_alerts

    async def get_active_alerts(self, warehouse_id: int = None,
                                alert_type: str = None,
                                unacknowledged_only: bool = True) -> list[dict]:
        """Get current inventory alerts."""
        conditions = ["1=1"]
        params = []
        idx = 1

        if warehouse_id:
            conditions.append(f"ia.warehouse_id = ${idx}")
            params.append(warehouse_id)
            idx += 1
        if alert_type:
            conditions.append(f"ia.alert_type = ${idx}")
            params.append(alert_type)
            idx += 1
        if unacknowledged_only:
            conditions.append("ia.acknowledged = FALSE")

        where = f"WHERE {' AND '.join(conditions)}"
        rows = await db.fetch(
            f"""SELECT ia.*, p.name as product_name, w.name as warehouse_name,
                       w.warehouse_type, w.code as warehouse_code
                FROM inventory_alerts ia
                JOIN products p ON ia.product_id = p.id
                JOIN warehouses w ON ia.warehouse_id = w.id
                {where}
                ORDER BY
                    CASE ia.severity
                        WHEN 'critical' THEN 1
                        WHEN 'warning' THEN 2
                        ELSE 3
                    END,
                    ia.created_at DESC""",
            *params,
        )
        return [dict(r) for r in rows]

    async def acknowledge_alert(self, alert_id: int, acknowledged_by: str = None) -> dict:
        """Acknowledge an inventory alert."""
        row = await db.fetchrow(
            """UPDATE inventory_alerts
            SET acknowledged = TRUE, acknowledged_by = $1, acknowledged_at = NOW()
            WHERE id = $2 RETURNING *""",
            acknowledged_by, alert_id,
        )
        if not row:
            return {"ok": False, "message": "Alert not found"}
        return {"ok": True, "alert": dict(row)}

    async def resolve_alert(self, alert_id: int) -> dict:
        """Mark an alert as resolved (acknowledged + resolved_at set)."""
        row = await db.fetchrow(
            """UPDATE inventory_alerts
            SET acknowledged = TRUE, resolved_at = NOW()
            WHERE id = $1 RETURNING *""",
            alert_id,
        )
        if not row:
            return {"ok": False, "message": "Alert not found"}
        return {"ok": True, "alert": dict(row)}

    async def delete_alert(self, alert_id: int) -> dict:
        """Soft-delete an alert (set deleted_at)."""
        row = await db.fetchrow(
            """UPDATE inventory_alerts
            SET deleted_at = NOW(), is_enabled = FALSE
            WHERE id = $1 RETURNING *""",
            alert_id,
        )
        if not row:
            return {"ok": False, "message": "Alert not found"}
        return {"ok": True, "alert": dict(row)}

    # ── Inventory Alert Rules ─────────────────────────────────────────

    async def list_alert_rules(self, warehouse_id: int = None,
                               product_id: int = None,
                               barn_id: str = None,
                               enabled: bool = None) -> list[dict]:
        """List inventory alert rules with optional filters."""
        conditions = ["1=1"]
        params = []
        idx = 1

        if warehouse_id is not None:
            conditions.append(f"(warehouse_id = ${idx} OR warehouse_id IS NULL)")
            params.append(warehouse_id)
            idx += 1
        if product_id is not None:
            conditions.append(f"(product_id = ${idx} OR product_id IS NULL)")
            params.append(product_id)
            idx += 1
        if barn_id is not None:
            conditions.append(f"(barn_id = ${idx} OR barn_id IS NULL)")
            params.append(barn_id)
            idx += 1
        if enabled is not None:
            conditions.append(f"enabled = ${idx}")
            params.append(enabled)
            idx += 1

        where = f"WHERE {' AND '.join(conditions)}"
        rows = await db.fetch(
            f"""SELECT r.*,
                       w.name as warehouse_name, w.code as warehouse_code,
                       p.name as product_name, p.code as product_code,
                       b.name as barn_name
                FROM inventory_alert_rules r
                LEFT JOIN warehouses w ON r.warehouse_id = w.id
                LEFT JOIN products p ON r.product_id = p.id
                LEFT JOIN barns b ON r.barn_id = b.id
                {where}
                ORDER BY r.enabled DESC, r.alert_type, r.created_at DESC""",
            *params,
        )
        return [dict(r) for r in rows]

    async def get_alert_rule(self, rule_id: int) -> Optional[dict]:
        """Get a single alert rule by ID."""
        row = await db.fetchrow(
            """SELECT r.*,
                      w.name as warehouse_name,
                      p.name as product_name,
                      b.name as barn_name
               FROM inventory_alert_rules r
               LEFT JOIN warehouses w ON r.warehouse_id = w.id
               LEFT JOIN products p ON r.product_id = p.id
               LEFT JOIN barns b ON r.barn_id = b.id
               WHERE r.id = $1""",
            rule_id,
        )
        return dict(row) if row else None

    async def create_alert_rule(self, data: dict) -> dict:
        """Create an inventory alert rule.

        Business rules:
        - warehouse_id and product_id are REQUIRED
        - warehouse_id + product_id + alert_type must be unique
        - threshold can be null (will use product.min_stock_alert)
        """
        # Validate warehouse_id is required
        if not data.get("warehouse_id"):
            return {"ok": False, "message": "Warehouse is required"}

        # Validate product_id is required
        if not data.get("product_id"):
            return {"ok": False, "message": "Product is required"}

        # Validate warehouse exists
        wh = await db.fetchrow("SELECT id FROM warehouses WHERE id = $1", data["warehouse_id"])
        if not wh:
            return {"ok": False, "message": "Warehouse not found"}

        # Validate product exists
        prod = await db.fetchrow("SELECT id FROM products WHERE id = $1", data["product_id"])
        if not prod:
            return {"ok": False, "message": "Product not found"}

        try:
            row = await db.fetchrow(
                """INSERT INTO inventory_alert_rules
                (warehouse_id, product_id, alert_type, threshold, frequency_minutes, enabled, severity, barn_id, note)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *""",
                data.get("warehouse_id"),
                data.get("product_id"),
                data.get("alert_type", "low_stock"),
                data.get("threshold"),
                data.get("frequency_minutes", 60),
                data.get("enabled", True),
                data.get("severity", "warning"),
                data.get("barn_id"),
                data.get("note"),
            )
            return {"ok": True, "rule": dict(row)}
        except Exception as e:
            if "unique" in str(e).lower():
                return {"ok": False, "message": "Rule already exists for this warehouse+product+alert_type combination"}
            return {"ok": False, "message": str(e)}

    async def update_alert_rule(self, rule_id: int, data: dict) -> dict:
        """Update an inventory alert rule."""
        # Get existing rule
        existing = await db.fetchrow("SELECT * FROM inventory_alert_rules WHERE id = $1", rule_id)
        if not existing:
            return {"ok": False, "message": "Rule not found"}

        # Validate warehouse_id cannot be null/empty if provided
        if "warehouse_id" in data and (data["warehouse_id"] is None or data["warehouse_id"] == ""):
            return {"ok": False, "message": "Warehouse cannot be empty"}

        # Validate product_id cannot be null/empty if provided
        if "product_id" in data and (data["product_id"] is None or data["product_id"] == ""):
            return {"ok": False, "message": "Product cannot be empty"}

        # Validate warehouse exists if changing
        if "warehouse_id" in data and data["warehouse_id"]:
            wh = await db.fetchrow("SELECT id FROM warehouses WHERE id = $1", data["warehouse_id"])
            if not wh:
                return {"ok": False, "message": "Warehouse not found"}

        # Validate product exists if changing
        if "product_id" in data and data["product_id"]:
            prod = await db.fetchrow("SELECT id FROM products WHERE id = $1", data["product_id"])
            if not prod:
                return {"ok": False, "message": "Product not found"}

        # Build update query dynamically
        update_fields = []
        params = []
        idx = 1

        for field in ["warehouse_id", "product_id", "alert_type", "threshold",
                      "frequency_minutes", "enabled", "severity", "barn_id", "note"]:
            if field in data:
                update_fields.append(f"{field} = ${idx}")
                params.append(data[field])
                idx += 1

        if not update_fields:
            return {"ok": False, "message": "No fields to update"}

        update_fields.append(f"updated_at = NOW()")
        params.append(rule_id)

        query = f"""UPDATE inventory_alert_rules
                    SET {', '.join(update_fields)}
                    WHERE id = ${idx}
                    RETURNING *"""

        try:
            row = await db.fetchrow(query, *params)
            return {"ok": True, "rule": dict(row)}
        except Exception as e:
            if "unique" in str(e).lower():
                return {"ok": False, "message": "Rule already exists for this warehouse+product+alert_type combination"}
            return {"ok": False, "message": str(e)}

    async def delete_alert_rule(self, rule_id: int) -> dict:
        """Delete an inventory alert rule."""
        row = await db.fetchrow(
            "DELETE FROM inventory_alert_rules WHERE id = $1 RETURNING id",
            rule_id,
        )
        if not row:
            return {"ok": False, "message": "Rule not found"}
        return {"ok": True, "message": "Rule deleted"}

    async def toggle_alert_rule(self, rule_id: int, enabled: bool) -> dict:
        """Enable or disable an alert rule."""
        row = await db.fetchrow(
            """UPDATE inventory_alert_rules
            SET enabled = $1, updated_at = NOW()
            WHERE id = $2 RETURNING *""",
            enabled, rule_id,
        )
        if not row:
            return {"ok": False, "message": "Rule not found"}
        return {"ok": True, "rule": dict(row)}


inventory_service = InventoryService()
