-- Medication Unit Specs - Quy đổi đơn vị thuốc
-- Mỗi sản phẩm có thể có nhiều đơn vị đóng gói: chai, lọ, túi...

CREATE TABLE IF NOT EXISTS medication_unit_specs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    package_unit VARCHAR(50) NOT NULL,      -- 'chai', 'lo', 'tui', 'vien', 'ong'
    package_size DECIMAL(10,2) NOT NULL,   -- kích thước đóng gói (VD: 100ml, 250g)
    base_unit VARCHAR(20) NOT NULL,         -- đơn vị cơ bản: 'ml', 'gram', 'liều', 'ml'
    dose_per_package INTEGER,              -- số liều per chai (nếu có)
    dose_unit VARCHAR(20),                  -- đơn vị liều: 'ml', 'gram'
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, package_unit)
);

CREATE INDEX IF NOT EXISTS idx_med_unit_specs_product ON medication_unit_specs(product_id);

-- Add base_unit to products for default unit reference
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20);

-- Sample data for existing medication products
INSERT INTO medication_unit_specs (product_id, package_unit, package_size, base_unit, dose_per_package, dose_unit) VALUES
(3, 'chai', 50, 'ml', NULL, NULL),
(4, 'chai', 250, 'gram', NULL, NULL),
(9, 'chai', 100, 'gram', NULL, NULL),
(10, 'chai', 100, 'ml', NULL, NULL),
(11, 'chai', 1000, 'ml', NULL, NULL)
ON CONFLICT (product_id, package_unit) DO NOTHING;

UPDATE products SET base_unit = 'ml' WHERE id IN (3, 10, 11) AND base_unit IS NULL;
UPDATE products SET base_unit = 'gram' WHERE id IN (4, 9) AND base_unit IS NULL;

DO $$ BEGIN
    RAISE NOTICE '=== Script 049: Medication unit specs - flexible unit conversion ===';
END $$;