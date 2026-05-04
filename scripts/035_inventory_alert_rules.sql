-- ============================================
-- Script 035: Inventory Alert Rules
-- Date: 2026-04-08
-- Purpose:
--   1. Add inventory_alert_rules table for configurable alert thresholds/frequency
--   2. Add is_enabled column to inventory_alerts for soft-delete/disable
-- ============================================

BEGIN;

-- ── 1. inventory_alert_rules ──────────────────────────────────────────────────
-- Configurable rules for inventory alerts per warehouse/product
CREATE TABLE IF NOT EXISTS inventory_alert_rules (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,

    -- Rule type: 'low_stock', 'out_of_stock', 'overstock'
    alert_type VARCHAR(30) NOT NULL DEFAULT 'low_stock',

    -- Threshold override (null = use product.min_stock_alert)
    threshold DECIMAL(10,2),

    -- Alert frequency in minutes (null = manual check only)
    frequency_minutes INT DEFAULT 60,

    -- Enable/disable this rule
    enabled BOOLEAN DEFAULT TRUE,

    -- Optional: severity override
    severity VARCHAR(20) DEFAULT 'warning',

    -- Which barn this rule applies to (nullable = all barns)
    barn_id VARCHAR(50) REFERENCES barns(id) ON DELETE CASCADE,

    note TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: one rule per warehouse+product+alert_type combination
    UNIQUE(warehouse_id, product_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_warehouse ON inventory_alert_rules(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_product ON inventory_alert_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_barn ON inventory_alert_rules(barn_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON inventory_alert_rules(enabled);

-- ── 2. Add is_enabled to inventory_alerts ─────────────────────────────────────
-- Allows disabling/hiding individual alerts without deleting
ALTER TABLE inventory_alerts ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;

-- Add deleted_at for soft delete
ALTER TABLE inventory_alerts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── 3. Sync triggers ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_inventory_alert_rules ON inventory_alert_rules;
CREATE TRIGGER trg_sync_inventory_alert_rules AFTER INSERT OR UPDATE OR DELETE ON inventory_alert_rules
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();

-- Update existing trigger to also handle is_enabled changes
DROP TRIGGER IF EXISTS trg_sync_inventory_alerts ON inventory_alerts;
CREATE TRIGGER trg_sync_inventory_alerts AFTER INSERT OR UPDATE OR DELETE ON inventory_alerts
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();

COMMIT;

DO $$ BEGIN
    RAISE NOTICE '=== Script 035: inventory_alert_rules + is_enabled ===';
END $$;
