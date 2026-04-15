-- ============================================
-- 040: Add sync triggers for notification_settings and push_subscriptions
-- These tables need triggers to automatically add entries to sync_queue
-- when data changes (INSERT/UPDATE/DELETE).
-- ============================================

-- Trigger function for notification_settings
CREATE OR REPLACE FUNCTION fn_sync_queue_change_notification_settings()
RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_record_id := NEW.key;
        v_payload := jsonb_build_object(
            'key', NEW.key,
            'value', NEW.value,
            'updated_at', NEW.updated_at
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.key;
        v_payload := jsonb_build_object(
            'key', NEW.key,
            'value', NEW.value,
            'updated_at', NEW.updated_at
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.key;
        v_payload := jsonb_build_object(
            'key', OLD.key,
            'value', OLD.value
        );
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload, source)
    VALUES ('notification_settings', v_record_id, v_action, v_payload, 'local');

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for notification_settings INSERT
DROP TRIGGER IF EXISTS trg_sync_notification_settings ON notification_settings;
CREATE TRIGGER trg_sync_notification_settings
    AFTER INSERT ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_notification_settings();

-- Trigger for notification_settings UPDATE
DROP TRIGGER IF EXISTS trg_sync_notification_settings_upd ON notification_settings;
CREATE TRIGGER trg_sync_notification_settings_upd
    AFTER UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_notification_settings();

-- Trigger for notification_settings DELETE
DROP TRIGGER IF EXISTS trg_sync_notification_settings_del ON notification_settings;
CREATE TRIGGER trg_sync_notification_settings_del
    AFTER DELETE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_notification_settings();

-- Trigger function for push_subscriptions
CREATE OR REPLACE FUNCTION fn_sync_queue_change_push_subscriptions()
RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'insert';
        v_record_id := NEW.endpoint;
        v_payload := jsonb_build_object(
            'endpoint', NEW.endpoint,
            'p256dh', NEW.p256dh,
            'auth', NEW.auth,
            'user_label', NEW.user_label,
            'created_at', NEW.created_at
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_record_id := NEW.endpoint;
        v_payload := jsonb_build_object(
            'endpoint', NEW.endpoint,
            'p256dh', NEW.p256dh,
            'auth', NEW.auth,
            'user_label', NEW.user_label
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete';
        v_record_id := OLD.endpoint;
        v_payload := jsonb_build_object(
            'endpoint', OLD.endpoint
        );
    END IF;

    INSERT INTO sync_queue (table_name, record_id, action, payload, source)
    VALUES ('push_subscriptions', v_record_id, v_action, v_payload, 'local');

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for push_subscriptions INSERT
DROP TRIGGER IF EXISTS trg_sync_push_subscriptions ON push_subscriptions;
CREATE TRIGGER trg_sync_push_subscriptions
    AFTER INSERT ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_push_subscriptions();

-- Trigger for push_subscriptions UPDATE
DROP TRIGGER IF EXISTS trg_sync_push_subscriptions_upd ON push_subscriptions;
CREATE TRIGGER trg_sync_push_subscriptions_upd
    AFTER UPDATE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_push_subscriptions();

-- Trigger for push_subscriptions DELETE
DROP TRIGGER IF EXISTS trg_sync_push_subscriptions_del ON push_subscriptions;
CREATE TRIGGER trg_sync_push_subscriptions_del
    AFTER DELETE ON push_subscriptions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change_push_subscriptions();

SELECT 'Sync triggers for notification_settings and push_subscriptions created!' AS status;
