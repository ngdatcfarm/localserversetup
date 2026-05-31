-- 049: Add unit and custom_name columns to care_medications
-- Needed because medication logs need to store unit (g/ml) and custom name

ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS unit VARCHAR(20);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS custom_name VARCHAR(200);
ALTER TABLE care_medications ADD COLUMN IF NOT EXISTS shift VARCHAR(20) DEFAULT 'all_day';

CREATE INDEX IF NOT EXISTS idx_care_medications_shift ON care_medications (shift);

RAISE NOTICE '=== Script 049: Added unit, custom_name, shift to care_medications ===';