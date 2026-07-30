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
| `process_material_sale(p_invoice_id)` | Creates material_sales rows, decrements material_purchases.sold_weight for 18K/Silver |
| `reverse_material_sale(p_invoice_id)` | Reverses material_sales and restores sold_weight |

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

### Pending / Not Yet Built
- (none currently tracked)

### Completed (August 2026 — Price Calculator)
- **Price Calculator page** (`/price-calculator`): live RCPL gold rates fetched from rohtakchain.com via Supabase Edge Function, auto-refreshes every 5 min, 3 top cards (RCPL Gold 999, 22K, 18K), all-rates table, gold price calculator with purity selector
- **Edge Function** (`fetch-rcpl-rate`): fetches HTML from rohtakchain.com/live-rates, parses all `.live-rate-row` blocks into structured data, returns JSON with CORS headers, errors returned gracefully as 200 with error field
- **BillingPage Gold 18K button**: "Add Gold 18K" button adjacent to "Add Silver" with standalone line items (item_id=null, material_type='gold_18k'), stock check against material_purchases, labour % editable, rate = goldRate/10 × 18/22, DB function updated to handle item_id=null gold_18k items

### Relevant Files
- `sql/schema.sql`: `material_purchases`, `material_sales`, `process_material_sale`, `reverse_material_sale`, `item_master.material_type`, seed 18K items, RLS policies
- `src/pages/BillingPage.jsx`: `addSilverLine`, `addGold18kLine`, silver/gold 18K standalone line items, stock check, save/edit/render
- `src/pages/MaterialPage.jsx`: purchase form, stock card, purchase/sale history (3 tabs)
- `src/pages/PriceCalculatorPage.jsx`: RCPL live rates, gold calculator, auto-refresh
- `supabase/functions/fetch-rcpl-rate/index.ts`: Edge Function to fetch/parse rohtakchain.com live rates
- `src/pages/SalesPage.jsx`: Materials tab with material_sales table
- `src/App.jsx`: `/materials`, `/price-calculator` routes + sidebar nav items
- `src/index.css`: `.badge-silver`
- `src/components/InvoiceModal.jsx`: gold_18k support in receipt modal
- `supabase/functions/generate-invoice-pdf/index.ts`: silver + gold_18k support in PDF generation
