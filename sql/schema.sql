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

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON stock_ledger(date);

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

-- ─── INWARD SUPPLY VOUCHERS ────────────────────────────
-- Exchange/trade-in: customer brings old items, shop values them,
-- value offsets customer's new bill via invoices.adj_bill_id + adj_amount.
-- NOT connected to stock/purchases — purely a valuation & adjustment mechanism.

CREATE TABLE IF NOT EXISTS inward_supply_vouchers (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inv_no          TEXT NOT NULL UNIQUE,
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
  payment_mode    TEXT DEFAULT 'Cash',
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

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS gold_rate NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS round_off NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

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
  ('shop_state', '"Delhi"'),
  ('shop_city', '"Delhi"'),
  ('shop_pan', '""'),
  ('bank_details', '{"bank_name":"","account_no":"","ifsc":"","branch":"","account_holder":""}'),
  ('declaration', '"We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."'),
  ('fy_start', '"2026-04-01"'),
  ('gold_rate', '0')
ON CONFLICT (key) DO NOTHING;

-- ─── FUNCTIONS ─────────────────────────────────────────

-- Get current financial year string (e.g. '2026-27')
CREATE OR REPLACE FUNCTION get_financial_year(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
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
RETURNS TEXT LANGUAGE plpgsql AS $$
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
  ELSE
    RETURN 'SJS/IWS/' || v_fy || '/' || LPAD(v_seq::TEXT, 3, '0');
  END IF;
END;
$$;

-- Get current stock balance for an item
CREATE OR REPLACE FUNCTION get_stock_balance(p_item_id BIGINT)
RETURNS TABLE(item_id BIGINT, item_name TEXT, total_weight NUMERIC, total_pcs BIGINT)
LANGUAGE SQL STABLE AS $$
  SELECT
    im.id,
    im.name,
    COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.weight ELSE -sl.weight END), 0),
    COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.pcs ELSE -sl.pcs END), 0)
  FROM item_master im
  LEFT JOIN stock_ledger sl ON sl.item_id = im.id
  WHERE im.id = p_item_id AND im.active = true
  GROUP BY im.id, im.name;
$$;

-- Get individual stock lots (purchases only — inward supply is not stock)
DROP FUNCTION IF EXISTS get_stock_lots();
CREATE OR REPLACE FUNCTION get_stock_lots()
RETURNS TABLE(lot_id BIGINT, item_name TEXT, purity TEXT, huid BOOLEAN, weight NUMERIC, pcs INTEGER, ref_date DATE, status TEXT, sale_inv_no TEXT)
LANGUAGE SQL STABLE AS $$
  SELECT
    p.id, im.name, p.purity, p.huid, p.weight,
    p.pcs - p.sold_pcs,
    p.date,
    CASE WHEN p.sold_pcs >= p.pcs THEN 'Sold' ELSE 'Available' END,
    COALESCE(p.sold_inv_no, '')
  FROM purchases p
  JOIN item_master im ON im.id = p.item_id
  WHERE p.pcs - p.sold_pcs > 0
  ORDER BY 6 DESC, 1 DESC;
$$;

-- Get next invoice sequence number
DROP FUNCTION IF EXISTS get_next_inv_no(text, text);
CREATE OR REPLACE FUNCTION get_next_inv_no(p_type inv_sequence_type, p_fy TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_no INTEGER;
BEGIN
  INSERT INTO inv_sequences (type, fy, last_no)
  VALUES (p_type, p_fy, 0)
  ON CONFLICT (type, fy) DO NOTHING;

  UPDATE inv_sequences SET last_no = last_no + 1
  WHERE type = p_type AND fy = p_fy
  RETURNING last_no INTO next_no;

  RETURN LPAD(next_no::TEXT, 3, '0');
END;
$$;

-- Peek next invoice number without incrementing
DROP FUNCTION IF EXISTS peek_next_inv_no(text, text);
CREATE OR REPLACE FUNCTION peek_next_inv_no(p_type inv_sequence_type, p_fy TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cur_no INTEGER;
BEGIN
  INSERT INTO inv_sequences (type, fy, last_no)
  VALUES (p_type, p_fy, 0)
  ON CONFLICT (type, fy) DO NOTHING;

  SELECT last_no INTO cur_no FROM inv_sequences
  WHERE type = p_type AND fy = p_fy;

  RETURN LPAD((cur_no + 1)::TEXT, 3, '0');
END;
$$;

-- Process full invoice stock: mark purchases/inward supply sold + insert stock_ledger OUT
CREATE OR REPLACE FUNCTION process_invoice_stock(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_inv_no TEXT;
BEGIN
  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;
  IF v_inv_no IS NULL THEN RAISE EXCEPTION 'Invoice not found: %', p_invoice_id; END IF;

  FOR r IN SELECT item_id, weight, huid FROM invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    -- Skip if stock_ledger already has an OUT entry for this exact item+weight+huid (idempotent)
    IF EXISTS (SELECT 1 FROM stock_ledger WHERE source_type = 'sale' AND reference_id = p_invoice_id AND item_id = r.item_id AND weight = r.weight AND huid = r.huid) THEN
      CONTINUE;
    END IF;

    -- Try purchases first (FIFO: oldest lot first)
    UPDATE purchases
    SET sold_pcs = sold_pcs + 1,
        is_sold = (sold_pcs + 1 >= pcs),
        sold_inv_no = CASE WHEN sold_inv_no = '' THEN v_inv_no ELSE sold_inv_no || ', ' || v_inv_no END
    WHERE id = (
      SELECT id FROM purchases
      WHERE item_id = r.item_id AND weight = r.weight AND huid = r.huid AND sold_pcs < pcs
      ORDER BY id ASC
      LIMIT 1
    );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No available stock for item_id=%, weight=%, huid=%', r.item_id, r.weight, r.huid;
    END IF;
  END LOOP;

  INSERT INTO stock_ledger (item_id, weight, pcs, direction, source_type, reference_id, date, notes, huid)
  SELECT item_id, weight, 1, 'OUT', 'sale', p_invoice_id,
    (SELECT date FROM invoices WHERE id = p_invoice_id),
    'Invoice ' || v_inv_no, huid
  FROM invoice_items WHERE invoice_id = p_invoice_id
    AND NOT EXISTS (
      SELECT 1 FROM stock_ledger
      WHERE source_type = 'sale' AND reference_id = p_invoice_id AND item_id = invoice_items.item_id AND weight = invoice_items.weight AND huid = invoice_items.huid
    );
END;
$$;

-- Reverse invoice stock: mark purchases/inward supply unsold + remove stock_ledger OUT
CREATE OR REPLACE FUNCTION reverse_invoice_stock(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_inv_no TEXT;
BEGIN
  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;

  FOR r IN SELECT item_id, weight, huid FROM invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    UPDATE purchases
    SET sold_pcs = GREATEST(sold_pcs - 1, 0),
        is_sold = (sold_pcs - 1 >= pcs),
        sold_inv_no = (
          SELECT COALESCE(string_agg(part, ', '), '')
          FROM unnest(string_to_array(sold_inv_no, ', ')) AS part
          WHERE part != v_inv_no
        )
    WHERE item_id = r.item_id
      AND sold_pcs > 0
      AND weight = r.weight
      AND huid = r.huid;

  END LOOP;

  DELETE FROM stock_ledger WHERE source_type = 'sale' AND reference_id = p_invoice_id;
END;
$$;

-- Safe delete: only allows deleting the last invoice
CREATE OR REPLACE FUNCTION delete_invoice(p_invoice_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max_id BIGINT;
  v_inv_no TEXT;
  v_fy TEXT;
  v_seq INTEGER;
BEGIN
  SELECT MAX(id) INTO v_max_id FROM invoices;
  IF p_invoice_id IS NULL OR p_invoice_id <> v_max_id THEN
    RAISE EXCEPTION 'Only the last invoice can be deleted';
  END IF;

  SELECT inv_no INTO v_inv_no FROM invoices WHERE id = p_invoice_id;

  PERFORM reverse_invoice_stock(p_invoice_id);
  DELETE FROM invoice_items WHERE invoice_id = p_invoice_id;
  DELETE FROM invoices WHERE id = p_invoice_id;

  -- Decrement sequence if this was the highest number
  v_fy := split_part(v_inv_no, '/', 2);
  v_seq := split_part(v_inv_no, '/', 3)::INTEGER;
  UPDATE inv_sequences SET last_no = last_no - 1
  WHERE type = 'sale' AND fy = v_fy AND last_no >= v_seq AND last_no > 0;
END;
$$;

CREATE OR REPLACE FUNCTION delete_inward_supply(p_inv_no TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- NOTE: stock marking is handled by process_invoice_stock() caller, not by trigger.
-- This avoids per-row issues where multiple items with same weight/huid
-- can't each find a matching unsold purchase lot.

-- ─── TRIGGER: auto-set user permissions on INSERT ──────

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
  BEFORE INSERT ON users
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
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO stock_ledger (item_id, weight, pcs, direction, source_type, reference_id, date, notes)
  VALUES (NEW.item_id, NEW.weight, NEW.pcs, 'IN', 'purchase', NEW.id, NEW.date, 'Purchase: ' || COALESCE(NEW.invoice_no, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_to_stock ON purchases;
CREATE TRIGGER trg_purchase_to_stock
  AFTER INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION trg_purchase_to_stock();

-- NOTE: Inward supply vouchers do NOT create stock ledger entries.
-- They are valuation/adjustment instruments, not stock movements.

-- Clean up triggers that may have been manually added in live DB
-- but conflict with the app's design (stock handled by RPCs, not triggers)
DROP TRIGGER IF EXISTS trg_mark_purchase_sold ON invoice_items;
DROP TRIGGER IF EXISTS trg_inward_to_stock ON inward_supply_vouchers;
DROP FUNCTION IF EXISTS trg_mark_purchase_sold();
DROP FUNCTION IF EXISTS trg_inward_to_stock();

-- ─── RLS POLICIES ──────────────────────────────────────

-- Helper: check if user has permission
CREATE OR REPLACE FUNCTION has_permission(perm_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
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

-- Item Master: read for anyone with stock_view, write for stock_edit or item_master
CREATE POLICY item_master_read ON item_master FOR SELECT USING (
  has_permission('allow_stock_view') OR has_permission('allow_item_master')
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
  has_permission('allow_stock_edit') OR has_permission('allow_billing')
);
DO $$ BEGIN DROP POLICY IF EXISTS stock_ledger_update ON stock_ledger; END $$;
CREATE POLICY stock_ledger_update ON stock_ledger FOR UPDATE USING (
  has_permission('allow_stock_edit') OR has_permission('allow_billing')
);

-- Purchases: read/write for stock_edit
CREATE POLICY purchases_read ON purchases FOR SELECT USING (
  has_permission('allow_stock_view')
);
CREATE POLICY purchases_write ON purchases FOR INSERT WITH CHECK (
  has_permission('allow_stock_edit')
);
CREATE POLICY purchases_update ON purchases FOR UPDATE USING (
  has_permission('allow_stock_edit') OR has_permission('allow_billing')
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
CREATE POLICY inward_supply_delete ON inward_supply_vouchers FOR DELETE USING (
  has_permission('allow_billing')
);

-- Invoices: read/write/update/delete for allow_billing
CREATE POLICY invoices_read ON invoices FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports')
);
CREATE POLICY invoices_write ON invoices FOR INSERT WITH CHECK (
  has_permission('allow_billing')
);
CREATE POLICY invoices_update ON invoices FOR UPDATE USING (
  has_permission('allow_billing')
);
CREATE POLICY invoices_delete ON invoices FOR DELETE USING (
  has_permission('allow_billing')
);

-- Invoice items: same as invoices
CREATE POLICY invoice_items_read ON invoice_items FOR SELECT USING (
  has_permission('allow_billing') OR has_permission('allow_reports')
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

-- Settings: only owner can read/write
CREATE POLICY settings_read ON settings FOR SELECT USING (
  has_permission('allow_settings')
);
CREATE POLICY settings_write ON settings FOR INSERT WITH CHECK (
  has_permission('allow_settings')
);
CREATE POLICY settings_update ON settings FOR UPDATE USING (
  has_permission('allow_settings')
);

-- Logs: owner read, insert by all
CREATE POLICY logs_read ON logs FOR SELECT USING (
  has_permission('allow_settings')
);
CREATE POLICY logs_write ON logs FOR INSERT WITH CHECK (true);
