-- ============================================
-- Expand Suppliers Table
-- Date: 2026-04-04
-- Purpose: Add missing columns to suppliers table to match cloud MySQL schema
-- ============================================

-- Add code (VARCHAR(50) UNIQUE in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;

-- Add contact_name (VARCHAR(100) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100);

-- Add email (VARCHAR(100) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email VARCHAR(100);

-- Add city (VARCHAR(100) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100);

-- Add tax_id (VARCHAR(50) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);

-- Add bank_name (VARCHAR(100) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- Add bank_account (VARCHAR(50) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50);

-- Add bank_account_holder (VARCHAR(200) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(200);

-- Add categories (JSON in cloud - ARRAY[feed, medication, equipment])
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS categories JSONB;

-- Add lead_time_days (INT DEFAULT 7 in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 7;

-- Add payment_terms (VARCHAR(50) in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);

-- Add updated_at (TIMESTAMP in cloud)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers (code);
CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers (city);

DO $$ BEGIN
    RAISE NOTICE '=== Script 025: suppliers table expanded successfully ===';
END $$;
