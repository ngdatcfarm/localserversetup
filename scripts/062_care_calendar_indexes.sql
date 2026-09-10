-- 062_care_calendar_indexes.sql
-- Date: 2026-09-08
-- Purpose: Add composite indexes on (cycle_id, *_date) for the 4 care
--          tables queried by the new /api/farm/care/calendar endpoint.
--          Without these, the calendar heatmap query scans all rows of a
--          cycle on every page load (gets slow past ~120 days).
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS, safe to re-run.

BEGIN;

-- care_feeds: feed_date is the heatmap grouping key
CREATE INDEX IF NOT EXISTS care_feeds_cycle_date_idx
    ON care_feeds(cycle_id, feed_date);

-- care_medications: med_date + the has_mixed_med filter on method='feed'
CREATE INDEX IF NOT EXISTS care_meds_cycle_date_idx
    ON care_medications(cycle_id, med_date);

-- care_deaths: aggregated per death_date (death_count)
CREATE INDEX IF NOT EXISTS care_deaths_cycle_date_idx
    ON care_deaths(cycle_id, death_date);

-- care_water_logs: aggregated per water_date (sum consumption_liters)
CREATE INDEX IF NOT EXISTS care_water_cycle_date_idx
    ON care_water_logs(cycle_id, water_date);

COMMIT;
