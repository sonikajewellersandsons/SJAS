-- SJS Database Repair — ONE-TIME script
-- Run AFTER sql/schema.sql has been applied.
--
-- Fixes data corrupted by earlier logic bugs:
--   1. process_material_sale double-inserted standalone 18K gold into material_sales
--   2. reverse_material_sale subtracted the whole invoice weight from EVERY lot
--   3. reverse_invoice_stock decremented ALL identical purchase lots, not the sold one
--
-- Approach: wipe all derivable stock-tracking data and rebuild it from the
-- source of truth (invoices + invoice_items) in chronological order using the
-- (now fixed) process_invoice_stock / process_material_sale RPCs.
--
-- If the transaction aborts, NOTHING is changed (it rolls back).
-- If it aborts with "No available stock for item_id=..." it means some historical
-- sale has no matching purchase lot — investigate that item before re-running.

BEGIN;

-- 1. Clear all derived stock tracking
DELETE FROM stock_ledger WHERE source_type = 'sale';
UPDATE purchases SET sold_pcs = 0, is_sold = false, sold_inv_no = '';
UPDATE material_purchases SET sold_weight = 0;
DELETE FROM material_sales;

-- 2. Rebuild in chronological order (FIFO allocation)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM invoices ORDER BY date ASC, id ASC
  LOOP
    PERFORM process_invoice_stock(r.id);
    PERFORM process_material_sale(r.id);
  END LOOP;
END $$;

COMMIT;

-- Sanity checks (should all read 0)
SELECT 'orphan stock_ledger' AS check_name, COUNT(*) FROM stock_ledger WHERE source_type = 'sale' AND invoice_item_id IS NULL
UNION ALL SELECT 'negative material sold_weight', COUNT(*) FROM material_purchases WHERE sold_weight < 0
UNION ALL SELECT 'oversold purchases', COUNT(*) FROM purchases WHERE sold_pcs > pcs;
