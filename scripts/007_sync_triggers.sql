-- 007: Database triggers to auto-queue changes for cloud sync
-- Run: psql -U postgres -d cfarm_local -f scripts/007_sync_triggers.sql

SET client_encoding = 'UTF8';

-- ═══════════════════════════════════════════════════
-- A) Generic trigger function for sync queue
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_queue_change()
RETURNS TRIGGER AS $$
DECLARE
    v_action TEXT;
    v_record_id TEXT;
    v_payload JSONB;
BEGIN
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

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════
-- B) Create triggers on all syncable tables
-- ═══════════════════════════════════════════════════

-- Farm structure tables
DO $$ BEGIN
    -- barns
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'barns') THEN
        DROP TRIGGER IF EXISTS trg_sync_barns ON barns;
        CREATE TRIGGER trg_sync_barns AFTER INSERT OR UPDATE OR DELETE ON barns
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- cycles
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cycles') THEN
        DROP TRIGGER IF EXISTS trg_sync_cycles ON cycles;
        CREATE TRIGGER trg_sync_cycles AFTER INSERT OR UPDATE OR DELETE ON cycles
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Feed system
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_brands') THEN
        DROP TRIGGER IF EXISTS trg_sync_feed_brands ON feed_brands;
        CREATE TRIGGER trg_sync_feed_brands AFTER INSERT OR UPDATE OR DELETE ON feed_brands
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_types') THEN
        DROP TRIGGER IF EXISTS trg_sync_feed_types ON feed_types;
        CREATE TRIGGER trg_sync_feed_types AFTER INSERT OR UPDATE OR DELETE ON feed_types
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Medications
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medications') THEN
        DROP TRIGGER IF EXISTS trg_sync_medications ON medications;
        CREATE TRIGGER trg_sync_medications AFTER INSERT OR UPDATE OR DELETE ON medications
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Suppliers
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
        DROP TRIGGER IF EXISTS trg_sync_suppliers ON suppliers;
        CREATE TRIGGER trg_sync_suppliers AFTER INSERT OR UPDATE OR DELETE ON suppliers
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Vaccine programs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vaccine_programs') THEN
        DROP TRIGGER IF EXISTS trg_sync_vaccine_programs ON vaccine_programs;
        CREATE TRIGGER trg_sync_vaccine_programs AFTER INSERT OR UPDATE OR DELETE ON vaccine_programs
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vaccine_program_items') THEN
        DROP TRIGGER IF EXISTS trg_sync_vaccine_program_items ON vaccine_program_items;
        CREATE TRIGGER trg_sync_vaccine_program_items AFTER INSERT OR UPDATE OR DELETE ON vaccine_program_items
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vaccine_schedules') THEN
        DROP TRIGGER IF EXISTS trg_sync_vaccine_schedules ON vaccine_schedules;
        CREATE TRIGGER trg_sync_vaccine_schedules AFTER INSERT OR UPDATE OR DELETE ON vaccine_schedules
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Care records (table names match cloud: care_feeds, care_deaths, etc.)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_feeds') THEN
        DROP TRIGGER IF EXISTS trg_sync_care_feeds ON care_feeds;
        CREATE TRIGGER trg_sync_care_feeds AFTER INSERT OR UPDATE OR DELETE ON care_feeds
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_deaths') THEN
        DROP TRIGGER IF EXISTS trg_sync_care_deaths ON care_deaths;
        CREATE TRIGGER trg_sync_care_deaths AFTER INSERT OR UPDATE OR DELETE ON care_deaths
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_medications') THEN
        DROP TRIGGER IF EXISTS trg_sync_care_medications ON care_medications;
        CREATE TRIGGER trg_sync_care_medications AFTER INSERT OR UPDATE OR DELETE ON care_medications
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weight_sessions') THEN
        DROP TRIGGER IF EXISTS trg_sync_weight_sessions ON weight_sessions;
        CREATE TRIGGER trg_sync_weight_sessions AFTER INSERT OR UPDATE OR DELETE ON weight_sessions
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weight_details') THEN
        DROP TRIGGER IF EXISTS trg_sync_weight_details ON weight_details;
        CREATE TRIGGER trg_sync_weight_details AFTER INSERT OR UPDATE OR DELETE ON weight_details
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_sales') THEN
        DROP TRIGGER IF EXISTS trg_sync_care_sales ON care_sales;
        CREATE TRIGGER trg_sync_care_sales AFTER INSERT OR UPDATE OR DELETE ON care_sales
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Cycle splits
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cycle_splits') THEN
        DROP TRIGGER IF EXISTS trg_sync_cycle_splits ON cycle_splits;
        CREATE TRIGGER trg_sync_cycle_splits AFTER INSERT OR UPDATE OR DELETE ON cycle_splits
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Health notes
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'health_notes') THEN
        DROP TRIGGER IF EXISTS trg_sync_health_notes ON health_notes;
        CREATE TRIGGER trg_sync_health_notes AFTER INSERT OR UPDATE OR DELETE ON health_notes
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Devices
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'devices') THEN
        DROP TRIGGER IF EXISTS trg_sync_devices ON devices;
        CREATE TRIGGER trg_sync_devices AFTER INSERT OR UPDATE OR DELETE ON devices
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Notification rules
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_rules') THEN
        DROP TRIGGER IF EXISTS trg_sync_notification_rules ON notification_rules;
        CREATE TRIGGER trg_sync_notification_rules AFTER INSERT OR UPDATE OR DELETE ON notification_rules
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

    -- Alerts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alerts') THEN
        DROP TRIGGER IF EXISTS trg_sync_alerts ON alerts;
        CREATE TRIGGER trg_sync_alerts AFTER INSERT OR UPDATE OR DELETE ON alerts
            FOR EACH ROW EXECUTE FUNCTION fn_sync_queue_change();
    END IF;

END $$;

SELECT 'Sync triggers created for all tables!' AS status;
