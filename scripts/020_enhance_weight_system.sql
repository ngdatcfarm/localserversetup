-- ============================================
-- ENHANCE: Weight System - Individual bird weights with gender
-- ============================================
-- Add columns to care_weights for gender-based tracking
-- Add weight_samples table for individual bird entries

-- 1. Add gender column to care_weights (for single-group weighing)
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS gender VARCHAR(20);

-- 2. Rename min/max to auto-calculated (remove manual entry)
-- Add sample_male and sample_female counts
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS sample_male INT DEFAULT 0;
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS sample_female INT DEFAULT 0;
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS total_weight_male DOUBLE PRECISION;
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS total_weight_female DOUBLE PRECISION;
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS avg_weight_male DOUBLE PRECISION GENERATED ALWAYS AS (total_weight_male / NULLIF(sample_male, 0)) STORED;
ALTER TABLE care_weights ADD COLUMN IF NOT EXISTS avg_weight_female DOUBLE PRECISION GENERATED ALWAYS AS (total_weight_female / NULLIF(sample_female, 0)) STORED;

-- 3. Create weight_samples for individual bird weights (overrides aggregate)
CREATE TABLE IF NOT EXISTS weight_samples (
    id SERIAL PRIMARY KEY,
    weight_id INT REFERENCES care_weights(id) ON DELETE CASCADE,
    weight_g DOUBLE PRECISION NOT NULL,
    gender VARCHAR(20),  -- 'male', 'female', or NULL for mixed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_samples_weight ON weight_samples (weight_id);
CREATE INDEX IF NOT EXISTS idx_weight_samples_gender ON weight_samples (weight_id, gender);

-- 4. Create FK if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_weight_samples_weight'
    ) THEN
        ALTER TABLE weight_samples ADD CONSTRAINT fk_weight_samples_weight
            FOREIGN KEY (weight_id) REFERENCES care_weights(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Comments
COMMENT ON TABLE weight_samples IS 'Individual bird weight samples linked to care_weights session';
COMMENT ON COLUMN weight_samples.gender IS 'male/female - tracks hen vs rooster weights separately';
COMMENT ON COLUMN care_weights.sample_male IS 'Number of roosters weighed';
COMMENT ON COLUMN care_weights.sample_female IS 'Number of hens weighed';
COMMENT ON COLUMN care_weights.total_weight_male IS 'Total weight of roosters in grams';
COMMENT ON COLUMN care_weights.total_weight_female IS 'Total weight of hens in grams';
