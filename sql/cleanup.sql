-- SJS Database Cleanup — Run in Supabase SQL Editor
-- Wipes ALL data. Preserves only: users, role_masters, settings

UPDATE invoices SET adj_bill_id = NULL, adj_amount = 0;

DELETE FROM logs;
DELETE FROM stock_ledger;
DELETE FROM diamond_items;
DELETE FROM invoice_items;
DELETE FROM invoices;
DELETE FROM inward_supply_vouchers;
DELETE FROM purchases;
DELETE FROM customers;
DELETE FROM item_master;
DELETE FROM inv_sequences;

-- Verify
SELECT 'logs' AS tbl, COUNT(*) FROM logs
UNION ALL SELECT 'stock_ledger', COUNT(*) FROM stock_ledger
UNION ALL SELECT 'diamond_items', COUNT(*) FROM diamond_items
UNION ALL SELECT 'invoice_items', COUNT(*) FROM invoice_items
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'inward_supply_vouchers', COUNT(*) FROM inward_supply_vouchers
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'item_master', COUNT(*) FROM item_master
UNION ALL SELECT 'inv_sequences', COUNT(*) FROM inv_sequences;
