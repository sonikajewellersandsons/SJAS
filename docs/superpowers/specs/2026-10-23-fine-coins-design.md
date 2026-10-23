# Fine Coins — Design

Date: 2026-10-23
Branch: `feat/fine-coins`

## Intent

The shop buys and sells investment coins (gold and silver) alongside its existing
18K gold and silver material business. Coins are sold at a fixed MRP per piece, not
by labour or hallmark. The owner needs to:

- record coin purchases by weight and number of pieces,
- keep coin stock accurate in **both pieces and grams**,
- bill coins by entering weight, price (MRP) and quantity — nothing else,
- maintain an MRP card per coin denomination so billing is one tap, not mental math,
- never oversell.

## Decisions (user-confirmed)

1. Billing price = **MRP per piece × quantity**. Weight is stock-only.
2. The weight typed on a bill line is the weight of **one coin**; total line weight = unit × qty.
3. Stock tracks both pieces and grams; billing blocks either shortfall.
4. MRP comes from a maintained rate card, auto-filled, still overridable.

Assumptions: Gold Coin = 24K/999, Silver Coin = 999, GST 3% editable, no labour or
hallmark on coin lines.

## Data model

`material_purchases` (+`pcs`, `sold_pcs`, `unit_weight`) — one row = one purchase lot of a
single denomination; `weight` remains the **total grams** (`unit_weight × pcs`).

`material_sales` (+`qty`, `unit_weight`) — one row per billed coin line; `rate` is MRP per
piece, `weight` total grams, `amount = MRP × qty`.

`invoice_items` (+`qty`, `unit_weight`, `mrp`) — coin lines use `item_id NULL` and
`material_type` `gold_coin` / `silver_coin`.

`coin_rates` (type, unit_weight, mrp, active) — unique on `(type, unit_weight)`.

Stock is keyed by `(type, unit_weight)`: a 5 g gold coin can only be sold from 5 g gold
coin lots. FIFO consumes pieces and grams together; reversal restores both newest-first.

## Invariants

- `sold_pcs <= pcs`; `sold_weight <= weight`.
- A lot's `unit_weight` is immutable once `sold_pcs > 0`.
- Deleting or editing an invoice fully reverses and re-applies coin stock.
- Coin lines never fall through the legacy "silver" display branch.

## Why not item_master

Coins have no per-item stock ledger, no HUID, no labour. Modelling them as material
types keeps them in the existing Materials stock model and avoids polluting the
jewellery item master.
