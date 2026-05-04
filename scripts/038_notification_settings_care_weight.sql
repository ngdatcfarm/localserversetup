-- ============================================
-- ENHANCE: Care & Weight Notification Settings
-- Keys for feed, weight, medication reminders
-- ============================================

INSERT INTO notification_settings (key, value) VALUES
('feed_notifications_enabled', 'true'),
('feed_morning_alert_after_hour', '12'),
('feed_afternoon_alert_after_hour', '19'),
('weight_notifications_enabled', 'true'),
('medication_reminder_enabled', 'true'),
('care_notifications_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
