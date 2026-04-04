-- ============================================
-- Add Barn CAPEX Columns
-- Date: 2026-04-04
-- Purpose: Add land_cost, construction_cost, equipment_cost, other_cost to barns
-- ============================================

ALTER TABLE barns ADD COLUMN IF NOT EXISTS land_cost DECIMAL(15,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS construction_cost DECIMAL(15,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS equipment_cost DECIMAL(15,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS other_cost DECIMAL(15,2);

DO $$ BEGIN
    RAISE NOTICE '=== Script 014: barns CAPEX columns added successfully ===';
END $$;
