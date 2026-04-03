"""Inventory Service - Warehouse, products, import/export (Kho cám + thuốc)."""

from typing import Optional
from src.services.database.db import db
from src.sync.sync_service import sync_service


class InventoryService:

    # ── Warehouses ────────────────────────────────────

    async def list_warehouses(self, warehouse_type: str = None,
                              barn_id: str = None) -> list[dict]:
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

        where = f"WHERE {' AND '.join(conditions)}"
        rows = await db.fetch(
            f"SELECT * FROM warehouses {where} ORDER BY barn_id NULLS FIRST, name",
            *params,
        )
        return [dict(r) for r in rows]

    async def create_warehouse(self, data: dict) -> dict:
        row = await db.fetchrow(
            """INSERT INTO warehouses (code, name, warehouse_type, barn_id, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            data["code"], data["name"], data["warehouse_type"],
            data.get("barn_id"), data.get("description"),
        )
        return {"ok": True, "warehouse": dict(row)}

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
