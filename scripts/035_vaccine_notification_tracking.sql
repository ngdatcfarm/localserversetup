-- ============================================
-- ENHANCE: Vaccine Notification System
-- Add notified_at to track sent reminders
-- ============================================

ALTER TABLE vaccine_schedules ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN vaccine_schedules.notified_at IS 'When vaccine reminder notification was sent';
