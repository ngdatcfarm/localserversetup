-- =====================================================
-- Equipment System - CRUD cho equipment types và equipment instances
-- =====================================================

-- Equipment types catalog (predefined types)
CREATE TABLE IF NOT EXISTS equipment_types (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    power_watts INTEGER,
    voltage_v INTEGER,
    current_amp DECIMAL(5,2),
    mqtt_protocol JSONB,  -- e.g., {"type": "relay", "states": ["on", "off"]}
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_types_code ON equipment_types (code);

-- Equipment instances (actual installed equipment)
CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id) ON DELETE SET NULL,
    equipment_type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    equipment_type VARCHAR(50),  -- fallback if no type_id
    model VARCHAR(100),
    serial_no VARCHAR(100),
    power_watts INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    install_date DATE,
    warranty_until DATE,
    purchase_price DECIMAL(12,2),
    runtime_hours DECIMAL(10,1) DEFAULT 0,
    energy_consumption_kwh DECIMAL(10,2) DEFAULT 0,
    maintenance_interval_days INTEGER,
    device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,  -- linked ESP32
    channel_number INTEGER,  -- relay channel on device (1-8)
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_barn ON equipment (barn_id);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment (equipment_type_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment (status);
CREATE INDEX IF NOT EXISTS idx_equipment_device ON equipment (device_id);

-- Equipment parts (maintainable components)
CREATE TABLE IF NOT EXISTS equipment_parts (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    part_name VARCHAR(100) NOT NULL,
    part_code VARCHAR(50),
    replacement_interval_hours INTEGER,
    last_replaced_at TIMESTAMPTZ,
    next_replacement_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_equipment_parts_equipment ON equipment_parts (equipment_id);

-- Equipment readings (sensor data from equipment)
CREATE TABLE IF NOT EXISTS equipment_readings (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    temperature DECIMAL(5,2),
    vibration DECIMAL(5,2),
    current_amp DECIMAL(5,2),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_readings_equipment ON equipment_readings (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_readings_recorded ON equipment_readings (recorded_at);

-- Equipment performance metrics
CREATE TABLE IF NOT EXISTS equipment_performance (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    period VARCHAR(20) NOT NULL,
    runtime_hours DECIMAL(6,2),
    energy_consumption_kwh DECIMAL(10,2),
    avg_current_amp DECIMAL(5,2),
    efficiency_pct DECIMAL(5,2),
    start_reading_id BIGINT,
    end_reading_id BIGINT,
    recorded_at DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_perf_equipment ON equipment_performance (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_perf_recorded ON equipment_performance (recorded_at);

-- Equipment assignment log (history of device channel assignments)
CREATE TABLE IF NOT EXISTS equipment_assignment_log (
    id BIGSERIAL PRIMARY KEY,
    device_channel_id INTEGER NOT NULL,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,  -- assign, unassign
    changed_by VARCHAR(100),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_assign_log_channel ON equipment_assignment_log (device_channel_id);
CREATE INDEX IF NOT EXISTS idx_equip_assign_log_equipment ON equipment_assignment_log (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_assign_log_changed ON equipment_assignment_log (changed_at);

-- Equipment command log (history of ON/OFF commands)
CREATE TABLE IF NOT EXISTS equipment_command_log (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    device_channel_id INTEGER,
    command VARCHAR(50) NOT NULL,
    value INTEGER,
    triggered_by VARCHAR(50),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_equipment ON equipment_command_log (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_channel ON equipment_command_log (device_channel_id);
CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_recorded ON equipment_command_log (recorded_at);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_equipment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on equipment
DROP TRIGGER IF EXISTS trg_equipment_updated_at ON equipment;
CREATE TRIGGER trg_equipment_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_equipment_timestamp();

-- Sync triggers for equipment system
DROP TRIGGER IF EXISTS trg_equipment_sync ON equipment;
CREATE TRIGGER trg_equipment_sync
    AFTER INSERT OR UPDATE OR DELETE ON equipment
    FOR EACH ROW EXECUTE FUNCTION queue_change('equipment');

DROP TRIGGER IF EXISTS trg_equipment_types_sync ON equipment_types;
CREATE TRIGGER trg_equipment_types_sync
    AFTER INSERT OR UPDATE OR DELETE ON equipment_types
    FOR EACH ROW EXECUTE FUNCTION queue_change('equipment_types');

DROP TRIGGER IF EXISTS trg_equipment_assignment_log_sync ON equipment_assignment_log;
CREATE TRIGGER trg_equipment_assignment_log_sync
    AFTER INSERT ON equipment_assignment_log
    FOR EACH ROW EXECUTE FUNCTION queue_change('equipment_assignment_log');

-- Insert default equipment types if not exists
INSERT INTO equipment_types (code, name, power_watts, voltage_v, current_amp, description)
SELECT 'FAN_150W', 'Quạt công nghiệp 150W', 150, 220, 0.68, 'Quạt làm mát công nghiệp công suất 150W'
WHERE NOT EXISTS (SELECT 1 FROM equipment_types WHERE code = 'FAN_150W');

INSERT INTO equipment_types (code, name, power_watts, voltage_v, current_amp, description)
SELECT 'FAN_200W', 'Quạt công nghiệp 200W', 200, 220, 0.91, 'Quạt làm mát công nghiệp công suất 200W'
WHERE NOT EXISTS (SELECT 1 FROM equipment_types WHERE code = 'FAN_200W');

INSERT INTO equipment_types (code, name, power_watts, voltage_v, current_amp, description)
SELECT 'FEEDER_AUTO', 'Máy cho ăn tự động', 50, 220, 0.23, 'Hệ thống cho ăn tự động'
WHERE NOT EXISTS (SELECT 1 FROM equipment_types WHERE code = 'FEEDER_AUTO');

INSERT INTO equipment_types (code, name, power_watts, voltage_v, current_amp, description)
SELECT 'LIGHT_LED', 'Đèn LED chiếu sáng', 30, 220, 0.14, 'Đèn LED chiếu sáng chuồng trại'
WHERE NOT EXISTS (SELECT 1 FROM equipment_types WHERE code = 'LIGHT_LED');

INSERT INTO equipment_types (code, name, power_watts, voltage_v, current_amp, description)
SELECT 'HEATER_500W', 'Máy sưởi 500W', 500, 220, 2.27, 'Máy sưởi sưởi ấm cho gia cầm'
WHERE NOT EXISTS (SELECT 1 FROM equipment_types WHERE code = 'HEATER_500W');

DO $$ BEGIN
    RAISE NOTICE '=== Script 038: Equipment system tables created successfully ===';
END $$;