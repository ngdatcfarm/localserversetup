-- ============================================
-- CFarm Local Server - IoT Database Schema
-- TimescaleDB (PostgreSQL + time-series)
-- ============================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- 1. Device Management
-- ============================================

CREATE TABLE device_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,        -- relay, sensor, mixed
    name VARCHAR(100) NOT NULL,
    channel_count INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(100) UNIQUE NOT NULL,  -- e.g. "ESP32_BARN1_01"
    name VARCHAR(200) NOT NULL,
    device_type_id INT REFERENCES device_types(id),
    barn_id VARCHAR(50),
    mqtt_topic VARCHAR(200) NOT NULL,          -- e.g. "cfarm/barn1"
    is_online BOOLEAN DEFAULT FALSE,
    last_heartbeat_at TIMESTAMPTZ,
    wifi_rssi INT,
    ip_address VARCHAR(45),
    uptime_seconds INT,
    free_heap_bytes INT,
    firmware_version VARCHAR(50),
    alert_offline BOOLEAN DEFAULT TRUE,
    last_offline_alert_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE device_channels (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    function VARCHAR(50),                      -- curtain_up, curtain_down, fan, light, heater, water
    name VARCHAR(100),
    gpio_pin INT,
    UNIQUE(device_id, channel_number)
);

-- ============================================
-- 2. Sensor Data (Time-series - Hypertable)
-- ============================================

CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,          -- temperature, humidity, light, soil_moisture
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20),                          -- °C, %, lux, %
    barn_id VARCHAR(50),
    cycle_id INT                               -- farming cycle reference
);

-- Convert to TimescaleDB hypertable (auto-partitioned by time)
SELECT create_hypertable('sensor_data', 'time');

-- Indexes for common queries
CREATE INDEX idx_sensor_device_time ON sensor_data (device_id, time DESC);
CREATE INDEX idx_sensor_type_time ON sensor_data (sensor_type, time DESC);
CREATE INDEX idx_sensor_barn_time ON sensor_data (barn_id, time DESC);

-- ============================================
-- 3. Device State Tracking
-- ============================================

CREATE TABLE device_states (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,                -- on, off
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, channel_number)
);

CREATE TABLE device_state_log (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,
    source VARCHAR(50)                         -- manual, schedule, automation, remote
);

SELECT create_hypertable('device_state_log', 'time');

-- ============================================
-- 4. Command Log
-- ============================================

CREATE TABLE device_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    command_type VARCHAR(50) NOT NULL,          -- relay, ota, config
    payload JSONB NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',       -- manual, schedule, automation, remote, cloud
    status VARCHAR(20) DEFAULT 'sent',         -- sent, delivered, failed
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- ============================================
-- 5. Curtain Configs
-- ============================================

CREATE TABLE curtain_configs (
    id SERIAL PRIMARY KEY,
    curtain_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    barn_id VARCHAR(50),
    device_id INT REFERENCES devices(id),
    up_channel INT NOT NULL,
    down_channel INT NOT NULL,
    full_up_seconds FLOAT DEFAULT 60,
    full_down_seconds FLOAT DEFAULT 60,
    current_position INT DEFAULT 0 CHECK (current_position BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. Cloud Sync Tracking
-- ============================================

CREATE TABLE sync_queue (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,               -- insert, update, delete
    payload JSONB NOT NULL,
    synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_pending ON sync_queue (synced, created_at) WHERE NOT synced;

-- ============================================
-- 7. Seed default device types
-- ============================================

INSERT INTO device_types (code, name, channel_count, description) VALUES
    ('relay_4ch', 'Relay 4 Channel', 4, 'ESP32 với 4 relay output'),
    ('relay_8ch', 'Relay 8 Channel', 8, 'ESP32 với 8 relay output'),
    ('sensor', 'Sensor Only', 0, 'ESP32 chỉ đọc sensor (temp, humidity)'),
    ('mixed', 'Mixed Relay + Sensor', 4, 'ESP32 có cả relay và sensor');

-- ============================================
-- Continuous Aggregates (auto rollup)
-- ============================================

-- Hourly average sensor data
CREATE MATERIALIZED VIEW sensor_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    device_id,
    sensor_type,
    barn_id,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM sensor_data
GROUP BY bucket, device_id, sensor_type, barn_id
WITH NO DATA;

-- Auto-refresh policy: refresh hourly data every 30 minutes
SELECT add_continuous_aggregate_policy('sensor_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes'
);

-- Data retention: keep raw data 90 days, aggregates forever
SELECT add_retention_policy('sensor_data', INTERVAL '90 days');
