-- Migration 055: Add to_warehouse_id to inventory_transactions
-- Purpose: Track destination warehouse on transfer transactions so the UI
--          can display "A → B" pairs in the transfer history tab.
-- Backfill: Existing transfer records are paired by (product_id, notes,
--           created_at within 5s) to recover to_warehouse_id. Records that
--           cannot be paired (orphans, very old data) keep to_warehouse_id NULL.

ALTER TABLE inventory_transactions
    ADD COLUMN IF NOT EXISTS to_warehouse_id INTEGER REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_invt_tx_to_warehouse
    ON inventory_transactions(to_warehouse_id)
    WHERE to_warehouse_id IS NOT NULL;

-- Backfill existing transfer records (best-effort, idempotent)
-- Pair export (source) with import (destination) by matching product + notes
-- and timestamps within 5 seconds.
UPDATE inventory_transactions src
SET to_warehouse_id = dst.warehouse_id
FROM inventory_transactions dst
WHERE src.reference_type = 'transfer'
  AND src.transaction_type = 'export'
  AND dst.reference_type = 'transfer'
  AND dst.transaction_type = 'import'
  AND src.product_id = dst.product_id
  AND src.notes IS NOT DISTINCT FROM dst.notes
  AND src.from_warehouse_id = dst.from_warehouse_id
  AND src.to_warehouse_id IS NULL
  AND dst.created_at BETWEEN src.created_at - INTERVAL '5 seconds'
                          AND src.created_at + INTERVAL '5 seconds';

-- Mirror: pair the import's to_warehouse_id back to the export's to_warehouse_id
-- (in case the export was filled but the import wasn't, or vice versa)
UPDATE inventory_transactions dst
SET to_warehouse_id = src.to_warehouse_id
FROM inventory_transactions src
WHERE dst.reference_type = 'transfer'
  AND dst.transaction_type = 'import'
  AND src.reference_type = 'transfer'
  AND src.transaction_type = 'export'
  AND src.product_id = dst.product_id
  AND src.notes IS NOT DISTINCT FROM dst.notes
  AND src.from_warehouse_id = dst.from_warehouse_id
  AND src.to_warehouse_id IS NOT NULL
  AND dst.to_warehouse_id IS NULL;
