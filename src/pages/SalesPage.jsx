import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import InvoiceModal from '../components/InvoiceModal'
import { Search, X } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function num(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SalesPage() {
  const { addToast } = useToast()
  const [items, setItems] = useState([])
  const [matSales, setMatSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [tab, setTab] = useState('jewellery')

  useEffect(() => { loadSales() }, [])

  async function loadSales() {
    setLoading(true)
    const [itemsRes, matRes] = await Promise.all([
      supabase.from('invoice_items')
        .select('*, invoices!inner(inv_no, date, customer_name, customer_phone, gold_rate, grand_total), item_master!inner(name, hsn_code, purity)')
        .order('id', { ascending: false }).limit(2000),
      supabase.from('material_sales').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    if (itemsRes.error) addToast('Failed to load sales', 'error')
    if (matRes.error) addToast('Failed to load material sales', 'error')
    setItems(itemsRes.data || [])
    setMatSales(matRes.data || [])
    setLoading(false)
  }

  async function viewInvoice(invNo) {
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('inv_no', invNo).single()
    if (invErr || !inv) { addToast('Invoice not found', 'error'); return }
    setSelectedInvoice(inv)
    setItemsLoading(true)
    setShowModal(true)
    const { data: li, error: liErr } = await supabase.from('invoice_items').select('*, description_extra, item_master!left(name, hsn_code)').eq('invoice_id', inv.id).order('sno')
    if (li) setLineItems(li)
    if (liErr) addToast('Failed to load line items', 'error')
    setItemsLoading(false)
  }

  const filtered = items.filter(it => {
    const s = search.toLowerCase()
    const inv = it.invoices || {}
    const item = it.item_master || {}
    if (s && !inv.inv_no?.toLowerCase().includes(s) && !item.name?.toLowerCase().includes(s) && !(it.huid_code || '').toLowerCase().includes(s) && !(Number(it.weight) || 0).toFixed(3).includes(s)) return false
    if ((dateFrom || dateTo) && !inv.date) return false
    if (dateFrom && inv.date < dateFrom) return false
    if (dateTo && inv.date > dateTo) return false
    return true
  })

  const totalWeight = filtered.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0)

  const matFiltered = matSales.filter(s => {
    const q = search.toLowerCase()
    if (q && !(s.invoice_no || '').toLowerCase().includes(q) && !(s.description || '').toLowerCase().includes(q)) return false
    if ((dateFrom || dateTo) && !s.created_at) return false
    if (dateFrom && s.created_at?.slice(0, 10) < dateFrom) return false
    if (dateTo && s.created_at?.slice(0, 10) > dateTo) return false
    return true
  })
  const matTotalWeight = matFiltered.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0)

  return (
    <div className="page">
      <div className="page-header"><h2>Sales Details</h2></div>

      <div className="tab-container" style={{ marginBottom: '1rem' }}>
        <button className={`tab-btn ${tab === 'jewellery' ? 'active' : ''}`} onClick={() => setTab('jewellery')}>Jewellery</button>
        <button className={`tab-btn ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>Materials</button>
      </div>

      {tab === 'jewellery' && (
      <>
      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by invoice no, item, HUID..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="btn-icon btn-sm" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setSearch('')}><X size={14} /></button>}
        </div>
        <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '150px' }} />
        <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '150px' }} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>Items: <strong>{filtered.length}</strong></span>
        <span>Weight: <strong>{totalWeight.toFixed(3)}g</strong></span>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Date</th>
                <th>Item</th>
                <th>Purity</th>
                <th>Weight</th>
                <th>HUID</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => {
                const inv = it.invoices || {}
                const item = it.item_master || {}
                return (
                  <tr key={it.id}>
                    <td className="text-xs text-muted">{i + 1}</td>
                <td className="text-sm text-secondary">{inv.date || '—'}</td>
                    <td style={{ fontWeight: 600, fontSize: '0.75rem' }}>{item.name || `Item #${it.item_id}`}</td>
                    <td className="text-xs" style={{ fontWeight: 600 }}>{item.purity || '—'}</td>
                    <td className="font-mono text-xs">{Number(it.weight).toFixed(3)}</td>
                    <td className="font-mono text-xs" style={{ fontSize: '0.65rem' }}>{it.huid_code || '—'}</td>
                    <td>
                      <button className="btn-link" onClick={() => viewInvoice(inv.inv_no)} style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', border: 'none', background: 'none', padding: 0, textDecoration: 'underline' }}>
                        {inv.inv_no || '—'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7}><div className="empty-state"><p>No sales found</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {tab === 'materials' && (
        <>
          <div className="filter-bar">
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by invoice or description..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="btn-icon btn-sm" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setSearch('')}><X size={14} /></button>}
            </div>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '150px' }} />
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '150px' }} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Items: <strong>{matFiltered.length}</strong></span>
            <span>Weight: <strong>{matTotalWeight.toFixed(3)}g</strong></span>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Weight</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {matFiltered.map((s, i) => (
                    <tr key={s.id}>
                      <td className="text-xs text-muted">{i + 1}</td>
                      <td className="text-sm text-secondary">{s.created_at?.slice(0, 10) || '—'}</td>
                      <td><span className={`badge ${s.type === 'gold_18k' ? 'badge-gold' : 'badge-silver'}`} style={{ fontSize: '0.65rem' }}>{s.type === 'gold_18k' ? '18K' : s.type === 'silver_925' ? '925' : 'Ornaments'}</span></td>
                      <td style={{ fontWeight: 600, fontSize: '0.75rem' }}>{s.description || '—'}</td>
                      <td className="font-mono text-xs">{Number(s.weight).toFixed(3)}</td>
                      <td className="font-mono text-xs">{s.rate ? fmt(s.rate) : '—'}</td>
                      <td className="font-mono text-xs">{fmt(s.amount)}</td>
                      <td>
                        <button className="btn-link" onClick={() => viewInvoice(s.invoice_no)} style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', border: 'none', background: 'none', padding: 0, textDecoration: 'underline' }}>
                          {s.invoice_no || '—'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {matFiltered.length === 0 && (
                    <tr><td colSpan={8}><div className="empty-state"><p>No material sales found</p></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <InvoiceModal
        show={showModal && !!selectedInvoice}
        invoice={selectedInvoice}
        lineItems={lineItems}
        loading={itemsLoading}
        onClose={() => { setShowModal(false); setSelectedInvoice(null); setLineItems([]) }}
        onPrint={() => window.print()}
      />
    </div>
  )
}
