-- 068_brooder_profiles.sql
-- Date: 2026-09-18
-- Purpose: Brooder Profile Management (Phase 1).
--          1. brooder_profiles — re-usable heating schedules per breed/strategy.
--             Carries the firmware safety envelope (emergency cutoff / release,
--             min ambient temp) so a profile can never override firmware safety.
--          2. brooder_profile_schedules — day-age → setpoint/limit/humidity/night-boost
--             rows attached to a profile. UNIQUE (profile_id, stage_order) keeps
--             stage ordering clean.
--          3. brooder_profile_test_assignments — time-boxed test overrides for
--             a cycle. Auto-expires via the sweeper in brooder_service.py.
--          4. updated_at trigger on brooder_profiles.
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks with EXCEPTION WHEN duplicate_object.

BEGIN;

-- ============================================================
-- 1. brooder_profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_profiles (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(64)  UNIQUE NOT NULL,
    name            VARCHAR(128) NOT NULL,
    species         VARCHAR(64),
    description     TEXT,
    -- Safety envelope (mirrors firmware/esp32_brooder.ino constants).
    -- A profile can NEVER override firmware safety: emergency_cutoff_temp
    -- must be ≤ firmware EMERGENCY_LATCH_C (35.1) and emergency_release_temp
    -- must be < cutoff. API validator rejects any edit that violates this.
    emergency_cutoff_temp  DOUBLE PRECISION NOT NULL DEFAULT 35.1,
    emergency_release_temp DOUBLE PRECISION NOT NULL DEFAULT 34.6,
    min_ambient_temp       DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    temperature_unit       VARCHAR(8)       NOT NULL DEFAULT 'celsius',
    is_active              BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. brooder_profile_schedules — day-age → setpoint etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_profile_schedules (
    id                  SERIAL PRIMARY KEY,
    profile_id          INTEGER NOT NULL REFERENCES brooder_profiles(id) ON DELETE CASCADE,
    stage_order         SMALLINT NOT NULL,
    day_range_start     SMALLINT NOT NULL,
    day_range_end       SMALLINT NOT NULL,
    setpoint_target     DOUBLE PRECISION NOT NULL,
    heater_zone_limit   DOUBLE PRECISION NOT NULL,
    humidity_min_pct    DOUBLE PRECISION,
    humidity_max_pct    DOUBLE PRECISION,
    night_boost_offset  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, stage_order)
);

CREATE INDEX IF NOT EXISTS idx_bps_profile
    ON brooder_profile_schedules(profile_id, day_range_start);

-- ============================================================
-- 3. brooder_profile_test_assignments — time-boxed test overrides
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_profile_test_assignments (
    id              SERIAL PRIMARY KEY,
    cycle_id        INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    profile_id      INTEGER NOT NULL REFERENCES brooder_profiles(id) ON DELETE CASCADE,
    expires_at      TIMESTAMPTZ NOT NULL,
    note            TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at      TIMESTAMPTZ,
    cleared_reason  VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_bpta_cycle_active
    ON brooder_profile_test_assignments(cycle_id)
    WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bpta_expiry
    ON brooder_profile_test_assignments(expires_at)
    WHERE cleared_at IS NULL;

-- ============================================================
-- 4. updated_at trigger for brooder_profiles
-- ============================================================

CREATE OR REPLACE FUNCTION trg_brooder_profiles_updated() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'brooder_profiles_updated'
    ) THEN
        CREATE TRIGGER brooder_profiles_updated
            BEFORE UPDATE ON brooder_profiles
            FOR EACH ROW
            EXECUTE FUNCTION trg_brooder_profiles_updated();
    END IF;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 068: brooder_profiles + schedules + test_assignments done ===';
END $$;

COMMIT;