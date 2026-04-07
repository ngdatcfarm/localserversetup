-- Script 032: Fix warehouses schema for farm_id and is_central columns
-- Date: 2026-04-07
-- Purpose: Add missing columns that are expected by inventory_service.py

BEGIN;

-- Add farm_id column if not exists
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS farm_id VARCHAR(50) DEFAULT 'farm-01';

-- Add is_central column if not exists
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_central BOOLEAN DEFAULT false;

-- Add address column if not exists
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS address TEXT;

-- Add length_m, width_m, height_m for warehouse dimensions
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS length_m DECIMAL(10,2);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS width_m DECIMAL(10,2);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS height_m DECIMAL(10,2);

-- Add capacity_kg
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS capacity_kg DECIMAL(12,2);

-- Add status column
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Set is_central = true where barn_id is null (existing central warehouses)
UPDATE warehouses SET is_central = true WHERE barn_id IS NULL;

-- Set farm_id = 'farm-01' where farm_id is null
UPDATE warehouses SET farm_id = 'farm-01' WHERE farm_id IS NULL;

COMMIT;

-- Verify
DO $$
BEGIN
    RAISE NOTICE '=== Warehouses Schema Update Complete ===';
    RAISE NOTICE 'Columns added: farm_id, is_central, address, length_m, width_m, height_m, capacity_kg, status';
END $$;
