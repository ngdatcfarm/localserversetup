-- 070_brooder_telemetry_columns.sql
-- Date: 2026-09-18
-- Purpose: Add 3 columns to sensor_data (analytics hook).
--          These are populated by brooder_service.py each tick so future
--          analytics can JOIN telemetry → profile → stage without needing
--          a second query. Nullable so legacy rows from before 070 still
--          fit cleanly.
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS on all three.

BEGIN;

ALTER TABLE sensor_data
    ADD COLUMN IF NOT EXISTS brooder_day_age    SMALLINT,
    ADD COLUMN IF NOT EXISTS brooder_stage_id   INTEGER,
    ADD COLUMN IF NOT EXISTS brooder_target_temp DOUBLE PRECISION;

-- Index on stage_id for analytics: "how often did setpoint cross X?"
CREATE INDEX IF NOT EXISTS idx_sensor_data_brooder_stage
    ON sensor_data(brooder_stage_id)
    WHERE brooder_stage_id IS NOT NULL;

DO $$ BEGIN
    RAISE NOTICE '=== Script 070: sensor_data brooder analytics columns added ===';
END $$;

COMMIT;