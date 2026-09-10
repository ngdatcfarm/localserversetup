-- 059_security.sql
-- Anti-theft / Person Detection (Phase 1 — manual arm/disarm)
--   - security_zones:    config table — 1 row per monitored camera
--   - security_events:   time-series hypertable — one row per detection
--   - 30-day retention via TimescaleDB add_retention_policy
--   - Falls back to a plain table if TimescaleDB extension is not installed
--
-- Indexes:
--   (zone_id, time DESC)        — event feed per zone
--   (camera_id, time DESC)      — event feed per camera
--   (time DESC) WHERE NOT ack   — unacknowledged badge query
--
-- Trigger: auto-update updated_at on security_zones (mirrors other tables)

-- (1) Zones (config)
CREATE TABLE IF NOT EXISTS security_zones (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    armed BOOLEAN NOT NULL DEFAULT FALSE,
    motion_threshold REAL NOT NULL DEFAULT 0.05,        -- 5% of pixels moving = trigger
    yolo_confidence REAL NOT NULL DEFAULT 0.30,         -- 30% = accept more (anti-theft bias)
    cooldown_seconds INTEGER NOT NULL DEFAULT 60,
    trigger_siren BOOLEAN NOT NULL DEFAULT FALSE,
    siren_device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    siren_channel INTEGER,
    siren_duration_seconds INTEGER NOT NULL DEFAULT 30,
    notes TEXT,
    created_by_user_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(camera_id)                                  -- Phase 1: 1 zone per camera
);
CREATE INDEX IF NOT EXISTS idx_security_zones_armed
    ON security_zones (armed) WHERE armed = TRUE;

-- (2) Events (time-series)
CREATE TABLE IF NOT EXISTS security_events (
    time TIMESTAMPTZ NOT NULL,
    id BIGSERIAL,
    zone_id INTEGER NOT NULL REFERENCES security_zones(id) ON DELETE CASCADE,
    camera_id TEXT NOT NULL,
    confidence REAL,
    bbox_x INTEGER, bbox_y INTEGER, bbox_w INTEGER, bbox_h INTEGER,
    snapshot_path TEXT,        -- E:\AI\Snapshots\security\YYYY-MM-DD\cam_X_ts.jpg
    snapshot_url TEXT,         -- /snapshots/security/YYYY-MM-DD/cam_X_ts.jpg
    siren_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_user_id INTEGER,
    PRIMARY KEY (id, time)
);

-- (3) Hypertable with plain-table fallback
DO $$
BEGIN
    PERFORM create_hypertable('security_events', 'time', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'security_events: TimescaleDB not available, using plain table';
END $$;

-- (4) Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_security_events_camera
    ON security_events (camera_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_zone
    ON security_events (zone_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_unack
    ON security_events (time DESC) WHERE acknowledged_at IS NULL;

-- (5) Retention policy — auto-drop events older than 30 days
DO $$
BEGIN
    PERFORM add_retention_policy('security_events', INTERVAL '30 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'security_events: retention policy not created';
END $$;

-- (6) Trigger: auto-update updated_at on security_zones
CREATE OR REPLACE FUNCTION update_security_zones_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_zones_updated_at ON security_zones;
CREATE TRIGGER trg_security_zones_updated_at
    BEFORE UPDATE ON security_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_security_zones_updated_at();