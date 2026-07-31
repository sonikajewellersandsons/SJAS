// CSV export helpers for Excel-friendly downloads.
// RFC 4180 escaping + UTF-8 BOM so ₹ and Indian text open correctly.

function esc(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function toCsv(headers, rows) {
  const lines = [headers.map(esc).join(',')]
  for (const row of rows) {
    lines.push(row.map(esc).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename, headers, rows) {
  const csv = toCsv(headers, rows)
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
