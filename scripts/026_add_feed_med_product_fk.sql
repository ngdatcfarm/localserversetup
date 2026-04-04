-- ============================================
-- Add Product FK to Feed and Medication Tables
-- Date: 2026-04-04
-- Purpose: Add product_id FK to feed_brands, feed_types, medications
-- ============================================

-- feed_brands: add product_id FK
ALTER TABLE feed_brands ADD COLUMN IF NOT EXISTS product_id INTEGER;

DO $$ BEGIN
    ALTER TABLE feed_brands ADD CONSTRAINT fk_feed_brands_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_feed_brands_product ON feed_brands (product_id);

-- feed_types: add product_id FK
ALTER TABLE feed_types ADD COLUMN IF NOT EXISTS product_id INTEGER;

DO $$ BEGIN
    ALTER TABLE feed_types ADD CONSTRAINT fk_feed_types_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_feed_types_product ON feed_types (product_id);

-- medications: add product_id FK
ALTER TABLE medications ADD COLUMN IF NOT EXISTS product_id INTEGER;

DO $$ BEGIN
    ALTER TABLE medications ADD CONSTRAINT fk_medications_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_medications_product ON medications (product_id);

DO $$ BEGIN
    RAISE NOTICE '=== Script 026: product_id FKs added to feed_brands, feed_types, medications ===';
END $$;
