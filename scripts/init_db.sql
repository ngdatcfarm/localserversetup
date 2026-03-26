-- ============================================
-- CFarm Local Server - IoT Database Schema
-- Compatible: PostgreSQL 16+ (TimescaleDB optional)
-- ============================================

-- Try to enable TimescaleDB (skip if not installed)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    RAISE NOTICE 'TimescaleDB enabled';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB not available - using plain PostgreSQL (OK)';
END $$;

-- ============================================
-- 1. Device Management
-- ============================================

CREATE TABLE IF NOT EXISTS device_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    channel_count INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    device_type_id INT REFERENCES device_types(id),
    barn_id VARCHAR(50),
    mqtt_topic VARCHAR(200) NOT NULL,
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

CREATE TABLE IF NOT EXISTS device_channels (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    function VARCHAR(50),
    name VARCHAR(100),
    gpio_pin INT,
    UNIQUE(device_id, channel_number)
);

-- ============================================
-- 2. Sensor Data (Time-series)
-- ============================================

CREATE TABLE IF NOT EXISTS sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20),
    barn_id VARCHAR(50),
    cycle_id INT
);

-- Convert to hypertable if TimescaleDB is available
DO $$
BEGIN
    PERFORM create_hypertable('sensor_data', 'time', if_not_exists => TRUE);
    RAISE NOTICE 'sensor_data: TimescaleDB hypertable created';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'sensor_data: Using standard table (TimescaleDB not available)';
END $$;

CREATE INDEX IF NOT EXISTS idx_sensor_device_time ON sensor_data (device_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_type_time ON sensor_data (sensor_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_barn_time ON sensor_data (barn_id, time DESC);

-- ============================================
-- 3. Device State Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS device_states (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, channel_number)
);

CREATE TABLE IF NOT EXISTS device_state_log (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,
    source VARCHAR(50)
);

DO $$
BEGIN
    PERFORM create_hypertable('device_state_log', 'time', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'device_state_log: Using standard table';
END $$;

-- ============================================
-- 4. Command Log
-- ============================================

CREATE TABLE IF NOT EXISTS device_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    command_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',
    status VARCHAR(20) DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- ============================================
-- 5. Curtain Configs
-- ============================================

CREATE TABLE IF NOT EXISTS curtain_configs (
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

CREATE TABLE IF NOT EXISTS sync_queue (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue (synced, created_at) WHERE NOT synced;

-- ============================================
-- 7. Seed default device types
-- ============================================

INSERT INTO device_types (code, name, channel_count, description) VALUES
    ('relay_4ch', 'Relay 4 Channel', 4, 'ESP32 with 4 relay outputs'),
    ('relay_8ch', 'Relay 8 Channel', 8, 'ESP32 with 8 relay outputs'),
    ('sensor', 'Sensor Only', 0, 'ESP32 sensor reader (temp, humidity)'),
    ('mixed', 'Mixed Relay + Sensor', 4, 'ESP32 with relay + sensor')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 8. TimescaleDB extras (only if available)
-- ============================================

DO $$
BEGIN
    -- Hourly aggregates
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

    PERFORM add_continuous_aggregate_policy('sensor_hourly',
        start_offset => INTERVAL '3 hours',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '30 minutes'
    );

    PERFORM add_retention_policy('sensor_data', INTERVAL '90 days');

    RAISE NOTICE 'TimescaleDB aggregates and policies created';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping TimescaleDB features (not available)';
END $$;

-- ============================================
-- Done!
-- ============================================
DO $$ BEGIN RAISE NOTICE '=== CFarm database initialized successfully! ==='; END $$;
