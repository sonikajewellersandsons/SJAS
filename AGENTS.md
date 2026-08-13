# SJS Jewellery Software — Project Context for opencode

## Overview
Invoice, stock, and customer management app for a small jewellery shop. Used on 2 laptops. Built with React + Supabase, deployed on Vercel.

## Tech Stack
- **Frontend**: React 18, Vite 5, React Router v6, Lucide React icons
- **Backend**: Supabase (PostgreSQL 15, Auth, RLS, Edge Functions)
- **Auth**: Supabase Auth with custom roles
- **Hosting**: Vercel (SPA with fallback)
- **Theme**: Balanced mid-tone (no pure white/black — soft #f5f0eb bg, warm accents, dark navy text)

## File Map
| Path | Purpose |
|---|---|
| `src/lib/supabase.js` | Supabase client init (env vars) |
| `src/context/AuthContext.jsx` | Auth provider, hasPermission(), signIn() |
| `src/App.jsx` | Routes, nav items, route guards |
| `src/pages/LoginPage.jsx` | Login |
| `src/pages/DashboardPage.jsx` | Dashboard stats |
| `src/pages/StockPage.jsx` | Stock management (ItemMaster, StockView, Purchase tabs) |
| `src/pages/CustomersPage.jsx` | Customer CRUD + purchase history |
| `src/pages/BillingPage.jsx` | Invoice creation with customer search, editable invoice no, gold rate with ₹+commas, inward supply voucher adj selector, silver type dropdown with stock check |
| `src/pages/InwardSupplyPage.jsx` | Exchange/trade-in vouchers: valuation, multi-item entry, not stock |
| `src/pages/InvoiceHistoryPage.jsx` | Past invoices, receipt view, print, export, last-only delete |
| `src/pages/SalesPage.jsx` | Sold items view with purity, materials tab, clickable receipt modal |
| `src/pages/MaterialPage.jsx` | 18K Gold & Silver purchase, stock card, sale history |
| `src/pages/MaterialPage.jsx` | 18K Gold & Silver purchase, stock card, sale history |
| `src/pages/ReportsPage.jsx` | Sales, Purchase, GST, Stock valuation reports |
| `src/pages/SettingsPage.jsx` | User/role management, master data |
| `src/pages/ProfilePage.jsx` | User profile |
| `src/index.css` | All CSS custom properties (theme), includes `.input-group`, `.cust-search-*`, `.combobox-*` |
| `index.html` | HTML entry |
| `sql/schema.sql` | ALL database logic (run this to deploy) |
| `supabase/functions/generate-invoice-pdf/` | Edge function for PDF generation (A4, GST layout, SVG logo) |
| `supabase/functions/create-auth-user/` | Edge function for creating auth users |

## Database Tables
| Table | Purpose |
|---|---|
| `item_master` | Item definitions (name, purity, category, hallmark_charge, hsn_code, active) |
| `customers` | Customer records (name, address, phone, state, gstin, pan) |
| `stock_ledger` | Every stock movement (item_id, weight, pcs, direction IN/OUT, source_type, reference_id, date) |
| `purchases` | Purchase from suppliers (has `sold_pcs`, `sold_inv_no` for multi-piece tracking) |
| `inward_supply_vouchers` | Adjustment bills (inv_no format: `SJS/IWS/{fy}/{seq}`) |
| `invoices` | Sale invoice header (inv_no format: `SJS/{fy}/{seq}`, customer, totals, disc, round_off, gold_rate, adj bill linkage) |
| `invoice_items` | Sale line items (item_id, weight, rate, price, tax, hallmark, sno, huid, huid_code, description_extra, material_type) |
| `diamond_items` | Diamond line items on invoices |
| `material_purchases` | 18K Gold / Silver 925 / Silver Ornaments weight-only purchase lots (sold_weight tracking) |
| `material_sales` | 18K Gold / Silver 925 / Silver Ornaments sales linked to invoices |
| `inv_sequences` | Financial year sequence tracker (type: sale/inward, fy, last_no) |
| `users` | App users (auth_id FK, role, name, email, permissions, is_active) |
| `role_masters` | Role definitions with JSONB permissions |
| `settings` | Key-value store (shop details, GSTIN, bank details, theme, gold_rate, declaration) |
| `logs` | Action audit trail |

## Invoice Number Format
- **Sales**: `SJS/{financial_year}/{sequential_no}` e.g. `SJS/2026-27/001`
- **Inward Supply**: `SJS/IWS/{financial_year}/{sequential_no}` e.g. `SJS/IWS/2026-27/001`
- Sequence tracked via `inv_sequences` table
- Invoice number field is **editable** — auto-suggested but user can override to fill gaps
- On save, `inv_sequences.last_no` is updated if the used number exceeds current max
- Preview shows lowest available number (finds gaps by querying existing invoices)

## Permission System
Roles (hierarchical): `owner > accountant > salesperson > stock_manager`

Permissions stored as JSONB in `role_masters.permissions`.

| Permission | owner | accountant | salesperson | stock_manager |
|---|---|---|---|---|
| `allow_billing` | ✓ | ✗ | ✓ | ✗ |
| `allow_stock_view` | ✓ | ✓ | ✗ | ✓ |
| `allow_stock_edit` | ✓ | ✗ | ✗ | ✓ |
| `allow_customers` | ✓ | ✓ | ✓ | ✗ |
| `allow_reports` | ✓ | ✓ | ✗ | ✗ |
| `allow_settings` | ✓ | ✗ | ✗ | ✗ |
| `allow_item_master` | ✓ | ✗ | ✗ | ✓ |

- Owner bypasses all restrictions
- `allow_settings` is owner-only

## Key Design Decisions
- Stock as a ledger (not inventory table) — every IN/OUT is a row
- On invoice save: insert stock_ledger OUT rows automatically via `process_invoice_stock()` RPC
- On invoice edit: `reverse_invoice_stock()` then re-`process_invoice_stock()`
- Multi-piece stock tracking: `purchases.sold_pcs` increments per piece, `sold_inv_no` stores comma-separated invoice refs
- Only the **last invoice** (by PK id) can be deleted — enforced at DB level via `delete_invoice()` RPC
- All monetary values displayed with `₹` + Indian comma formatting (en-IN locale, 2 decimals)
- Invoice PDF generated server-side via Edge Function (A4 portrait, SVG logo, GST taxes, bank details)
- Customer search on BillingPage: search by name, phone, aadhaar; theme-matching dropdown with keyboard nav
- Gold rate input: ₹ prefix addon, Indian commas on blur, raw input on focus
- No Chakra UI — plain CSS custom properties only
- No TypeScript — plain JSX
- No testing framework configured

## Key RPC Functions (in schema.sql)
| Function | Purpose |
|---|---|
| `process_invoice_stock(p_invoice_id)` | Marks purchases sold (increments `sold_pcs`), appends to `sold_inv_no`, inserts stock_ledger OUT |
| `reverse_invoice_stock(p_invoice_id)` | Reverses stock (decrements `sold_pcs`, removes invoice ref, deletes stock_ledger) |
| `delete_invoice(p_invoice_id)` | Safe delete — only allows deleting the last invoice; calls reverse + deletes items + invoice |
| `get_stock_balance(p_item_id)` | Returns current stock (weight, pcs) for an item |
| `get_stock_lots()` | Returns all purchase lots with available pcs, status, comma-separated sale invoice refs |
| `next_inv_no(p_type)` | Returns next full invoice number (`SJS/2026-27/001`) — atomic INSERT ... ON CONFLICT DO UPDATE |
| `process_material_sale(p_invoice_id)` | Creates material_sales rows, decrements material_purchases.sold_weight for 18K/Silver |
| `reverse_material_sale(p_invoice_id)` | Reverses material_sales and restores sold_weight |
| `replace_purchase(p_created_at, p_rows)` | Atomic edit of a purchase group (all rows share `created_at`): deletes old rows + stock-ledger IN entries, re-inserts updated rows; refuses if any lot is sold; preserves original `created_by` |
| `delete_purchase(p_created_at)` | Atomic delete of a purchase group: deletes stock-ledger IN entries + purchase rows; refuses if any lot is sold (`sold_pcs > 0`); permission-gated on `allow_stock_edit` |

## Deployment
1. Run `sql/schema.sql` in Supabase SQL Editor (idempotent)
2. `npm run build` → deploys `dist/` to Vercel
3. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Edge Function env: `INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
5. Edge Function: `npx supabase functions deploy generate-invoice-pdf`

---

## Known Bugs & Issues (as of July 2026 — Verified against actual code)

### All Previously Documented Bugs (All Fixed)
All items from the original audit have been verified and fixed:
- **StockPage.jsx:276** — `addToast` called without `useToast()`. Fixed.
- **BillingPage.jsx:291** — Float comparison for cash+bank validation. Fixed to tolerance check `> 0.01`.
- **BillingPage.jsx:268** — Discount applied after tax. Fixed: per-line `calcLine()` applies discount before computing tax, `beforeAdj` formula is `totalPrice - discAmt + totalTax + ...`.
- **BillingPage.jsx:348** — `subTotal` included hallmark charges inconsistently with DB. Fixed: `subtotal` stores gold+labour only, hallmark in `hallmark_total`.
- **BillingPage.jsx:117-118** — Labour reverse-calculation on edit. Fixed: `labour_rate` column exists in DB (`schema.sql:210`), stored on save, read on load with fallback using invoice's own gold rate.
- **BillingPage.jsx:124** — `tax_pct` column missing. Fixed: column exists in DB (`schema.sql:209`), stored on save, read on load with `DEFAULT_TAX_PCT` fallback.
- **PROJECT.md** — Windows `set` command on Mac. Fixed.

### Fixed (July 2026 pass — continued)
- **Double-stock bug** — Live DB had `trg_mark_purchase_sold` trigger on `invoice_items` that duplicated `process_invoice_stock()` RPC, causing `sold_pcs` to increment by 2. Dropped the trigger.
- **Inward supply trigger contradiction** — Live DB had `trg_inward_to_stock` creating stock ledger entries for inward supply vouchers, contradicting design intent (valuation-only). Dropped the trigger. Both `DROP IF EXISTS` added to `schema.sql` for idempotency.

### Fixed (August 2026 audit pass)
- **Critical: BillingPage error recovery** — Undefined `items` variable in catch block crashed stock restoration on edit failure. Fixed to use `restored.invoice_items`.
- **Critical: BillingPage edit save cleanup** — `process_invoice_stock` failure during edit left orphan state (stock reversed, invoice updated, recovery crashed). Fixed catch to restore from DB.
- **High: InwardSupplyPage atomic save** — Edit mode deleted before inserting (data loss on failure). Changed to insert first, delete on success.
- **High: CustomersPage phone storage** — Phone validated cleaned but saved uncleaned (`+91` prefix stored). Now saves cleaned digits-only phone.
- **High: InvoiceHistoryPage full reload on edit** — `window.location.href` replaced with `useNavigate()` for client-side navigation.
- **High: BillingPage stock check in edit mode** — Stock validation and save button guard now applies to both create and edit modes.
- **High: BillingPage line index fallback** — Removed `?? idx` fallback that could use wrong line's totals. Uses reliable `indexOf`.
- **High: BillingPage error numbering** — Error messages used valid-line index instead of original line index. Fixed to show correct item number.
- **AuthContext double fetchProfile** — Removed redundant `fetchProfile` call in `signIn` (auth listener handles it).
- **BillingPage phone duplicate check** — Now cleans `+91` prefix before comparing with DB.
- **ReportsPage intra-state hardcoded to Haryana** — Now reads `shop_state` from settings dynamically.
- **DashboardPage stock value card** — Removed the ₹0 card (stock valuation not needed). Added error toast on load failure.
- **SalesPage duplicate modal** — Extracted 190-line shared `InvoiceModal` component, used by both SalesPage and InvoiceHistoryPage.
- **Schema.sql: stock_ledger missing `huid`** — Added `huid` column to stock_ledger table and INSERT in `process_invoice_stock()`.
- **item_master: removed `huid`** — `huid` is no longer a master-level property (some items have HUID, some don't). Now set per-transaction on purchases, invoice_items, and stock_ledger.
- **InwardSupplyPage voucherMap perf** — Changed from recompute-on-every-render to `useMemo`.
- **InwardSupplyPage lastVoucher** — Replaced `.sort()` (mutating, wasteful) with `.reduce()`.
- **InvoiceHistoryPage tautological ternary** — Both branches returned `error.message`. Simplified to direct `error.message`.
- **InvoiceHistoryPage lastInvoiceId** — Replaced spread operator with `.reduce()` for large arrays.
- **ReportsPage hardcoded year range** — Now computes from current year with ±1/+2 range.
- **ProfilePage native confirm()** — Replaced browser `confirm()` with themed modal.
- **ComboBox highlight reset** — Changed from resetting to 0 on filter change to clamping within bounds.
- **LoginPage error exposure** — Raw Supabase error replaced with generic "Invalid email or password."
- **BillingPage loadData error handling** — Added try/catch to prevent infinite spinner on query failure.

### Remaining Incomplete Modules
- **Diamond Items** — DB table `diamond_items` exists but BillingPage has no UI for diamond line items.
- **`create-auth-user` Edge Function** — Stub: returns "coming soon"

### Minor (Fixed during July 2026 pass)
- **CustomersPage.jsx:42** — Phone validation rejected `+91` prefixes. Fixed: strips `+91` and non-digits before checking length.
- **ComboBox.jsx** — Lacked ArrowUp/ArrowDown keyboard navigation. Fixed: added `highlightIdx` state, keyboard handlers, and hover sync.
- **ComboBox.jsx:50** — Blank display when value doesn't match any option. Fixed: falls back to displaying `value` string.
- **SalesPage.jsx:56** — Date filter silently passed items when `inv.date` was undefined. Fixed: returns `false` when date filter active but date missing.
- **InvoiceHistoryPage.jsx:100** — Double `requestAnimationFrame` may not wait for SVG images. Fixed: uses `setTimeout(300)` instead.
- **Customer GSTIN** — DB column existed but forms didn't collect it. Fixed: added GSTIN field to CustomersPage form (edit + create) and BillingPage new-customer form. Uppercased on input.

---

## Current Work Session (August 2026 — 18K Gold & Silver Modules)

### Objective
Add 18K Gold (weight-only stock) and Silver (Quick Silver line items) modules — purchase/sale/stock management, billing integration.

### Completed
- **DB schema**: `material_purchases`, `material_sales` tables; `item_master.material_type` column; seed 18K Gold items; `invoice_items.material_type` column
- **RPCs**: `process_material_sale()` + `reverse_material_sale()`; `process_invoice_stock()`/`reverse_invoice_stock()` skip 18K and silver items; RLS policies for new tables
- **BillingPage**: "Add Silver" button with type dropdown (Silver 925 / Silver Ornaments), description/weight/rate input; stock check against `material_purchases` available weight; silver items save as `invoice_items` with `item_id=NULL`, `description_extra`, `material_type`; `process_material_sale` called after `process_invoice_stock`; `reverse_material_sale` on edit; error recovery
- **18K billing**: "Gold Jewellery (18K)" single item in dropdown; rate auto-calculated as `goldRate × 18/22`; labour % editable
- **MaterialPage.jsx**: New page at `/materials` with 3 tabs (18K Gold / Silver 925 / Silver Ornaments); purchase form (date, supplier, weight, notes); stock card (total/sold/available); purchase & sale history tables
- **SalesPage**: "Materials" tab showing `material_sales` rows with type badge (18K/925/Ornaments)
- **App.jsx**: `/materials` route + nav item (Layers icon)
- **CSS**: `.badge-silver` class added to `index.css`
- **Silver stock split**: `material_purchases.type` and `material_sales.type` now use `'silver_925'` and `'silver_ornaments'` instead of generic `'silver'`

### Fixed (August 2026 — continued)
- **`process_material_sale`** now validates available stock per type (gold_18k, silver_925, silver_ornaments) with `RAISE EXCEPTION` if insufficient — safety net beyond frontend validation.
- **MaterialPage** purchase history now has Edit/Delete buttons (disabled for lots with sold_weight > 0); form supports both insert and update.
- **`process_material_sale` UPDATE subqueries** fixed: changed from `SELECT id, weight` (multi-row, picked arbitrary row) to `SELECT COALESCE(SUM(weight), 0)` — single aggregate row.
- **Missing DELETE RLS on `material_purchases`** — added policy; also enabled RLS on `material_purchases` and `material_sales` (policies existed but RLS was not enabled).
- **`next_inv_no` missing SECURITY DEFINER** — added `SECURITY DEFINER` to the function.
- **`useMonthlyData` addToast scope** — `addToast` not defined in hook; now accepts it as parameter from both callers.
- **BillingPage phone save** — was saving raw `newCust.phone.trim()` including `+91` prefix; now saves cleaned `cleanedPhone`.
- **5 query locations using `item_master!inner`** — changed to `!left` to prevent silver items being silently excluded: SalesPage, InvoiceHistoryPage, StockPage, BillingPage, PDF edge function.
- **InvoiceModal Haryana hardcode** — now fetches `shop_state` from settings dynamically.
- **InvoiceModal silver display** — shows `description_extra`, hides labour breakdown for silver items.
- **PDF generation silver support** — updated `InvItem` interface, `itemDesc()`, line rows, query.
- **`window.confirm()` replaced** on StockPage, InwardSupplyPage, CustomersPage, InvoiceHistoryPage — all now use themed modals.
- **Delete button loading states** — added `deleting` state + disabled button + "Deleting..." text on StockPage, InwardSupplyPage, CustomersPage, InvoiceHistoryPage, MaterialPage.
- **Edge Function CORS** — dynamic origin from request headers instead of wildcard `*`.
- **Edge Function error leak** — 500 response now returns generic message instead of `err.message`.
- **Edge Function env validation** — startup check with explicit error for missing env vars.
- **SalesPage print button** — replaced "coming soon" stub with `window.print()`.
- **Created `vercel.json`** — SPA fallback rewrites, security headers.
- **Created `.github/workflows/deploy.yml`** — CI/CD build on push/PR.
- **Route-level error boundaries** — each route in App.jsx wrapped with `RouteErrorBoundary`.

### Completed (August 2026 — Comprehensive Bugfix Audit)

### Fixed (August 2026 — Comprehensive Bugfix Pass)
All 12 Critical, ~20 High, ~23 Medium, and ~12 Low bugs found in full audit fixed. Build verified (`npm run build` succeeds).

**Schema.sql fixes:**
- **C3**: `process_material_sale` idempotency — skip if already processed
- **C10**: `delete_invoice` now calls `reverse_material_sale` (silver/18K stock lost on deletion)
- **C11**: `material_sales` INSERT uses `LEFT JOIN` + `COALESCE(im.name, ii.description_extra)` for standalone items
- **C12**: FIFO per-lot sold_weight updates instead of bulk per-type update
- **M7**: `get_stock_lots` limited to 500 rows
- **M8**: CHECK constraints for positive weight/rate on invoice_items/purchases/material tables
- **M9**: `active = true` filter removed from `get_stock_balance`

**BillingPage (12 fixes):**
- **C1**: `cleanedPhone` lifted outside `if` block for new customers with no phone
- **C2**: `reversed` flag set immediately after each reversal step
- **C4**: Edit mode: INSERT new items first, DELETE old items second (atomicity)
- **H1**: Negative weight validation (`w <= 0`)
- **H2**: Negative labour% validation
- **H3/H4**: `allStockAvailable` null check (`stockResults[i] === null`)
- **H5**: Discount exceeding total price validation
- **M1**: Recovery query uses `item_master!left`
- **M2**: `updateLine` clears `silver_type` on item_id change
- **M3**: `Promise.all` → `Promise.allSettled` in loadData
- **M4**: `resetForm` now `async` with `await generateInvNo()`
- **M5**: GSTIN uppercased on save

**Other pages (20+ fixes):**
- **C5**: PDF edge function — added missing `wordsBelow1000()` helper
- **C6/C7**: SettingsPage — `bank_details` null guard, permissions try/catch
- **C8/C9**: App.jsx/ProfilePage — signOut try/catch + await
- **H6**: SalesPage — `!inner` → `!left` joins, orphan item fallback
- **H7**: StockPage — `!inner` → `!left` joins, phone cleaning
- **H8**: ReportsPage — shop state JSON.parse with try/catch (2 occurrences)
- **H9**: ReportsPage — HSN/Category `!inner` → `!left` joins
- **H10**: InwardSupplyPage — `!inner` → `!left` joins, deleted item fallback
- **H11**: MaterialPage — `parseFloat(p.sold_weight ?? 0)` NaN guard
- **H12**: MaterialPage — edit btn disabled with null sold_weight
- **H13**: PriceCalcPage — localStorage wrapped in try/catch
- **H14**: PriceCalcPage — `Math.max(0, labour%)` clamp
- **H15**: InvoiceModal — `round_off != null` guard
- **H16**: InvoiceModal — `labour_pct ?? 10` (shows 0% when 0)
- **H17**: AuthContext — confirmed no duplicate `fetchProfile`
- **H18/M22**: DashboardPage — `Promise.all` → `Promise.allSettled` per-result
- **H20**: CustomersPage — phone cleaned, GSTIN uppercased
- **M10/M11**: InwardSupplyPage — insert-then-delete order, `lineTotals[idx]` index
- **M12**: CustomersPage — GSTIN `.toUpperCase()`
- **M14**: InvoiceHistoryPage — `for` loop replaces `.reduce()` for perf
- **M15**: SalesPage — orphan items note
- **M16**: ReportsPage — `.catch()` on drill-down promise
- **M17**: ReportsPage — toast on query error
- **M18**: ReportsPage — hallmark tax clamp `Math.max(0, ...)`
- **M19/M20**: ComboBox — ArrowDown no-op on empty, Enter free-text fallback
- **M21**: LoginPage — `setError('')` at top of handleSubmit (already existed)
- **M23**: PDF — correct HSN codes for silver (`71131130`) and 18K (`71131913`)
- **LOW**: 12+ small fixes across all files (fallback displays, loading states, gold rate row in PDF, address maxLength, etc.)

### Completed (August 2026 — Price Calculator)
- **Price Calculator page** (`/price-calculator`): live RCPL gold rates fetched from rohtakchain.com via Supabase Edge Function, auto-refreshes every 5 min, 3 top cards (RCPL Gold 999, 22K, 18K), all-rates table, gold price calculator with purity selector
- **Edge Function** (`fetch-rcpl-rate`): fetches HTML from rohtakchain.com/live-rates, parses all `.live-rate-row` blocks into structured data, returns JSON with CORS headers, errors returned gracefully as 200 with error field
- **BillingPage Gold 18K button**: "Add Gold 18K" button adjacent to "Add Silver" with standalone line items (item_id=null, material_type='gold_18k'), stock check against material_purchases, labour % editable, rate = goldRate/10 × 18/22, DB function updated to handle item_id=null gold_18k items

## Current Work Session (Aug 2026 — Performance & Edit-Mode Stock Fixes)

### Objective
Fix BillingPage performance (slow load/re-render), edit-mode stock validation for silver/gold 18K, PDF HSN display, and last-round audit bugs.

### Added (Aug 2026 — HUID split summary cards)
- **`src/components/HuidSplit.jsx`** — 2-card summary strip (green = HUID, orange = non-HUID) showing weight (g) + pieces for the current filtered view.
- **SalesPage (Jewellery tab)** — "HUID Sale" / "Non-HUID Sale" cards: 22K items only (`item_master.purity === '22K'`), split on `huid_code` presence; materials/18K/silver excluded.
- **StockPage Purchase tab** — "HUID Purchase" / "Non-HUID Purchase" cards: 22K rows only (`purity === '22K'`), split on `huid` boolean, weight = `weight × pcs` (matches total-weight convention).
- **StockPage Stock tab** — "HUID in Stock" / "HUID not in Stock" cards: 22K lots only (`purity === '22K'`), split on lot `huid`, weight = `weight × avail_pcs` (available weight), pcs = `avail_pcs`.
- All splits respect the page's current filters (search/date/HUID/status) — they reflect what's on screen.

### Completed

**BillingPage Performance (6 fixes):**
- **Customers query**: Added `.limit(1000)` + column selection instead of `*` — was loading ALL customers
- **`generateInvNo`**: Eliminated full invoice number scan (`ilike 'SJS/…'`) — now uses single `inv_sequences` lookup
- **`filteredCustomers`**: Wrapped in `useMemo` — was filtering full array on every render
- **`stockLotsByName` Map**: Pre-indexed stock lots by name for O(1) lookup in `checkStock` and `getFilteredLots`
- **All derived calculations** (`linePrices`, `lineTotals`, `stockResults`, totals): Wrapped in single `useMemo`
- **`getFilteredLots`**: Switched from `stockLots.filter(...)` to `stockLotsByName[name].filter(...)`

**Edit-Mode Stock Validation (`checkStock` rewrite):**
- **Silver**: Edit-mode delta check — same/reduced weight skips, increased weight checks `(new - orig) <= currentStock`, different `silver_type` does full check
- **Gold 18K**: Same delta-based edit-mode bypass
- **Regular items**: Added weight-decreased bypass (was falling through to normal check), kept existing exact-match and weight-increased fallthrough

**PDF Edge Function:**
- Exposed real error message in 500 response (was swallowing with generic text)
- Deployed with `npx supabase functions deploy generate-invoice-pdf` — fixes `wordsBelow1000` ReferenceError on live
- Fixed HSN/SAC column for silver (`71131130`) and gold 18K (`71131913`) — was showing `—` in line item rows

**Audit Bugfixes (Aug 2026 pass 2):**
- **InvoiceHistoryPage:66** — `setConfirmDelete(null)` ran before error check (modal dismissed on RPC failure)
- **InwardSupplyPage:210** — `lineTotals[idx]` used filtered `validLines` index instead of `lineItems.indexOf(line)` (wrong totals)
- **InwardSupplyPage:73** — Added missing `metalRes.error` toast
- **MaterialPage:80** — Negative weight allowed (`<= 0` check added)
- **MaterialPage:62-71** — Added per-query `.error` checks with toasts
- **InvoiceModal:26** — `hallmarkTax` NaN when `tax_total` null (`Math.max(0, ...)`)

### Pending / Not Yet Built
- (none currently tracked)

## Fixed (July 2026 — Logic Break Audit, full pass)

**schema.sql — CRITICAL:**
- **Inward supply edit was broken** — `inward_supply_delete` RLS policy was dropped and never recreated, so the edit flow's `delete()` was a silent no-op → every edit duplicated voucher rows. Policy re-added (`allow_billing`).
- **`process_material_sale` double-inserted standalone 18K gold** — the silver INSERT (`item_id IS NULL AND material_type IS NOT NULL`) also matched `gold_18k` lines already inserted by the 18K INSERT. Now restricted to `IN ('silver_925','silver_ornaments')`.
- **`reverse_material_sale` over-reversed `sold_weight`** — subtracted the full invoice weight from *every* lot of the type, wiping other invoices' consumption. Rewritten as reverse-FIFO (newest lot first, capped per lot).
- **`reverse_invoice_stock` decremented ALL identical lots** — now only touches lots actually sold on the invoice (matched via `sold_inv_no`), newest first.
- **`process_invoice_stock` ledger idempotency** — keyed on new `stock_ledger.invoice_item_id` so two identical lines each get their own OUT row (was keyed on item+weight+huid, skipping the 2nd).

**schema.sql — minor:**
- `shop_state`/`shop_city` seed defaults changed to `Haryana`/`Faridabad`.
- Dropped unused RPCs `get_next_inv_no`, `peek_next_inv_no` (superseded by client-side gap detection).

**BillingPage.jsx:**
- **Silver/18K stock checks now aggregate across all lines** (`silverNet`/`goldNet` in the totals memo) — two lines can no longer jointly exceed stock and fail only at the DB layer.
- **Edit-original matching is now content-based** (`findOrig`) instead of positional, so adding/removing/reordering lines during an edit validates correctly.
- 18K line with **0% labour** is preserved on edit (was coerced back to 10%).
- Invoice now **stores `customer_gstin`** (PDF no longer depends on a live customer lookup).
- **`settings.gold_rate` fallback** added — billing auto-fills last saved rate when the calculator was never used.
- Customer phone search normalizes `+91` / non-digits.

**ReportsPage.jsx:** HSN summary & category report map standalone silver (`71131130`) and 18K (`71131913`) instead of lumping them under OTHER.

**Dead code removed:** `api/fetch-rcpl-rate.js`, `supabase/functions/fetch-rcpl-rate/`, the RCPL dev middleware in `vite.config.js`, and the `/api/(.*)` rewrite in `vercel.json`. Price Calculator remains manual input only.

**PDF (`generate-invoice-pdf`):** fixed em-dash mojibake on diamond rows; payment summary no longer prints a redundant `E-Banking ₹0.00` line.

**Repair script (`sql/repair.sql`):** ONE-TIME rebuild of `material_sales`, `material_purchases.sold_weight`, `purchases.sold_pcs/sold_inv_no`, and `stock_ledger` sale rows from invoices in chronological order. Run after `schema.sql`.

## Added (August 2026 — Audit Trail + Invoice Number Collision)

**Audit trail (`logs` table now actually written):**
- `src/lib/audit.js` — `logAction(action, table_name, record_id, details, userId?)` fire-and-forget helper (never throws, resolves `users.id` from the auth session, caches it).
- Wired into: login/logout (`AuthContext`), invoice create/update (`BillingPage`) & delete (`InvoiceHistoryPage`), inward voucher create/update/delete (`InwardSupplyPage`), purchase + item-master actions (`StockPage`), customer CRUD (`CustomersPage`), material purchase CRUD (`MaterialPage`), settings/bank/user-role/toggle (`SettingsPage`).
- **Activity Log viewer** added as a 5th tab in Settings (owner-only) — lists latest 300 entries with timestamp, user name, action label, and details.

**Invoice number collision:**
- `BillingPage` — `invNoTaken()` pre-check before any stock reversal; on conflict it shows an error, regenerates a fresh number, and aborts (no state corruption). A last-resort `23505` handler in the catch regenerates the number if a race slips through.
- `InwardSupplyPage` — create-mode duplicate check before insert.

**Inward supply voucher fix (critical):**
- `inward_supply_vouchers.inv_no` had a `UNIQUE` constraint that contradicted the multi-row design (one voucher = one row per line item). Dropped it (idempotent `DROP CONSTRAINT IF EXISTS` + regular index).
- Edit flow reordered to **delete old rows first, then insert new** — the previous insert-then-delete either failed on the unique key or deleted the just-inserted rows (same `inv_no`).

## Added (August 2026 — CSV Export, Pagination & Backup)

**CSV export (`src/lib/csv.js`):**
- `toCsv(rows, columns)` + `downloadCsv(filename, rows, columns)` — UTF-8 BOM so Excel opens ₹/Indian text correctly; quotes fields containing commas/quotes/newlines.
- Wired into: InvoiceHistoryPage (CSV button), SalesPage (CSV buttons in both jewellery + materials filter bars), ReportsPage (SalesOverview, TaxReport, HsnSummary, CustomerReport, payments/category/outward).
- Export always uses the **currently filtered** rows (matches what's on screen).

**Pagination (silently-capped queries — Supabase default limit is 1000):**
- InvoiceHistoryPage — `PAGE_SIZE = 500`, `loadInvoices` uses `.range()`, "Load more" button.
- SalesPage — jewellery items + material sales each paginated (500), separate `hasMore` flags.
- StockPage PurchaseTab — `.range(0, 500)`, Load more button.
- InwardSupplyPage — vouchers paginated, Load more button.
- MaterialPage — `material_sales` paginated `.range(0, 200)`, Load more button.
- ReportsPage queries are already date-bounded (no pagination needed).

**Backup script (`scripts/backup.sh`):**
- `npm run backup` → `supabase db dump` schema + data into `backups/` with `YYYY-MM-DD_HHMMSS` timestamps. Flags: `--schema`, `--data`. Requires `supabase link` done once.
- Restore: schema via SQL Editor (`sql/schema.sql` is canonical), data via `psql < backups/data-*.sql`.

**RLS fix:**
- `settings_read` policy was owner-only, blocking accountants (reports) and salespeople (billing) from reading `shop_state`/`gold_rate`. Now `allow_settings OR allow_billing OR allow_reports`. Write stays owner-only. Deploy by re-running `sql/schema.sql` (idempotent).

## Added (August 2026 — Production-Ready Audit & Fixes)

**CRITICAL: BillingPage edit-save rewritten** (`src/pages/BillingPage.jsx`):
- **C1 — edit save destroyed line items**: new items were inserted with `invoice_id = invId`, then `delete().eq('invoice_id', invId)` removed **all** rows (old AND new) → every edit left the invoice with zero items and released stock. Now deletes old rows **by their ids** (`.in('id', oldIds)`) after inserting new.
- **C2 — early return after stock reversal**: a bare `return` on a new-customer name error ran *after* `reverse_material_sale`/`reverse_invoice_stock`, permanently releasing stock. Customer resolution (incl. name validation) now runs **before** any reversal.
- **Wrong-direction recovery**: the catch block called `reverse_material_sale` again (double-restored `sold_weight`). Now on failure the edit is **fully restored**: old items re-inserted, header restored from snapshot, and stock re-processed (`process_invoice_stock` + `process_material_sale`).
- **Create-mode orphan invoices**: failed create-mode saves now clean up via the `delete_invoice` RPC (the direct `invoices.delete()` was RLS-denied, leaving empty orphan rows that blocked the last-invoice delete).
- **M2**: a phone-matched customer no longer stores the *typed* name/address in the header — the DB record's details are used.
- **H3**: manual invoice numbers from another FY no longer corrupt the current FY sequence (`fyFromInvNo`/`invNoSeq` from `src/lib/format.js`).
- **H4**: silver/18K `tax_pct` is preserved on edit reload (was hardcoded to `'0'`).
- **L1**: `resetForm` re-autofills the gold rate (price calculator → settings) and clears the custom-rate flag.
- Post-save refresh/reset failures no longer roll back a committed save.

**RLS / RPC fixes** (`sql/schema.sql`):
- Salesperson billing unblocked: `item_master_read` + `purchases_read` now include `allow_billing`; `get_stock_lots()`/`get_stock_balance()` are now `SECURITY DEFINER`.
- Materials readable by stock_manager: `material_purchases_read`/`material_sales_read` include `allow_stock_view`; StockPage sale-details modal unblocked via `invoices_read`/`invoice_items_read` + `allow_stock_view`.
- Write-locking tightened: removed `allow_billing` from `stock_ledger_insert/update`, `purchases_update`, `material_purchases_write/update/delete` (all stock mutations go through SECURITY DEFINER RPCs).
- **`reverse_invoice_stock`** decrements `sold_pcs` by the *count* of invoice occurrences in `sold_inv_no` — fixes under-reversal when an invoice sells 2+ pieces from one lot.
- **`delete_invoice`** guards non-standard inv numbers (regex on `{fy}`/`{seq}`) so free-text overrides can't crash deletion.
- **Role change updates permissions**: `trg_set_user_permissions` now fires on `BEFORE INSERT OR UPDATE OF role` (SettingsPage role changes no longer leave stale/elevated access).
- `material_purchases` gets `chk_mp_sold_weight CHECK (sold_weight >= 0 AND sold_weight <= weight)` (concurrency oversell guard).
- `logs_write` restricted to `auth.role() = 'authenticated'` (anon spam blocked).
- `has_permission` + all SECURITY DEFINER functions now set `search_path = pg_catalog, public`.
- **New RPC `save_inward_supply(p_rows JSONB, p_old_inv_no TEXT)`** — atomic duplicate-check + delete-old + insert for inward vouchers (fixes the delete-then-insert data-loss window and the non-atomic number race). `InwardSupplyPage` now uses it.

**PDF edge function** (`generate-invoice-pdf`):
- Prefers invoice-time snapshot (`inv.customer_*`) over the live customer row, so reprints never change.
- Seller state code falls back to `stateCode(shop_state)` (was hardcoded `'07'` Delhi); buyer state prefers `customer_gstin`.
- HSN summary "Total" now equals the sum of HSN rows (was pre-discount `subtotal + totalHc`, wrong on discounted invoices).
- `daman & diu` code fixed to `26`; `shop_city` fallback `Faridabad`.

**Robustness across pages:**
- ReportsPage: drill-down end-date built from strings (`monthEndDate`) — was `toISOString()` dropping the last day of the month in UTC+ timezones; HsnSummary/CustomerReport/OthersReport got try/catch + `.error` checks + cancellation guards; `'delhi'` → `'haryana'` fallbacks.
- SalesPage + SettingsPage (4 tabs): loaders wrapped in try/catch/finally (no more stuck spinners).
- CustomersPage: paginated (500/page, Load more), `+91`-aware phone search, save try/catch.
- MaterialPage: purchase history paginated, tab-switch race guarded via `typeRef`, stock card totals from a dedicated aggregate query (correct regardless of pagination), Add/Edit/Delete gated on `allow_stock_edit`.
- InwardSupplyPage: `generateInvNo`/`openCreateForm`/`loadEditVoucher`/`viewDetails` error-handled (no silent dead buttons).
- BillingPage: `checkStock` aggregates available pcs across **all** matching lots (false "out of stock" when multiple identical lots exist).
- StockPage: purchase quantity validated (`min 1` — `0` was silently saved as `1`).
- **StockPage purchase delete (Aug 2026)** — Purchase groups now have a **Delete** button (themed confirm modal, `deleting` state, disabled + tooltip on sold lots) backed by the new `delete_purchase` RPC (deletes stock-ledger IN rows + purchase rows; refuses if any `sold_pcs > 0`). Edit/Delete failures with `PGRST202` (RPC missing from live DB — schema.sql deploy aborted partway) show a message telling the user to re-run `sql/schema.sql` in the Supabase SQL Editor.
- **`replace_purchase` preserves `created_by`** — was reading it from client rows (always NULL on edit), wiping the original creator. Now reuses the old rows' `created_by`.
- AuthContext: deactivated users are signed out and rejected at login with a clear message; audit user-id cache reset on logout (`resetAuditUserCache`).
- Toast: unique ids via counter (was `Date.now()` collision).
- RouteErrorBoundary: `key={location.pathname}` resets the error state on navigation.
- `src/lib/csv.js`: CSV formula-injection guard (`= + - @` prefixed) and `\r` quoting.
- `src/lib/format.js`: extracted pure helpers (`fmt`, `num`, `cleanPhone`, `financialYear`, `fyFromInvNo`, `invNoSeq`, `monthEndDate`).

**Tests (NEW — Vitest + Testing Library):**
- `npm test` → `vitest run`. 28 tests in `src/lib/format.test.js`, `src/lib/csv.test.js`, `src/lib/audit.test.js`, and `src/pages/BillingPage.test.jsx`.
- The BillingPage integration test locks in the C1 fix: edit-save deletes old items by `.in('id', [..])`, never by `.eq('invoice_id', ..)`, and runs both stock RPCs.
- Deps: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. Config in `vite.config.js` (`test` block) + `src/test/setup.js` (jsdom localStorage polyfill).

**Deploy steps (manual, after re-running `sql/schema.sql`):**
1. Re-run `sql/schema.sql` in the Supabase SQL Editor (idempotent).
2. `npx supabase functions deploy generate-invoice-pdf` (PDF snapshot/HSN fixes).
3. `npm run build` → deploy `dist/` to Vercel.

### Materials Page CRUD fix (Aug 2026)
- **Verified CRUD logic** with a new integration suite (`src/pages/MaterialPage.test.jsx`, 6 tests): load, add, edit, sold-lot guard, delete-after-confirm, and RLS-denied error toast all pass.
- **Root cause of "materials CRUD not working" was a deploy abort, not the page**: if `schema.sql` fails partway (e.g. legacy `type='silver'` rows blocking the `type` CHECK, or `sold_weight > weight` blocking `chk_mp_sold_weight`), every statement **after** the failure never runs — including the RLS read-policy fix that lets stock_manager/accountant *see* materials. Symptoms: add/edit appears to work but the list stays empty.
- **Fix in `schema.sql`**: defensive data migrations run *before* the CHECK constraints so re-runs never abort:
  - `material_purchases.type` / `material_sales.type` `'silver'` → `'silver_925'`
  - `sold_weight` clamped to `weight`, `sold_pcs` clamped to `pcs`
- **Read-only notice** added to MaterialPage when the role can view but lacks `allow_stock_edit` (accountant), so it's clear why Add/Edit/Delete are hidden.
- **Edit now allowed on sold lots** (silver_925 / gold_18k / silver_ornaments): previously the Edit button was disabled whenever `sold_weight > 0`, so lots that had been sold via billing could never be corrected. It is safe because `savePurchase` already blocks reducing weight below `sold_weight` (protecting `chk_mp_sold_weight`). The edit form shows "Sold so far: X g".
- **Delete stays disabled on sold lots** (deleting a consumed lot corrupts the material ledger) — the button now has a tooltip explaining to delete the linked invoices first.
- **Tab-switch guard**: switching material tabs mid-edit now closes the form/confirm so an edit can never apply a row from another type.
- Permission model for materials (route = `allow_stock_view`, CRUD = `allow_stock_edit`): owner & stock_manager full CRUD, accountant read-only, salesperson no access.

## Added (August 2026 — Billing/Stock/PDF UX fixes)

- **Silver tax default 3%**: `addSilverLine()` now creates silver lines with `tax_pct = 3` (was 0). Existing lines keep their stored tax on edit reload.
- **Discount is now a flat deduction from the final total**: tax is computed on the full price, then the discount is subtracted after tax (`beforeAdj = totalPrice + tax + hallmark - discAmt`). This means a ₹669 discount takes exactly ₹669 off the grand total — letting the shop land on round bill amounts (previously the discount shrank the taxable base and the tax too, so the total dropped by more than the entered discount). The Discount row shows the deducted amount (`-₹X`) next to the input.
- **Purchase total weight includes qty**: StockPage `totalWeight` now sums `weight × qty` (was just weight), so 2–3 pieces are counted.
- **Edit purchase (StockPage)**: each purchase entry (grouped by its shared `created_at`) now has an **Edit** button. Editing loads supplier/date/notes + item lines into the form; saving calls the new atomic RPC **`replace_purchase(p_created_at, p_rows)`** (SECURITY DEFINER) which deletes the old rows + their stock-ledger IN entries and re-inserts the updated ones. Edit is disabled for any lot with `sold_pcs > 0` (must delete the linked invoices first).
- **PDF centered**: `@page { margin: 8mm }` (equal margins), `.invoice { margin: 0 auto }`, white body background — the invoice is centered with equal margins on both sides when printed.
- **BillingPage "Preview Bill" button**: renders the bill via the print edge function in a new read-only `preview` mode (`{ preview: true, invoice, items, customer }`) — no invoice is saved, no stock is processed, nothing is written to the DB. Runs the same field validation as save (via shared `validateBillingFields()`), skips stock checks. Preview invoice number is `SJS/{fy}/{seq}/Invid` (or `/{id}` when editing). Requires the edge function to be deployed.
