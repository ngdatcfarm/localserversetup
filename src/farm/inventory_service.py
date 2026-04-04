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
                "SELECT * FROM warehouse_zones WHERE warehouse_id = $1 ORDER BY name",
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

    async def import_stock(self, data: dict) -> dict:
        """Import goods into warehouse."""
        quantity = abs(data["quantity"])

        # Create transaction
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, supplier, unit_price, batch_number,
             expiry_date, notes, created_by)
            VALUES ($1, $2, 'import', $3, 'purchase', $4, $5, $6, $7, $8, $9)""",
            data["warehouse_id"], data["product_id"], quantity,
            data.get("supplier"), data.get("unit_price"),
            data.get("batch_number"), data.get("expiry_date"),
            data.get("notes"), data.get("created_by"),
        )

        # Update inventory
        await db.execute(
            """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
            data["warehouse_id"], data["product_id"], quantity,
        )

        # Queue sync to cloud
        payload = {
            "warehouse_id": data["warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "import",
            "quantity": quantity,
            "supplier": data.get("supplier"),
            "unit_price": data.get("unit_price"),
            "batch_number": data.get("batch_number"),
            "expiry_date": data.get("expiry_date"),
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"{data['warehouse_id']}-{data['product_id']}-{quantity}", "import", payload)

        return {"ok": True, "warehouse_id": data["warehouse_id"],
                "product_id": data["product_id"], "imported": quantity}

    # ── Export (Xuất kho) ─────────────────────────────

    async def export_stock(self, data: dict) -> dict:
        """Export goods from warehouse. Returns error if insufficient stock."""
        quantity = abs(data["quantity"])

        # Check stock
        current = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            data["warehouse_id"], data["product_id"],
        )
        if current is None or current < quantity:
            return {"ok": False, "message": f"Không đủ tồn kho (hiện có: {current or 0})"}

        # Create transaction
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, reference_id, notes, created_by)
            VALUES ($1, $2, 'export', $3, $4, $5, $6, $7)""",
            data["warehouse_id"], data["product_id"], -quantity,
            data.get("reference_type", "manual"), data.get("reference_id"),
            data.get("notes"), data.get("created_by"),
        )

        # Update inventory
        await db.execute(
            """UPDATE inventory SET quantity = quantity - $3, updated_at = NOW()
            WHERE warehouse_id = $1 AND product_id = $2""",
            data["warehouse_id"], data["product_id"], quantity,
        )

        # Queue sync to cloud
        payload = {
            "warehouse_id": data["warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "export",
            "quantity": -quantity,
            "reference_type": data.get("reference_type", "manual"),
            "reference_id": data.get("reference_id"),
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"{data['warehouse_id']}-{data['product_id']}-{-quantity}", "export", payload)

        return {"ok": True, "exported": quantity}

    # ── Transfer (Chuyển kho) ─────────────────────────

    async def transfer_stock(self, data: dict) -> dict:
        """Transfer goods between warehouses."""
        quantity = abs(data["quantity"])

        # Check source stock
        current = await db.fetchval(
            "SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2",
            data["from_warehouse_id"], data["product_id"],
        )
        if current is None or current < quantity:
            return {"ok": False, "message": f"Không đủ tồn kho nguồn (hiện có: {current or 0})"}

        # Export from source
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, from_warehouse_id, notes, created_by)
            VALUES ($1, $2, 'export', $3, 'transfer', $4, $5, $6)""",
            data["from_warehouse_id"], data["product_id"], -quantity,
            data["from_warehouse_id"], data.get("notes"), data.get("created_by"),
        )
        await db.execute(
            "UPDATE inventory SET quantity = quantity - $3, updated_at = NOW() WHERE warehouse_id = $1 AND product_id = $2",
            data["from_warehouse_id"], data["product_id"], quantity,
        )

        # Import to destination
        await db.execute(
            """INSERT INTO inventory_transactions
            (warehouse_id, product_id, transaction_type, quantity,
             reference_type, from_warehouse_id, notes, created_by)
            VALUES ($1, $2, 'import', $3, 'transfer', $4, $5, $6)""",
            data["to_warehouse_id"], data["product_id"], quantity,
            data["from_warehouse_id"], data.get("notes"), data.get("created_by"),
        )
        await db.execute(
            """INSERT INTO inventory (warehouse_id, product_id, quantity, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (warehouse_id, product_id)
            DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()""",
            data["to_warehouse_id"], data["product_id"], quantity,
        )

        # Queue sync to cloud (2 transactions: export + import)
        export_payload = {
            "warehouse_id": data["from_warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "export",
            "quantity": -quantity,
            "reference_type": "transfer",
            "from_warehouse_id": data["from_warehouse_id"],
            "notes": data.get("notes"),
        }
        import_payload = {
            "warehouse_id": data["to_warehouse_id"],
            "product_id": data["product_id"],
            "transaction_type": "import",
            "quantity": quantity,
            "reference_type": "transfer",
            "from_warehouse_id": data["from_warehouse_id"],
            "notes": data.get("notes"),
        }
        await sync_service.queue_change("inventory_transactions", f"transfer-{data['from_warehouse_id']}-{data['product_id']}-{-quantity}", "export", export_payload)
        await sync_service.queue_change("inventory_transactions", f"transfer-{data['to_warehouse_id']}-{data['product_id']}-{quantity}", "import", import_payload)

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


inventory_service = InventoryService()
