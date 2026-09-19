-- 066_brooder_heaters.sql
-- Date: 2026-09-17
-- Purpose: Phase B of Brooder Zone Refactor.
--          A Heater = 1 ESP32 brooder node + 1 of its 2 DAC channels
--          (DAC1 / DAC2) + max_power_w (wattage of that chảo).
--          A zone has 1..N heaters; the server's PID output is split
--          across heaters using max-power weighted distribution
--          (heater_i_pct = pid_output × w_i / Σw).
--
--          1 ESP32 can drive 2 heaters (one per DAC channel) so each
--          zone's heater list may contain 2 rows from the same device_code.
--          Unique (device_code, channel) where is_active=TRUE.
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks.

BEGIN;

-- ============================================================
-- 1. brooder_heaters — per-channel heater config
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_heaters (
    id              SERIAL PRIMARY KEY,
    zone_id         INTEGER NOT NULL REFERENCES brooder_zones(id) ON DELETE CASCADE,
    device_code     VARCHAR(64) NOT NULL
        REFERENCES brooder_nodes(device_code) ON DELETE CASCADE,
    channel         SMALLINT NOT NULL CHECK (channel IN (1, 2)),
    label           VARCHAR(100),
    max_power_w     DOUBLE PRECISION NOT NULL DEFAULT 1500.0
        CHECK (max_power_w > 0 AND max_power_w <= 10000.0),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,    -- soft-delete
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each (device, channel) can only be assigned to one active heater at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_heater_active_channel
    ON brooder_heaters(device_code, channel) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_brooder_heaters_zone
    ON brooder_heaters(zone_id);
CREATE INDEX IF NOT EXISTS idx_brooder_heaters_device
    ON brooder_heaters(device_code);

-- ============================================================
-- 2. brooder_heater_latest_power — server-side cache of last-published
--    power per heater. Lets the dashboard query current % without
--    JOINing the sensor_data hypertable (which would be slow for the
--    "current state" widget on every page load).
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_heater_latest_power (
    heater_id          INTEGER PRIMARY KEY
        REFERENCES brooder_heaters(id) ON DELETE CASCADE,
    last_power_pct     SMALLINT NOT NULL
        CHECK (last_power_pct BETWEEN 0 AND 100),
    last_setpoint      DOUBLE PRECISION,
    last_published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source             VARCHAR(20) NOT NULL DEFAULT 'server'
        CHECK (source IN ('server', 'failsafe', 'manual'))
);

-- ============================================================
-- 3. updated_at trigger for brooder_heaters
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_brooder_heaters_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION update_brooder_heaters_updated_at()
        RETURNS TRIGGER AS $B$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $B$ LANGUAGE plpgsql;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_brooder_heaters_updated_at ON brooder_heaters;
CREATE TRIGGER trg_brooder_heaters_updated_at
    BEFORE UPDATE ON brooder_heaters
    FOR EACH ROW
    EXECUTE FUNCTION update_brooder_heaters_updated_at();

-- ============================================================
-- 4. Backfill: for each zone created by script 065, auto-create 2
--    heaters (channel 1 + channel 2) per ESP32 node in that zone.
--    Idempotent — uses ON CONFLICT DO NOTHING.
-- ============================================================

DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT bzd.zone_id, bzd.brooder_device_code
        FROM brooder_zone_devices bzd
        JOIN brooder_zones bz ON bz.id = bzd.zone_id AND bz.is_active
        ORDER BY bzd.zone_id, bzd.brooder_device_code
    LOOP
        -- Channel 1
        INSERT INTO brooder_heaters(zone_id, device_code, channel, label,
                                    max_power_w, enabled, is_active)
        VALUES (rec.zone_id, rec.brooder_device_code, 1,
                'Chảo 1 (' || rec.brooder_device_code || ')',
                1500.0, TRUE, TRUE)
        ON CONFLICT DO NOTHING;
        -- Channel 2
        INSERT INTO brooder_heaters(zone_id, device_code, channel, label,
                                    max_power_w, enabled, is_active)
        VALUES (rec.zone_id, rec.brooder_device_code, 2,
                'Chảo 2 (' || rec.brooder_device_code || ')',
                1500.0, TRUE, TRUE)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 066: brooder_heaters + brooder_heater_latest_power created and backfilled ===';
END $$;

COMMIT;