-- ============================================
-- 009: Device Tables - Full Sync Alignment with Cloud
-- Purpose: Ensure local device tables match cloud schema
--          for bidirectional hybrid control
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- PHASE A: device_states - add channel_id + position_pct
-- Cloud uses channel_id (FK), local uses channel_number
-- Keep channel_number for backward compat, add channel_id
-- ============================================

ALTER TABLE device_states ADD COLUMN IF NOT EXISTS channel_id INT;
ALTER TABLE device_states ADD COLUMN IF NOT EXISTS position_pct INT;

-- Backfill channel_id from existing channel_number data
UPDATE device_states ds
SET channel_id = dc.id
FROM device_channels dc
WHERE dc.device_id = ds.device_id
  AND dc.channel_number = ds.channel_number
  AND ds.channel_id IS NULL;

-- Add index for channel_id lookups
CREATE INDEX IF NOT EXISTS idx_device_states_channel_id ON device_states (channel_id);

-- ============================================
-- PHASE B: device_state_log - add cloud columns
-- This is a TimescaleDB hypertable, cannot add FK constraints
-- ============================================

ALTER TABLE device_state_log ADD COLUMN IF NOT EXISTS channel_id INT;
ALTER TABLE device_state_log ADD COLUMN IF NOT EXISTS position_pct INT;
ALTER TABLE device_state_log ADD COLUMN IF NOT EXISTS curtain_config_id INT;
ALTER TABLE device_state_log ADD COLUMN IF NOT EXISTS barn_id VARCHAR(50);
ALTER TABLE device_state_log ADD COLUMN IF NOT EXISTS cycle_id INT;

-- Backfill channel_id from channel_number
UPDATE device_state_log dsl
SET channel_id = dc.id
FROM device_channels dc
WHERE dc.device_id = dsl.device_id
  AND dc.channel_number = dsl.channel_number
  AND dsl.channel_id IS NULL;

-- ============================================
-- PHASE C: device_commands - expand status + command_type
-- Cloud status: pending, sent, acknowledged, completed, failed, timeout
-- Cloud command_type: on, off, stop, set_position
-- Local status: sent, delivered, failed
-- Local command_type: relay, ota, config
-- Keep both sets for hybrid compatibility
-- ============================================

-- No ENUM in PostgreSQL, status/command_type are VARCHAR - already flexible
-- Just add a comment for documentation
COMMENT ON COLUMN device_commands.status IS 'pending|sent|acknowledged|completed|failed|timeout (cloud-compatible)';
COMMENT ON COLUMN device_commands.command_type IS 'on|off|stop|set_position|relay|ota|config (hybrid: cloud + local types)';

-- ============================================
-- PHASE D: device_channels - add created_at (cloud has it)
-- ============================================

ALTER TABLE device_channels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- PHASE E: Consolidate device_relay_states into device_states
-- 005 created device_relay_states as a parallel table
-- We consolidate: device_states is the single source of truth
-- Migrate any data from device_relay_states, then drop it
-- ============================================

-- Migrate data from device_relay_states if any exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_relay_states') THEN
        INSERT INTO device_states (device_id, channel_id, state, position_pct, updated_at)
        SELECT drs.device_id, drs.channel_id, drs.state, drs.position_pct, drs.updated_at
        FROM device_relay_states drs
        WHERE NOT EXISTS (
            SELECT 1 FROM device_states ds
            WHERE ds.device_id = drs.device_id
              AND ds.channel_id = drs.channel_id
        )
        AND drs.channel_id IS NOT NULL;

        DROP TABLE device_relay_states;
        RAISE NOTICE 'Migrated device_relay_states into device_states and dropped duplicate table';
    END IF;
END $$;

-- ============================================
-- PHASE F: Consolidate device_relay_logs into device_state_log
-- Same approach: merge data, drop duplicate
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_relay_logs') THEN
        INSERT INTO device_state_log (time, device_id, channel_number, channel_id, state, position_pct, curtain_config_id)
        SELECT drl.logged_at, drl.device_id, 0, drl.channel_id, drl.state, drl.position_pct, drl.curtain_config_id
        FROM device_relay_logs drl
        WHERE drl.channel_id IS NOT NULL;

        DROP TABLE device_relay_logs;
        RAISE NOTICE 'Migrated device_relay_logs into device_state_log and dropped duplicate table';
    END IF;
END $$;

-- ============================================
-- PHASE G: Ensure device_types has updated_at for sync tracking
-- (005 already added it, but ensure trigger exists)
-- ============================================

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on device_types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_device_types_updated_at') THEN
        CREATE TRIGGER trg_device_types_updated_at
        BEFORE UPDATE ON device_types
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- Auto-update updated_at on devices
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_devices_updated_at') THEN
        CREATE TRIGGER trg_devices_updated_at
        BEFORE UPDATE ON devices
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- Auto-update updated_at on device_states
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_device_states_updated_at') THEN
        CREATE TRIGGER trg_device_states_updated_at
        BEFORE UPDATE ON device_states
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- Auto-update updated_at on curtain_configs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_curtain_configs_updated_at') THEN
        CREATE TRIGGER trg_curtain_configs_updated_at
        BEFORE UPDATE ON curtain_configs
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- Auto-update updated_at on device_firmwares
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_device_firmwares_updated_at') THEN
        CREATE TRIGGER trg_device_firmwares_updated_at
        BEFORE UPDATE ON device_firmwares
        FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();
    END IF;
END $$;

-- ============================================
-- PHASE H: Indexes for sync/hybrid queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands (status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON device_commands (device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_state_log_channel_id ON device_state_log (channel_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_devices_barn ON devices (barn_id);
CREATE INDEX IF NOT EXISTS idx_device_channels_type ON device_channels (channel_type);

-- ============================================
-- PHASE I: Grant permissions
-- ============================================

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm user - OK';
END $$;

DO $$ BEGIN RAISE NOTICE '=== 009: Device sync alignment complete! ==='; END $$;
