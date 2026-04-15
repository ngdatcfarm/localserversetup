-- ============================================
-- 039: Sync notification_settings & push_subscriptions to Cloud
-- Purpose: Add cloud-side tables for syncing notification settings
--          and Web Push subscriptions so cloud can send push notifications
--          to remote subscribers.
-- ============================================
SET client_encoding = 'UTF8';

-- notification_settings: key-value store for notification toggles
-- Local table has: id, key (unique), value, updated_at
-- Cloud needs same structure for sync handler (_sync_notification_settings)
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_key ON notification_settings (key);

-- Insert default vaccine notification setting on cloud if not exists
INSERT INTO notification_settings (key, value)
VALUES ('vaccine_notifications_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- push_subscriptions: Web Push subscription storage
-- Local table has: id, endpoint (unique), p256dh, auth, user_label, created_at
-- Cloud needs same structure for sync handler (_sync_push_subscriptions)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL DEFAULT '',
    auth TEXT NOT NULL DEFAULT '',
    user_label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
