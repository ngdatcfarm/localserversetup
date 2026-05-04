-- ============================================
-- 041: Notification History & Care Dismissals
-- Purpose: Store notification history for display in notifications page
--          and care_dismissals to allow users to snooze alerts.
-- ============================================

-- notification_history: stores sent notifications (alerts + system events)
CREATE TABLE IF NOT EXISTS notification_history (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,          -- ALERT_DANGER, ALERT_WARNING, CARE_FEED_MISSING, etc.
    title VARCHAR(255) NOT NULL,
    body TEXT,
    cycle_id INTEGER,                   -- NULL for system notifications
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    acknowledged_at TIMESTAMPTZ NULL,   -- when user clicked "Đã biết"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_cycle_id ON notification_history (cycle_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history (type);

-- care_dismissals: lets user snooze a specific alert type for a cycle/day
-- e.g. Dismiss feed_morning alert for cycle 9 on 2026-04-17
CREATE TABLE IF NOT EXISTS care_dismissals (
    id SERIAL PRIMARY KEY,
    cycle_id INTEGER NOT NULL,
    alert_type VARCHAR(30) NOT NULL,     -- feed_morning, feed_afternoon, medication
    dismissed_date DATE NOT NULL,       -- the date being dismissed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cycle_id, alert_type, dismissed_date)
);

CREATE INDEX IF NOT EXISTS idx_care_dismissals_cycle_date ON care_dismissals (cycle_id, dismissed_date);

SELECT '041: notification_history and care_dismissals tables created!' AS status;
