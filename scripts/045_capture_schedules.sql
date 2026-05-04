-- Capture schedule table for automated dataset collection

CREATE TABLE IF NOT EXISTS capture_schedules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    camera_id VARCHAR(50) NOT NULL,
    preset_id INTEGER NOT NULL,
    -- Schedule times (hour of day, 0-23)
    schedule_hours INTEGER[] DEFAULT ARRAY[6, 11, 15, 19],
    -- Capture settings
    shots_per_capture INTEGER DEFAULT 10,
    interval_seconds FLOAT DEFAULT 2.0,
    -- Duration
    start_date DATE DEFAULT CURRENT_DATE,
    total_days INTEGER DEFAULT 3,
    -- Status
    enabled BOOLEAN DEFAULT TRUE,
    is_running BOOLEAN DEFAULT FALSE,
    last_capture_at TIMESTAMPTZ,
    next_capture_at TIMESTAMPTZ,
    -- Stats
    total_captures INTEGER DEFAULT 0,
    total_images INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capture log to track individual captures
CREATE TABLE IF NOT EXISTS capture_logs (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES capture_schedules(id) ON DELETE CASCADE,
    capture_time TIMESTAMPTZ NOT NULL,
    preset_id INTEGER NOT NULL,
    images_captured INTEGER DEFAULT 0,
    errors TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capture_schedules_enabled ON capture_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_capture_logs_schedule ON capture_logs(schedule_id);