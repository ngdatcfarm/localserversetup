-- Add unit_spec (specification/quantity per unit) to medications
-- e.g., "100ml", "1kg", "500g", "1000 con" per unit
ALTER TABLE medications ADD COLUMN IF NOT EXISTS unit_spec VARCHAR(50);

-- Update existing medications to set default unit_spec based on unit
UPDATE medications SET unit_spec = unit WHERE unit_spec IS NULL AND unit IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medications_unit_spec ON medications (unit_spec);

DO $$ BEGIN
    RAISE NOTICE '=== Script 047: Added unit_spec to medications ===';
END $$;
