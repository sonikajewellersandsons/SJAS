// Pure formatting / parsing helpers shared across pages (unit-testable).

export function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function num(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Strip +91 prefix and non-digits: '+91 98765 43210' -> '9876543210'
export function cleanPhone(phone) {
  return String(phone || '').trim().replace(/^\+91\s*/, '').replace(/\D/g, '')
}

// Indian financial year for a date (Apr–Mar). e.g. 2026-08-01 -> '2026-27'
export function financialYear(date) {
  const d = date ? new Date(date) : new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return m >= 4 ? `${y}-${(y + 1).toString().slice(-2)}` : `${y - 1}-${y.toString().slice(-2)}`
}

// Extract the FY segment of a standard invoice number.
//   'SJS/2026-27/001'      -> '2026-27'   (sale)
//   'SJS/IWS/2026-27/001'  -> '2026-27'   (inward)
//   anything else          -> undefined
export function fyFromInvNo(invNo) {
  const parts = String(invNo || '').split('/')
  if (parts[0] !== 'SJS') return undefined
  return parts[1] === 'IWS' ? parts[2] : parts[1]
}

// Extract the trailing sequence number of an invoice number if numeric.
//   'SJS/2026-27/050' -> 50   'INV-123' -> null
export function invNoSeq(invNo) {
  const m = String(invNo || '').match(/\/(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}

// Last day of a (1-indexed) month, built from strings so it is timezone-safe.
// '2026', '07' -> '2026-07-31'
export function monthEndDate(year, month) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const lastDay = new Date(y, m, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}
