-- 061_cloud_sync_archive_gates.sql
-- Date: 2026-09-07
-- Purpose: Add archive gate to all sync_queue trigger functions.
--          When sync_config.archived = 'true', triggers bail early instead
--          of inserting into sync_queue. This is the final piece of the
--          cloud DB sync archive (replaced by Cloudflare Worker for notifications).
--
-- Reactivation: DELETE FROM sync_config WHERE key='archived'; triggers auto-resume.

BEGIN;

-- Mark cloud DB sync as archived
INSERT INTO sync_config (key, value, updated_at) VALUES
    ('archived', 'true', NOW()),
    ('archive_reason', 'cloud_db_sync_replaced_by_cloudflare_worker_2026-09-07', NOW()),
    ('archive_date', '2026-09-07', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Clear cloud_url so all sync_service guards short-circuit (no-op behavior).
UPDATE sync_config SET value = '', updated_at = NOW() WHERE key = 'cloud_url';

-- Trigger function: generic (used by trg_sync_barns, trg_sync_cycles, etc.)
CREATE OR REPLACE FUNCTION fn_sync_queue_change() RETURNS TRIGGER AS $$
DECLARE
    v_archived BOOLEAN;
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
    -- ARCHIVE GATE: bail early if cloud DB sync is archived.
    SELECT (value = 'true') INTO v_archived FROM sync_config WHERE key = 'archived';
    IF v_archived THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.id::TEXT;
        v_payload := to_jsonb(OLD);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.id::TEXT;
        v_payload := to_jsonb(NEW);
    ELSE
        v_action := 'insert';
        v_record_id := NEW.id::TEXT;
        v_payload := to_jsonb(NEW);
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload)
    VALUES (TG_TABLE_NAME, v_record_id, v_action, v_payload);

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: notification_settings (uses key, not id)
CREATE OR REPLACE FUNCTION fn_sync_queue_change_notification_settings() RETURNS TRIGGER AS $$
DECLARE
    v_archived BOOLEAN;
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
    SELECT (value = 'true') INTO v_archived FROM sync_config WHERE key = 'archived';
    IF v_archived THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_record_id := NEW.key;
        v_payload := jsonb_build_object('key', NEW.key, 'value', NEW.value, 'updated_at', NEW.updated_at);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.key;
        v_payload := jsonb_build_object('key', NEW.key, 'value', NEW.value, 'updated_at', NEW.updated_at);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.key;
        v_payload := jsonb_build_object('key', OLD.key, 'value', OLD.value);
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload, source)
    VALUES ('notification_settings', v_record_id, v_action, v_payload, 'local');

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger function: push_subscriptions (uses endpoint, not id)
CREATE OR REPLACE FUNCTION fn_sync_queue_change_push_subscriptions() RETURNS TRIGGER AS $$
DECLARE
    v_archived BOOLEAN;
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
    SELECT (value = 'true') INTO v_archived FROM sync_config WHERE key = 'archived';
    IF v_archived THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_record_id := NEW.endpoint;
        v_payload := jsonb_build_object('endpoint', NEW.endpoint, 'p256dh', NEW.p256dh, 'auth', NEW.auth, 'user_label', NEW.user_label, 'created_at', NEW.created_at);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.endpoint;
        v_payload := jsonb_build_object('endpoint', NEW.endpoint, 'p256dh', NEW.p256dh, 'auth', NEW.auth, 'user_label', NEW.user_label);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.endpoint;
        v_payload := jsonb_build_object('endpoint', OLD.endpoint);
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload, source)
    VALUES ('push_subscriptions', v_record_id, v_action, v_payload, 'local');

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger function: legacy sync_queue_trigger (used by some early tables)
CREATE OR REPLACE FUNCTION sync_queue_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_archived BOOLEAN;
BEGIN
    SELECT (value = 'true') INTO v_archived FROM sync_config WHERE key = 'archived';
    IF v_archived THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload, created_at)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE TG_OP WHEN 'DELETE' THEN 'delete' ELSE 'update' END,
        row_to_json(COALESCE(NEW, OLD)),
        NOW()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Cleanup any pending sync queue items (would otherwise accumulate forever
-- when service was offline and not draining). Future inserts are gated by
-- the archive gate above.
DELETE FROM sync_queue;

COMMIT;