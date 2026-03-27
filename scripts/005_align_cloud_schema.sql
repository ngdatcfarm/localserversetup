-- ============================================
-- 005: Align Local Schema with Cloud (cfarm.vn)
-- Purpose: Sync database structure for future cloud-to-local migration
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- PHASE A: Device Tables - Align with Cloud
-- ============================================

-- A1. device_types: cloud uses different columns
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS device_class VARCHAR(20);
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS total_channels INT;
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS mqtt_protocol JSONB;
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
-- Migrate data: channel_count -> total_channels, code -> keep for local compatibility
UPDATE device_types SET total_channels = channel_count WHERE total_channels IS NULL;

-- A2. devices: add cloud columns
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ping_sent_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ping_response_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ping_fail_count INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS env_interval_seconds INT DEFAULT 300;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes TEXT;

-- A3. device_channels: add cloud columns
ALTER TABLE device_channels ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) DEFAULT 'other';
ALTER TABLE device_channels ADD COLUMN IF NOT EXISTS max_on_seconds INT DEFAULT 120;
ALTER TABLE device_channels ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE device_channels ADD COLUMN IF NOT EXISTS sort_order INT;

-- A4. device_commands: add cloud columns
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES device_channels(id);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS barn_id VARCHAR(50);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS cycle_id INT;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS response_payload JSONB;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- A5. curtain_configs: align with cloud
ALTER TABLE curtain_configs ADD COLUMN IF NOT EXISTS moving_state VARCHAR(20) DEFAULT 'idle';
ALTER TABLE curtain_configs ADD COLUMN IF NOT EXISTS last_moved_at TIMESTAMPTZ;
ALTER TABLE curtain_configs ADD COLUMN IF NOT EXISTS moving_target_pct INT;
ALTER TABLE curtain_configs ADD COLUMN IF NOT EXISTS moving_started_at TIMESTAMPTZ;
ALTER TABLE curtain_configs ADD COLUMN IF NOT EXISTS moving_duration_seconds FLOAT;

-- A6. New: device_pings (cloud table)
CREATE TABLE IF NOT EXISTS device_pings (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    ping_sent_at TIMESTAMPTZ,
    ping_response_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- A7. New: device_relay_states (cloud uses this instead of device_states)
CREATE TABLE IF NOT EXISTS device_relay_states (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_id INT REFERENCES device_channels(id),
    state VARCHAR(20) NOT NULL,
    position_pct INT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, channel_id)
);

-- A8. New: device_relay_logs
CREATE TABLE IF NOT EXISTS device_relay_logs (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_id INT REFERENCES device_channels(id),
    curtain_config_id INT REFERENCES curtain_configs(id),
    state VARCHAR(20) NOT NULL,
    position_pct INT,
    logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- A9. New: device_firmwares (cloud version - different from local firmwares)
CREATE TABLE IF NOT EXISTS device_firmwares (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    device_type_id INT REFERENCES device_types(id),
    code TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_latest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE B: Sensor/Environment Tables
-- ============================================

-- B1. env_readings (cloud's comprehensive sensor table)
CREATE TABLE IF NOT EXISTS env_readings (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    barn_id VARCHAR(50),
    cycle_id INT,
    day_age INT,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    heat_index DOUBLE PRECISION,
    nh3_ppm DOUBLE PRECISION,
    co2_ppm DOUBLE PRECISION,
    wind_speed_ms DOUBLE PRECISION,
    fan_rpm DOUBLE PRECISION,
    light_lux DOUBLE PRECISION,
    outdoor_temp DOUBLE PRECISION,
    outdoor_humidity DOUBLE PRECISION,
    is_raining BOOLEAN,
    rain_mm DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_env_device_time ON env_readings (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_env_barn_time ON env_readings (barn_id, recorded_at DESC);

-- B2. weather_readings
CREATE TABLE IF NOT EXISTS weather_readings (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    barn_id VARCHAR(50),
    cycle_id INT,
    day_age INT,
    wind_speed_ms DOUBLE PRECISION,
    wind_direction_deg DOUBLE PRECISION,
    is_raining BOOLEAN,
    rainfall_mm DOUBLE PRECISION,
    outdoor_temp DOUBLE PRECISION,
    outdoor_humidity DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- B3. sensor_readings (simple cloud table)
CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    heat_index DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE C: Farm Management - Align with Cloud
-- ============================================

-- C1. barns: restructure to match cloud
ALTER TABLE barns ADD COLUMN IF NOT EXISTS number INT;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS length_m DECIMAL(10,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS width_m DECIMAL(10,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS height_m DECIMAL(10,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE barns ADD COLUMN IF NOT EXISTS note TEXT;
-- Keep capacity and area_sqm for backward compat, they can be computed

-- C2. cycles: major restructure to match cloud
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS parent_cycle_id INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS split_date DATE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS season VARCHAR(50);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS flock_source VARCHAR(100);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS male_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS female_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS stage VARCHAR(20) DEFAULT 'chick';
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS vaccine_program_id INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS final_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_sold_weight_kg DOUBLE PRECISION;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_revenue DOUBLE PRECISION;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS close_reason TEXT;
-- Cloud uses initial_quantity (same as initial_count), current_quantity (same as current_count)
-- Rename breed to ensure compatibility (already exists)

-- C3. cycle_daily_snapshots: restructure to match cloud
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS alive_total INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS alive_male INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS alive_female INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS dead_today INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS sold_today INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS sold_male_today INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS sold_female_today INT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS bird_days_cumulative BIGINT;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS feed_poured_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS feed_remaining_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS feed_consumed_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS feed_cumulative_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS avg_weight_g DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS avg_weight_male_g DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS avg_weight_female_g DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS biomass_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS biomass_dead_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS biomass_sold_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS weight_produced_kg DOUBLE PRECISION;
ALTER TABLE cycle_daily_snapshots ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ;

-- ============================================
-- PHASE D: Feed System (Cloud has detailed feed management)
-- ============================================

-- D1. feed_brands
CREATE TABLE IF NOT EXISTS feed_brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    kg_per_bag DECIMAL(10,2),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D2. feed_types
CREATE TABLE IF NOT EXISTS feed_types (
    id SERIAL PRIMARY KEY,
    feed_brand_id INT REFERENCES feed_brands(id),
    code VARCHAR(50),
    price_per_bag DECIMAL(15,2),
    name VARCHAR(200) NOT NULL,
    suggested_stage VARCHAR(20),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D3. feed_remaining_checks
CREATE TABLE IF NOT EXISTS feed_remaining_checks (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    ref_feed_id INT REFERENCES care_feeds(id),
    remaining_pct DOUBLE PRECISION,
    checked_at TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D4. cycle_feed_programs
CREATE TABLE IF NOT EXISTS cycle_feed_programs (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    feed_brand_id INT REFERENCES feed_brands(id),
    start_date DATE,
    end_date DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D5. cycle_feed_program_items
CREATE TABLE IF NOT EXISTS cycle_feed_program_items (
    id SERIAL PRIMARY KEY,
    cycle_feed_program_id INT REFERENCES cycle_feed_programs(id),
    inventory_item_id INT,
    stage VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D6. cycle_feed_stages
CREATE TABLE IF NOT EXISTS cycle_feed_stages (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    stage VARCHAR(20),
    primary_feed_type_id INT REFERENCES feed_types(id),
    mix_feed_type_id INT REFERENCES feed_types(id),
    mix_ratio DOUBLE PRECISION,
    effective_date DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D7. care_feeds: add cloud columns
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS feed_type_id INT REFERENCES feed_types(id);
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS bags DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS kg_actual DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS remaining_pct DOUBLE PRECISION;
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS session VARCHAR(20);
ALTER TABLE care_feeds ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- PHASE E: Care Tables - Align with Cloud
-- ============================================

-- E1. care_deaths: add cloud columns
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS reason VARCHAR(200);
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS death_category VARCHAR(50);
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS health_note_id INT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE care_deaths ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
-- Migrate: count -> quantity
UPDATE care_deaths SET quantity = count WHERE quantity IS NULL AND count IS NOT NULL;

-- E2. care_medications: add cloud columns
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS medication_id INT;
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS medication_name VARCHAR(200);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS dosage DOUBLE PRECISION;
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- E3. care_sales: add cloud columns
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS weight_kg DOUBLE PRECISION;
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS price_per_kg DOUBLE PRECISION;
ALTER TABLE care_sales ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- E4. care_expenses (new cloud table)
CREATE TABLE IF NOT EXISTS care_expenses (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    category VARCHAR(50),
    label VARCHAR(200),
    amount DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E5. care_item_uses (new cloud table)
CREATE TABLE IF NOT EXISTS care_item_uses (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    item_id INT,
    quantity DOUBLE PRECISION,
    unit VARCHAR(20),
    note TEXT,
    recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E6. health_notes (new cloud table)
CREATE TABLE IF NOT EXISTS health_notes (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    recorded_at TIMESTAMPTZ,
    day_age INT,
    severity VARCHAR(20),
    symptoms TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    image_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E7. cycle_splits (new)
CREATE TABLE IF NOT EXISTS cycle_splits (
    id SERIAL PRIMARY KEY,
    from_cycle_id INT REFERENCES cycles(id),
    to_cycle_id INT REFERENCES cycles(id),
    quantity INT,
    split_date DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE F: Weight System - Align with Cloud
-- ============================================

-- F1. weight_sessions (cloud version of care_weights)
CREATE TABLE IF NOT EXISTS weight_sessions (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    day_age INT,
    sample_count INT,
    avg_weight_g DOUBLE PRECISION,
    note TEXT,
    weighed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- F2. weight_details (individual bird weights)
CREATE TABLE IF NOT EXISTS weight_details (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES weight_sessions(id) ON DELETE CASCADE,
    weight_g DOUBLE PRECISION,
    gender VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE G: Medication & Vaccine System
-- ============================================

-- G1. medications (master catalog)
CREATE TABLE IF NOT EXISTS medications (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20),
    category VARCHAR(50),
    manufacturer VARCHAR(200),
    price_per_unit DECIMAL(15,2),
    recommended_dose TEXT,
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- G2. vaccine_programs
CREATE TABLE IF NOT EXISTS vaccine_programs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    note TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- G3. vaccine_program_items
CREATE TABLE IF NOT EXISTS vaccine_program_items (
    id SERIAL PRIMARY KEY,
    program_id INT REFERENCES vaccine_programs(id) ON DELETE CASCADE,
    vaccine_brand_id INT,
    vaccine_name VARCHAR(200),
    day_age INT,
    method VARCHAR(50),
    remind_days INT DEFAULT 1,
    sort_order INT
);

-- G4. vaccine_schedules (per cycle)
CREATE TABLE IF NOT EXISTS vaccine_schedules (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    vaccine_name VARCHAR(200),
    scheduled_date DATE,
    day_age_target INT,
    method VARCHAR(50),
    dosage TEXT,
    remind_days INT DEFAULT 1,
    done BOOLEAN DEFAULT FALSE,
    done_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    skipped BOOLEAN DEFAULT FALSE,
    skip_reason TEXT,
    vaccine_brand_id INT,
    program_item_id INT REFERENCES vaccine_program_items(id)
);

-- ============================================
-- PHASE H: Inventory System - Align with Cloud
-- ============================================

-- H1. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- H2. inventory_items (cloud's master catalog - replaces products)
CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sub_category VARCHAR(50),
    unit VARCHAR(20),
    ref_medication_id INT REFERENCES medications(id),
    ref_feed_brand_id INT REFERENCES feed_brands(id),
    ref_feed_type_id INT REFERENCES feed_types(id),
    min_stock_alert DECIMAL(15,2) DEFAULT 0,
    supplier_id INT REFERENCES suppliers(id),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- H3. inventory_purchases
CREATE TABLE IF NOT EXISTS inventory_purchases (
    id SERIAL PRIMARY KEY,
    item_id INT REFERENCES inventory_items(id),
    supplier_id INT REFERENCES suppliers(id),
    quantity DOUBLE PRECISION,
    unit_price DOUBLE PRECISION,
    total_price DOUBLE PRECISION,
    purchased_at DATE,
    expiry_date DATE,
    batch_no VARCHAR(100),
    storage_location VARCHAR(200),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- H4. inventory_sales
CREATE TABLE IF NOT EXISTS inventory_sales (
    id SERIAL PRIMARY KEY,
    item_id INT REFERENCES inventory_items(id),
    buyer_name VARCHAR(200),
    buyer_phone VARCHAR(50),
    quantity DOUBLE PRECISION,
    unit_price DOUBLE PRECISION,
    total_price DOUBLE PRECISION,
    sold_at DATE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- H5. inventory_barn_stock (stock per barn - cloud approach)
CREATE TABLE IF NOT EXISTS inventory_barn_stock (
    id SERIAL PRIMARY KEY,
    item_id INT REFERENCES inventory_items(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    quantity DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, barn_id)
);

-- H6. Cloud-style inventory_transactions (different from local version)
-- Local already has inventory_transactions - add missing cloud columns
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS item_id INT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS txn_type VARCHAR(20);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS from_barn_id VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS to_barn_id VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS ref_purchase_id INT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS ref_care_feed_id INT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS ref_care_medication_id INT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS cycle_id INT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS install_location VARCHAR(200);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

-- ============================================
-- PHASE I: Notification System - Align with Cloud
-- ============================================

-- I1. notification_rules (cloud's rule-based notifications)
CREATE TABLE IF NOT EXISTS notification_rules (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(200),
    level VARCHAR(20) DEFAULT 'blue',
    enabled BOOLEAN DEFAULT TRUE,
    interval_min INT DEFAULT 1440,
    send_at_hour INT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default notification rules from cloud
INSERT INTO notification_rules (code, label, level, enabled, interval_min, send_at_hour) VALUES
    ('MISSING_FEED', 'Missing feed record', 'orange', TRUE, 360, NULL),
    ('FEED_DROP', 'Feed quantity dropped suddenly', 'blue', TRUE, 1440, 7),
    ('DEATH_SPIKE', 'Death spike detected', 'blue', TRUE, 1440, 7),
    ('HIGH_DEATH_RATE', 'High death rate threshold', 'blue', TRUE, 1440, 7),
    ('NO_WEIGH', 'No weight record', 'blue', TRUE, 1440, 7),
    ('REMIND_WEIGH', 'Weight reminder', 'blue', TRUE, 1440, 8),
    ('DAILY_REPORT', 'Daily report', 'blue', TRUE, 1440, 20),
    ('VACCINE_REMIND', 'Vaccine reminder', 'red', TRUE, 1440, 7)
ON CONFLICT (code) DO NOTHING;

-- I2. notification_logs
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50),
    title TEXT,
    body TEXT,
    cycle_id INT,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    acknowledged_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- I3. push_subscriptions: add cloud columns
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- ============================================
-- PHASE J: Auth & Users
-- ============================================

-- J1. users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- J2. api_tokens
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE K: Indexes for new tables
-- ============================================

CREATE INDEX IF NOT EXISTS idx_env_readings_barn ON env_readings (barn_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_pings_device ON device_pings (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_sessions_cycle ON weight_sessions (cycle_id, weighed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vaccine_schedules_cycle ON vaccine_schedules (cycle_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_inv_items_category ON inventory_items (category, status);
CREATE INDEX IF NOT EXISTS idx_inv_barn_stock ON inventory_barn_stock (item_id, barn_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs (type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_expenses_cycle ON care_expenses (cycle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_notes_cycle ON health_notes (cycle_id, recorded_at DESC);

-- ============================================
-- GRANT permissions
-- ============================================

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm';
    RAISE NOTICE 'Granted privileges to cfarm user';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm user (may not exist) - OK';
END $$;

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm_local';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm_local';
    RAISE NOTICE 'Granted privileges to cfarm_local user';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm_local user (may not exist) - OK';
END $$;

DO $$ BEGIN RAISE NOTICE '=== Cloud schema alignment complete! ==='; END $$;
