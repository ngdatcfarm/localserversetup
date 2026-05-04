-- ============================================
-- ENHANCE: Notification Settings Table
-- Global settings for enabling/disabling notification types
-- ============================================

CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default vaccine notification setting
INSERT INTO notification_settings (key, value)
VALUES ('vaccine_notifications_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_notification_settings_key ON notification_settings (key);
