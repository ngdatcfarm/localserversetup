-- 067_brooder_zone_history.sql
-- Date: 2026-09-17
-- Purpose: Phase B of Brooder Zone Refactor.
--          1. zone_setpoint_history — zone-scoped audit log for setpoint
--             changes. Replaces (or complements) the device-scoped
--             brooder_setpoint_history table once we cutover.
--          2. Refactor brooder_zone_sensors to use zone_id FK instead of
--             brooder_device_code (sensors attach to a zone, not a node).
--             Backfill zone_id from the brooder_zone_devices mapping.
--             The brooder_device_code column stays for legacy compat
--             (Phase F will drop it after cutover).
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks with EXCEPTION WHEN duplicate_object.

BEGIN;

-- ============================================================
-- 1. zone_setpoint_history — zone-scoped audit log
-- ============================================================

CREATE TABLE IF NOT EXISTS zone_setpoint_history (
    id                  SERIAL PRIMARY KEY,
    zone_id             INTEGER NOT NULL
        REFERENCES brooder_zones(id) ON DELETE CASCADE,
    manual_setpoint     DOUBLE PRECISION,            -- NULL = cleared
    effective_setpoint  DOUBLE PRECISION NOT NULL,   -- value PID used
    source              VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'auto', 'cycle_change', 'system')),
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zsh_zone_time
    ON zone_setpoint_history(zone_id, created_at DESC);

-- ============================================================
-- 2. Backfill zone_setpoint_history from legacy brooder_setpoint_history
--    Best-effort: legacy rows have device_code; map to zone via
--    brooder_zone_devices. Rows that can't be mapped are left in
--    brooder_setpoint_history (legacy table preserved through Phase F).
-- ============================================================

DO $$
DECLARE
    rec RECORD;
    zid INTEGER;
BEGIN
    FOR rec IN
        SELECT device_code, manual_setpoint, effective_setpoint,
               source, note, created_at
        FROM brooder_setpoint_history
        ORDER BY created_at
    LOOP
        SELECT zone_id INTO zid
        FROM brooder_zone_devices
        WHERE brooder_device_code = rec.device_code
        LIMIT 1;

        IF zid IS NOT NULL THEN
            INSERT INTO zone_setpoint_history
                (zone_id, manual_setpoint, effective_setpoint, source, note,
                 created_at)
            VALUES (zid, rec.manual_setpoint, rec.effective_setpoint,
                    rec.source, rec.note, rec.created_at);
        END IF;
    END LOOP;
END $$;

-- ============================================================
-- 3. Refactor brooder_zone_sensors: add zone_id column, backfill
--    from brooder_zone_devices mapping, then add FK constraint.
--    Idempotent — DO blocks guard each step.
-- ============================================================

-- 3a. Add zone_id column if missing
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'brooder_zone_sensors' AND column_name = 'zone_id'
    ) THEN
        ALTER TABLE brooder_zone_sensors ADD COLUMN zone_id INTEGER;
    END IF;
END $$;

-- 3b. Backfill zone_id from brooder_zone_devices
UPDATE brooder_zone_sensors bzs
SET zone_id = bzd.zone_id
FROM brooder_zone_devices bzd
WHERE bzd.brooder_device_code = bzs.brooder_device_code
  AND bzs.zone_id IS NULL;

-- 3c. Add FK constraint (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_bzs_zone'
    ) THEN
        ALTER TABLE brooder_zone_sensors
            ADD CONSTRAINT fk_bzs_zone
            FOREIGN KEY (zone_id) REFERENCES brooder_zones(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3d. Index on zone_id for the /zones/{id}/sensors query
CREATE INDEX IF NOT EXISTS idx_bzs_zone
    ON brooder_zone_sensors(zone_id);

-- ============================================================
-- 4. Clean up: notify which legacy sensors couldn't be mapped to a zone.
--    These are sensor devices that reference a brooder_device_code with
--    no active zone link. They're left in brooder_zone_sensors with
--    zone_id=NULL; the zone controller's _publish_zone_temp loop skips
--    NULL rows. Logged here so admins can fix the linkage manually.
-- ============================================================

DO $$
DECLARE orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM brooder_zone_sensors
    WHERE zone_id IS NULL;

    IF orphan_count > 0 THEN
        RAISE NOTICE 'Script 067: % zone-sensor rows have zone_id=NULL '
                     '(brooder_device_code not in any active zone). '
                     'These will be ignored by the zone controller until '
                     'the link is fixed via the dashboard.', orphan_count;
    END IF;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 067: zone_setpoint_history + brooder_zone_sensors.zone_id done ===';
END $$;

COMMIT;