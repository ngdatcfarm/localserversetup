-- ============================================
-- Add Sensor Tables
-- Date: 2026-04-04
-- Purpose: Create sensor_types, sensors, sensor_threshold_configs,
--          sensor_calibrations, sensor_maintenance_log tables
-- ============================================

-- Sensor_types table
CREATE TABLE IF NOT EXISTS sensor_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20),
    data_type VARCHAR(20) DEFAULT 'numeric',
    typical_range JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_types_code ON sensor_types (code);

-- Sensors table
CREATE TABLE IF NOT EXISTS sensors (
    id SERIAL PRIMARY KEY,
    sensor_type_id INTEGER,
    barn_id VARCHAR(50),
    device_id BIGINT,
    name VARCHAR(200) NOT NULL,
    location VARCHAR(100),
    calibration_date DATE,
    reading_interval_seconds INTEGER DEFAULT 60,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensors_type ON sensors (sensor_type_id);
CREATE INDEX IF NOT EXISTS idx_sensors_barn ON sensors (barn_id);
CREATE INDEX IF NOT EXISTS idx_sensors_device ON sensors (device_id);
CREATE INDEX IF NOT EXISTS idx_sensors_status ON sensors (status);

-- Sensor_threshold_configs table
CREATE TABLE IF NOT EXISTS sensor_threshold_configs (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER,
    alert_type VARCHAR(20) NOT NULL,
    threshold_value DECIMAL(10,2),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_threshold_sensor ON sensor_threshold_configs (sensor_id);

-- Sensor_calibrations table
CREATE TABLE IF NOT EXISTS sensor_calibrations (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER,
    calibration_date DATE NOT NULL,
    reference_value DECIMAL(10,2),
    measured_value DECIMAL(10,2),
    calibration_offset DECIMAL(10,2),
    technician VARCHAR(100),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_calibrations_sensor ON sensor_calibrations (sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_calibrations_date ON sensor_calibrations (calibration_date);

-- Sensor_maintenance_log table
CREATE TABLE IF NOT EXISTS sensor_maintenance_log (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER,
    maintenance_type VARCHAR(50) NOT NULL,
    performed_date DATE NOT NULL,
    description TEXT,
    performed_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_maint_sensor ON sensor_maintenance_log (sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_maint_date ON sensor_maintenance_log (performed_date);

-- Add FK constraints
DO $$ BEGIN
    ALTER TABLE sensors ADD CONSTRAINT fk_sensors_type
        FOREIGN KEY (sensor_type_id) REFERENCES sensor_types(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE sensors ADD CONSTRAINT fk_sensors_barn
        FOREIGN KEY (barn_id) REFERENCES barns(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE sensors ADD CONSTRAINT fk_sensors_device
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE sensor_threshold_configs ADD CONSTRAINT fk_sensor_threshold_sensor
        FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE sensor_calibrations ADD CONSTRAINT fk_sensor_calibrations_sensor
        FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE sensor_maintenance_log ADD CONSTRAINT fk_sensor_maint_sensor
        FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 021: Sensor tables created successfully ===';
END $$;
