-- ============================================
-- Add Product FK to Vaccine Programs
-- Date: 2026-04-04
-- Purpose: Add product_id FK to vaccine_programs
-- ============================================

-- vaccine_programs: add product_id FK
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS product_id INTEGER;

DO $$ BEGIN
    ALTER TABLE vaccine_programs ADD CONSTRAINT fk_vaccine_programs_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Also add missing columns that cloud MySQL has
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE;
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS bird_type VARCHAR(50);
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE vaccine_programs ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_vaccine_programs_product ON vaccine_programs (product_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_programs_code ON vaccine_programs (code);

DO $$ BEGIN
    RAISE NOTICE '=== Script 027: product_id FK added to vaccine_programs ===';
END $$;
