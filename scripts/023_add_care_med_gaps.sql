-- ============================================
-- Add Care Medications Additional Gaps
-- Date: 2026-04-04
-- Purpose: Add additional FK constraints and columns for care_medications
--          and other care tables that may need sync
-- ============================================

-- Ensure care_medications has medication_id FK to medications table
DO $$ BEGIN
    ALTER TABLE care_medications ADD CONSTRAINT fk_care_medications_medication
        FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Ensure care_medications has product_id FK to products table
DO $$ BEGIN
    ALTER TABLE care_medications ADD CONSTRAINT fk_care_medications_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- care_sales: ensure proper columns and FKs exist
-- Check if gender column exists (cloud has gender column)
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(8,2);
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS price_per_kg DECIMAL(10,2);
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE care_sales ADD CONSTRAINT fk_care_sales_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_sales ADD CONSTRAINT fk_care_sales_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_care_sales_cycle ON care_sales (cycle_id);
CREATE INDEX IF NOT EXISTS idx_care_sales_recorded ON care_sales (recorded_at);

-- care_feeds: ensure proper columns and FKs exist
DO $$ BEGIN
    ALTER TABLE care_feeds ADD CONSTRAINT fk_care_feeds_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_feeds ADD CONSTRAINT fk_care_feeds_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_feeds ADD CONSTRAINT fk_care_feeds_feed_type
        FOREIGN KEY (feed_type_id) REFERENCES feed_types(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 023: care_medications and care tables gaps filled ===';
END $$;
