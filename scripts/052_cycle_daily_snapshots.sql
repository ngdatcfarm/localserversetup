-- ================================================================
-- Cycle Daily Snapshots Table
-- Purpose: Aggregate daily data for ML training
-- Created: 2026-05-23
-- ================================================================

CREATE TABLE IF NOT EXISTS cycle_daily_snapshots (
    id SERIAL PRIMARY KEY,
    cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,

    -- Cycle context
    day_age INTEGER DEFAULT 0,
    stage VARCHAR(50),

    -- Bird counts
    initial_count INTEGER NOT NULL DEFAULT 0,
    current_count INTEGER NOT NULL DEFAULT 0,
    deaths_today INTEGER DEFAULT 0,
    mortality_rate_pct DECIMAL(5,2) DEFAULT 0,

    -- JSONB data fields
    sensor_data JSONB DEFAULT '{}',
    care_data JSONB DEFAULT '{}',
    weight_data JSONB DEFAULT '{}',
    environment_data JSONB DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint: one snapshot per cycle per day
    CONSTRAINT cycle_snapshot_unique UNIQUE (cycle_id, snapshot_date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_snapshots_cycle_id ON cycle_daily_snapshots(cycle_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON cycle_daily_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_cycle_date ON cycle_daily_snapshots(cycle_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_day_age ON cycle_daily_snapshots(day_age);

-- Comments
COMMENT ON TABLE cycle_daily_snapshots IS 'Daily aggregated snapshots for each cycle - used for ML training and historical analysis';
COMMENT ON COLUMN cycle_daily_snapshots.sensor_data IS '{"temperature": {"avg": 28.5, "min": 26, "max": 31, "std": 1.2}, "humidity": {...}, "mq137_raw": {...}}';
COMMENT ON COLUMN cycle_daily_snapshots.care_data IS '{"feed_kg": 125.5, "medication_count": 2, "water_liters": 80, "sales_count": 0}';
COMMENT ON COLUMN cycle_daily_snapshots.weight_data IS '{"avg_weight_g": 450, "sample_count": 50, "uniformity_pct": 85}';
COMMENT ON COLUMN cycle_daily_snapshots.metadata IS '{"schema_version": "1.0", "breed": "Gà Hồ"}';