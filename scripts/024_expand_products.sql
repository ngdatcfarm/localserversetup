-- ============================================
-- Expand Products Table
-- Date: 2026-04-04
-- Purpose: Add missing columns to products table to match cloud MySQL schema
-- ============================================

-- Add supplier_id (FK to suppliers)
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER;

DO $$ BEGIN
    ALTER TABLE products ADD CONSTRAINT fk_products_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add price_per_unit (DECIMAL(12,2) in cloud)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_per_unit DECIMAL(12,2);

-- Add min_stock_alert (DECIMAL(12,2) in cloud)
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_alert DECIMAL(12,2) DEFAULT 0;

-- Add reorder_point (DECIMAL(12,2) in cloud)
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(12,2) DEFAULT 0;

-- Add barcode (VARCHAR(100) in cloud)
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);

-- Add updated_at (TIMESTAMP in cloud)
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Ensure product_type is correct (cloud uses ENUM: feed, medication, equipment, consumable)
-- Add if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_type ON products (product_type);

DO $$ BEGIN
    RAISE NOTICE '=== Script 024: products table expanded successfully ===';
END $$;
