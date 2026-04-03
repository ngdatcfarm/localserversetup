-- ============================================
-- 011: Device Firmware Sync
-- Purpose: Add firmware_id to devices for tracking assigned firmware
--          and sync firmwares table to cloud
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- PHASE A: Add firmware_id to devices table
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'firmware_id') THEN
        ALTER TABLE devices ADD COLUMN firmware_id INT REFERENCES firmwares(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_firmware ON devices (firmware_id);

-- ============================================
-- PHASE B: Ensure firmwares table exists with proper structure
-- ============================================

CREATE TABLE IF NOT EXISTS firmwares (
    id SERIAL PRIMARY KEY,
    device_type_code VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    changelog TEXT,
    is_latest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_type_code, version)
);

CREATE INDEX IF NOT EXISTS idx_firmwares_type ON firmwares (device_type_code, is_latest);

-- ============================================
-- PHASE C: Sync tracking - ensure firmwares can sync to cloud
-- ============================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION sync_queue_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sync_queue (table_name, record_id, action, payload, created_at)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE TG_OP WHEN 'DELETE' THEN 'delete' ELSE 'update' END,
        row_to_json(COALESCE(NEW, OLD)),
        NOW()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on firmwares if sync_queue exists (do separately to avoid errors)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sync_queue') THEN
        -- Drop existing trigger if any to recreate
        DROP TRIGGER IF EXISTS trg_firmwares_sync_queue ON firmwares;
        -- Recreate trigger
        CREATE TRIGGER trg_firmwares_sync_queue
            AFTER INSERT OR UPDATE OR DELETE ON firmwares
            FOR EACH ROW EXECUTE FUNCTION sync_queue_trigger();
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create firmwares sync trigger - OK: %', SQLERRM;
END $$;

-- ============================================
-- PHASE D: Auto-assign firmware to devices without one
-- ============================================

DO $$
DECLARE
    dev_id INT;
    dev_type_id INT;
    type_code VARCHAR(50);
    fw_id INT;
BEGIN
    FOR dev_id, dev_type_id IN SELECT id, device_type_id FROM devices WHERE firmware_id IS NULL AND device_type_id IS NOT NULL LOOP
        SELECT code INTO type_code FROM device_types WHERE id = dev_type_id;

        SELECT f.id INTO fw_id FROM firmwares f
        WHERE f.device_type_code = type_code AND f.is_latest = TRUE
        LIMIT 1;

        IF fw_id IS NOT NULL THEN
            UPDATE devices SET firmware_id = fw_id WHERE id = dev_id;
            RAISE NOTICE 'Assigned firmware % to device %', fw_id, dev_id;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- PHASE E: Grant permissions
-- ============================================

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm user - OK';
END $$;

DO $$ BEGIN RAISE NOTICE '=== 011: Device firmware sync tables created! ==='; END $$;
