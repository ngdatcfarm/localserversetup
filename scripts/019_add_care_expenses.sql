-- ============================================
-- Expand Care Expenses Table
-- Date: 2026-04-04
-- Purpose: Add expense_date, expense_type, description columns to care_expenses
--          to match cloud MySQL schema and sync handler expectations
-- ============================================

-- Add expense_date column (cloud MySQL uses DATE NOT NULL)
ALTER TABLE care_expenses ADD COLUMN IF NOT EXISTS expense_date DATE;

-- Add expense_type column (cloud MySQL uses ENUM: feed, medication, labor, utility, other)
ALTER TABLE care_expenses ADD COLUMN IF NOT EXISTS expense_type VARCHAR(20);

-- Add description column (cloud MySQL uses TEXT)
ALTER TABLE care_expenses ADD COLUMN IF NOT EXISTS description TEXT;

-- Add barn_id if not exists (local might not have it)
ALTER TABLE care_expenses ADD COLUMN IF NOT EXISTS barn_id VARCHAR(50);

-- Add FK constraint for barn_id
DO $$ BEGIN
    ALTER TABLE care_expenses ADD CONSTRAINT fk_care_expenses_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Backfill expense_date from recorded_at where NULL
UPDATE care_expenses SET expense_date = recorded_at::date WHERE expense_date IS NULL AND recorded_at IS NOT NULL;

-- Backfill expense_type from category where NULL
UPDATE care_expenses SET expense_type = category WHERE expense_type IS NULL AND category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_care_expenses_cycle ON care_expenses (cycle_id);
CREATE INDEX IF NOT EXISTS idx_care_expenses_barn ON care_expenses (barn_id);
CREATE INDEX IF NOT EXISTS idx_care_expenses_date ON care_expenses (expense_date);

DO $$ BEGIN
    RAISE NOTICE '=== Script 019: care_expenses expanded successfully ===';
END $$;
