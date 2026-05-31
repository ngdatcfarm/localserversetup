-- 050: Create barn_default_warehouses table for default warehouse lookup
CREATE TABLE IF NOT EXISTS barn_default_warehouses (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) NOT NULL,
    warehouse_type VARCHAR(20) NOT NULL,
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(barn_id, warehouse_type)
);

-- Insert default medication warehouse for each barn
INSERT INTO barn_default_warehouses (barn_id, warehouse_type, warehouse_id)
SELECT b.id, 'medication', w.id
FROM barns b
CROSS JOIN (SELECT id FROM warehouses WHERE warehouse_type = 'medication' LIMIT 1) w
WHERE NOT EXISTS (
    SELECT 1 FROM barn_default_warehouses bd
    WHERE bd.barn_id = b.id AND bd.warehouse_type = 'medication'
);

-- Insert default feed warehouse for each barn
INSERT INTO barn_default_warehouses (barn_id, warehouse_type, warehouse_id)
SELECT b.id, 'feed', w.id
FROM barns b
CROSS JOIN (SELECT id FROM warehouses WHERE warehouse_type = 'feed' LIMIT 1) w
WHERE NOT EXISTS (
    SELECT 1 FROM barn_default_warehouses bd
    WHERE bd.barn_id = b.id AND bd.warehouse_type = 'feed'
);

RAISE NOTICE '=== Script 050: Created barn_default_warehouses and default mappings ===';