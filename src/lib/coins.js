// Fine coins: MRP-priced pieces. Weight drives stock, MRP drives money.

export const COIN_TYPES = ['gold_coin', 'silver_coin']

export const COIN_HSN = { gold_coin: '71189010', silver_coin: '71189020' }

export function isCoinType(type) {
  return COIN_TYPES.includes(type)
}

export function coinLabel(type) {
  if (type === 'gold_coin') return 'Gold Coin'
  if (type === 'silver_coin') return 'Silver Coin'
  return ''
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000
}

// Billing enters the weight of ONE coin; stock carries total grams.
export function coinLineWeight(unitWeight, qty) {
  return round3((Number(unitWeight) || 0) * (parseInt(qty, 10) || 0))
}

export function coinLineTotal(mrp, qty) {
  return round2((Number(mrp) || 0) * (parseInt(qty, 10) || 0))
}

// MRP for an exact denomination from the rate card.
export function coinMrpFor(rates, type, unitWeight) {
  const w = Number(unitWeight)
  if (!type || !w) return null
  const row = (rates || []).find(
    r => r.type === type && r.active !== false && Math.abs(Number(r.unit_weight) - w) < 0.0005
  )
  return row ? Number(row.mrp) : null
}

// Net stock demand of coin lines, keyed by type + denomination.
// Pass the invoice's original lines on edit so unchanged lines don't re-consume stock.
export function coinDemand(lines, originalLines = []) {
  const out = {}
  const add = (line, sign) => {
    const type = line.coin_type || line.material_type
    const w = Number(line.unit_weight)
    const qty = parseInt(line.qty, 10) || 0
    if (!isCoinType(type) || !(w > 0) || qty <= 0) return
    const key = `${type}|${w}`
    out[key] = out[key] || { type, unit_weight: w, pcs: 0, grams: 0 }
    out[key].pcs += sign * qty
    out[key].grams += sign * qty * w
  }
  lines.forEach(l => add(l, 1))
  originalLines.forEach(l => add(l, -1))
  Object.values(out).forEach(v => {
    v.grams = round3(v.grams)
  })
  return out
}
