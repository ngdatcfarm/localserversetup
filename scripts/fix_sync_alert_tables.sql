-- Create missing alert tables for sync

-- 1. Create sensor_alerts table
CREATE TABLE IF NOT EXISTS sensor_alerts (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER,
    barn_id VARCHAR(50),
    alert_type VARCHAR(50),
    threshold_value DOUBLE PRECISION,
    actual_value DOUBLE PRECISION,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create device_alerts table
CREATE TABLE IF NOT EXISTS device_alerts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER,
    alert_type VARCHAR(50),
    message TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Add missing columns to warehouses if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'warehouses' AND column_name = 'note'
    ) THEN
        ALTER TABLE warehouses ADD COLUMN note TEXT DEFAULT '';
    END IF;
END $$;

-- 4. Verify notification_settings has the right structure
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notification_settings' AND column_name = 'key'
    ) THEN
        ALTER TABLE notification_settings ADD COLUMN key VARCHAR(100);
    END IF;
END $$;
