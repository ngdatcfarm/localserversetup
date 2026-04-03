-- ============================================
-- Add Farms Table - Multi-farm Support
-- Date: 2026-04-03
-- ============================================
-- Purpose: Add top-level Farm entity for multi-farm support
-- Location: Local PostgreSQL (cfarm_local)
-- ============================================

-- 1. Create farms table
CREATE TABLE IF NOT EXISTS farms (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Insert default farm (ID=farm-01) for existing single-farm setup
INSERT INTO farms (id, name, active) VALUES ('farm-01', 'Trang trại chính', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Add farm_id to barns (default = 'farm-01' for backward compatibility)
ALTER TABLE barns ADD COLUMN IF NOT EXISTS farm_id VARCHAR(50) DEFAULT 'farm-01';

-- 4. Backfill existing barns with default farm
UPDATE barns SET farm_id = 'farm-01' WHERE farm_id IS NULL;

-- 5. Set NOT NULL constraint
ALTER TABLE barns ALTER COLUMN farm_id SET NOT NULL;

-- 6. Add foreign key (optional - depends on referential integrity needs)
-- ALTER TABLE barns ADD CONSTRAINT fk_barns_farm FOREIGN KEY (farm_id) REFERENCES farms(id);

-- 7. Create index for farm_id lookups
CREATE INDEX IF NOT EXISTS idx_barns_farm ON barns (farm_id);

DO $$ BEGIN
    RAISE NOTICE '=== Farm table created successfully! ===';
    RAISE NOTICE 'Farm ID: farm-01 (default)';
    RAISE NOTICE 'All existing barns linked to farm-01';
END $$;