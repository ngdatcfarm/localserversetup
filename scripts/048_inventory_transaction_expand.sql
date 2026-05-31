-- Expand inventory_transactions for detailed medication imports
-- Fields: unit, unit_size (g/ml/liều), total_price

ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS unit VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS unit_size VARCHAR(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2);

CREATE INDEX IF NOT EXISTS idx_inventory_txn_unit ON inventory_transactions (unit);
CREATE INDEX IF NOT EXISTS idx_inventory_txn_unit_size ON inventory_transactions (unit_size);

DO $$ BEGIN
    RAISE NOTICE '=== Script 048: Expanded inventory_transactions for medication imports ===';
END $$;
