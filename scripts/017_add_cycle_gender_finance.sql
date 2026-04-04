-- ============================================
-- Add Cycle Gender and Finance Columns
-- Date: 2026-04-04
-- Purpose: Add gender column and ensure finance columns exist in cycles
-- ============================================
-- Note: male_quantity, female_quantity, purchase_price, total_sold_weight_kg,
--       total_revenue, final_quantity already exist in local cycles table

-- Add gender column (for combined gender tracking if needed)
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);

-- Add finance-related columns if they don't exist
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS profit DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS roi_pct DECIMAL(8,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS fcr DECIMAL(6,3);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS feed_cost DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS medicine_cost DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS other_cost DECIMAL(15,2);

CREATE INDEX IF NOT EXISTS idx_cycles_gender ON cycles (gender);

DO $$ BEGIN
    RAISE NOTICE '=== Script 017: cycles gender and finance columns added successfully ===';
END $$;
