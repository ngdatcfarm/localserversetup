-- 006: Sync Config & Queue tables for cloud-local bidirectional sync
-- Run: psql -U postgres -d cfarm_local -f scripts/006_sync_config.sql

SET client_encoding = 'UTF8';

-- ═══════════════════════════════════════════════════
-- A) sync_config - Key-value config for sync service
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sync_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Default config values
INSERT INTO sync_config (key, value) VALUES
    ('cloud_url', 'https://cfarm.vn'),
    ('api_token', ''),
    ('local_token', ''),
    ('sync_interval', '60'),
    ('push_batch_size', '100'),
    ('enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- B) sync_queue - Outbound queue (local → cloud)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sync_queue (
    id          SERIAL PRIMARY KEY,
    table_name  VARCHAR(100) NOT NULL,
    record_id   VARCHAR(100) NOT NULL,
    action      VARCHAR(20) NOT NULL DEFAULT 'insert',  -- insert, update, delete
    payload     JSONB,
    synced      BOOLEAN DEFAULT FALSE,
    synced_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue (synced, created_at) WHERE synced = FALSE;

-- ═══════════════════════════════════════════════════
-- C) sync_log - Audit log for sync operations
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sync_log (
    id          SERIAL PRIMARY KEY,
    direction   VARCHAR(10) NOT NULL,  -- push, pull
    items_count INTEGER DEFAULT 0,
    status      VARCHAR(20) DEFAULT 'ok',  -- ok, error
    error_msg   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
-- D) Grant permissions
-- ═══════════════════════════════════════════════════
DO $$
BEGIN
    EXECUTE 'GRANT ALL ON sync_config, sync_queue, sync_log TO cfarm';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfarm';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant permissions (user may not exist) - OK';
END $$;

SELECT 'Sync tables created successfully!' AS status;
