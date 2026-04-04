-- ============================================
-- Add Barn Dimensions - capacity_kg column
-- Date: 2026-04-04
-- Purpose: Add capacity_kg column to barns table
-- ============================================
-- Note: length_m, width_m, height_m already exist in local barns table

ALTER TABLE barns ADD COLUMN IF NOT EXISTS capacity_kg NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_barns_capacity_kg ON barns (capacity_kg);

DO $$ BEGIN
    RAISE NOTICE '=== Script 013: barns.capacity_kg added successfully ===';
END $$;
