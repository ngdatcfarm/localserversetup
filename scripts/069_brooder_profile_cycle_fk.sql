-- 069_brooder_profile_cycle_fk.sql
-- Date: 2026-09-18
-- Purpose: Add brooder_profile_id FK to cycles (Phase 1).
--          When a cycle is active, the brooder service reads
--          cycles.brooder_profile_id to pick up the day-age schedule.
--          ON DELETE SET NULL — deleting a profile keeps the cycle intact,
--          it just stops having a profile (legacy SETPOINT_TABLE kicks in).
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE cycles
    ADD COLUMN IF NOT EXISTS brooder_profile_id INTEGER
        REFERENCES brooder_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cycles_brooder_profile
    ON cycles(brooder_profile_id)
    WHERE brooder_profile_id IS NOT NULL;

DO $$ BEGIN
    RAISE NOTICE '=== Script 069: cycles.brooder_profile_id FK added ===';
END $$;

COMMIT;