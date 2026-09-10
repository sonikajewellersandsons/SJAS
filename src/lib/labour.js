// Pure helpers for the Labour Job module (job-work vouchers).
// The customer supplies the metal; the shop bills only service +
// hallmark charges. Kept framework-free so it is unit-testable and
// mirrors exactly what save_labour_job() recomputes in SQL.

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Compute all derived amounts for a labour job.
 *  - serviceCharge is INCLUSIVE of GST (₹10,000 → taxable ≈ ₹8,474.58)
 *  - hallmarkCharge is EXCLUSIVE of GST (₹500 + ₹90 GST = ₹590 paid)
 *  - taxable + tax always equals the entered charge exactly (the tax is
 *    taken as the remainder, never rounded independently), matching
 *    save_labour_job's SQL: taxable = ROUND(charge*100/(100+pct), 2);
 *    tax = charge − taxable.
 */
export function computeLabourTotals({ serviceCharge = 0, hallmarkCharge = 0, taxPct = 18 } = {}) {
  const charge = Math.max(0, round2(serviceCharge))
  const hall = Math.max(0, round2(hallmarkCharge))
  const pctNum = Number(taxPct)
  const rate = Number.isFinite(pctNum) && pctNum > 0 ? pctNum : 18

  const serviceTaxable = round2(charge * 100 / (100 + rate))
  const serviceTax = round2(charge - serviceTaxable)
  const hallmarkTax = round2(hall * rate / 100)

  return {
    serviceCharge: charge,
    serviceTaxable,
    serviceTax,
    hallmarkCharge: hall,
    hallmarkTax,
    taxTotal: round2(serviceTax + hallmarkTax),
    grandTotal: round2(charge + hall + hallmarkTax),
    taxPct: rate,
  }
}

export const LABOUR_PURITIES = ['22K', '24K', '23K', '21K', '20K', '18K', '14K', 'Silver']

/**
 * Validate + normalize item lines. Fully-blank rows are dropped; a row
 * with a name but no weight (or vice versa) is an error, not silently
 * ignored. Returns { items } with clean sno numbering or { error }.
 */
export function cleanLabourItems(items) {
  const rows = []
  const list = Array.isArray(items) ? items : []
  for (let i = 0; i < list.length; i++) {
    const raw = list[i] || {}
    const name = String(raw.item_name || '').trim()
    const weightStr = String(raw.weight ?? '').trim()
    const weight = weightStr === '' ? NaN : parseFloat(weightStr)
    if (!name && weightStr === '') continue // fully-blank row — ignore
    if (!name) return { error: `Item ${i + 1}: name is required` }
    if (!Number.isFinite(weight) || weight <= 0) return { error: `Item ${i + 1}: weight must be greater than 0` }
    rows.push({
      sno: rows.length + 1,
      item_name: name,
      purity: String(raw.purity || '22K').trim() || '22K',
      huid: String(raw.huid || '').trim().toUpperCase(),
      weight,
    })
  }
  if (rows.length === 0) return { error: 'Add at least one item' }
  return { items: rows }
}
