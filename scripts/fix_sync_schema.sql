-- Fix sync schema issues
-- Run this script to fix warehouses.note column

-- 1. Add note column to warehouses if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'warehouses' AND column_name = 'note'
    ) THEN
        ALTER TABLE warehouses ADD COLUMN note TEXT DEFAULT '';
        RAISE NOTICE 'Added note column to warehouses';
    ELSE
        RAISE NOTICE 'note column already exists in warehouses';
    END IF;
END $$;

-- 2. Check for duplicate device_codes
SELECT device_code, COUNT(*) as cnt, ARRAY_AGG(id) as ids
FROM devices
GROUP BY device_code
HAVING COUNT(*) > 1;

-- 3. If duplicates exist, you can delete them with:
-- DELETE FROM devices WHERE id IN (
--     SELECT id FROM (
--         SELECT id, ROW_NUMBER() OVER (PARTITION BY device_code ORDER BY id) as rn
--         FROM devices
--     ) t WHERE rn > 1
-- );
