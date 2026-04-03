-- ============================================
-- 010: Hybrid Device Control - Priority System
-- Purpose: Add priority-based command coordination
--          LOCAL/MANUAL > CLOUD > AUTOMATION
-- ============================================
SET client_encoding = 'UTF8';

-- ============================================
-- PHASE A: Add priority columns to device_commands
-- ============================================

ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS source_priority INT DEFAULT 2;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sequence_number BIGINT;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS requires_ack BOOLEAN DEFAULT FALSE;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS lock_until TIMESTAMPTZ;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

COMMENT ON COLUMN device_commands.source_priority IS '1=local, 2=manual, 3=cloud, 4=automation';
COMMENT ON COLUMN device_commands.sequence_number IS 'Per-device monotonic sequence for ordering';

-- ============================================
-- PHASE B: Sequence tracker per device
-- ============================================

CREATE TABLE IF NOT EXISTS device_command_sequences (
    device_id INT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    last_sequence_number BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PHASE C: Per-device/channel command locks
-- ============================================

CREATE TABLE IF NOT EXISTS device_command_locks (
    device_id INT NOT NULL,
    channel_id INT NOT NULL,
    locked_by_command_id INT,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    lock_expires_at TIMESTAMPTZ,
    source VARCHAR(20),
    PRIMARY KEY (device_id, channel_id)
);

-- ============================================
-- PHASE D: Indexes for hybrid control queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_device_commands_sequence ON device_commands (device_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON device_commands (device_id, status) WHERE status IN ('pending', 'sent');
CREATE INDEX IF NOT EXISTS idx_device_command_locks_expires ON device_command_locks (lock_expires_at);

-- ============================================
-- PHASE E: Auto-expire stale locks on startup
-- ============================================

DO $$
BEGIN
    -- Clean up any expired locks
    DELETE FROM device_command_locks WHERE lock_expires_at IS NOT NULL AND lock_expires_at < NOW();
    RAISE NOTICE 'Cleaned up expired device command locks';
END $$;

-- ============================================
-- PHASE F: Grant permissions
-- ============================================

DO $$
BEGIN
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cfarm';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cfarm';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant to cfarm user - OK';
END $$;

DO $$ BEGIN RAISE NOTICE '=== 010: Hybrid device control tables created! ==='; END $$;
