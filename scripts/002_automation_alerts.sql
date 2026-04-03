-- ============================================
-- Phase 2: Automation Rules + Environmental Alerts + Firmware
-- ============================================

-- 1. Automation Rules (schedule + condition-based)
CREATE TABLE IF NOT EXISTS automation_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    rule_type VARCHAR(20) NOT NULL,               -- 'schedule' or 'condition'
    enabled BOOLEAN DEFAULT TRUE,

    -- Schedule fields (rule_type = 'schedule')
    cron_expression VARCHAR(100),                  -- e.g. "0 6 * * *" = 6:00 mỗi ngày
    action_state VARCHAR(10),                      -- 'on' or 'off'
    duration_seconds INT,                          -- auto-off after N seconds (NULL = no auto-off)

    -- Condition fields (rule_type = 'condition')
    sensor_device_id INT REFERENCES devices(id),   -- device đọc sensor
    sensor_type VARCHAR(50),                       -- temperature, humidity, etc.
    operator VARCHAR(10),                          -- '>', '<', '>=', '<=', '=='
    threshold DOUBLE PRECISION,                    -- giá trị ngưỡng
    condition_action VARCHAR(10),                  -- 'on' or 'off' khi thỏa điều kiện
    cooldown_seconds INT DEFAULT 300,              -- chờ 5 phút trước khi trigger lại

    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Environmental Alerts
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    barn_id VARCHAR(50),
    sensor_type VARCHAR(50) NOT NULL,              -- temperature, humidity, nh3, etc.
    min_value DOUBLE PRECISION,                    -- cảnh báo nếu < min
    max_value DOUBLE PRECISION,                    -- cảnh báo nếu > max
    severity VARCHAR(20) DEFAULT 'warning',        -- info, warning, danger
    enabled BOOLEAN DEFAULT TRUE,
    cooldown_minutes INT DEFAULT 15,               -- không báo lại trong 15 phút
    last_alerted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    alert_rule_id INT REFERENCES alert_rules(id),
    device_id INT REFERENCES devices(id),
    barn_id VARCHAR(50),
    sensor_type VARCHAR(50) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    direction VARCHAR(10) NOT NULL,                -- 'above' or 'below'
    severity VARCHAR(20) NOT NULL,
    message TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts (acknowledged, created_at DESC)
    WHERE NOT acknowledged;

-- 3. Firmware Management
CREATE TABLE IF NOT EXISTS firmwares (
    id SERIAL PRIMARY KEY,
    device_type_code VARCHAR(50) NOT NULL,         -- relay_4ch, sensor, mixed
    version VARCHAR(50) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size INT,
    checksum VARCHAR(64),                          -- SHA256
    changelog TEXT,
    is_latest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_type_code, version)
);

-- Done
DO $$ BEGIN RAISE NOTICE '=== Automation, alerts, firmware tables created! ==='; END $$;
