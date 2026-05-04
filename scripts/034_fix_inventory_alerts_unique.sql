-- ============================================
-- Script 034: Fix inventory_alerts unique constraint
-- Date: 2026-04-07
-- Purpose:
--   1. Add UNIQUE constraint on (warehouse_id, product_id) for ON CONFLICT upsert
-- ============================================

BEGIN;

-- Add unique constraint for upsert on warehouse_id + product_id
-- First drop existing alerts that might violate the constraint (keep latest)
DELETE FROM inventory_alerts a1
WHERE EXISTS (
    SELECT 1 FROM inventory_alerts a2
    WHERE a2.warehouse_id = a1.warehouse_id
      AND a2.product_id = a1.product_id
      AND a2.id < a1.id
);

-- Add unique constraint
ALTER TABLE inventory_alerts
ADD CONSTRAINT uq_inventory_alerts_warehouse_product
UNIQUE (warehouse_id, product_id);

COMMIT;

DO $$ BEGIN
    RAISE NOTICE '=== Script 034: Added unique constraint on inventory_alerts(warehouse_id, product_id) ===';
END $$;
