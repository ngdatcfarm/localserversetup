-- 065_brooder_zones.sql
-- Date: 2026-09-17
-- Purpose: Phase B of Brooder Zone Refactor.
--          A Zone is a thermal control unit: 1 zone = 1 PID + multiple
--          heaters (across N ESP32 nodes) + M reference sensors. The
--          zone is the new "thing we control" — brooder_nodes (each ESP32)
--          are now just dumb actuators (member devices) inside a zone.
--
--          This migration creates the zone container and the many-to-many
--          link between zones and ESP32 nodes. Existing brooder_nodes are
--          backfilled into a 1:1 "Zone per node" relationship so the
--          legacy /api/brooder/nodes/{code}/... endpoints keep working
--          during the transition.
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).
--
-- Idempotent: IF NOT EXISTS + DO blocks.

BEGIN;

-- ============================================================
-- 1. brooder_zones — zone container
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_zones (
    id                  SERIAL PRIMARY KEY,
    barn_id             VARCHAR(50) REFERENCES barns(id) ON DELETE SET NULL,
    name                VARCHAR(100) NOT NULL,
    manual_setpoint     DOUBLE PRECISION
        CHECK (manual_setpoint IS NULL OR (manual_setpoint >= 0 AND manual_setpoint <= 45)),
    fallback_delta_c    DOUBLE PRECISION NOT NULL DEFAULT 0.0
        CHECK (fallback_delta_c >= -5.0 AND fallback_delta_c <= 5.0),
    max_total_w         DOUBLE PRECISION
        CHECK (max_total_w IS NULL OR max_total_w > 0),
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,    -- soft-delete
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique zone name per barn — partial index ignores soft-deleted rows
-- so admins can re-use a name after the previous zone was retired.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brooder_zones_barn_name
    ON brooder_zones(barn_id, name) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_brooder_zones_active
    ON brooder_zones(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_brooder_zones_barn
    ON brooder_zones(barn_id);

-- ============================================================
-- 2. brooder_zone_devices — many-to-many ESP32 nodes in a zone
--    Each ESP32 node can belong to at most 1 active zone.
-- ============================================================

CREATE TABLE IF NOT EXISTS brooder_zone_devices (
    id                  SERIAL PRIMARY KEY,
    zone_id             INTEGER NOT NULL REFERENCES brooder_zones(id) ON DELETE CASCADE,
    brooder_device_code VARCHAR(64) NOT NULL
        REFERENCES brooder_nodes(device_code) ON DELETE CASCADE,
    role                VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('member', 'lead')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bzd UNIQUE (zone_id, brooder_device_code)
);

-- Each ESP32 node appears in at most 1 active zone.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bzd_device
    ON brooder_zone_devices(brooder_device_code);
CREATE INDEX IF NOT EXISTS idx_bzd_zone ON brooder_zone_devices(zone_id);

-- ============================================================
-- 3. updated_at auto-touch trigger for brooder_zones
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'update_brooder_zones_updated_at'
    ) THEN
        CREATE OR REPLACE FUNCTION update_brooder_zones_updated_at()
        RETURNS TRIGGER AS $inner$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $inner$ LANGUAGE plpgsql;
    END IF;
END $$;

DROP TRIGGER IF EXISTS trg_brooder_zones_updated_at ON brooder_zones;
CREATE TRIGGER trg_brooder_zones_updated_at
    BEFORE UPDATE ON brooder_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_brooder_zones_updated_at();

-- ============================================================
-- 4. Backfill: auto-create 1 zone per legacy brooder_node, link
--    via brooder_zone_devices so the new /api/brooder/zones/{id}
--    endpoint has data immediately after migration.
--
--    Idempotent — uses ON CONFLICT DO NOTHING on both inserts.
-- ============================================================

DO $$
DECLARE
    rec RECORD;
    new_zone_id INTEGER;
    barn INTEGER;
BEGIN
    FOR rec IN
        SELECT device_code,
               COALESCE(zone_name, 'Zone ' || device_code) AS zname,
               cycle_id
        FROM brooder_nodes
        WHERE is_active = TRUE
        ORDER BY device_code
    LOOP
        -- Resolve barn_id from cycle (NULL if no cycle assigned)
        barn := NULL;
        IF rec.cycle_id IS NOT NULL THEN
            SELECT c.barn_id INTO barn
            FROM cycles c WHERE c.id = rec.cycle_id;
        END IF;

        -- Insert zone (skip if same name + barn already active)
        INSERT INTO brooder_zones(barn_id, name, manual_setpoint,
                                  fallback_delta_c, enabled, is_active, notes)
        SELECT barn,
               rec.zname,
               n.manual_setpoint,
               n.fallback_delta_c,
               TRUE,
               TRUE,
               COALESCE('Auto-migrated from brooder_node ' || n.device_code,
                        'Auto-migrated from brooder_node ' || n.device_code)
        FROM brooder_nodes n
        WHERE n.device_code = rec.device_code
        ON CONFLICT (barn_id, name) WHERE is_active DO NOTHING
        RETURNING id INTO new_zone_id;

        -- If zone already existed, look it up
        IF new_zone_id IS NULL THEN
            SELECT id INTO new_zone_id
            FROM brooder_zones
            WHERE name = rec.zname
              AND ((barn_id = barn) OR (barn_id IS NULL AND barn IS NULL))
              AND is_active
            LIMIT 1;
        END IF;

        -- Link device to zone (skip if already linked)
        IF new_zone_id IS NOT NULL THEN
            INSERT INTO brooder_zone_devices(zone_id, brooder_device_code, role)
            VALUES (new_zone_id, rec.device_code, 'member')
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END $$;

DO $$ BEGIN
    RAISE NOTICE '=== Script 065: brooder_zones + brooder_zone_devices created and backfilled ===';
END $$;

COMMIT;