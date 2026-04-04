-- ============================================
-- Add Version Columns to Main Tables
-- Date: 2026-04-04
-- Purpose: Add version columns for optimistic locking on key tables
-- ============================================

-- Add version column to cycles
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to barns
ALTER TABLE barns ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to device_types
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to feed_brands
ALTER TABLE feed_brands ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE feed_brands ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to feed_types
ALTER TABLE feed_types ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE feed_types ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to medications
ALTER TABLE medications ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to equipment
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to sensors
ALTER TABLE sensors ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE sensors ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Add version column to vaccine_programs
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Create indexes for version columns
CREATE INDEX IF NOT EXISTS idx_cycles_version ON cycles (version);
CREATE INDEX IF NOT EXISTS idx_barns_version ON barns (version);
CREATE INDEX IF NOT EXISTS idx_products_version ON products (version);
CREATE INDEX IF NOT EXISTS idx_suppliers_version ON suppliers (version);
CREATE INDEX IF NOT EXISTS idx_devices_version ON devices (version);

DO $$ BEGIN
    RAISE NOTICE '=== Script 031: version columns added to main tables ===';
END $$;
