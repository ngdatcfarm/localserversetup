-- ============================================
-- Add Equipment Tables
-- Date: 2026-04-04
-- Purpose: Create equipment, equipment_parts, equipment_readings,
--          equipment_performance, equipment_assignment_log, equipment_command_log tables
-- ============================================

-- Equipment table
CREATE TABLE IF NOT EXISTS equipment (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50),
    equipment_type_id INTEGER,
    name VARCHAR(200) NOT NULL,
    equipment_type VARCHAR(50),
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
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_barn ON equipment (barn_id);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment (equipment_type_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment (status);

-- Equipment_parts table
CREATE TABLE IF NOT EXISTS equipment_parts (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL,
    part_name VARCHAR(100) NOT NULL,
    part_code VARCHAR(50),
    replacement_interval_hours INTEGER,
    last_replaced_at TIMESTAMPTZ,
    next_replacement_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_equipment_parts_equipment ON equipment_parts (equipment_id);

-- Equipment_readings table
CREATE TABLE IF NOT EXISTS equipment_readings (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL,
    temperature DECIMAL(5,2),
    vibration DECIMAL(5,2),
    current_amp DECIMAL(5,2),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_readings_equipment ON equipment_readings (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_readings_recorded ON equipment_readings (recorded_at);

-- Equipment_performance table
CREATE TABLE IF NOT EXISTS equipment_performance (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL,
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

-- Equipment_assignment_log table
CREATE TABLE IF NOT EXISTS equipment_assignment_log (
    id BIGSERIAL PRIMARY KEY,
    device_channel_id INTEGER NOT NULL,
    equipment_id INTEGER,
    action VARCHAR(20) NOT NULL,
    changed_by VARCHAR(100),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_assign_log_channel ON equipment_assignment_log (device_channel_id);
CREATE INDEX IF NOT EXISTS idx_equip_assign_log_equipment ON equipment_assignment_log (equipment_id);

-- Equipment_command_log table
CREATE TABLE IF NOT EXISTS equipment_command_log (
    id BIGSERIAL PRIMARY KEY,
    equipment_id INTEGER NOT NULL,
    device_channel_id INTEGER,
    command VARCHAR(50) NOT NULL,
    value INTEGER,
    triggered_by VARCHAR(50),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_equipment ON equipment_command_log (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_channel ON equipment_command_log (device_channel_id);
CREATE INDEX IF NOT EXISTS idx_equip_cmd_log_recorded ON equipment_command_log (recorded_at);

-- Add foreign keys after tables are created (to avoid circular FK issues)
DO $$ BEGIN
    ALTER TABLE equipment_parts ADD CONSTRAINT fk_equipment_parts_equipment
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE equipment_readings ADD CONSTRAINT fk_equipment_readings_equipment
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE equipment_performance ADD CONSTRAINT fk_equipment_performance_equipment
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE equipment_command_log ADD CONSTRAINT fk_equipment_command_log_equipment
        FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 016: Equipment tables created successfully ===';
END $$;
