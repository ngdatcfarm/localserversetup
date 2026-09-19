-- 063_brooder.sql
-- Date: 2026-09-16
-- Purpose: Brooder heating subsystem for free-range tropical chickens.
--          Master-Edge architecture: ESP32 nodes publish 2x SHT40 telemetry
--          + LWT; server runs PID, publishes power (0-100%) and setpoint
--          (retained) back over MQTT. Hardware safety: 38°C mechanical
--          thermostat cut-off on every heater string (outside this DB).
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks with EXCEPTION WHEN duplicate_object.

BEGIN;

-- ============================================================
-- 1. brooder_nodes — per-node config
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_nodes (
    device_code        VARCHAR(64) PRIMARY KEY,           -- e.g. "esp-aabbcc" (parsed from MAC)
    zone_name          VARCHAR(100),                      -- free-text zone label (e.g. "Trại 4 - Zone A")
    cycle_id           INTEGER REFERENCES cycles(id) ON DELETE SET NULL,
    manual_setpoint    DOUBLE PRECISION,                  -- °C, NULL = follow day-age table
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,     -- soft-delete flag; FALSE = retired
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brooder_nodes_cycle ON brooder_nodes(cycle_id);
CREATE INDEX IF NOT EXISTS idx_brooder_nodes_active ON brooder_nodes(is_active) WHERE is_active;

-- ============================================================
-- 2. sensor_types entries — brooder_temp and brooder_power
--    Two streams per node: temperature (°C) for PID input, power (%)
--    for actuator feedback / correlation chart. Both land in the same
--    sensor_data hypertable as existing mq135_raw/temp/hum streams.
-- ============================================================

INSERT INTO sensor_types (code, name, unit, data_type, typical_range)
VALUES
    ('brooder_temp',  'Brooder Temperature (min of 2x SHT40)', '°C',  'numeric',
     jsonb_build_object('min', 0.0,  'max', 45.0,  'safe_min', 18.0, 'safe_max', 38.0)),
    ('brooder_power', 'Brooder Heater Power Output',          '%',   'numeric',
     jsonb_build_object('min', 0.0,  'max', 100.0, 'safe_min', 0.0,  'safe_max', 100.0))
ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        unit = EXCLUDED.unit,
        typical_range = EXCLUDED.typical_range;

-- ============================================================
-- 3. brooder_setpoint_history — audit trail for dashboard override changes
--    Lets the dashboard show "Manual override at 30.5°C since 2 hours ago".
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_setpoint_history (
    id                 SERIAL PRIMARY KEY,
    device_code        VARCHAR(64) NOT NULL,
    manual_setpoint    DOUBLE PRECISION,            -- NULL = cleared (back to auto)
    effective_setpoint DOUBLE PRECISION NOT NULL,   -- the value PID actually used
    source             VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual | auto | cycle_change
    note               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brooder_sph_code_time
    ON brooder_setpoint_history(device_code, created_at DESC);

-- ============================================================
-- 4. Cleanup: drop old FK to cycles if it was ever created elsewhere
--    (idempotent — DO blocks handle missing constraints)
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_brooder_nodes_cycle'
          AND table_name = 'brooder_nodes'
    ) THEN
        ALTER TABLE brooder_nodes
            ADD CONSTRAINT fk_brooder_nodes_cycle
            FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 063: brooder_nodes + sensor_types + history created ===';
END $$;

COMMIT;
