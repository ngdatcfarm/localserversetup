-- 064_brooder_zone_sensors.sql
-- Date: 2026-09-16
-- Purpose: Reference sensor feature for brooder nodes.
--          Each brooder (ESP-brooder) can be configured to read temperature
--          from one or more ESP-sensor devices in the same barn. The server
--          blends those readings (weighted avg) and publishes the result to
--          cfarm/brooder-{code}/zone_temp every 20s. The ESP uses that as a
--          50/50 weighted blend with its own SHT40 for PID input, falling
--          back to local-only when zone_temp is stale (>5 min).
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks.

BEGIN;

-- ============================================================
-- 1. brooder_zone_sensors — junction table
--    Many-to-many: one brooder can pull from many sensors;
--    one sensor can feed many brooders (rare, but allowed).
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_zone_sensors (
    id                    SERIAL PRIMARY KEY,
    brooder_device_code   VARCHAR(64) NOT NULL,
    sensor_device_code    VARCHAR(64) NOT NULL,
    weight                DOUBLE PRECISION NOT NULL DEFAULT 1.0
        CHECK (weight >= 0 AND weight <= 10.0),
    label                 VARCHAR(100),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_brooder_sensor
        UNIQUE (brooder_device_code, sensor_device_code)
);

CREATE INDEX IF NOT EXISTS idx_bzs_brooder
    ON brooder_zone_sensors (brooder_device_code);
CREATE INDEX IF NOT EXISTS idx_bzs_sensor
    ON brooder_zone_sensors (sensor_device_code);

-- ============================================================
-- 1b. brooder_nodes.fallback_delta_c — admin-tuned offset for the
--     Tier-2 fallback path. When zone sensors go stale, ESP uses
--     local_SHT40 + fallback_delta_c as PID input. Default 0 means
--     "no offset" (heater runs conservatively — zone may run 1-2°C
--     cooler than setpoint, but chicks stay safe). Admin raises it
--     to ~+2°C after observing the steady-state heater-vs-zone bias.
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'brooder_nodes'
          AND column_name = 'fallback_delta_c'
    ) THEN
        ALTER TABLE brooder_nodes
            ADD COLUMN fallback_delta_c DOUBLE PRECISION NOT NULL DEFAULT 0.0
            CHECK (fallback_delta_c >= -5.0 AND fallback_delta_c <= 5.0);
    END IF;
END $$;

-- ============================================================
-- 2. updated_at auto-touch trigger
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_brooder_zone_sensors_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION update_brooder_zone_sensors_updated_at()
        RETURNS TRIGGER AS $inner$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $inner$ LANGUAGE plpgsql;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_brooder_zone_sensors_updated_at ON brooder_zone_sensors;
CREATE TRIGGER trg_brooder_zone_sensors_updated_at
    BEFORE UPDATE ON brooder_zone_sensors
    FOR EACH ROW
    EXECUTE FUNCTION update_brooder_zone_sensors_updated_at();

-- ============================================================
-- 3. Self-cleanup: if a sensor device is hard-deleted from `devices`,
--    drop the linkage too. (brooder_nodes uses ON DELETE SET NULL.)
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_bzs_sensor_device'
    ) THEN
        ALTER TABLE brooder_zone_sensors
            ADD CONSTRAINT fk_bzs_sensor_device
            FOREIGN KEY (sensor_device_code)
            REFERENCES devices (device_code)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 064: brooder_zone_sensors junction table created ===';
END $$;

COMMIT;