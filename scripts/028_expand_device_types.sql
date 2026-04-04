-- ============================================
-- Expand Device Types Table
-- Date: 2026-04-04
-- Purpose: Add missing columns to device_types to match cloud MySQL schema
-- ============================================

-- Add relay_count (cloud has INT)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS relay_count INTEGER DEFAULT 0;

-- Add config_template (cloud has JSON for config structure)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS config_template JSONB;

-- Add firmware_version (VARCHAR(50) in cloud)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(50);

-- Add firmware_url (VARCHAR(500) in cloud)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS firmware_url VARCHAR(500);

-- Add is_active if not exists (BOOLEAN DEFAULT TRUE in cloud)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add total_channels if not exists (cloud has INT)
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS total_channels INTEGER DEFAULT 0;

-- Add device_class if not exists (cloud has VARCHAR(20))
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS device_class VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_device_types_code ON device_types (code);
CREATE INDEX IF NOT EXISTS idx_device_types_class ON device_types (device_class);

DO $$ BEGIN
    RAISE NOTICE '=== Script 028: device_types table expanded successfully ===';
END $$;
