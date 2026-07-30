import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import InvoiceModal from '../components/InvoiceModal'
import { Receipt, Search, Eye, Printer, Trash2, Table2, Edit3 } from 'lucide-react'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function num(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoiceHistoryPage() {
  const { addToast } = useToast()
  const navigate = useNavigate()

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [exportView, setExportView] = useState(false)
  const [printLoading, setPrintLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadInvoices() }, [])

  async function loadInvoices() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(1000)
      if (error) { addToast('Failed to load invoices', 'error') } else if (data) { setInvoices(data) }
    } catch (err) { addToast('Failed to load invoices', 'error') }
    finally { setLoading(false) }
  }

  async function viewDetails(inv) {
    setSelectedInvoice(inv)
    setItemsLoading(true)
    setShowModal(true)
    const { data, error } = await supabase.from('invoice_items').select('*, item_master!left(name, hsn_code)').eq('invoice_id', inv.id).order('sno')
    if (data) setLineItems(data)
    if (error) addToast('Failed to load line items', 'error')
    setItemsLoading(false)
  }

  async function deleteInvoice(id, invNo) {
    setConfirmDelete({ id, invNo })
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error } = await supabase.rpc('delete_invoice', { p_invoice_id: confirmDelete.id })
    setDeleting(false)
    setConfirmDelete(null)
    if (error) {
      addToast(error.message, 'error')
      return
    }
    addToast(`Invoice ${confirmDelete.invNo} deleted`, 'success')
    loadInvoices()
  }

  function handleCancelDelete() {
    setConfirmDelete(null)
  }

  function editInvoice(inv) {
    navigate('/billing?edit=' + inv.id)
  }

  async function printInvoice(inv) {
    addToast('Generating invoice…', 'info')
    setPrintLoading(true)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess?.data?.session?.access_token
      if (!token) { addToast('Not authenticated', 'error'); setPrintLoading(false); return }
      const res = await fetch(FUNCTIONS_URL + '/generate-invoice-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ invoiceId: inv.id })
      })
      if (!res.ok) {
        const errText = await res.text()
        addToast('PDF error (' + res.status + '): ' + errText, 'error')
        setPrintLoading(false)
        return
      }
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) {
        addToast('Please allow popups to print', 'warning')
        setPrintLoading(false)
        return
      }
      setPrintLoading(false)
    } catch (e) {
      addToast('Failed to generate PDF', 'error')
      setPrintLoading(false)
    }
  }

  const filtered = invoices.filter(inv => {
    const s = search.toLowerCase()
    return (
      (inv.inv_no?.toLowerCase().includes(s) || inv.customer_name?.toLowerCase().includes(s) || inv.customer_phone?.includes(search)) &&
      (!dateFrom || inv.date >= dateFrom) &&
      (!dateTo || inv.date <= dateTo)
    )
  })

  const lastInvoiceId = invoices.length > 0 ? invoices.reduce((max, i) => Math.max(max, i.id), 0) : null

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h2>Invoice History</h2></div>
        <div className="loading-center"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header"><h2>Invoice History</h2></div>

      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by invoice no, customer name, phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="form-group" style={{ minWidth: 150 }}>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ minWidth: 150 }}>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={loadInvoices}>Refresh</button>
        <button className={`btn btn-sm ${exportView ? 'btn-primary' : 'btn-outline'}`} onClick={() => setExportView(!exportView)} title="Toggle export view">
          <Table2 size={14} /> {exportView ? 'Normal' : 'Export'}
        </button>
      </div>

      <p className="text-xs text-muted" style={{ marginBottom: '0.75rem' }}>
        Showing {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} {filtered.length < invoices.length && `(of ${invoices.length})`}
      </p>

      {exportView ? (
        <div className="table-wrapper" style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Inv No</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Address</th>
                <th>State</th>
                <th>Subtotal</th>
                <th>Disc</th>
                <th>Tax</th>
                <th>HMark Tax</th>
                <th>Adj</th>
                <th>Rnd Off</th>
                <th>Grand Total</th>
                <th>Payment</th>
                <th>Cash</th>
                <th>Bank</th>
                <th>Gold /10g</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => (
                <tr key={inv.id}>
                  <td className="text-xs text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{inv.inv_no}</td>
                  <td>{inv.date}</td>
                  <td>{inv.customer_name}</td>
                  <td className="font-mono">{inv.customer_phone || ''}</td>
                  <td className="text-xs" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.customer_address || ''}</td>
                  <td>{inv.customer_state || ''}</td>
                  <td className="font-mono">{fmt(inv.subtotal)}</td>
                  <td className="font-mono" style={{ color: 'var(--red)' }}>{fmt(inv.discount)}</td>
                  <td className="font-mono">{fmt(inv.tax_total)}</td>
                  <td className="font-mono">{fmt(inv.hallmark_total)}</td>
                  <td className="font-mono">{fmt(inv.adj_amount)}</td>
                  <td className="font-mono">{fmt(inv.round_off)}</td>
                  <td className="font-mono" style={{ fontWeight: 700 }}>{fmt(inv.grand_total)}</td>
                  <td>{inv.payment_mode}</td>
                  <td className="font-mono">{fmt(inv.cash_amt)}</td>
                  <td className="font-mono">{fmt(inv.bank_amt)}</td>
                  <td className="font-mono">{fmt(inv.gold_rate)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={18}><div className="empty-state"><Receipt size={48} /><p>No invoices found</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Invoice No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Amt</th>
              <th>Disc</th>
              <th>Gold</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv, i) => (
              <tr key={inv.id}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td><span className="font-mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{inv.inv_no}</span></td>
                <td className="text-sm text-secondary">{inv.date}</td>
                <td style={{ fontWeight: 600 }}>{inv.customer_name}</td>
                <td className="font-mono text-sm">{inv.customer_phone || '—'}</td>
                <td className="font-mono" style={{ fontWeight: 700 }}>{fmt(inv.grand_total)}</td>
                <td className="font-mono text-sm" style={{ color: parseFloat(inv.discount) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{parseFloat(inv.discount) > 0 ? `-${fmt(inv.discount)}` : '—'}</td>
                <td className="font-mono text-xs text-muted">{fmt(inv.gold_rate)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon btn-sm" onClick={() => viewDetails(inv)} title="View Details"><Eye size={15} /></button>
                    <button className="btn-icon btn-sm" onClick={() => editInvoice(inv)} title="Edit"><Edit3 size={15} /></button>
                    <button className="btn-icon btn-sm" onClick={() => printInvoice(inv)} title="Print"><Printer size={15} /></button>
                    {inv.id === lastInvoiceId ? (
                      <button className="btn-icon btn-sm" onClick={() => deleteInvoice(inv.id, inv.inv_no)} title="Delete" style={{ color: 'var(--red)' }}><Trash2 size={15} /></button>
                    ) : (
                      <button className="btn-icon btn-sm" disabled title="Only last invoice can be deleted" style={{ opacity: 0.3, cursor: 'not-allowed', color: 'var(--text-muted)' }}><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9}><div className="empty-state"><Receipt size={48} /><p>No invoices found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <InvoiceModal
        show={showModal && !!selectedInvoice && lineItems.length > 0}
        invoice={selectedInvoice}
        lineItems={lineItems}
        loading={itemsLoading}
        onClose={() => { setShowModal(false); setSelectedInvoice(null); setLineItems([]) }}
        onPrint={() => printInvoice(selectedInvoice)}
      />

      {printLoading && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '300px', textAlign: 'center', padding: '2rem' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <p className="text-sm" style={{ fontWeight: 700 }}>Generating invoice…</p>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-card" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete Invoice</h3>
              <button className="modal-close" onClick={handleCancelDelete}>&times;</button>
            </div>
            <p style={{ marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Delete invoice <strong>{confirmDelete.invNo}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={handleCancelDelete} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
