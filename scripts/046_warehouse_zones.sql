-- Warehouse zones table - for organizing zones within a warehouse
CREATE TABLE IF NOT EXISTS warehouse_zones (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(50) DEFAULT 'storage',  -- storage, quarantine, staging
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_zones_warehouse_id ON warehouse_zones(warehouse_id);
