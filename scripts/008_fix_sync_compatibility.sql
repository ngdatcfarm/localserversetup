-- ============================================
-- 008: Fix sync compatibility between local and cloud
-- Fixes: barns id type, cycles column names, missing updated_at columns
-- Run: psql -U postgres -d cfarm_local -f scripts/008_fix_sync_compatibility.sql
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- A) Add updated_at to barns (needed for cloud sync tracking)
-- ============================================
ALTER TABLE barns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- B) Add updated_at to cycles (needed for cloud sync tracking)
-- ============================================
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- C) Ensure cycles has all cloud-compatible columns
--    Cloud uses initial_quantity/current_quantity,
--    local uses initial_count/current_count.
--    Keep both for compatibility.
-- ============================================
-- These were already added in 005, but ensure they exist:
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS parent_cycle_id INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS split_date DATE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS flock_source VARCHAR(100);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS male_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS female_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS stage VARCHAR(20) DEFAULT 'chick';
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS vaccine_program_id INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS final_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_sold_weight_kg DOUBLE PRECISION;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_revenue DOUBLE PRECISION;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS close_reason TEXT;

-- ============================================
-- D) Ensure care_feeds has sync-compatible columns
-- ============================================
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS feed_type_id INT;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS bags DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS kg_actual DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS remaining_pct DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS session VARCHAR(20);
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- E) Ensure care_deaths has sync-compatible columns
-- ============================================
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS reason VARCHAR(200);
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS death_category VARCHAR(50);
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- F) Ensure care_medications has sync-compatible columns
-- ============================================
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS medication_id INT;
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS medication_name VARCHAR(200);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS dosage DOUBLE PRECISION;
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- G) Ensure care_sales has sync-compatible columns
-- ============================================
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS weight_kg DOUBLE PRECISION;
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS price_per_kg DOUBLE PRECISION;
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- H) Ensure cycle_splits table exists
-- ============================================
CREATE TABLE IF NOT EXISTS cycle_splits (
    id SERIAL PRIMARY KEY,
    from_cycle_id INT REFERENCES cycles(id),
    to_cycle_id INT REFERENCES cycles(id),
    quantity INT,
    split_date DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- I) Add updated_at trigger function for auto-update
-- ============================================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to barns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_barns_updated_at') THEN
        CREATE TRIGGER trg_barns_updated_at BEFORE UPDATE ON barns
            FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- Apply to cycles
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cycles_updated_at') THEN
        CREATE TRIGGER trg_cycles_updated_at BEFORE UPDATE ON cycles
            FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '=== Sync compatibility fixes applied! ==='; END $$;
