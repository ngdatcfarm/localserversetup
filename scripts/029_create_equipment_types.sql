-- ============================================
-- Create Equipment Types Table
-- Date: 2026-04-04
-- Purpose: Create equipment_types table for equipment type definitions
-- ============================================

CREATE TABLE IF NOT EXISTS equipment_types (
    id SERIAL PRIMARY KEY,
    product_id INTEGER,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    power_watts INTEGER,
    voltage_v INTEGER,
    current_amp DECIMAL(5,2),
    mqtt_protocol JSONB,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK to products if product_id is provided
DO $$ BEGIN
    ALTER TABLE equipment_types ADD CONSTRAINT fk_equipment_types_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipment_types_code ON equipment_types (code);
CREATE INDEX IF NOT EXISTS idx_equipment_types_product ON equipment_types (product_id);

DO $$ BEGIN
    RAISE NOTICE '=== Script 029: equipment_types table created successfully ===';
END $$;
