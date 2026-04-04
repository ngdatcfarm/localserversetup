-- ============================================
-- Expand Sync Queue Table
-- Date: 2026-04-04
-- Purpose: Add priority, retry, version columns to sync_queue
-- ============================================

-- Add priority (for processing order)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Add retry_count (number of retry attempts)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add retry_at (when to retry next)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS retry_at TIMESTAMPTZ;

-- Add last_error (error message from last attempt)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add version (for optimistic locking / conflict detection)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add processed_at (when fully processed)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Add expires_at (when this queue item expires)
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add source (where this entry came from: 'local' or 'cloud')
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'local';

CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue (priority DESC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue (retry_count);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue (synced);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue (table_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_expires ON sync_queue (expires_at);

DO $$ BEGIN
    RAISE NOTICE '=== Script 030: sync_queue expanded successfully ===';
END $$;
