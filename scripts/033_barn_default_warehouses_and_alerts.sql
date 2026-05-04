-- ============================================
-- Script 033: Barn Default Warehouses + Inventory Alerts
-- Date: 2026-04-07
-- Purpose:
--   1. Add barn_default_warehouses table for default warehouse per barn/type
--   2. Add inventory_alerts table for low stock tracking
-- ============================================

BEGIN;

-- ── 1. barn_default_warehouses ──────────────────────────────────────────────
-- Links a barn to its default feed/medication warehouses
CREATE TABLE IF NOT EXISTS barn_default_warehouses (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) NOT NULL REFERENCES barns(id) ON DELETE CASCADE,
    warehouse_type VARCHAR(20) NOT NULL,  -- 'feed' or 'medication'
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(barn_id, warehouse_type)
);

CREATE INDEX IF NOT EXISTS idx_barn_default_warehouses_barn
    ON barn_default_warehouses(barn_id);
CREATE INDEX IF NOT EXISTS idx_barn_default_warehouses_type
    ON barn_default_warehouses(warehouse_type);

-- ── 2. inventory_alerts ─────────────────────────────────────────────────────
-- Tracks low stock, out of stock, and expiry alerts for inventory items
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,

    alert_type VARCHAR(30) NOT NULL,  -- 'low_stock' | 'out_of_stock' | 'expiry_warning' | 'expiry_critical' | 'overstock' | 'damage'
    severity VARCHAR(20) NOT NULL,    -- 'info' | 'warning' | 'critical'

    message TEXT NOT NULL,
    current_quantity DECIMAL(10,2),
    threshold_value DECIMAL(10,2),

    suggested_action TEXT,
    suggested_order_quantity DECIMAL(10,2),

    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_alerts_warehouse
    ON inventory_alerts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product
    ON inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_type
    ON inventory_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_severity
    ON inventory_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_unack
    ON inventory_alerts(acknowledged) WHERE acknowledged = FALSE;

-- ── 3. Add sync trigger for barn_default_warehouses ─────────────────────────
DROP TRIGGER IF EXISTS trg_sync_barn_default_warehouses ON barn_default_warehouses;
CREATE TRIGGER trg_sync_barn_default_warehouses AFTER INSERT OR UPDATE OR DELETE ON barn_default_warehouses
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();

-- ── 4. Add sync trigger for inventory_alerts ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_inventory_alerts ON inventory_alerts;
CREATE TRIGGER trg_sync_inventory_alerts AFTER INSERT OR UPDATE OR DELETE ON inventory_alerts
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();

COMMIT;

DO $$ BEGIN
    RAISE NOTICE '=== Script 033: barn_default_warehouses + inventory_alerts ===';
END $$;
