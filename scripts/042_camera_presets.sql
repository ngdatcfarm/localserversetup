-- Camera Presets V2: Multi-type preset system
-- Supports: ptz_position, snapshot, video, alert_trigger

CREATE TABLE IF NOT EXISTS camera_presets (
    id SERIAL PRIMARY KEY,
    camera_id VARCHAR(20) NOT NULL,
    preset_type VARCHAR(20) NOT NULL CHECK (preset_type IN ('ptz_position', 'snapshot', 'video', 'alert_trigger')),
    name VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (camera_id, preset_type, name)
);

-- Index for camera_id lookups
CREATE INDEX IF NOT EXISTS idx_camera_presets_camera_id ON camera_presets(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_presets_type ON camera_presets(preset_type);

-- Config JSONB structure by type:
-- ptz_position:   {"pan": int, "tilt": int}
-- snapshot:       {"count": int, "interval_sec": int}
-- video:          {"duration_sec": int}
-- alert_trigger:  {"event_types": ["feed_missing", "weight_reminder"]}