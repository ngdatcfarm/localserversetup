-- ============================================
-- Add Care Litters Table
-- Date: 2026-04-04
-- Purpose: Create care_litters table for litter management tracking
-- ============================================

CREATE TABLE IF NOT EXISTS care_litters (
    id BIGSERIAL PRIMARY KEY,
    cycle_id INTEGER NOT NULL,
    barn_id VARCHAR(50),
    litter_date DATE NOT NULL,
    litter_type VARCHAR(20) NOT NULL,
    product_id INTEGER,
    quantity_kg DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK constraints
DO $$ BEGIN
    ALTER TABLE care_litters ADD CONSTRAINT fk_care_litters_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_litters ADD CONSTRAINT fk_care_litters_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_care_litters_cycle ON care_litters (cycle_id);
CREATE INDEX IF NOT EXISTS idx_care_litters_barn ON care_litters (barn_id);
CREATE INDEX IF NOT EXISTS idx_care_litters_date ON care_litters (litter_date);

DO $$ BEGIN
    RAISE NOTICE '=== Script 020: care_litters table created successfully ===';
END $$;
