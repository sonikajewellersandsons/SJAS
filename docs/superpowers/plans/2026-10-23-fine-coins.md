# Fine Coins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Fine Coins (Gold Coin / Silver Coin) to Materials with pcs + grams stock, a per-denomination MRP rate card, and MRP × qty billing lines with no labour or hallmark.

**Architecture:** Coins reuse `material_purchases` / `material_sales` / `invoice_items` with four new columns (`pcs`/`sold_pcs` on purchases; `qty`/`unit_weight` on sales; `qty`/`unit_weight`/`mrp` on invoice items) and two new `material_type` values (`gold_coin`, `silver_coin`). Stock is keyed by `(type, unit_weight)` so denominations never mix. A new `coin_rates` table holds the MRP card. `process_material_sale` consumes pcs and grams in lockstep FIFO per denomination; `reverse_material_sale` restores them reverse-FIFO.

**Tech Stack:** React 18 + Vite, Supabase Postgres 15 (RLS + SECURITY DEFINER RPCs), Deno edge function (PDF), Vitest.

**Spec:** user request + decisions recorded in `docs/superpowers/specs/2026-10-23-fine-coins-design.md` (this plan's source).

## Global Constraints

- Never write to the database from the agent. Author `sql/schema.sql` only; the user runs it.
- No `git push`. Local commits on `feat/fine-coins` only.
- No TypeScript in `src/` (plain JSX). No Chakra.
- All money via `fmt` (₹ + en-IN, 2 dp); weights 3 dp.
- Coin line = `item_id NULL`, `material_type` `gold_coin`/`silver_coin`, `price = mrp × qty`, `weight = unit_weight × qty`, `rate_per_gram = 0`, labour/hallmark 0.
- GST default 3%, editable per line.
- HSN: gold coin `71189010`, silver coin `71189020`.
- Coin stock is pcs + grams; billing must reject either shortfall.
- Existing behaviour (18K gold, silver 925, ornaments, regular items) must not change.

## Review Focus

- Editing an invoice whose coin line changes denomination or qty must not leak stock (net demand = new − original).
- Selling more coin pcs than a lot holds is blocked in the UI **and** by the RPC.
- A coin purchase lot's unit weight cannot be changed after pieces are sold (grams/pcs would desync) — the edit form locks it.
- Deleting an invoice with coins restores both pcs and grams.
- Coin lines must never render as "silver" in receipts/PDF/reports (the old `material_type !== 'gold_18k'` catch-all).

---

### Task 1: Schema — coin columns, types, rate card

**Files:**
- Modify: `sql/schema.sql` (invoice_items ~:237, material_purchases ~:759-785, material_sales ~:787-805, constraints ~:1244, RLS ~:1200-1230)

**Interfaces:**
- Produces: `material_purchases.pcs/sold_pcs/unit_weight`, `material_sales.qty/unit_weight`, `invoice_items.qty/unit_weight/mrp`, table `coin_rates(type, unit_weight, mrp, active)`.

- [ ] Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks.
- [ ] Extend both `type` CHECKs with `'gold_coin','silver_coin'` (drop-then-add, after legacy migration).
- [ ] Add `chk_mp_sold_pcs CHECK (sold_pcs >= 0 AND sold_pcs <= pcs)` and positive checks for new numeric columns.
- [ ] Create `coin_rates` with `UNIQUE(type, unit_weight)`; enable RLS; read policy `allow_billing OR allow_stock_view OR allow_reports`, write `allow_stock_edit`.

### Task 2: RPCs — process / reverse coins

**Files:**
- Modify: `sql/schema.sql:809-965`

**Interfaces:**
- `process_material_sale(p_invoice_id BIGINT)` — adds validation/insert/FIFO for coins.
- `reverse_material_sale(p_invoice_id BIGINT)` — restores coin pcs + grams.

- [ ] Validate per `(coin type, unit_weight)`: `SUM(qty)` vs `SUM(pcs - sold_pcs)`; raise `Insufficient Gold Coin 5.000g stock: selling % pcs but only % pcs available`.
- [ ] Insert `material_sales` coin rows (`qty`, `unit_weight`, `weight = qty*unit_weight`, `rate = mrp`, `amount = price`).
- [ ] FIFO per denomination: decrement by pcs; `sold_weight += deduct * unit_weight`.
- [ ] Reverse: per `(type, unit_weight)` reverse-FIFO, `sold_pcs -= d`, `sold_weight = GREATEST(0, sold_weight - d*unit_weight)`.

### Task 3: Pure helper + tests

**Files:**
- Create: `src/lib/coins.js`, `src/lib/coins.test.js`

**Interfaces:**
- `COIN_TYPES = { gold_coin: 'Gold Coin', silver_coin: 'Silver Coin' }`
- `isCoinType(t) -> boolean`
- `coinKey(type, unitWeight) -> string`
- `coinLineTotal(unitWeight, qty, mrp) -> { weight, price }`
- `coinMrpFor(rates, type, unitWeight) -> number | null`
- `coinDemand(lines) -> { [key]: pcs }`
- `origCoinDemand(items) -> { [key]: pcs }`

- [ ] Write failing tests: totals, key stability, MRP lookup exact match, demand aggregation, coin type guard.
- [ ] Implement; `npm test` passes.

### Task 4: MaterialPage — Fine Coins section

**Files:**
- Modify: `src/pages/MaterialPage.jsx`

- [ ] `TYPES` gains `{ key: 'fine_coins', label: 'Fine Coins' }`; when active render sub-tabs Gold Coin / Silver Coin + `MaterialDashboard type="gold_coin|silver_coin"` + `CoinRateCard`.
- [ ] `MaterialDashboard`: `isCoin`, stock totals include `pcs/sold_pcs`; form gains `unit_weight` + `pcs` for coins; payload `weight = unit*pcs`, `pcs`, `unit_weight`; validation unit>0, pcs integer ≥1, edit cannot reduce pcs below sold_pcs and cannot change unit_weight when sold_pcs>0.
- [ ] History table for coins shows Pcs, Wt/coin, Total, Sold pcs, Available pcs.
- [ ] `CoinRateCard`: add/edit/delete MRP per `(type, unit_weight)`; table + inline form.

### Task 5: BillingPage — coin lines

**Files:**
- Modify: `src/pages/BillingPage.jsx`

- [ ] Load `coin_rates` and coin stock in `loadData`; state `coinStock` (key → `{pcs, grams}`), `coinRates`.
- [ ] Line flag `is_coin`, `coin_type`, `unit_weight`, `qty`, `mrp`; buttons Add Gold Coin / Add Silver Coin; `addCoinLine(type)` presets first rate card entry.
- [ ] `updateLine`: unit_weight change auto-fills MRP from rate card; type change resets weight/MRP.
- [ ] Totals memo: coin demand/orig demand per key; `calcLinePrice` returns `mrp*qty`; `checkStock` coin branch checks pcs and grams.
- [ ] Validation branch before the generic weight check.
- [ ] Save + preview payload; edit reload maps `gold_coin`/`silver_coin` to `is_coin`.
- [ ] Compact coin UI block: type, Wt/coin, Qty, MRP/pc, Tax %, stock badge.

### Task 6: Display surfaces

**Files:**
- Modify: `src/pages/SalesPage.jsx`, `src/components/InvoiceModal.jsx`

- [ ] SalesPage: Qty column (colSpan 9), coin badge labels, Qty in CSV.
- [ ] InvoiceModal: coin branch → description, HSN, MRP rate, amount; never the silver branch.

### Task 7: PDF + Reports

**Files:**
- Modify: `supabase/functions/generate-invoice-pdf/index.ts:21,194,236-248`
- Modify: `src/pages/ReportsPage.jsx:424-427,646-648`

- [ ] `InvItem` gains `qty/unit_weight/mrp`.
- [ ] Coin description includes `× qty`; HSN 71189010 / 71189020; rate column shows MRP.
- [ ] `hsnRows` maps coin HSNs.
- [ ] Reports classify coins into `Gold Coin` / `Silver Coin` with their HSNs.

### Task 8: Verify

- [ ] `npm test` — all suites pass.
- [ ] `npm run build` — succeeds.
- [ ] Report the exact output. SQL is authored, not executed.
