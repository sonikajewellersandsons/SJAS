import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { BarChart3, TrendingUp, Receipt, Users, FileText, Tag, PieChart } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function num(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TABS = [
  { key: 'overview', label: 'Sales Overview', icon: BarChart3 },
  { key: 'tax', label: 'Tax Report', icon: FileText },
  { key: 'hsn', label: 'HSN Summary', icon: Tag },
  { key: 'customers', label: 'GSTR-1 Customers', icon: Users },
  { key: 'others', label: 'Payments & Category', icon: PieChart },
]

export default function ReportsPage() {
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('overview')
  const [year, setYear] = useState(new Date().getFullYear().toString())

  return (
    <div className="page">
      <div className="page-header">
        <h2>Reports</h2>
        <select className="input" style={{ width: 'auto', minWidth: '100px' }} value={year} onChange={e => setYear(e.target.value)}>
          {(() => {
            const cur = new Date().getFullYear()
            const years = []
            for (let y = cur - 1; y <= cur + 2; y++) years.push(y)
            return years.map(y => <option key={y} value={y}>{y}-{(y+1).toString().slice(-2)}</option>)
          })()}
        </select>
      </div>
      <div className="tab-container">
        {TABS.map(tab => (
          <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'overview' && <SalesOverview year={year} addToast={addToast} />}
      {activeTab === 'tax' && <TaxReport year={year} addToast={addToast} />}
      {activeTab === 'hsn' && <HsnSummary year={year} addToast={addToast} />}
      {activeTab === 'customers' && <CustomerReport year={year} addToast={addToast} />}
      {activeTab === 'others' && <OthersReport year={year} addToast={addToast} />}
    </div>
  )
}

/* ─── HOOK: Monthly Sales Data ─────────────────────── */

function useMonthlyData(year) {
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const fyStart = `${year}-04-01`
  const fyEnd = `${parseInt(year)+1}-03-31`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: settings } = await supabase.from('settings').select('value').eq('key', 'shop_state').maybeSingle()
      const shopState = (settings?.value || '').toLowerCase().replace(/^"|"$/g, '') || 'delhi'
      const { data, error } = await supabase
        .from('invoices')
        .select('date, grand_total, tax_total, customer_state, subtotal, hallmark_total')
        .gte('date', fyStart)
        .lte('date', fyEnd)
        .order('date')
      if (cancelled) return
      if (error) { setLoading(false); return }
      const byMonth = {}
      for (const inv of (data || [])) {
        const m = inv.date ? inv.date.slice(0, 7) : 'unknown'
        if (!byMonth[m]) byMonth[m] = { sales: 0, tax: 0, count: 0, intra: 0, inter: 0, taxable: 0, hallmark: 0 }
        byMonth[m].sales += parseFloat(inv.grand_total) || 0
        byMonth[m].tax += parseFloat(inv.tax_total) || 0
        byMonth[m].count++
        byMonth[m].taxable += parseFloat(inv.subtotal) || 0
        byMonth[m].hallmark += parseFloat(inv.hallmark_total) || 0
        if ((inv.customer_state || '').toLowerCase() === shopState) {
          byMonth[m].intra += parseFloat(inv.subtotal) || 0
        } else {
          byMonth[m].inter += parseFloat(inv.subtotal) || 0
        }
      }
      const result = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, d]) => ({ month: m, ...d }))
      setMonths(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [year])

  return { months, loading }
}

/* ─── OVERVIEW TAB ─────────────────────────────────── */

function SalesOverview({ year, addToast }) {
  const { months, loading } = useMonthlyData(year)
  const [selectedMonth, setSelectedMonth] = useState(null)

  const totalSales = months.reduce((s, m) => s + m.sales, 0)
  const totalTax = months.reduce((s, m) => s + m.tax, 0)
  const totalInvoices = months.reduce((s, m) => s + m.count, 0)
  const maxSales = Math.max(...months.map(m => m.sales), 1)

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <>
      {/* Summary Cards */}
      <div className="form-row three" style={{ marginBottom: '1rem' }}>
        <div className="card"><div style={{ padding: '1rem', textAlign: 'center' }}>
          <div className="text-xs text-muted" style={{ marginBottom: '4px' }}>Total Sales</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent)' }}>{fmt(totalSales)}</div>
        </div></div>
        <div className="card"><div style={{ padding: '1rem', textAlign: 'center' }}>
          <div className="text-xs text-muted" style={{ marginBottom: '4px' }}>Total Tax</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--red)' }}>{fmt(totalTax)}</div>
        </div></div>
        <div className="card"><div style={{ padding: '1rem', textAlign: 'center' }}>
          <div className="text-xs text-muted" style={{ marginBottom: '4px' }}>Invoices</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{totalInvoices}</div>
        </div></div>
      </div>

      {/* Bar Chart */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Monthly Sales</h3></div>
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '180px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
              {months.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', cursor: 'pointer' }}
                  onClick={() => setSelectedMonth(selectedMonth === m.month ? null : m.month)}>
                <div style={{
                  width: '100%', maxWidth: '40px',
                  height: `${Math.max((m.sales / maxSales) * 160, 4)}px`,
                  background: selectedMonth === m.month ? 'var(--accent)' : 'var(--accent-light)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'background 0.2s',
                  position: 'relative',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedMonth === m.month ? 'var(--accent)' : 'var(--accent-light)'}
                >
                  <div style={{ position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {fmt(m.sales)}
                  </div>
                </div>
                <div style={{ fontSize: '0.65rem', marginTop: '4px', fontWeight: selectedMonth === m.month ? 700 : 400, color: 'var(--text-muted)' }}>
                  {MONTHS[parseInt(m.month.split('-')[1]) - 1]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Table */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Month-wise Details</h3></div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Taxable Value</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Sales</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ textAlign: 'right' }}>Intra</th>
                <th style={{ textAlign: 'right' }}>Inter</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.month} style={{ cursor: 'pointer' }} onClick={() => setSelectedMonth(selectedMonth === m.month ? null : m.month)}>
                  <td style={{ fontWeight: 700 }}>{MONTHS[parseInt(m.month.split('-')[1]) - 1]} {m.month.split('-')[0]}</td>
                  <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(m.taxable)}</td>
                  <td className="font-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(m.tax)}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(m.sales)}</td>
                  <td style={{ textAlign: 'right' }}>{m.count}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(m.intra)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(m.inter)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gold)' }}>
                <td>Total</td>
                <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.taxable, 0))}</td>
                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(totalTax)}</td>
                <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalSales)}</td>
                <td style={{ textAlign: 'right' }}>{totalInvoices}</td>
                <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.intra, 0))}</td>
                <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.inter, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down modal */}
      {selectedMonth && <MonthDrillDown month={selectedMonth} onClose={() => setSelectedMonth(null)} addToast={addToast} />}
    </>
  )
}

function MonthDrillDown({ month, onClose, addToast }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const [y, m] = month.split('-')
    const from = `${y}-${m}-01`
    const to = new Date(parseInt(y), parseInt(m), 0).toISOString().split('T')[0]
    setLoading(true)
    supabase.from('invoices').select('id, inv_no, date, customer_name, customer_state, subtotal, tax_total, grand_total, payment_mode')
      .gte('date', from).lte('date', to).order('date')
      .then(({ data }) => { setInvoices(data || []); setLoading(false) })
  }, [month])

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{MONTHS[parseInt(month.split('-')[1]) - 1]} {month.split('-')[0]} — Invoices</h3>
          <button className="modal-close" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div style={{ padding: '1rem' }}>
          {loading ? <div className="loading-center"><div className="spinner" /></div> : (
            <table style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Inv No</th>
                <th style={{ textAlign: 'left' }}>Date</th>
                <th style={{ textAlign: 'left' }}>Customer</th>
                <th style={{ textAlign: 'right' }}>Taxable</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{inv.inv_no}</td>
                    <td className="text-xs text-secondary">{inv.date}</td>
                    <td style={{ fontSize: '0.75rem' }}>{inv.customer_name}</td>
                    <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(inv.subtotal)}</td>
                    <td className="font-mono text-xs" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(inv.tax_total)}</td>
                    <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(inv.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── TAX REPORT TAB ───────────────────────────────── */

function TaxReport({ year, addToast }) {
  const { months, loading } = useMonthlyData(year)

  const totalTax = months.reduce((s, m) => s + m.tax, 0)
  const totalTaxable = months.reduce((s, m) => s + m.taxable, 0)

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Tax Summary — {year}-{parseInt(year)+1}</h3></div>
      <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
        <div><span className="text-xs text-muted">Total Taxable Value</span><div style={{ fontWeight: 700 }}>{fmt(totalTaxable)}</div></div>
        <div><span className="text-xs text-muted">Total Tax</span><div style={{ fontWeight: 700, color: 'var(--red)' }}>{fmt(totalTax)}</div></div>
        <div><span className="text-xs text-muted">Effective Tax Rate</span><div style={{ fontWeight: 700 }}>{totalTaxable > 0 ? ((totalTax / totalTaxable) * 100).toFixed(2) : '0.00'}%</div></div>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th style={{ textAlign: 'right' }}>Taxable Value</th>
              <th style={{ textAlign: 'right' }}>CGST (1.5%)</th>
              <th style={{ textAlign: 'right' }}>SGST (1.5%)</th>
              <th style={{ textAlign: 'right' }}>IGST (3%)</th>
              <th style={{ textAlign: 'right' }}>Intra-state</th>
              <th style={{ textAlign: 'right' }}>Inter-state</th>
              <th style={{ textAlign: 'right' }}>Hallmark</th>
              <th style={{ textAlign: 'right' }}>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const cgst = m.intra * 0.015
              const sgst = m.intra * 0.015
              const igst = m.inter * 0.03
              const goodsTax = cgst + sgst + igst
              const hallmarkTax = m.tax - goodsTax
              return (
                <tr key={m.month}>
                  <td style={{ fontWeight: 700 }}>{MONTHS[parseInt(m.month.split('-')[1]) - 1]} {m.month.split('-')[0]}</td>
                  <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(m.taxable)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(cgst)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(sgst)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(igst)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(m.intra)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(m.inter)}</td>
                  <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{fmt(hallmarkTax)}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(m.tax)}</td>
                </tr>
              )
            })}
            <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gold)' }}>
              <td>Total</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalTaxable)}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.intra * 0.015, 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.intra * 0.015, 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.inter * 0.03, 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.intra, 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.inter, 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(months.reduce((s, m) => s + m.tax - (m.intra * 0.015 + m.intra * 0.015 + m.inter * 0.03), 0))}</td>
              <td className="font-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(totalTax)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── HSN SUMMARY TAB ──────────────────────────────── */

function HsnSummary({ year, addToast }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const fyStart = `${year}-04-01`
  const fyEnd = `${parseInt(year)+1}-03-31`

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      const { data: invoices } = await supabase.from('invoices').select('id').gte('date', fyStart).lte('date', fyEnd)
      const invIds = (invoices || []).map(i => i.id)
      if (invIds.length === 0) { setData([]); setLoading(false); return }
      const { data: items } = await supabase
        .from('invoice_items')
        .select('price, tax_amount, weight, hallmark_charge, invoice_id, item_master!inner(name, hsn_code, category)')
        .in('invoice_id', invIds)
      const byHsn = {}
      for (const it of (items || [])) {
        const hsn = it.item_master?.hsn_code || 'OTHER'
        if (!byHsn[hsn]) byHsn[hsn] = { hsn, name: it.item_master?.name || '', weight: 0, value: 0, tax: 0 }
        byHsn[hsn].weight += parseFloat(it.weight) || 0
        byHsn[hsn].value += parseFloat(it.price) || 0
        byHsn[hsn].tax += parseFloat(it.tax_amount) || 0
      }
      setData(Object.values(byHsn).sort((a, b) => b.value - a.value))
      setLoading(false)
    })()
  }, [year])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const totalValue = data.reduce((s, r) => s + r.value, 0)
  const totalTax = data.reduce((s, r) => s + r.tax, 0)
  const totalWeight = data.reduce((s, r) => s + r.weight, 0)

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">HSN Code Summary — {year}-{parseInt(year)+1}</h3></div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>HSN Code</th>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Weight (g)</th>
              <th style={{ textAlign: 'right' }}>Taxable Value</th>
              <th style={{ textAlign: 'right' }}>Tax</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.hsn}>
                <td className="font-mono" style={{ fontWeight: 700 }}>{r.hsn}</td>
                <td className="text-sm text-secondary">{r.name}</td>
                <td className="font-mono text-xs" style={{ textAlign: 'right' }}>{num(r.weight)}</td>
                <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(r.value)}</td>
                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(r.tax)}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No data for this period</p></div></td></tr>}
            {data.length > 0 && (
              <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gold)' }}>
                <td colSpan={2}>Total</td>
                <td className="font-mono" style={{ textAlign: 'right' }}>{num(totalWeight)}</td>
                <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalValue)}</td>
                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(totalTax)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── CUSTOMER REPORT (GSTR-1) TAB ────────────────── */

function CustomerReport({ year, addToast }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const fyStart = `${year}-04-01`
  const fyEnd = `${parseInt(year)+1}-03-31`

  useEffect(() => {
    setLoading(true)
    supabase
      .from('invoices')
      .select('customer_name, customer_phone, customer_state, customer_gstin, grand_total, subtotal')
      .gte('date', fyStart)
      .lte('date', fyEnd)
      .then(({ data: invoices }) => {
        const byCust = {}
        for (const inv of (invoices || [])) {
          const key = inv.customer_name
          if (!byCust[key]) byCust[key] = { name: inv.customer_name, phone: inv.customer_phone || '', state: inv.customer_state || '', gstin: inv.customer_gstin || '', total: 0, count: 0 }
          byCust[key].total += parseFloat(inv.grand_total) || 0
          byCust[key].count++
        }
        const arr = Object.values(byCust).sort((a, b) => b.total - a.total)
        setData(arr)
        setLoading(false)
      })
  }, [year])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const aboveLimit = data.filter(c => c.total >= 250000)
  const belowLimit = data.filter(c => c.total < 250000)

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Customers with Sales ≥ ₹2.5L (GSTR-1 Required)</h3></div>
        <div className="table-wrapper">
          <table>
            <thead><tr>
              <th>#</th><th>Customer</th><th>Phone</th><th>State</th><th>GSTIN</th><th style={{ textAlign: 'right' }}>Total Sales</th><th style={{ textAlign: 'right' }}>Invoices</th>
            </tr></thead>
            <tbody>
              {aboveLimit.map((c, i) => (
                <tr key={c.name}>
                  <td className="text-xs text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="font-mono text-xs">{c.phone || '—'}</td>
                  <td className="text-xs">{c.state || '—'}</td>
                  <td className="font-mono text-xs text-muted">{c.gstin || '—'}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(c.total)}</td>
                  <td style={{ textAlign: 'right' }}>{c.count}</td>
                </tr>
              ))}
              {aboveLimit.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No customers above ₹2.5L</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3 className="card-title">All Customers (Sorted by Sales)</h3></div>
        <div className="table-wrapper">
          <table>
            <thead><tr>
              <th>#</th><th>Customer</th><th>Phone</th><th>State</th><th>GSTIN</th><th style={{ textAlign: 'right' }}>Total Sales</th><th style={{ textAlign: 'right' }}>Invoices</th>
            </tr></thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.name}>
                  <td className="text-xs text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="font-mono text-xs">{c.phone || '—'}</td>
                  <td className="text-xs">{c.state || '—'}</td>
                  <td className="font-mono text-xs text-muted">{c.gstin || '—'}</td>
                  <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(c.total)}</td>
                  <td style={{ textAlign: 'right' }}>{c.count}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No data for this period</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ─── PAYMENT & CATEGORY TAB ───────────────────────── */

function OthersReport({ year, addToast }) {
  const [payData, setPayData] = useState([])
  const [catData, setCatData] = useState([])
  const [supplyData, setSupplyData] = useState({})
  const [loading, setLoading] = useState(true)
  const fyStart = `${year}-04-01`
  const fyEnd = `${parseInt(year)+1}-03-31`

  useEffect(() => {
    setLoading(true)
    ;(async () => {
      const { data: shopSetting } = await supabase.from('settings').select('value').eq('key', 'shop_state').maybeSingle()
      const shopState = (shopSetting?.value || '').toLowerCase().replace(/^"|"$/g, '') || 'delhi'
      const { data: invoices } = await supabase.from('invoices').select('id, payment_mode, cash_amt, bank_amt, grand_total, date, customer_state').gte('date', fyStart).lte('date', fyEnd)

      // Payment mode
      const byPay = { CASH: 0, 'E-BANKING': 0, BOTH: 0 }
      for (const inv of (invoices || [])) {
        const mode = inv.payment_mode || 'CASH'
        byPay[mode] = (byPay[mode] || 0) + (parseFloat(inv.grand_total) || 0)
      }
      setPayData(Object.entries(byPay).filter(([, v]) => v > 0).map(([k, v]) => ({ mode: k, total: v })))

      // Monthly outward supply summary
      const byMonth = {}
      for (const inv of (invoices || [])) {
        const m = inv.date ? inv.date.slice(0, 7) : 'unknown'
        if (!byMonth[m]) byMonth[m] = { count: 0, total: 0, intra: 0, inter: 0 }
        byMonth[m].count++
        byMonth[m].total += parseFloat(inv.grand_total) || 0
        if ((inv.customer_state || '').toLowerCase() === shopState) {
          byMonth[m].intra++
        } else {
          byMonth[m].inter++
        }
      }
      setSupplyData(byMonth)

      // Category sales
      const invIds = (invoices || []).map(i => i.id)
      if (invIds.length > 0) {
        const { data: items } = await supabase
          .from('invoice_items')
          .select('price, tax_amount, invoice_id, item_master!inner(name, hsn_code, category)')
          .in('invoice_id', invIds)
        const byCat = {}
        for (const it of (items || [])) {
          const cat = it.item_master?.category || 'Other'
          if (!byCat[cat]) byCat[cat] = { category: cat, value: 0, tax: 0, count: 0 }
          byCat[cat].value += parseFloat(it.price) || 0
          byCat[cat].tax += parseFloat(it.tax_amount) || 0
          byCat[cat].count++
        }
        setCatData(Object.values(byCat).sort((a, b) => b.value - a.value))
      }
      setLoading(false)
    })()
  }, [year])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const payTotal = payData.reduce((s, p) => s + p.total, 0)
  const supplyMonths = Object.entries(supplyData).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <>
      {/* Payment Mode Split */}
      <div className="form-row" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Payment Mode Split</h3></div>
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1rem' }}>
              {payData.map(p => (
                <div key={p.mode} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{p.mode}</div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent)' }}>{fmt(p.total)}</div>
                  <div className="text-xs text-muted">{payTotal > 0 ? ((p.total / payTotal) * 100).toFixed(1) : 0}%</div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg)', borderRadius: '4px', marginTop: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${payTotal > 0 ? (p.total / payTotal) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category Sales */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Category-wise Sales</h3></div>
          <div className="table-wrapper">
            <table>
              <thead><tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
              </tr></thead>
              <tbody>
                {catData.map(c => (
                  <tr key={c.category}>
                    <td style={{ fontWeight: 600 }}>{c.category}</td>
                    <td style={{ textAlign: 'right' }}>{c.count}</td>
                    <td className="font-mono" style={{ textAlign: 'right' }}>{fmt(c.value)}</td>
                    <td className="font-mono text-xs" style={{ textAlign: 'right', color: 'var(--red)' }}>{fmt(c.tax)}</td>
                  </tr>
                ))}
                {catData.length === 0 && <tr><td colSpan={4}><div className="empty-state"><p>No data</p></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly Outward Supply Summary */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Monthly Outward Supply Summary</h3></div>
        <div className="table-wrapper">
          <table>
            <thead><tr>
              <th>Month</th>
              <th style={{ textAlign: 'right' }}>Invoices</th>
              <th style={{ textAlign: 'right' }}>Intra-state</th>
              <th style={{ textAlign: 'right' }}>Inter-state</th>
              <th style={{ textAlign: 'right' }}>Total Value</th>
            </tr></thead>
            <tbody>
              {supplyMonths.map(([m, d]) => (
                <tr key={m}>
                  <td style={{ fontWeight: 700 }}>{MONTHS[parseInt(m.split('-')[1]) - 1]} {m.split('-')[0]}</td>
                  <td style={{ textAlign: 'right' }}>{d.count}</td>
                  <td style={{ textAlign: 'right' }}>{d.intra}</td>
                  <td style={{ textAlign: 'right' }}>{d.inter}</td>
                  <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(d.total)}</td>
                </tr>
              ))}
              {supplyMonths.length === 0 && <tr><td colSpan={5}><div className="empty-state"><p>No data</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
