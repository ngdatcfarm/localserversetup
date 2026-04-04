-- ============================================
-- Add Care Deaths and Medications Gap Columns
-- Date: 2026-04-04
-- Purpose: Add missing columns to care_deaths and care_medications tables
--          to match sync handler expectations
-- ============================================

-- === care_deaths gaps ===

-- Add image_path if not exists (cloud has VARCHAR(500))
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS image_path VARCHAR(500);

-- Add recorded_at if not exists (cloud uses TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- Add health_note_id if not exists (for linking to health_notes)
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS health_note_id INTEGER;

-- Ensure barn_id exists and add FK
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS barn_id VARCHAR(50);

DO $$ BEGIN
    ALTER TABLE care_deaths ADD CONSTRAINT fk_care_deaths_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_deaths ADD CONSTRAINT fk_care_deaths_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_care_deaths_barn ON care_deaths (barn_id);
CREATE INDEX IF NOT EXISTS idx_care_deaths_recorded ON care_deaths (recorded_at);

-- === care_medications gaps ===

-- Add recorded_at if not exists
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- Add warehouse_id if not exists
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS warehouse_id INTEGER;

-- Ensure barn_id exists and add FK
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS barn_id VARCHAR(50);

DO $$ BEGIN
    ALTER TABLE care_medications ADD CONSTRAINT fk_care_medications_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE care_medications ADD CONSTRAINT fk_care_medications_cycle
        FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_care_medications_barn ON care_medications (barn_id);
CREATE INDEX IF NOT EXISTS idx_care_medications_recorded ON care_medications (recorded_at);

DO $$ BEGIN
    RAISE NOTICE '=== Script 022: care_deaths and care_medications gaps filled ===';
END $$;
