-- ============================================
-- 012: Mother Firmware + Cycle Device Link
-- Purpose:
--   1. Add cycle_id to devices (track which cycle a device serves)
--   2. Add is_mother flag to firmwares (default firmware per device type)
--   3. Update auto-assign to prefer is_mother firmware
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- PHASE A: Add cycle_id to devices
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'cycle_id') THEN
        ALTER TABLE devices ADD COLUMN cycle_id INT;
        -- Add foreign key after cycles table exists
        ALTER TABLE devices ADD CONSTRAINT fk_devices_cycle
            FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- cycles table might not exist yet, add without FK
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'cycle_id') THEN
        ALTER TABLE devices ADD COLUMN cycle_id INT;
    END IF;
    RAISE NOTICE 'cycle_id added without FK constraint - will add later';
END $$;

CREATE INDEX IF NOT EXISTS idx_devices_cycle ON devices (cycle_id);

-- ============================================
-- PHASE B: Add is_mother to firmwares
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firmwares' AND column_name = 'is_mother') THEN
        ALTER TABLE firmwares ADD COLUMN is_mother BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- There can only be ONE mother firmware per device_type
-- Ensure only one is_mother per type (first one created wins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_firmwares_mother_type
    ON firmwares (device_type_code) WHERE is_mother = TRUE;

-- ============================================
-- PHASE C: Update auto-assign firmware logic
-- Prefer is_mother, fallback to is_latest
-- ============================================

-- Create a function to auto-assign firmware to a device
CREATE OR REPLACE FUNCTION assign_mother_firmware(p_device_id INT)
RETURNS VOID AS $$
DECLARE
    v_type_code VARCHAR(50);
    v_fw_id INT;
BEGIN
    -- Get device type code
    SELECT dt.code INTO v_type_code
    FROM devices d
    JOIN device_types dt ON dt.id = d.device_type_id
    WHERE d.id = p_device_id;

    IF v_type_code IS NULL THEN
        RETURN;
    END IF;

    -- Try to find mother firmware first
    SELECT id INTO v_fw_id FROM firmwares
    WHERE device_type_code = v_type_code AND is_mother = TRUE
    LIMIT 1;

    -- Fallback to latest if no mother
    IF v_fw_id IS NULL THEN
        SELECT id INTO v_fw_id FROM firmwares
        WHERE device_type_code = v_type_code AND is_latest = TRUE
        LIMIT 1;
    END IF;

    -- Assign if found
    IF v_fw_id IS NOT NULL THEN
        UPDATE devices SET firmware_id = v_fw_id WHERE id = p_device_id;
        RAISE NOTICE 'Device % assigned firmware %', p_device_id, v_fw_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to existing devices without firmware
DO $$
DECLARE
    dev RECORD;
BEGIN
    FOR dev IN SELECT id FROM devices WHERE firmware_id IS NULL AND device_type_id IS NOT NULL LOOP
        PERFORM assign_mother_firmware(dev.id);
    END LOOP;
END $$;

-- ============================================
-- PHASE D: Create trigger for new devices
-- ============================================

-- Function to auto-assign firmware on device insert
CREATE OR REPLACE FUNCTION trg_device_auto_firmware()
RETURNS TRIGGER AS $$
BEGIN
    -- Assign mother/latest firmware if not set
    IF NEW.firmware_id IS NULL AND NEW.device_type_id IS NOT NULL THEN
        -- Try mother first
        SELECT f.id INTO NEW.firmware_id FROM firmwares f
        WHERE f.device_type_code = (
            SELECT code FROM device_types WHERE id = NEW.device_type_id
        ) AND f.is_mother = TRUE
        LIMIT 1;

        -- Fallback to latest
        IF NEW.firmware_id IS NULL THEN
            SELECT f.id INTO NEW.firmware_id FROM firmwares f
            WHERE f.device_type_code = (
                SELECT code FROM device_types WHERE id = NEW.device_type_id
            ) AND f.is_latest = TRUE
            LIMIT 1;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_devices_auto_firmware ON devices;
CREATE TRIGGER trg_devices_auto_firmware
    BEFORE INSERT ON devices
    FOR EACH ROW EXECUTE FUNCTION trg_device_auto_firmware();

-- ============================================
-- PHASE E: Create trigger for new firmwares
-- Auto-set is_mother if first firmware for type
-- ============================================

CREATE OR REPLACE FUNCTION trg_firmware_auto_mother()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is the first firmware for this type, make it mother
    IF NOT EXISTS (
        SELECT 1 FROM firmwares
        WHERE device_type_code = NEW.device_type_code
    ) THEN
        NEW.is_mother = TRUE;
        NEW.is_latest = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firmware_auto_mother ON firmwares;
CREATE TRIGGER trg_firmware_auto_mother
    BEFORE INSERT ON firmwares
    FOR EACH ROW EXECUTE FUNCTION trg_firmware_auto_mother();

-- ============================================
-- PHASE F: Grant permissions
-- ============================================

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm user - OK';
END $$;

DO $$ BEGIN RAISE NOTICE '=== 012: Mother firmware + cycle device link done! ==='; END $$;
