-- 056: Care schema gaps — water_logs table + health_notes columns
-- Idempotent: uses IF NOT EXISTS / EXCEPTION blocks

-- care_water_logs: create table if not exists
CREATE TABLE IF NOT EXISTS care_water_logs (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50),
    water_date DATE,
    shift VARCHAR(20) DEFAULT 'all_day',
    consumption_liters DECIMAL,
    medicated BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- health_notes: add barn_id if missing
DO $$ BEGIN
    ALTER TABLE health_notes ADD COLUMN barn_id VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- health_notes: add health_flags if missing
DO $$ BEGIN
    ALTER TABLE health_notes ADD COLUMN health_flags JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
