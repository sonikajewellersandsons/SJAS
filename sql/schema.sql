-- SJS Jewellery Software — Database Schema
-- Run this entire file in Supabase SQL Editor to deploy.

-- ─── EXTENSIONS ─────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── ENUMS ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE stock_direction AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('purchase', 'inward_supply', 'sale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inv_sequence_type AS ENUM ('sale', 'inward');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── ITEM MASTER ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS item_master (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  purity          TEXT NOT NULL DEFAULT '22K',
  category        TEXT NOT NULL DEFAULT 'Gold',
  hallmark_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  hsn_code        TEXT DEFAULT '71131913',
  active          BOOLEAN NOT NULL DEFAULT true,
  material_type   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_master_active ON item_master(active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_master_name ON item_master(name);

-- ─── SEED: ITEM MASTER ─────────────────────────────────

INSERT INTO item_master (name, purity, category, hallmark_charge, hsn_code, active) VALUES
  ('Bali', '22K', 'Gold', 45, '71131913', true),
  ('Tops', '22K', 'Gold', 45, '71131913', true),
  ('Set', '22K', 'Gold', 45, '71131913', true),
  ('Ring', '22K', 'Gold', 45, '71131913', true),
  ('Mangal Sutra', '22K', 'Gold', 45, '71131913', true),
  ('Locket', '22K', 'Gold', 45, '71131913', true),
  ('Chain', '22K', 'Gold', 45, '71131913', true),
  ('Bracelet', '22K', 'Gold', 45, '71131913', true),
  ('Khanthi Set', '22K', 'Gold', 45, '71131913', true),
  ('Kada', '22K', 'Gold', 45, '71131913', true),
  ('Kan Chain', '22K', 'Gold', 45, '71131913', true),
  ('Latkan', '22K', 'Gold', 45, '71131913', true),
  ('Nath', '22K', 'Gold', 45, '71131913', true),
  ('Teeka', '22K', 'Gold', 45, '71131913', true),
  ('Set Tika', '22K', 'Gold', 45, '71131913', true),
  ('Baby Item', '22K', 'Gold', 45, '71131913', true),
  ('Wax Bead Jewellery', '22K', 'Gold', 45, '71131913', true),
  ('4 Bangle', '22K', 'Gold', 180, '71131913', true),
  ('Khanthi', '22K', 'Gold', 45, '71131913', true),
  ('Necklace', '22K', 'Gold', 45, '71131913', true),
  ('Silver Ornaments', 'Silver', 'Silver', 0, '71131913', true),
  ('Gold', '22K', 'Metal', 0, '71131913', true),
  ('Silver', 'Silver', 'Metal', 0, '71131913', true)
ON CONFLICT DO NOTHING;

ALTER TABLE item_master ADD COLUMN IF NOT EXISTS material_type TEXT;

INSERT INTO item_master (name, purity, category, hallmark_charge, hsn_code, active, material_type) VALUES
  ('Gold Jewellery (18K)', '18K', 'Gold', 0, '71131913', true, 'gold_18k')
ON CONFLICT (name) DO NOTHING;

-- ─── CUSTOMERS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT DEFAULT '',
  phone      TEXT DEFAULT '',
  state      TEXT DEFAULT 'Haryana',
  gstin      TEXT DEFAULT '',
  aadhaar    TEXT DEFAULT '',
  pan        TEXT DEFAULT '',
  pincode    TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pincode TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS aadhaar TEXT DEFAULT '';

-- ─── STOCK LEDGER ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_ledger (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES item_master(id),
  weight         NUMERIC(10,3) NOT NULL,
  pcs            INTEGER NOT NULL DEFAULT 1,
  direction      stock_direction NOT NULL,
  source_type    source_type NOT NULL,
  reference_id   BIGINT,  -- FK to purchases/invoices/inward_supply_vouchers
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT DEFAULT '',
  created_by     BIGINT,  -- FK to users
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS huid BOOLEAN;
ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS invoice_item_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON stock_ledger(date);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_source_ref ON stock_ledger(source_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_inv_item ON stock_ledger(invoice_item_id);

-- ─── PURCHASES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchases (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_no    TEXT DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  supplier_phone TEXT DEFAULT '',
  item_id       BIGINT NOT NULL REFERENCES item_master(id),
  purity        TEXT NOT NULL DEFAULT '22K',
  weight        NUMERIC(10,3) NOT NULL,
  pcs           INTEGER NOT NULL DEFAULT 1,
  rate          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT DEFAULT '',
  created_by    BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purity TEXT NOT NULL DEFAULT '22K';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS huid BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS sold_inv_no TEXT DEFAULT '';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS sold_pcs INTEGER NOT NULL DEFAULT 0;

-- Clamp legacy oversold data so the CHECK below never aborts schema.sql
UPDATE purchases SET sold_pcs = LEAST(sold_pcs, pcs) WHERE sold_pcs > pcs;
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS chk_sold_pcs;
ALTER TABLE purchases ADD CONSTRAINT chk_sold_pcs CHECK (sold_pcs <= pcs);

CREATE INDEX IF NOT EXISTS idx_purchases_item_id ON purchases(item_id);

-- ─── INWARD SUPPLY VOUCHERS ────────────────────────────
-- Exchange/trade-in: customer brings old items, shop values them,
-- value offsets customer's new bill via invoices.adj_bill_id + adj_amount.
-- NOT connected to stock/purchases — purely a valuation & adjustment mechanism.
-- NB: inv_no is NOT unique — one voucher spans multiple rows (one per line item).

CREATE TABLE IF NOT EXISTS inward_supply_vouchers (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inv_no          TEXT NOT NULL,
  customer_id     BIGINT REFERENCES customers(id),
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_phone  TEXT DEFAULT '',
  item_id         BIGINT NOT NULL REFERENCES item_master(id),
  weight          NUMERIC(10,3) NOT NULL,
  pcs             INTEGER NOT NULL DEFAULT 1,
  purity          TEXT NOT NULL DEFAULT '22K',
  rate            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT DEFAULT '',
  created_by      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent cleanup for databases that still have the old UNIQUE constraint
ALTER TABLE inward_supply_vouchers DROP CONSTRAINT IF EXISTS inward_supply_vouchers_inv_no_key;
DROP INDEX IF EXISTS inward_supply_vouchers_inv_no_key;
CREATE INDEX IF NOT EXISTS idx_inward_inv_no ON inward_supply_vouchers(inv_no);

ALTER TABLE inward_supply_vouchers ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id);
ALTER TABLE inward_supply_vouchers ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inward_supply_vouchers ADD COLUMN IF NOT EXISTS purity TEXT NOT NULL DEFAULT '22K';

-- ─── INVOICES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inv_no          TEXT NOT NULL UNIQUE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id     BIGINT REFERENCES customers(id),
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_address TEXT DEFAULT '',
  customer_phone  TEXT DEFAULT '',
  customer_state  TEXT DEFAULT 'Haryana',
  customer_gstin  TEXT DEFAULT '',
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  hallmark_total  NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(10,2) NOT NULL DEFAULT 0,
  adj_bill_id     BIGINT REFERENCES inward_supply_vouchers(id),
  adj_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_mode    TEXT DEFAULT 'CASH',
  cash_amt        NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_amt        NUMERIC(12,2) NOT NULL DEFAULT 0,
  irn             TEXT DEFAULT '',
  ack_no          TEXT DEFAULT '',
  created_by      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── INVOICE ITEMS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_items (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id     BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id        BIGINT NOT NULL REFERENCES item_master(id),
  weight         NUMERIC(10,3) NOT NULL,
  rate_per_gram  NUMERIC(10,2) NOT NULL DEFAULT 0,
  price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  hallmark_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  sno            INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS huid BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS huid_code TEXT DEFAULT '';
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_pct NUMERIC(5,2) NOT NULL DEFAULT 3;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS labour_rate NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS labour_pct NUMERIC(5,2) NOT NULL DEFAULT 10;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description_extra TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS material_type TEXT;
ALTER TABLE invoice_items ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gold_rate NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_id ON invoice_items(item_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);

-- ─── DIAMOND ITEMS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS diamond_items (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id       BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  code             TEXT DEFAULT '',
  description      TEXT DEFAULT '',
  weight           NUMERIC(10,3) NOT NULL DEFAULT 0,
  mrp              NUMERIC(12,2) NOT NULL DEFAULT 0,
  hallmark_charge  NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- ─── INV SEQUENCES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_sequences (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type     inv_sequence_type NOT NULL,
  fy       TEXT NOT NULL,  -- e.g. '2026-27'
  last_no  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(type, fy)
);

-- ─── ROLE MASTERS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_masters (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── USERS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'salesperson' REFERENCES role_masters(role),
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── SETTINGS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'
);

-- ─── LOGS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action     TEXT NOT NULL,
  table_name TEXT DEFAULT '',
  record_id  BIGINT,
  details    JSONB DEFAULT '{}',
  user_id    BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── DEFAULT ROLE DATA ─────────────────────────────────

INSERT INTO role_masters (role, label, permissions) VALUES
  ('owner', 'Owner', '{"allow_billing":true,"allow_stock_view":true,"allow_stock_edit":true,"allow_customers":true,"allow_reports":true,"allow_settings":true,"allow_item_master":true}'),
  ('accountant', 'Accountant', '{"allow_billing":false,"allow_stock_view":true,"allow_stock_edit":false,"allow_customers":true,"allow_reports":true,"allow_settings":false,"allow_item_master":false}'),
  ('salesperson', 'Salesperson', '{"allow_billing":true,"allow_stock_view":false,"allow_stock_edit":false,"allow_customers":true,"allow_reports":false,"allow_settings":false,"allow_item_master":false}'),
  ('stock_manager', 'Stock Manager', '{"allow_billing":false,"allow_stock_view":true,"allow_stock_edit":true,"allow_customers":false,"allow_reports":false,"allow_settings":false,"allow_item_master":true}')
ON CONFLICT (role) DO NOTHING;

-- ─── DEFAULT SETTINGS ──────────────────────────────────

INSERT INTO settings (key, value) VALUES
  ('shop_name', '"SJS Jewellery"'),
  ('shop_address', '"Your Shop Address"'),
  ('shop_gstin', '""'),
  ('shop_phone', '""'),
  ('shop_email', '""'),
  ('shop_state', '"Haryana"'),
  ('shop_city', '"Faridabad"'),
  ('shop_pan', '""'),
  ('bank_details', '{"bank_name":"","account_no":"","ifsc":"","branch":"","account_holder":""}'),
  ('declaration', '"We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."'),
  ('fy_start', '"2026-04-01"'),
  ('gold_rate', '0')
ON CONFLICT (key) DO NOTHING;

-- ─── FUNCTIONS ─────────────────────────────────────────

-- Get current financial year string (e.g. '2026-27')
CREATE OR REPLACE FUNCTION get_financial_year(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT
    CASE
      WHEN EXTRACT(MONTH FROM p_date) >= 4
        THEN EXTRACT(YEAR FROM p_date)::TEXT || '-' || RIGHT((EXTRACT(YEAR FROM p_date)+1)::TEXT, 2)
      ELSE (EXTRACT(YEAR FROM p_date)-1)::TEXT || '-' || RIGHT(EXTRACT(YEAR FROM p_date)::TEXT, 2)
    END;
$$;

-- Generate next invoice number for a given type (sale/inward)
DROP FUNCTION IF EXISTS next_inv_no(text);
CREATE OR REPLACE FUNCTION next_inv_no(p_type inv_sequence_type)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_fy TEXT;
  v_seq INTEGER;
BEGIN
  v_fy := get_financial_year();

  INSERT INTO inv_sequences (type, fy, last_no)
  VALUES (p_type, v_fy, 1)
  ON CONFLICT (type, fy) DO UPDATE SET last_no = inv_sequences.last_no + 1
  RETURNING last_no INTO v_seq;

  IF p_type = 'sale' THEN
    RETURN 'SJS/' || v_fy || '/' || LPAD(v_seq::TEXT, 3, '0');
  ELSIF p_type = 'labour' THEN
    RETURN 'SJS/LB/' || v_fy || '/' || LPAD(v_seq::TEXT, 3, '0');
  ELSE
    RETURN 'SJS/IWS/' || v_fy || '/' || LPAD(v_seq::TEXT, 3, '0');
  END IF;
END;
$$;

-- Get current stock balance for an item
-- SECURITY DEFINER so billing roles can validate stock without extra RLS grants
CREATE OR REPLACE FUNCTION get_stock_balance(p_item_id BIGINT)
RETURNS TABLE(item_id BIGINT, item_name TEXT, total_weight NUMERIC, total_pcs BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT
    im.id,
    im.name,
    COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.weight ELSE -sl.weight END), 0),
    COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.pcs ELSE -sl.pcs END), 0)
  FROM item_master im
  LEFT JOIN stock_ledger sl ON sl.item_id = im.id
  WHERE im.id = p_item_id
  GROUP BY im.id, im.name;
$$;

-- Get individual stock lots (purchases only — inward supply is not stock)
-- SECURITY DEFINER so billing roles can run stock checks (salesperson has no
-- direct purchases/item_master SELECT rights)
DROP FUNCTION IF EXISTS get_stock_lots();
CREATE OR REPLACE FUNCTION get_stock_lots()
RETURNS TABLE(lot_id BIGINT, item_name TEXT, purity TEXT, huid BOOLEAN, weight NUMERIC, orig_pcs INTEGER, sold_pcs INTEGER, avail_pcs INTEGER, ref_date DATE, status TEXT, sale_inv_no TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT
    p.id, im.name, p.purity, p.huid, p.weight,
    p.pcs, p.sold_pcs, p.pcs - p.sold_pcs,
    p.date,
    CASE
      WHEN p.sold_pcs = 0 THEN 'Available'
      WHEN p.sold_pcs < p.pcs THEN 'Partial'
      ELSE 'Sold'
    END,
    COALESCE(p.sold_inv_no, '')
  FROM purchases p
  JOIN item_master im ON im.id = p.item_id
  ORDER BY 8 DESC, p.id DESC LIMIT 5000;
$$;

-- Peek next invoice number without incrementing
-- (Superseded by client-side gap detection in BillingPage/InwardSupplyPage)

-- Process full invoice stock: mark purchases sold + insert stock_ledger OUT
-- Idempotency is keyed on invoice_item_id so that two identical lines
-- (same item + weight + HUID) each get their own OUT ledger row.
CREATE OR REPLACE FUNCTION process_invoice_stock(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r RECORD;
  v_inv_no TEXT;
BEGIN
  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;
  IF v_inv_no IS NULL THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  FOR r IN SELECT ii.id AS inv_item_id, ii.item_id, ii.weight, ii.huid
  FROM invoice_items ii
  LEFT JOIN item_master im ON im.id = ii.item_id
  WHERE ii.invoice_id = p_invoice_id
    AND ii.item_id IS NOT NULL
    AND (im.material_type IS DISTINCT FROM 'gold_18k')
  LOOP
    -- Skip if this invoice_item already produced an OUT ledger row (idempotent)
    IF EXISTS (SELECT 1 FROM stock_ledger WHERE source_type = 'sale' AND reference_id = p_invoice_id AND invoice_item_id = r.inv_item_id) THEN
      CONTINUE;
    END IF;

    -- Try purchases first (FIFO: oldest lot first)
    UPDATE purchases
    SET sold_pcs = sold_pcs + 1,
        is_sold = (sold_pcs + 1 >= pcs),
        sold_inv_no = CASE WHEN sold_inv_no = '' THEN v_inv_no ELSE sold_inv_no || ', ' || v_inv_no END
    WHERE id = (
      SELECT id FROM purchases
      WHERE item_id = r.item_id AND weight = r.weight AND huid IS NOT DISTINCT FROM r.huid AND sold_pcs < pcs
      ORDER BY id ASC
      LIMIT 1
    );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No available stock for item_id=%, weight=%, huid=%', r.item_id, r.weight, r.huid;
    END IF;
  END LOOP;

  INSERT INTO stock_ledger (item_id, weight, pcs, direction, source_type, reference_id, date, notes, huid, invoice_item_id)
  SELECT item_id, weight, 1, 'OUT', 'sale', p_invoice_id,
    (SELECT date FROM invoices WHERE id = p_invoice_id),
    'Invoice ' || v_inv_no, huid, id
  FROM invoice_items WHERE invoice_id = p_invoice_id
    AND item_id IS NOT NULL
    AND item_id NOT IN (SELECT id FROM item_master WHERE material_type = 'gold_18k')
    AND NOT EXISTS (
      SELECT 1 FROM stock_ledger
      WHERE source_type = 'sale' AND reference_id = p_invoice_id AND invoice_item_id = invoice_items.id
    );
END;
$$;

-- Reverse invoice stock: release ONLY the purchase lots that were sold on this
-- invoice (matched via sold_inv_no), newest lot first (reverse of FIFO).
-- This prevents corrupting identical lots sold by a different invoice.
CREATE OR REPLACE FUNCTION reverse_invoice_stock(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  r RECORD;
  v_inv_no TEXT;
BEGIN
  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;
  IF v_inv_no IS NULL THEN RETURN; END IF;

  FOR r IN SELECT ii.item_id, ii.weight, ii.huid
  FROM invoice_items ii
  LEFT JOIN item_master im ON im.id = ii.item_id
  WHERE ii.invoice_id = p_invoice_id
    AND ii.item_id IS NOT NULL
    AND (im.material_type IS DISTINCT FROM 'gold_18k')
  LOOP
    -- Decrement by the number of times THIS invoice appears in sold_inv_no,
    -- so a lot sold 2+ pieces to the same invoice is fully released (the
    -- per-line loop then no-ops on later identical lines).
    UPDATE purchases p
    SET sold_pcs = GREATEST(p.sold_pcs - (
          SELECT COUNT(*) FROM unnest(string_to_array(p.sold_inv_no, ', ')) AS part WHERE part = v_inv_no
        ), 0),
        is_sold = (p.sold_pcs - (
          SELECT COUNT(*) FROM unnest(string_to_array(p.sold_inv_no, ', ')) AS part WHERE part = v_inv_no
        ) >= p.pcs),
        sold_inv_no = (
          SELECT COALESCE(string_agg(part, ', '), '')
          FROM unnest(string_to_array(p.sold_inv_no, ', ')) AS part
          WHERE part != v_inv_no
        )
    WHERE p.id = (
      SELECT id FROM purchases
      WHERE item_id = r.item_id
        AND weight = r.weight
        AND huid IS NOT DISTINCT FROM r.huid
        AND sold_pcs > 0
        AND ',' || replace(sold_inv_no, ', ', ',') || ',' LIKE '%,' || v_inv_no || ',%'
      ORDER BY id DESC
      LIMIT 1
    );
  END LOOP;

  DELETE FROM stock_ledger WHERE source_type = 'sale' AND reference_id = p_invoice_id;
END;
$$;

-- Safe delete: only allows deleting the last invoice
CREATE OR REPLACE FUNCTION delete_invoice(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_max_id BIGINT;
  v_inv_no TEXT;
  v_fy TEXT;
  v_seq TEXT;
BEGIN
  SELECT MAX(id) INTO v_max_id FROM invoices;
  IF p_invoice_id IS NULL OR p_invoice_id <> v_max_id THEN
    RAISE EXCEPTION 'Only the last invoice can be deleted';
  END IF;

  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;

  PERFORM reverse_material_sale(p_invoice_id);
  PERFORM reverse_invoice_stock(p_invoice_id);
  DELETE FROM invoice_items WHERE invoice_id = p_invoice_id;
  DELETE FROM invoices WHERE id = p_invoice_id;

  -- Decrement sequence if this was the highest number (only for standard
  -- SJS/{fy}/{seq} numbers — free-text overrides must not crash the delete)
  v_fy := split_part(v_inv_no, '/', 2);
  v_seq := NULLIF(split_part(v_inv_no, '/', 3), '');
  IF v_fy IS NOT NULL AND v_fy ~ '^\d{4}-\d{2}$'
     AND v_seq IS NOT NULL AND v_seq ~ '^\d+$' THEN
    UPDATE inv_sequences SET last_no = last_no - 1
    WHERE type = 'sale' AND fy = v_fy AND last_no >= v_seq::INTEGER AND last_no > 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_inward_supply(p_inv_no TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_max_id BIGINT;
  v_highest_inv_no TEXT;
BEGIN
  SELECT inv_no INTO v_highest_inv_no FROM inward_supply_vouchers ORDER BY id DESC LIMIT 1;
  IF p_inv_no IS NULL OR p_inv_no <> v_highest_inv_no THEN
    RAISE EXCEPTION 'Only the last inward supply voucher can be deleted';
  END IF;

  -- Clear linked invoices
  UPDATE invoices SET adj_bill_id = NULL, adj_amount = 0
  WHERE adj_bill_id IN (SELECT id FROM inward_supply_vouchers WHERE inv_no = p_inv_no);

  DELETE FROM inward_supply_vouchers WHERE inv_no = p_inv_no;

  -- Decrement sequence
  UPDATE inv_sequences SET last_no = GREATEST(last_no - 1, 0)
  WHERE type = 'inward' AND fy = split_part(p_inv_no, '/', 3) AND last_no > 0;
END;
$$;

-- Atomic create/update for inward supply vouchers. The duplicate check,
-- delete-old-rows and insert run in ONE transaction, so a failed edit never
-- loses the existing rows and two operators can't both create the same number.
CREATE OR REPLACE FUNCTION save_inward_supply(p_rows JSONB, p_old_inv_no TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_inv_no TEXT;
BEGIN
  IF NOT has_permission('allow_billing') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT MIN(r->>'inv_no') INTO v_inv_no FROM jsonb_array_elements(p_rows) r;
  IF v_inv_no IS NULL THEN RAISE EXCEPTION 'No rows to save'; END IF;

  IF p_old_inv_no IS NULL THEN
    IF EXISTS (SELECT 1 FROM inward_supply_vouchers WHERE inv_no = v_inv_no) THEN
      RAISE EXCEPTION 'Voucher number % is already in use', v_inv_no;
    END IF;
  END IF;

  IF p_old_inv_no IS NOT NULL THEN
    DELETE FROM inward_supply_vouchers WHERE inv_no = p_old_inv_no;
  END IF;

  INSERT INTO inward_supply_vouchers
    (inv_no, customer_id, customer_name, customer_phone, item_id, weight, pcs, purity, rate, total, grand_total, date, notes, created_by)
  SELECT
    r->>'inv_no',
    (r->>'customer_id')::BIGINT,
    r->>'customer_name',
    r->>'customer_phone',
    (r->>'item_id')::BIGINT,
    (r->>'weight')::NUMERIC,
    (r->>'pcs')::INTEGER,
    r->>'purity',
    (r->>'rate')::NUMERIC,
    (r->>'total')::NUMERIC,
    (r->>'grand_total')::NUMERIC,
    (r->>'date')::DATE,
    r->>'notes',
    (r->>'created_by')::BIGINT
  FROM jsonb_array_elements(p_rows) r;
END;
$$;

-- NOTE: stock marking is handled by process_invoice_stock() caller, not by trigger.
-- This avoids per-row issues where multiple items with same weight/huid
-- can't each find a matching unsold purchase lot.

-- ─── TRIGGER: auto-set user permissions on INSERT and ROLE CHANGE ──
-- Fires on UPDATE OF role so a role change in SettingsPage immediately
-- revokes/grants the matching permissions (no stale elevated access).
CREATE OR REPLACE FUNCTION trg_set_user_permissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(permissions, '{}') INTO NEW.permissions
  FROM role_masters WHERE role = NEW.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_permissions ON users;
CREATE TRIGGER trg_set_user_permissions
  BEFORE INSERT OR UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_user_permissions();

-- ─── TRIGGER: cascade role permission changes ──────────

CREATE OR REPLACE FUNCTION trg_cascade_role_permissions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET permissions = NEW.permissions WHERE role = NEW.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_role_permissions ON role_masters;
CREATE TRIGGER trg_cascade_role_permissions
  AFTER INSERT OR UPDATE OF permissions ON role_masters
  FOR EACH ROW EXECUTE FUNCTION trg_cascade_role_permissions();

-- ─── TRIGGER: log stock ledger on purchase insert ──────

CREATE OR REPLACE FUNCTION trg_purchase_to_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO stock_ledger (item_id, weight, pcs, direction, source_type, reference_id, date, notes, huid)
  VALUES (NEW.item_id, NEW.weight, NEW.pcs, 'IN', 'purchase', NEW.id, NEW.date, 'Purchase: ' || COALESCE(NEW.invoice_no, ''), NEW.huid);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_to_stock ON purchases;
CREATE TRIGGER trg_purchase_to_stock
  AFTER INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION trg_purchase_to_stock();

-- Atomic edit of a purchase entry (identified by its created_at — all rows of
-- one purchase share the transaction timestamp). Removes the old stock-ledger
-- IN rows + old purchase rows, then re-inserts the updated ones. Refuses to
-- touch lots that have already been sold (would corrupt sold_pcs tracking).
CREATE OR REPLACE FUNCTION replace_purchase(p_created_at TIMESTAMPTZ, p_rows JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_old_ids BIGINT[];
BEGIN
  IF NOT has_permission('allow_stock_edit') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT array_agg(id) INTO v_old_ids
  FROM purchases WHERE created_at = p_created_at;

  IF v_old_ids IS NULL OR cardinality(v_old_ids) = 0 THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  IF EXISTS (SELECT 1 FROM purchases WHERE id = ANY(v_old_ids) AND sold_pcs > 0) THEN
    RAISE EXCEPTION 'Cannot edit: one or more items in this purchase are already sold. Delete the linked invoices first.';
  END IF;

  DELETE FROM stock_ledger WHERE source_type = 'purchase' AND reference_id = ANY(v_old_ids);
  DELETE FROM purchases WHERE id = ANY(v_old_ids);

  INSERT INTO purchases (invoice_no, supplier_name, supplier_phone, item_id, purity, weight, pcs, rate, total, date, notes, created_by, huid)
  SELECT
    COALESCE(r->>'invoice_no', ''),
    r->>'supplier_name',
    r->>'supplier_phone',
    (r->>'item_id')::BIGINT,
    r->>'purity',
    (r->>'weight')::NUMERIC,
    (r->>'pcs')::INTEGER,
    0,
    0,
    (r->>'date')::DATE,
    r->>'notes',
    (SELECT created_by FROM purchases WHERE id = ANY(v_old_ids) LIMIT 1),
    COALESCE((r->>'huid')::BOOLEAN, true)
  FROM jsonb_array_elements(p_rows) r;
END;
$$;

-- Delete an entire purchase entry (all rows sharing created_at) plus its
-- stock-ledger IN entries. Refuses to touch lots that have already been sold.
CREATE OR REPLACE FUNCTION delete_purchase(p_created_at TIMESTAMPTZ)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_old_ids BIGINT[];
BEGIN
  IF NOT has_permission('allow_stock_edit') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT array_agg(id) INTO v_old_ids
  FROM purchases WHERE created_at = p_created_at;

  IF v_old_ids IS NULL OR cardinality(v_old_ids) = 0 THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  IF EXISTS (SELECT 1 FROM purchases WHERE id = ANY(v_old_ids) AND sold_pcs > 0) THEN
    RAISE EXCEPTION 'Cannot delete: one or more items in this purchase are already sold. Delete the linked invoices first.';
  END IF;

  DELETE FROM stock_ledger WHERE source_type = 'purchase' AND reference_id = ANY(v_old_ids);
  DELETE FROM purchases WHERE id = ANY(v_old_ids);
END;
$$;

-- NOTE: Inward supply vouchers do NOT create stock ledger entries.
-- They are valuation/adjustment instruments, not stock movements.

-- Clean up triggers that may have been manually added in live DB
-- but conflict with the app's design (stock handled by RPCs, not triggers)
DROP TRIGGER IF EXISTS trg_mark_purchase_sold ON invoice_items;
DROP TRIGGER IF EXISTS trg_inward_to_stock ON inward_supply_vouchers;
DROP FUNCTION IF EXISTS trg_mark_purchase_sold();
DROP FUNCTION IF EXISTS trg_inward_to_stock();

-- ─── MATERIAL PURCHASES (18K Gold / Silver weight-only) ──

CREATE TABLE IF NOT EXISTS material_purchases (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier    TEXT NOT NULL,
  weight      NUMERIC(12,3) NOT NULL,
  notes       TEXT,
  sold_weight NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE material_purchases DROP COLUMN IF EXISTS rate;
ALTER TABLE material_purchases DROP COLUMN IF EXISTS amount;
-- Migrate legacy 'silver' rows BEFORE the type CHECK is added, otherwise a
-- leftover 'silver' row aborts schema.sql and everything after it (RLS fixes)
-- silently never deploys.
UPDATE material_purchases SET type = 'silver_925' WHERE type = 'silver';
ALTER TABLE material_purchases DROP CONSTRAINT IF EXISTS material_purchases_type_check;
ALTER TABLE material_purchases ADD CONSTRAINT material_purchases_type_check CHECK (type IN ('gold_18k', 'silver_925', 'silver_ornaments'));
-- Clamp oversold legacy data before the sold_weight CHECK (same abort guard).
UPDATE material_purchases SET sold_weight = LEAST(sold_weight, weight) WHERE sold_weight > weight;
ALTER TABLE material_purchases DROP CONSTRAINT IF EXISTS chk_mp_sold_weight;
ALTER TABLE material_purchases ADD CONSTRAINT chk_mp_sold_weight CHECK (sold_weight >= 0 AND sold_weight <= weight);

CREATE INDEX IF NOT EXISTS idx_material_purchases_type ON material_purchases(type);

-- ─── MATERIAL SALES (18K Gold / Silver sold on invoices) ─

CREATE TABLE IF NOT EXISTS material_sales (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  invoice_id  BIGINT REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_no  TEXT,
  description TEXT,
  weight      NUMERIC(12,3) NOT NULL,
  rate        NUMERIC(10,2),
  amount      NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

UPDATE material_sales SET type = 'silver_925' WHERE type = 'silver';
ALTER TABLE material_sales DROP CONSTRAINT IF EXISTS material_sales_type_check;
ALTER TABLE material_sales ADD CONSTRAINT material_sales_type_check CHECK (type IN ('gold_18k', 'silver_925', 'silver_ornaments'));

CREATE INDEX IF NOT EXISTS idx_material_sales_type ON material_sales(type);
CREATE INDEX IF NOT EXISTS idx_material_sales_invoice ON material_sales(invoice_id);

-- ─── RPC: PROCESS MATERIAL SALE ──────────────────────────

DROP FUNCTION IF EXISTS process_material_sale(bigint);
CREATE OR REPLACE FUNCTION process_material_sale(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_inv_no TEXT;
  v_avail NUMERIC;
  v_selling NUMERIC;
  v_remaining_weight NUMERIC;
  v_lot RECORD;
BEGIN
  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;

  IF EXISTS (SELECT 1 FROM material_sales WHERE invoice_id = p_invoice_id) THEN
    RETURN;
  END IF;

  -- === Validate stock availability ===

  -- 18K Gold (both item_id-linked and item_id=null buttons)
  SELECT COALESCE(SUM(weight - sold_weight), 0) INTO v_avail FROM material_purchases WHERE type = 'gold_18k';
  SELECT COALESCE(SUM(ii.weight), 0) INTO v_selling
  FROM invoice_items ii
  LEFT JOIN item_master im ON im.id = ii.item_id
  WHERE ii.invoice_id = p_invoice_id AND (im.material_type = 'gold_18k' OR ii.material_type = 'gold_18k');
  IF v_selling > v_avail THEN
    RAISE EXCEPTION 'Insufficient 18K Gold stock: selling %s g but only %s g available', v_selling, v_avail;
  END IF;

  -- Silver 925
  SELECT COALESCE(SUM(weight - sold_weight), 0) INTO v_avail FROM material_purchases WHERE type = 'silver_925';
  SELECT COALESCE(SUM(weight), 0) INTO v_selling FROM invoice_items WHERE invoice_id = p_invoice_id AND material_type = 'silver_925';
  IF v_selling > v_avail THEN
    RAISE EXCEPTION 'Insufficient Silver 925 stock: selling %s g but only %s g available', v_selling, v_avail;
  END IF;

  -- Silver Ornaments
  SELECT COALESCE(SUM(weight - sold_weight), 0) INTO v_avail FROM material_purchases WHERE type = 'silver_ornaments';
  SELECT COALESCE(SUM(weight), 0) INTO v_selling FROM invoice_items WHERE invoice_id = p_invoice_id AND material_type = 'silver_ornaments';
  IF v_selling > v_avail THEN
    RAISE EXCEPTION 'Insufficient Silver Ornaments stock: selling %s g but only %s g available', v_selling, v_avail;
  END IF;

  -- === Process 18K Gold ===

  INSERT INTO material_sales (type, invoice_id, invoice_no, description, weight, rate, amount)
  SELECT 'gold_18k', p_invoice_id, v_inv_no, COALESCE(im.name, ii.description_extra), ii.weight, ii.rate_per_gram, ii.price
  FROM invoice_items ii
  LEFT JOIN item_master im ON im.id = ii.item_id
  WHERE ii.invoice_id = p_invoice_id
    AND (im.material_type = 'gold_18k' OR ii.material_type = 'gold_18k');

  -- Deduct gold_18k from purchases FIFO
  BEGIN
    SELECT COALESCE(SUM(ii.weight), 0) INTO v_remaining_weight
    FROM invoice_items ii
    LEFT JOIN item_master im ON im.id = ii.item_id
    WHERE ii.invoice_id = p_invoice_id AND (im.material_type = 'gold_18k' OR ii.material_type = 'gold_18k');
    FOR v_lot IN SELECT id, weight, sold_weight FROM material_purchases
                 WHERE type = 'gold_18k' AND weight > sold_weight
                 ORDER BY created_at ASC
    LOOP
      IF v_remaining_weight <= 0 THEN EXIT; END IF;
      DECLARE
        v_avail_weight NUMERIC := v_lot.weight - v_lot.sold_weight;
        v_deduct NUMERIC := LEAST(v_avail_weight, v_remaining_weight);
      BEGIN
        UPDATE material_purchases SET sold_weight = sold_weight + v_deduct WHERE id = v_lot.id;
        v_remaining_weight := v_remaining_weight - v_deduct;
      END;
    END LOOP;
  END;

  -- === Process Silver items ===
  -- NB: item_id IS NULL alone also matches standalone gold_18k lines, so the
  -- type must be explicitly restricted to silver types to avoid double-counting.

  INSERT INTO material_sales (type, invoice_id, invoice_no, description, weight, rate, amount)
  SELECT ii.material_type, p_invoice_id, v_inv_no, ii.description_extra, ii.weight, ii.rate_per_gram, ii.price
  FROM invoice_items ii
  WHERE ii.invoice_id = p_invoice_id AND ii.item_id IS NULL AND ii.material_type IN ('silver_925', 'silver_ornaments');

  -- Deduct silver_925 from purchases FIFO
  BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO v_remaining_weight
    FROM invoice_items WHERE invoice_id = p_invoice_id AND material_type = 'silver_925';
    FOR v_lot IN SELECT id, weight, sold_weight FROM material_purchases
                 WHERE type = 'silver_925' AND weight > sold_weight
                 ORDER BY created_at ASC
    LOOP
      IF v_remaining_weight <= 0 THEN EXIT; END IF;
      DECLARE
        v_avail_weight NUMERIC := v_lot.weight - v_lot.sold_weight;
        v_deduct NUMERIC := LEAST(v_avail_weight, v_remaining_weight);
      BEGIN
        UPDATE material_purchases SET sold_weight = sold_weight + v_deduct WHERE id = v_lot.id;
        v_remaining_weight := v_remaining_weight - v_deduct;
      END;
    END LOOP;
  END;

  -- Deduct silver_ornaments from purchases FIFO
  BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO v_remaining_weight
    FROM invoice_items WHERE invoice_id = p_invoice_id AND material_type = 'silver_ornaments';
    FOR v_lot IN SELECT id, weight, sold_weight FROM material_purchases
                 WHERE type = 'silver_ornaments' AND weight > sold_weight
                 ORDER BY created_at ASC
    LOOP
      IF v_remaining_weight <= 0 THEN EXIT; END IF;
      DECLARE
        v_avail_weight NUMERIC := v_lot.weight - v_lot.sold_weight;
        v_deduct NUMERIC := LEAST(v_avail_weight, v_remaining_weight);
      BEGIN
        UPDATE material_purchases SET sold_weight = sold_weight + v_deduct WHERE id = v_lot.id;
        v_remaining_weight := v_remaining_weight - v_deduct;
      END;
    END LOOP;
  END;
END;
$$;

-- ─── RPC: REVERSE MATERIAL SALE ──────────────────────────

DROP FUNCTION IF EXISTS reverse_material_sale(bigint);
CREATE OR REPLACE FUNCTION reverse_material_sale(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_type TEXT;
  v_remaining NUMERIC;
  v_lot RECORD;
BEGIN
  -- Release sold_weight per type using reverse-FIFO (newest lot first),
  -- capped at each lot's actual sold_weight. This avoids wiping other
  -- invoices' consumption when multiple lots share a type.
  FOR v_type IN SELECT unnest(ARRAY['gold_18k', 'silver_925', 'silver_ornaments']) LOOP
    SELECT COALESCE(SUM(weight), 0) INTO v_remaining
    FROM material_sales WHERE invoice_id = p_invoice_id AND type = v_type;

    IF v_remaining > 0 THEN
      FOR v_lot IN SELECT id, sold_weight FROM material_purchases
                   WHERE type = v_type AND sold_weight > 0
                   ORDER BY id DESC
      LOOP
        IF v_remaining <= 0 THEN EXIT; END IF;
        DECLARE
          v_deduct NUMERIC := LEAST(v_lot.sold_weight, v_remaining);
        BEGIN
          UPDATE material_purchases SET sold_weight = sold_weight - v_deduct WHERE id = v_lot.id;
          v_remaining := v_remaining - v_deduct;
        END;
      END LOOP;
    END IF;
  END LOOP;

  -- Delete material_sales for this invoice
  DELETE FROM material_sales WHERE invoice_id = p_invoice_id;
END;
$$;

-- ─── RLS POLICIES ──────────────────────────────────────

-- Helper: check if user has permission
CREATE OR REPLACE FUNCTION has_permission(perm_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
    AND is_active = true
    AND (
      role = 'owner'
      OR permissions->>perm_name = 'true'
    )
  );
$$;

-- Enable RLS on all tables
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inward_supply_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE diamond_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_sales ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first (for idempotent re-runs)
DO $$ BEGIN
  DROP POLICY IF EXISTS item_master_read ON item_master; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS item_master_write ON item_master; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS item_master_update ON item_master; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS item_master_delete ON item_master; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS customers_read ON customers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS customers_write ON customers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS customers_update ON customers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS customers_delete ON customers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS stock_ledger_read ON stock_ledger; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS purchases_read ON purchases; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS purchases_write ON purchases; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS purchases_update ON purchases; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inward_supply_read ON inward_supply_vouchers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inward_supply_write ON inward_supply_vouchers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inward_supply_update ON inward_supply_vouchers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inward_supply_delete ON inward_supply_vouchers; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoices_read ON invoices; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoices_write ON invoices; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoices_update ON invoices; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoices_delete ON invoices; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoice_items_read ON invoice_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoice_items_write ON invoice_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoice_items_update ON invoice_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS invoice_items_delete ON invoice_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS diamond_items_read ON diamond_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS diamond_items_write ON diamond_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS diamond_items_update ON diamond_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS diamond_items_delete ON diamond_items; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS users_read ON users; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS users_write ON users; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS users_update ON users; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS role_masters_read ON role_masters; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS role_masters_write ON role_masters; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inv_sequences_read ON inv_sequences; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inv_sequences_write ON inv_sequences; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS inv_sequences_update ON inv_sequences; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS settings_read ON settings; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS settings_write ON settings; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS settings_update ON settings; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS logs_read ON logs; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS logs_write ON logs; END $$;

-- Item Master: read for anyone who bills or manages stock, write for item_master
CREATE POLICY item_master_read ON item_master FOR SELECT USING (
  has_permission('allow_stock_view') OR has_permission('allow_item_master') OR has_permission('allow_billing')
);
CREATE POLICY item_master_write ON item_master FOR INSERT WITH CHECK (
  has_permission('allow_item_master')
);
CREATE POLICY item_master_update ON item_master FOR UPDATE USING (
  has_permission('allow_item_master')
);
CREATE POLICY item_master_delete ON item_master FOR DELETE USING (
  has_permission('allow_item_master')
);

-- Customers: read/write for allow_customers
CREATE POLICY customers_read ON customers FOR SELECT USING (
  has_permission('allow_customers') OR has_permission('allow_billing')
);
CREATE POLICY customers_write ON customers FOR INSERT WITH CHECK (
  has_permission('allow_customers')
);
CREATE POLICY customers_update ON customers FOR UPDATE USING (
  has_permission('allow_customers')
);
CREATE POLICY customers_delete ON customers FOR DELETE USING (
  has_permission('allow_customers')
);

-- Stock Ledger: read for stock_view/billing, insert for triggers/stock_edit
CREATE POLICY stock_ledger_read ON stock_ledger FOR SELECT USING (
  has_permission('allow_stock_view') OR has_permission('allow_billing')
);
DO $$ BEGIN DROP POLICY IF EXISTS stock_ledger_insert ON stock_ledger; END $$;
CREATE POLICY stock_ledger_insert ON stock_ledger FOR INSERT WITH CHECK (
  has_permission('allow_stock_edit')
);
DO $$ BEGIN DROP POLICY IF EXISTS stock_ledger_update ON stock_ledger; END $$;
CREATE POLICY stock_ledger_update ON stock_ledger FOR UPDATE USING (
  has_permission('allow_stock_edit')
);

-- Purchases: read for stock_view AND billing (stock check needs lots), write for stock_edit
CREATE POLICY purchases_read ON purchases FOR SELECT USING (
  has_permission('allow_stock_view') OR has_permission('allow_billing')
);
CREATE POLICY purchases_write ON purchases FOR INSERT WITH CHECK (
  has_permission('allow_stock_edit')
);
CREATE POLICY purchases_update ON purchases FOR UPDATE USING (
  has_permission('allow_stock_edit')
);

-- Inward Supply: read/write for allow_billing (exchange valuation)
CREATE POLICY inward_supply_read ON inward_supply_vouchers FOR SELECT USING (
  has_permission('allow_billing')
);
CREATE POLICY inward_supply_write ON inward_supply_vouchers FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY inward_supply_update ON inward_supply_vouchers FOR UPDATE USING (
  has_permission('allow_billing')
);
-- Needed for the edit flow which replaces a voucher's rows (insert new, delete old)
DROP POLICY IF EXISTS inward_supply_delete ON inward_supply_vouchers;
CREATE POLICY inward_supply_delete ON inward_supply_vouchers FOR DELETE USING (
  has_permission('allow_billing')
);

-- Invoices: read for billing/reports (and stock_view so stock managers can view
-- sale details), write/update for allow_billing
CREATE POLICY invoices_read ON invoices FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
CREATE POLICY invoices_write ON invoices FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (
  has_permission('allow_billing')
);
DROP POLICY IF EXISTS invoices_delete ON invoices;

-- Invoice items: same as invoices
CREATE POLICY invoice_items_read ON invoice_items FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
CREATE POLICY invoice_items_write ON invoice_items FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY invoice_items_update ON invoice_items FOR UPDATE USING (
  has_permission('allow_billing')
);
CREATE POLICY invoice_items_delete ON invoice_items FOR DELETE USING (
  has_permission('allow_billing')
);

-- Diamond items: same as invoices
CREATE POLICY diamond_items_read ON diamond_items FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports')
);
CREATE POLICY diamond_items_write ON diamond_items FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY diamond_items_update ON diamond_items FOR UPDATE USING (
  has_permission('allow_billing')
);
CREATE POLICY diamond_items_delete ON diamond_items FOR DELETE USING (
  has_permission('allow_billing')
);

-- Users: own profile read by self, all users read by owner/settings, write by owner only
CREATE POLICY users_read ON users FOR SELECT USING (
  auth_id = auth.uid() OR has_permission('allow_settings')
);
CREATE POLICY users_write ON users FOR INSERT WITH CHECK (
  has_permission('allow_settings')
);
CREATE POLICY users_update ON users FOR UPDATE USING (
  auth_id = auth.uid() OR has_permission('allow_settings')
);

-- Role masters: only owner can read/write
CREATE POLICY role_masters_read ON role_masters FOR SELECT USING (
  has_permission('allow_settings')
);
CREATE POLICY role_masters_write ON role_masters FOR INSERT WITH CHECK (
  has_permission('allow_settings')
);

-- Inv sequences: owner read, billing write/update
CREATE POLICY inv_sequences_read ON inv_sequences FOR SELECT USING (
  has_permission('allow_settings') OR has_permission('allow_billing')
);
CREATE POLICY inv_sequences_write ON inv_sequences FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY inv_sequences_update ON inv_sequences FOR UPDATE USING (
  has_permission('allow_billing')
);

-- Settings: read for billing/reports (need gold_rate, shop_state for invoices & tax split), write only owner
CREATE POLICY settings_read ON settings FOR SELECT USING (
  has_permission('allow_settings') OR has_permission('allow_billing') OR has_permission('allow_reports')
);
CREATE POLICY settings_write ON settings FOR INSERT WITH CHECK (
  has_permission('allow_settings')
);
CREATE POLICY settings_update ON settings FOR UPDATE USING (
  has_permission('allow_settings')
);

-- Logs: owner read, insert by any signed-in user (blocks anon spam)
CREATE POLICY logs_read ON logs FOR SELECT USING (
  has_permission('allow_settings')
);
CREATE POLICY logs_write ON logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Material purchases: read by billing/reports/stock_view, write/update by billing
DROP POLICY IF EXISTS material_purchases_read ON material_purchases;
CREATE POLICY material_purchases_read ON material_purchases FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
DROP POLICY IF EXISTS material_purchases_write ON material_purchases;
CREATE POLICY material_purchases_write ON material_purchases FOR INSERT WITH CHECK (
  has_permission('allow_stock_edit')
);
DROP POLICY IF EXISTS material_purchases_update ON material_purchases;
CREATE POLICY material_purchases_update ON material_purchases FOR UPDATE USING (
  has_permission('allow_stock_edit')
);
DROP POLICY IF EXISTS material_purchases_delete ON material_purchases;
CREATE POLICY material_purchases_delete ON material_purchases FOR DELETE USING (
  has_permission('allow_stock_edit')
);

-- Material sales: read by billing/reports/stock_view, write/delete by billing
DROP POLICY IF EXISTS material_sales_read ON material_sales;
CREATE POLICY material_sales_read ON material_sales FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
DROP POLICY IF EXISTS material_sales_write ON material_sales;
CREATE POLICY material_sales_write ON material_sales FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
DROP POLICY IF EXISTS material_sales_delete ON material_sales;
CREATE POLICY material_sales_delete ON material_sales FOR DELETE USING (
  has_permission('allow_billing')
);

-- ─── CHECK CONSTRAINTS ────────────────────────────────
-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add keeps
-- schema.sql idempotent on re-runs.

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS chk_weight_positive;
ALTER TABLE invoice_items ADD CONSTRAINT chk_weight_positive CHECK (weight > 0);
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS chk_rate_positive;
ALTER TABLE invoice_items ADD CONSTRAINT chk_rate_positive CHECK (rate_per_gram >= 0);
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS chk_purch_weight_positive;
ALTER TABLE purchases ADD CONSTRAINT chk_purch_weight_positive CHECK (weight > 0);
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS chk_pcs_positive;
ALTER TABLE purchases ADD CONSTRAINT chk_pcs_positive CHECK (pcs > 0);
ALTER TABLE material_purchases DROP CONSTRAINT IF EXISTS chk_mp_weight_positive;
ALTER TABLE material_purchases ADD CONSTRAINT chk_mp_weight_positive CHECK (weight > 0);
ALTER TABLE material_sales DROP CONSTRAINT IF EXISTS chk_ms_weight_positive;
ALTER TABLE material_sales ADD CONSTRAINT chk_ms_weight_positive CHECK (weight > 0);

-- ══════════════════════════════════════════════════════
-- ─── LABOUR JOBS (job-work service vouchers) ───────────
-- Customer supplies the metal; shop charges service +
-- hallmark charges only. NO stock impact, no ledger rows.
--
-- Money model (per job):
--   service_charge  = entered amount, INCLUSIVE of GST
--   service_taxable = round(charge × 100/(100+pct), 2)
--   service_tax     = charge − taxable   (exact, no drift)
--   hallmark_charge = entered amount, EXCLUSIVE of GST
--   hallmark_tax    = round(hallmark × pct/100, 2)
--   grand_total     = charge + hallmark + hallmark_tax
-- ══════════════════════════════════════════════════════

ALTER TYPE inv_sequence_type ADD VALUE IF NOT EXISTS 'labour';

CREATE TABLE IF NOT EXISTS labour_jobs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inv_no           TEXT NOT NULL UNIQUE,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id      BIGINT REFERENCES customers(id),
  -- Snapshot fields so reprints never change (same pattern as invoices)
  customer_name    TEXT NOT NULL DEFAULT '',
  customer_address TEXT DEFAULT '',
  customer_phone   TEXT DEFAULT '',
  customer_state   TEXT DEFAULT 'Haryana',
  customer_gstin   TEXT DEFAULT '',
  service_charge   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  service_taxable  NUMERIC(12,2) NOT NULL DEFAULT 0,
  hallmark_charge  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hallmark_charge >= 0),
  tax_pct          NUMERIC(5,2)  NOT NULL DEFAULT 18,
  service_tax      NUMERIC(10,2) NOT NULL DEFAULT 0,
  hallmark_tax     NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_total        NUMERIC(10,2) NOT NULL DEFAULT 0,
  grand_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes            TEXT DEFAULT '',
  created_by       BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS labour_job_items (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES labour_jobs(id) ON DELETE CASCADE,
  sno        INTEGER NOT NULL DEFAULT 1,
  item_name  TEXT NOT NULL DEFAULT '',
  purity     TEXT NOT NULL DEFAULT '22K',
  weight     NUMERIC(10,3) NOT NULL CHECK (weight > 0)
);

CREATE INDEX IF NOT EXISTS idx_labour_jobs_date ON labour_jobs(date);
CREATE INDEX IF NOT EXISTS idx_labour_jobs_customer ON labour_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_labour_job_items_job ON labour_job_items(job_id);

-- ─── LABOUR JOBS RPCs ──────────────────────────────────

-- Atomic create/update for a labour job. Recomputes all derived amounts
-- server-side (the client's numbers are display-only), guards duplicate
-- voucher numbers, replaces the item lines in one transaction.
CREATE OR REPLACE FUNCTION save_labour_job(p_job JSONB)
RETURNS TABLE(job_id BIGINT, job_inv_no TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_id            BIGINT;
  v_inv_no        TEXT;
  v_parts         TEXT[];
  i               INTEGER;
  v_fy            TEXT;
  v_seq           INTEGER;
  v_charge        NUMERIC;
  v_hallmark      NUMERIC;
  v_pct           NUMERIC;
  v_taxable       NUMERIC;
  v_service_tax   NUMERIC;
  v_hall_tax      NUMERIC;
  r               JSONB;
  v_line_no       INTEGER := 0;
BEGIN
  IF NOT has_permission('allow_billing') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_inv_no := NULLIF(trim(COALESCE(p_job->>'inv_no', '')), '');
  IF v_inv_no IS NULL THEN
    RAISE EXCEPTION 'Voucher number is required';
  END IF;

  v_charge   := COALESCE(NULLIF(p_job->>'service_charge', '')::NUMERIC, 0);
  v_hallmark := COALESCE(NULLIF(p_job->>'hallmark_charge', '')::NUMERIC, 0);
  v_pct      := COALESCE(NULLIF(p_job->>'tax_pct', '')::NUMERIC, 18);

  IF v_charge < 0 OR v_hallmark < 0 THEN
    RAISE EXCEPTION 'Charges cannot be negative';
  END IF;

  -- Derived amounts. Service charge is INCLUSIVE of GST; hallmark EXCLUSIVE.
  -- taxable + tax always equals the entered charge exactly (no rounding drift).
  v_taxable     := ROUND(v_charge * 100 / (100 + v_pct), 2);
  v_service_tax := v_charge - v_taxable;
  v_hall_tax    := ROUND(v_hallmark * v_pct / 100, 2);

  -- Duplicate check — edit mode excludes the row being edited
  v_id := NULLIF(p_job->>'id', '')::BIGINT;
  IF EXISTS (SELECT 1 FROM labour_jobs WHERE inv_no = v_inv_no AND id <> COALESCE(v_id, -1)) THEN
    RAISE EXCEPTION 'DUPLICATE_INV_NO: % is already in use', v_inv_no;
  END IF;

  -- Extract FY ({yyyy-yy}) and trailing sequence from the number, whatever
  -- prefix format was used ('SJS/LB/2026-27/005' or a free-text override).
  -- Only same-FY sequences bump inv_sequences; cross-FY overrides are ignored.
  v_parts := string_to_array(v_inv_no, '/');
  FOR i IN 1..COALESCE(array_length(v_parts, 1), 0) LOOP
    IF v_parts[i] ~ '^\d{4}-\d{2}$' THEN v_fy := v_parts[i]; END IF;
  END LOOP;
  -- Regex-guarded cast: free-text overrides without a numeric tail are
  -- simply ignored for sequencing instead of crashing the save.
  IF COALESCE(array_length(v_parts, 1), 0) > 0
     AND v_parts[array_length(v_parts, 1)] ~ '^\d+$' THEN
    v_seq := v_parts[array_length(v_parts, 1)]::INTEGER;
  END IF;

  IF v_fy IS NOT NULL AND v_seq IS NOT NULL AND v_seq > 0 THEN
    INSERT INTO inv_sequences (type, fy, last_no)
    VALUES ('labour'::inv_sequence_type, v_fy, v_seq)
    ON CONFLICT (type, fy)
    DO UPDATE SET last_no = GREATEST(inv_sequences.last_no, EXCLUDED.last_no);
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE labour_jobs SET
      inv_no          = v_inv_no,
      date            = COALESCE((p_job->>'date')::DATE, CURRENT_DATE),
      customer_id     = (p_job->>'customer_id')::BIGINT,
      customer_name   = COALESCE(p_job->>'customer_name', ''),
      customer_address= COALESCE(p_job->>'customer_address', ''),
      customer_phone  = COALESCE(p_job->>'customer_phone', ''),
      customer_state  = COALESCE(p_job->>'customer_state', 'Haryana'),
      customer_gstin  = COALESCE(p_job->>'customer_gstin', ''),
      service_charge  = v_charge,
      service_taxable = v_taxable,
      hallmark_charge = v_hallmark,
      tax_pct         = v_pct,
      service_tax     = v_service_tax,
      hallmark_tax    = v_hall_tax,
      tax_total       = v_service_tax + v_hall_tax,
      grand_total     = v_charge + v_hallmark + v_hall_tax,
      notes           = COALESCE(p_job->>'notes', ''),
      updated_at      = now()
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Labour job % not found', v_id;
    END IF;
    -- Qualified column (li.job_id) so it can't collide with this function's
    -- job_id OUT parameter — unqualified would raise 'ambiguous column'.
    DELETE FROM labour_job_items li WHERE li.job_id = v_id;
    -- created_by is preserved on edit (matches replace_purchase behaviour)
  ELSE
    INSERT INTO labour_jobs (
      inv_no, date, customer_id, customer_name, customer_address, customer_phone,
      customer_state, customer_gstin, service_charge, service_taxable,
      hallmark_charge, tax_pct, service_tax, hallmark_tax, tax_total,
      grand_total, notes, created_by
    ) VALUES (
      v_inv_no,
      COALESCE((p_job->>'date')::DATE, CURRENT_DATE),
      (p_job->>'customer_id')::BIGINT,
      COALESCE(p_job->>'customer_name', ''),
      COALESCE(p_job->>'customer_address', ''),
      COALESCE(p_job->>'customer_phone', ''),
      COALESCE(p_job->>'customer_state', 'Haryana'),
      COALESCE(p_job->>'customer_gstin', ''),
      v_charge, v_taxable, v_hallmark, v_pct, v_service_tax, v_hall_tax,
      v_service_tax + v_hall_tax,
      v_charge + v_hallmark + v_hall_tax,
      COALESCE(p_job->>'notes', ''),
      (p_job->>'created_by')::BIGINT
    ) RETURNING id INTO v_id;
  END IF;

  -- Replace item lines
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_job->'items', '[]'::jsonb)) LOOP
    v_line_no := v_line_no + 1;
    IF trim(COALESCE(r->>'item_name', '')) = '' THEN
      RAISE EXCEPTION 'Item %: name is required', v_line_no;
    END IF;
    IF COALESCE(r->>'weight', '0')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'Item %: weight must be greater than 0', v_line_no;
    END IF;
    INSERT INTO labour_job_items (job_id, sno, item_name, purity, weight)
    VALUES (
      v_id,
      COALESCE((r->>'sno')::INTEGER, v_line_no),
      trim(r->>'item_name'),
      COALESCE(NULLIF(r->>'purity', ''), '22K'),
      (r->>'weight')::NUMERIC
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_inv_no;
END;
$$;

-- Delete a labour job any time (no stock linkage). Items cascade via FK.
-- Sequence steps back only if the deleted job held the exact highest number
-- of its FY, so deleting the latest voucher doesn't burn a number but
-- deleting a middle one never creates duplicate-number risk.
CREATE OR REPLACE FUNCTION delete_labour_job(p_job_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_inv_no TEXT;
  v_parts  TEXT[];
  i        INTEGER;
  v_fy     TEXT;
  v_seq    INTEGER;
BEGIN
  IF NOT has_permission('allow_billing') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_job_id IS NULL THEN RETURN; END IF;

  SELECT inv_no INTO v_inv_no FROM labour_jobs WHERE id = p_job_id;
  IF v_inv_no IS NULL THEN RETURN; END IF;

  DELETE FROM labour_jobs WHERE id = p_job_id;

  v_parts := string_to_array(v_inv_no, '/');
  FOR i IN 1..COALESCE(array_length(v_parts, 1), 0) LOOP
    IF v_parts[i] ~ '^\d{4}-\d{2}$' THEN v_fy := v_parts[i]; END IF;
  END LOOP;
  IF COALESCE(array_length(v_parts, 1), 0) > 0
     AND v_parts[array_length(v_parts, 1)] ~ '^\d+$' THEN
    v_seq := v_parts[array_length(v_parts, 1)]::INTEGER;
  END IF;

  IF v_fy IS NOT NULL AND v_seq IS NOT NULL THEN
    UPDATE inv_sequences SET last_no = last_no - 1
    WHERE type = 'labour'::inv_sequence_type AND fy = v_fy
      AND last_no = v_seq AND last_no > 0;
  END IF;
END;
$$;

-- ─── LABOUR JOBS RLS ───────────────────────────────────
-- Read mirrors invoices (billing / reports / stock view);
-- writes stay with allow_billing.

ALTER TABLE labour_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_job_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN DROP POLICY IF EXISTS labour_jobs_read ON labour_jobs; END $$;
CREATE POLICY labour_jobs_read ON labour_jobs FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
DO $$ BEGIN DROP POLICY IF EXISTS labour_jobs_write ON labour_jobs; END $$;
CREATE POLICY labour_jobs_write ON labour_jobs FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
DO $$ BEGIN DROP POLICY IF EXISTS labour_jobs_update ON labour_jobs; END $$;
CREATE POLICY labour_jobs_update ON labour_jobs FOR UPDATE USING (
  has_permission('allow_billing')
);
DO $$ BEGIN DROP POLICY IF EXISTS labour_jobs_delete ON labour_jobs; END $$;
CREATE POLICY labour_jobs_delete ON labour_jobs FOR DELETE USING (
  has_permission('allow_billing')
);

DO $$ BEGIN DROP POLICY IF EXISTS labour_job_items_read ON labour_job_items; END $$;
CREATE POLICY labour_job_items_read ON labour_job_items FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports') OR has_permission('allow_stock_view')
);
DO $$ BEGIN DROP POLICY IF EXISTS labour_job_items_write ON labour_job_items; END $$;
CREATE POLICY labour_job_items_write ON labour_job_items FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
DO $$ BEGIN DROP POLICY IF EXISTS labour_job_items_delete ON labour_job_items; END $$;
CREATE POLICY labour_job_items_delete ON labour_job_items FOR DELETE USING (
  has_permission('allow_billing')
);
