-- ONE-TIME FIX: labour job HUID not saving on update/print
-- Run this whole file once in Supabase SQL Editor.
-- It adds the huid column (if missing) and replaces save_labour_job()
-- with the version that persists huid per item line.
-- Safe to re-run (idempotent).

ALTER TABLE labour_job_items ADD COLUMN IF NOT EXISTS huid TEXT DEFAULT '';

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
      date            = COALESCE(NULLIF(p_job->>'date', '')::DATE, CURRENT_DATE),
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
      COALESCE(NULLIF(p_job->>'date', '')::DATE, CURRENT_DATE),
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
    INSERT INTO labour_job_items (job_id, sno, item_name, purity, huid, weight)
    VALUES (
      v_id,
      COALESCE((r->>'sno')::INTEGER, v_line_no),
      trim(r->>'item_name'),
      COALESCE(NULLIF(r->>'purity', ''), '22K'),
      COALESCE(NULLIF(upper(trim(r->>'huid')), ''), ''),
      (r->>'weight')::NUMERIC
    );
  END LOOP;

  RETURN QUERY SELECT v_id, v_inv_no;
END;
$$;

-- Verify: both should return true / include huid after running.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'labour_job_items';
-- SELECT prosrc LIKE '%huid%' AS rpc_handles_huid FROM pg_proc WHERE proname = 'save_labour_job';
