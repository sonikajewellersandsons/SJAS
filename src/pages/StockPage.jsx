import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import InvoiceModal from '../components/InvoiceModal'
import {
  Package, Plus, Edit2, Search, X, Trash2,
  TrendingUp, ShoppingCart, RotateCcw
} from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TABS = [
  { key: 'stock_view', label: 'Stock', icon: TrendingUp, perm: 'allow_stock_view' },
  { key: 'purchase', label: 'Purchase', icon: ShoppingCart, perm: 'allow_stock_edit' },
  { key: 'item_master', label: 'Item Master', icon: Package, perm: 'allow_item_master' },
]

export default function StockPage() {
  const { hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState('stock_view')

  const visibleTabs = TABS.filter(t => hasPermission(t.perm))

  return (
    <div className="page">
      <div className="page-header">
        <h2>Stock Management</h2>
      </div>

      <div className="tab-container">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'item_master' && <ItemMasterTab />}
      {activeTab === 'stock_view' && <StockViewTab />}
      {activeTab === 'purchase' && <PurchaseTab />}
      
    </div>
  )
}

/* ─── ITEM MASTER TAB ────────────────────────────────── */

function ItemMasterTab() {
  const { addToast } = useToast()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('allow_item_master')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', purity: '22K', category: 'Gold', hallmark_charge: '', hsn_code: '71131913', active: true })
  const [subTab, setSubTab] = useState('jewellery')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('item_master').select('*').order('name')
      if (error) addToast('Failed to load items', 'error')
      setItems(data || [])
    } catch (err) { addToast('Failed to load items', 'error') }
    finally { setLoading(false) }
  }

  function resetForm() {
    setForm({ name: '', purity: '22K', category: subTab === 'metal' ? 'Metal' : 'Gold', hallmark_charge: '', hsn_code: subTab === 'metal' ? '' : '71131913', active: true })
    setEditing(null)
    setShowForm(false)
  }

  function switchSubTab(tab) {
    setSubTab(tab)
    resetForm()
  }

  function editItem(item) {
    setForm({
      name: item.name, purity: item.purity, category: item.category,
      hallmark_charge: String(item.hallmark_charge), hsn_code: item.hsn_code,
      active: item.active
    })
    setEditing(item.id)
    setShowForm(true)
  }

  function deleteItem(id) {
    setConfirmDelete(id)
  }

  async function handleDeleteConfirm() {
    if (!confirmDelete) return
    setDeleting(true)
    const { error } = await supabase.from('item_master').delete().eq('id', confirmDelete)
    setDeleting(false)
    if (error) {
      addToast(error.code === '23503' ? `Cannot delete — it is linked to purchases or stock.` : error.message, 'error')
      setConfirmDelete(null)
      return
    }
    addToast('Item deleted', 'success')
    setConfirmDelete(null)
    loadItems()
  }

  async function saveItem(e) {
    e.preventDefault()
    if (!form.name.trim()) { addToast('Item name is required', 'error'); return }

    const payload = {
      name: form.name.trim(),
      purity: form.purity,
      category: form.category,
      hallmark_charge: parseFloat(form.hallmark_charge) || 0,
      hsn_code: form.hsn_code || '71131913',
      active: form.active,
    }

    if (editing) {
      const { error } = await supabase.from('item_master').update(payload).eq('id', editing)
      if (error) { addToast(error.message, 'error'); return }
      addToast('Item updated', 'success')
    } else {
      const { error } = await supabase.from('item_master').insert(payload)
      if (error) { addToast(error.message, 'error'); return }
      addToast('Item added', 'success')
    }
    resetForm()
    loadItems()
  }

  const isMetal = subTab === 'metal'
  const filtered = items.filter(i => {
    const matchesType = isMetal ? i.category === 'Metal' : i.category !== 'Metal'
    if (!matchesType) return false
    if (!search) return true
    const s = search.toLowerCase()
    return i.name.toLowerCase().includes(s) || i.purity.toLowerCase().includes(s)
  })

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="tab-container" style={{ marginBottom: '0.75rem' }}>
        <button className={`tab-btn ${subTab === 'jewellery' ? 'active' : ''}`} onClick={() => switchSubTab('jewellery')}>Jewellery</button>
        <button className={`tab-btn ${subTab === 'metal' ? 'active' : ''}`} onClick={() => switchSubTab('metal')}>Metals (Inward Supply)</button>
      </div>

      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder={`Search ${isMetal ? 'metals' : 'items'}...`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}>
            <Plus size={16} /> Add {isMetal ? 'Metal' : 'Item'}
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>{isMetal ? 'Metal' : 'Item'}</th>
              <th>Purity</th>
              {!isMetal && <th>Category</th>}
              {!isMetal && <th>Hallmark (₹)</th>}
              {!isMetal && <th>HSN</th>}
              <th>Status</th>
              {canEdit && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.id}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td><span className="badge badge-gold">{item.purity}</span></td>
                {!isMetal && <td className="text-sm text-secondary">{item.category}</td>}
                {!isMetal && <td className="font-mono">{fmt(item.hallmark_charge)}</td>}
                {!isMetal && <td className="font-mono text-sm text-muted">{item.hsn_code}</td>}
                <td><span className={`badge ${item.active ? 'badge-green' : 'badge-red'}`}>{item.active ? 'Active' : 'Inactive'}</span></td>
                {canEdit && (
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon btn-sm" onClick={() => editItem(item)} title="Edit">
                        <Edit2 size={15} />
                      </button>
                      <button className="btn-icon btn-sm" onClick={() => deleteItem(item.id)} title="Delete" style={{ color: 'var(--red)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={canEdit ? (isMetal ? 5 : 8) : (isMetal ? 4 : 7)}><div className="empty-state"><p>No {isMetal ? 'metals' : 'items'} found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Item?</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Edit Item' : 'Add Item'}</h3>
              <button className="modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <form onSubmit={saveItem}>
              {isMetal ? (
                <div className="form-row">
                  <div className="form-group full">
                    <label className="label">Metal Name</label>
                    <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gold 22K" required />
                  </div>
                  <div className="form-group">
                    <label className="label">Purity</label>
                    <select className="input" value={form.purity} onChange={e => setForm({ ...form, purity: e.target.value })}>
                      <option value="22K">22K</option>
                      <option value="18K">18K</option>
                      <option value="24K">24K</option>
                      <option value="Silver">Silver</option>
                    </select>
                  </div>
                </div>
              ) : (
              <>
              <div className="form-row">
                <div className="form-group full">
                  <label className="label">Item Name</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ring(22K)" required />
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label className="label">Purity</label>
                  <select className="input" value={form.purity} onChange={e => setForm({ ...form, purity: e.target.value })}>
                    <option value="22K">22K</option>
                    <option value="18K">18K</option>
                    <option value="24K">24K</option>
                    <option value="Silver">Silver</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Category</label>
                  <input className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Hallmark Charge (₹)</label>
                  <input className="input" type="number" step="0.01" value={form.hallmark_charge} onChange={e => setForm({ ...form, hallmark_charge: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">HSN Code</label>
                  <input className="input" value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <label className="label" style={{ marginBottom: 0 }}>Active</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '44px' }}>
                    <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ width: 18, height: 18 }} />
                    <span className="text-sm">{form.active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>
              </>
              )}
              <div className="flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Update' : 'Add'} {isMetal ? 'Metal' : 'Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── STOCK VIEW TAB ─────────────────────────────────── */

function StockViewTab() {
  const { addToast } = useToast()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterItem, setFilterItem] = useState('')
  const [filterWeight, setFilterWeight] = useState('')
  const [filterHuid, setFilterHuid] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [invoiceItems, setInvoiceItems] = useState([])
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  useEffect(() => { loadStock() }, [])

  async function loadStock() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_stock_lots')
      if (error) addToast('Failed to load stock', 'error')
      setStock(data || [])
    } catch (err) { addToast('Failed to load stock', 'error') }
    finally { setLoading(false) }
  }

  async function viewInvoice(invNo) {
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('inv_no', invNo).single()
    if (invErr || !inv) { addToast('Invoice not found', 'error'); return }
    setSelectedInvoice(inv)
    setInvoiceLoading(true)
    setShowModal(true)
    const { data: li, error: liErr } = await supabase.from('invoice_items').select('*, item_master!left(name, hsn_code)').eq('invoice_id', inv.id).order('sno')
    if (li) setInvoiceItems(li)
    if (liErr) addToast('Failed to load line items', 'error')
    setInvoiceLoading(false)
  }

  const uniqueItems = [...new Set(stock.map(s => s.item_name))].sort()

  const filtered = stock.filter(s => {
    if (filterItem && s.item_name !== filterItem) return false
    const w = parseFloat(filterWeight)
    if (w && Number(s.weight) !== w) return false
    if (filterHuid === 'yes' && !s.huid) return false
    if (filterHuid === 'no' && s.huid) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="filter-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1', minWidth: '180px' }}>
          <label className="label">Item</label>
          <select className="input" value={filterItem} onChange={e => setFilterItem(e.target.value)}>
            <option value="">All Items</option>
            {uniqueItems.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div style={{ width: '110px' }}>
          <label className="label">Weight (g)</label>
          <input className="input" type="number" step="0.001" min="0" value={filterWeight} onChange={e => setFilterWeight(e.target.value)} placeholder="0.000" style={{ padding: '0.3rem 0.5rem' }} />
        </div>
        <div style={{ width: '100px' }}>
          <label className="label">HUID</label>
          <select className="input" value={filterHuid} onChange={e => setFilterHuid(e.target.value)}>
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style={{ width: '110px' }}>
          <label className="label">Status</label>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="Available">Available</option>
            <option value="Partial">Partial</option>
            <option value="Sold">Sold</option>
          </select>
        </div>
        <button className="btn btn-sm btn-outline" onClick={() => { setFilterItem(''); setFilterWeight(''); setFilterHuid('all'); setFilterStatus('all') }} style={{ marginBottom: '1px' }}>
          <X size={14} /> Clear
        </button>
        <button className="btn btn-sm btn-outline" onClick={loadStock} style={{ marginBottom: '1px' }}>
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      <p className="text-xs text-muted" style={{ marginBottom: '0.75rem' }}>
        Lots: <strong>{filtered.length}</strong> / {stock.length}
      </p>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item</th>
              <th>Purity</th>
              <th>Huid</th>
              <th>Weight (g)</th>
              <th style={{ textAlign: 'center' }} colSpan={3}>Pieces</th>
              <th>Date</th>
              <th>Sale Inv No</th>
              <th>Status</th>
            </tr>
            <tr>
              <th colSpan={5}></th>
              <th style={{ borderTop: 'none', fontSize: '0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>P</th>
              <th style={{ borderTop: 'none', fontSize: '0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>S</th>
              <th style={{ borderTop: 'none', fontSize: '0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>A</th>
              <th colSpan={3}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.lot_id} style={s.status === 'Sold' ? { opacity: 0.6 } : {}}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                <td><span className="badge badge-gold" style={{ fontSize: '10px' }}>{s.purity}</span></td>
                <td><span className={`badge ${s.huid ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '10px' }}>{s.huid ? 'Y' : 'N'}</span></td>
                <td className="font-mono" style={{ fontWeight: 600 }}>{Number(s.weight).toFixed(3)}</td>
                <td className="font-mono" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{s.orig_pcs}</td>
                <td className="font-mono" style={{ textAlign: 'center', color: s.sold_pcs > 0 ? 'var(--red)' : 'transparent' }}>{s.sold_pcs > 0 ? s.sold_pcs : ''}</td>
                <td className="font-mono" style={{ textAlign: 'center', fontWeight: 700 }}>{s.avail_pcs}</td>
                <td className="text-sm text-secondary">{s.ref_date?.slice(0, 10)}</td>
                <td>
                  {s.sale_inv_no ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {s.sale_inv_no.split(',').map((inv, j) => (
                        <button key={j} type="button" onClick={() => viewInvoice(inv.trim())} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', textAlign: 'left', padding: 0, textDecoration: 'underline' }}>
                          {inv.trim()}
                        </button>
                      ))}
                    </div>
                  ) : <span className="text-muted text-xs">—</span>}
                </td>
                <td>
                  {s.status === 'Available' ? (
                    <span className="badge badge-green" style={{ fontSize: '9px' }}>Available</span>
                  ) : s.status === 'Partial' ? (
                    <span className="badge badge-gold" style={{ fontSize: '9px', background: 'var(--orange-bg)', color: 'var(--orange)' }}>Partial</span>
                  ) : (
                    <span className="badge badge-red" style={{ fontSize: '9px' }}>Sold</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11}><div className="empty-state"><p>No stock lots found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <InvoiceModal
        show={showModal && !!selectedInvoice && invoiceItems.length > 0}
        invoice={selectedInvoice}
        lineItems={invoiceItems}
        loading={invoiceLoading}
        onClose={() => { setShowModal(false); setSelectedInvoice(null); setInvoiceItems([]) }}
        onPrint={() => addToast('Print from invoice history', 'info')}
      />
    </div>
  )
}

/* ─── PURCHASE TAB ───────────────────────────────────── */

function PurchaseTab() {
  const { addToast } = useToast()
  const [masterItems, setMasterItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedDates, setExpandedDates] = useState({})

  // Header fields
  const [supplier, setSupplier] = useState({ name: '', phone: '' })
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  // Item bucket
  const [lineItems, setLineItems] = useState([
    { item_id: '', purity: '22K', weight: '', qty: '1', huid: true }
  ])

  useEffect(() => { loadData() }, [])

  function getItemPurity(itemId) {
    const item = masterItems.find(i => i.id === parseInt(itemId))
    return item?.purity || '22K'
  }

  function addLine() {
    setLineItems([...lineItems, { item_id: '', purity: '22K', weight: '', qty: '1', huid: true }])
  }

  function updateLine(index, field, value) {
    const updated = lineItems.map((line, i) => {
      if (i !== index) return line
      const newLine = { ...line, [field]: value }
      if (field === 'item_id') {
        newLine.purity = getItemPurity(value)
      }
      return newLine
    })
    setLineItems(updated)
  }

  function removeLine(index) {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function resetForm() {
    setSupplier({ name: '', phone: '' })
    setDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setLineItems([{ item_id: '', purity: '22K', weight: '', qty: '1', huid: true }])
  }

  async function loadData() {
    setLoading(true)
    try {
      const [itemsRes, purchasesRes] = await Promise.all([
        supabase.from('item_master').select('id, name, purity').eq('active', true).order('name'),
        supabase.from('purchases').select('*, item_master!inner(name)').order('created_at', { ascending: false }).limit(500)
      ])
      if (itemsRes.error) addToast('Failed to load items', 'error')
      if (purchasesRes.error) addToast('Failed to load purchases', 'error')
      setMasterItems(itemsRes.data || [])
      setPurchases(purchasesRes.data || [])
    } catch (err) { addToast('Failed to load data', 'error') }
    finally { setLoading(false) }
  }

  async function savePurchase(e) {
    e.preventDefault()

    const validLines = lineItems.filter(l => l.item_id && parseFloat(l.weight) > 0)
    if (validLines.length === 0) {
      addToast('Add at least one item with weight', 'error')
      return
    }

    setSaving(true)
    try {
      const rows = validLines.map(line => ({
        supplier_name: supplier.name.trim(),
        supplier_phone: supplier.phone.trim(),
        item_id: parseInt(line.item_id),
        purity: line.purity,
        weight: parseFloat(line.weight),
        pcs: parseInt(line.qty) || 1,
        rate: 0,
        total: 0,
        date,
        notes: notes.trim(),
        huid: line.huid ?? true,
      }))

      const { error } = await supabase.from('purchases').insert(rows)
      if (error) throw error

      addToast(`${rows.length} item(s) purchased successfully`, 'success')
      resetForm()
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to save purchase', 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalWeight = lineItems.reduce((sum, l) => sum + (parseFloat(l.weight) || 0), 0)

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3 className="card-title">New Purchase</h3>
        </div>
        <form onSubmit={savePurchase}>
          {/* Header: Supplier, Date, Notes */}
          <div className="form-row">
            <div className="form-group">
              <label className="label">Supplier Name</label>
              <input className="input" value={supplier.name} onChange={e => setSupplier({ ...supplier, name: e.target.value })} placeholder="Supplier name" />
            </div>
            <div className="form-group">
              <label className="label">Supplier Phone</label>
              <input className="input" value={supplier.phone} onChange={e => setSupplier({ ...supplier, phone: e.target.value })} placeholder="Phone" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Notes</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>

          {/* Divider */}
          <div className="divider" />

          <label className="label" style={{ marginBottom: '0.5rem' }}>Items</label>

          {/* Items Bucket */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '0.75rem' }}>
            {lineItems.map((line, i) => { return (
              <div key={i} style={{
                background: 'var(--bg)',
                borderRadius: 'var(--radius-lg)',
                padding: '0.75rem',
                border: '1px solid var(--border)',
                position: 'relative'
              }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="text-xs font-bold text-muted">Item #{i + 1}</span>
                  {lineItems.length > 1 && (
                    <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="form-row" style={{ marginBottom: '6px' }}>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: '0.7rem' }}>Item</label>
                    <ComboBox
                      options={masterItems.map(mi => ({ value: mi.id.toString(), label: `${mi.name} (${mi.purity})` }))}
                      value={line.item_id?.toString()}
                      onChange={val => updateLine(i, 'item_id', val)}
                      placeholder="Type to search item..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: '0.7rem' }}>Purity</label>
                    <select className="input" value={line.purity} onChange={e => updateLine(i, 'purity', e.target.value)}>
                      <option value="22K">22K</option>
                      <option value="18K">18K</option>
                      <option value="24K">24K</option>
                      <option value="Silver">Silver</option>
                    </select>
                  </div>
                </div>
                <div className="form-row three" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: '0.7rem' }}>Weight (grm)</label>
                    <input className="input" type="number" step="0.001" min="0" value={line.weight}
                      onChange={e => updateLine(i, 'weight', e.target.value)} required placeholder="0.000" />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: '0.7rem' }}>Qty</label>
                    <input className="input" type="number" min="1" value={line.qty}
                      onChange={e => updateLine(i, 'qty', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: '0.7rem' }}>Huid</label>
                    <select className="input" value={line.huid ? 'true' : 'false'} onChange={e => updateLine(i, 'huid', e.target.value === 'true')}>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>
              </div>
              )
            })}
          </div>

          <button type="button" className="btn btn-sm btn-outline" onClick={addLine} style={{ marginBottom: '1rem', width: '100%' }}>
            <Plus size={14} /> Add Item
          </button>

          {/* Total Weight */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 1rem', background: 'var(--accent-bg)', borderRadius: 'var(--radius)',
            border: '1px solid var(--gold)', marginBottom: '1rem'
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Weight:</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
              {totalWeight.toFixed(3)} grm
            </span>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
            {saving ? 'Saving...' : <><Plus size={16} /> Save Purchase</>}
          </button>
        </form>
      </div>

      <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Purchase History</h3>
      <div className="filter-bar" style={{ marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search purchases..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      {(() => {
        const filtered = purchases.filter(p => {
          if (!search) return true
          const s = search.toLowerCase()
          return p.item_master?.name?.toLowerCase().includes(s) ||
            p.supplier_name?.toLowerCase().includes(s) ||
            p.purity?.toLowerCase().includes(s) ||
            (Number(p.weight) || 0).toFixed(3).includes(search)
        })
        const grouped = {}
        filtered.forEach(p => {
          const d = p.date || 'Unknown'
          if (!grouped[d]) grouped[d] = []
          grouped[d].push(p)
        })
        const sortedDates = Object.keys(grouped).sort().reverse()
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortedDates.length === 0 && (
              <div className="empty-state"><p>No purchases yet</p></div>
            )}
            {sortedDates.map(date => {
              const isOpen = expandedDates[date]
              const items = grouped[date]
              return (
                <div key={date} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }))}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.5rem 0.75rem', cursor: 'pointer',
                      background: 'var(--accent-bg)', borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                      fontWeight: 600, fontSize: '0.85rem'
                    }}
                  >
                    <span>{date} — {items.length} item{items.length > 1 ? 's' : ''}</span>
                    <span style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </div>
                  {isOpen && (
                    <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
                      <table style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 40 }}>#</th>
                            <th>Item</th>
                            <th>Purity</th>
                            <th>Huid</th>
                            <th>Weight</th>
                            <th>Qty</th>
                            <th>Supplier</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p, i) => (
                            <tr key={p.id}>
                              <td className="text-xs text-muted">{i + 1}</td>
                              <td style={{ fontWeight: 600 }}>{p.item_master?.name}</td>
                              <td><span className="badge badge-gold" style={{ fontSize: '10px' }}>{p.purity}</span></td>
                              <td><span className={`badge ${p.huid ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '10px' }}>{p.huid ? 'Yes' : 'No'}</span></td>
                              <td className="font-mono">{Number(p.weight).toFixed(3)}</td>
                              <td className="font-mono">{p.pcs}</td>
                              <td className="text-sm text-secondary">{p.supplier_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}


