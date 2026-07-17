import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import {
  Package, Plus, Edit2, Search, X, Trash2,
  TrendingUp, ShoppingCart, RotateCcw
} from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TABS = [
  { key: 'item_master', label: 'Item Master', icon: Package, perm: 'allow_item_master' },
  { key: 'stock_view', label: 'Stock View', icon: TrendingUp, perm: 'allow_stock_view' },
  { key: 'purchase', label: 'Purchase', icon: ShoppingCart, perm: 'allow_stock_edit' },
]

export default function StockPage() {
  const { hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState('item_master')

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

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    setLoading(true)
    const { data, error } = await supabase.from('item_master').select('*').order('name')
    if (error) addToast('Failed to load items', 'error')
    setItems(data || [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', purity: '22K', category: 'Gold', hallmark_charge: '', hsn_code: '71131913', active: true })
    setEditing(null)
    setShowForm(false)
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

  async function deleteItem(id, name) {
    if (!window.confirm(`Delete item "${name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('item_master').delete().eq('id', id)
    if (error) {
      addToast(error.code === '23503' ? `Cannot delete "${name}" — it is linked to purchases or stock.` : error.message, 'error')
      return
    }
    addToast('Item deleted', 'success')
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

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.purity.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}>
            <Plus size={16} /> Add Item
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item</th>
              <th>Purity</th>
              <th>Category</th>
              <th>Hallmark (₹)</th>
              <th>HSN</th>
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
                <td className="text-sm text-secondary">{item.category}</td>
                <td className="font-mono">{fmt(item.hallmark_charge)}</td>
                <td className="font-mono text-sm text-muted">{item.hsn_code}</td>
                <td><span className={`badge ${item.active ? 'badge-green' : 'badge-red'}`}>{item.active ? 'Active' : 'Inactive'}</span></td>
                {canEdit && (
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon btn-sm" onClick={() => editItem(item)} title="Edit">
                        <Edit2 size={15} />
                      </button>
                      <button className="btn-icon btn-sm" onClick={() => deleteItem(item.id, item.name)} title="Delete" style={{ color: 'var(--red)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7}><div className="empty-state"><p>No items found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Edit Item' : 'Add Item'}</h3>
              <button className="modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <form onSubmit={saveItem}>
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
              <div className="flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Update' : 'Add'} Item
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
  const [search, setSearch] = useState('')

  useEffect(() => { loadStock() }, [])

  async function loadStock() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_stock_lots')
    if (error) addToast('Failed to load stock', 'error')
    setStock(data || [])
    setLoading(false)
  }

  const filtered = stock.filter(s =>
    s.item_name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search stock..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={loadStock}>
          <RotateCcw size={16} /> Refresh
        </button>
      </div>

      <p className="text-xs text-muted" style={{ marginBottom: '0.75rem' }}>
        Each row is a distinct physical item (lot). Total items: <strong>{filtered.length}</strong>
      </p>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Item</th>
              <th>Purity</th>
              <th>Huid</th>
              <th>Weight (grm)</th>
              <th>Pcs</th>
              <th>Date</th>
              <th>Sale Invoice</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.lot_id} style={s.status === 'Sold' ? { opacity: 0.6 } : {}}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                <td><span className="badge badge-gold" style={{ fontSize: '10px' }}>{s.purity}</span></td>
                <td><span className={`badge ${s.huid ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '10px' }}>{s.huid ? 'Yes' : 'No'}</span></td>
                <td className="font-mono" style={{ fontWeight: 600 }}>{Number(s.weight).toFixed(3)}</td>
                <td className="font-mono">{s.pcs}</td>
                <td className="text-sm text-secondary">{s.ref_date}</td>
                <td>
                  {s.status === 'Sold' ? (
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span className="badge badge-red" style={{ fontSize: '9px' }}>Sold</span>
                      {s.sale_inv_no && <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{s.sale_inv_no}</span>}
                    </span>
                  ) : (
                    <span className="badge badge-green" style={{ fontSize: '10px' }}>Available</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state"><p>No stock lots found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
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
    const [itemsRes, purchasesRes] = await Promise.all([
      supabase.from('item_master').select('id, name, purity').eq('active', true).order('name'),
      supabase.from('purchases').select('*, item_master!inner(name)').order('created_at', { ascending: false }).limit(500)
    ])
    if (itemsRes.error) addToast('Failed to load items', 'error')
    if (purchasesRes.error) addToast('Failed to load purchases', 'error')
    setMasterItems(itemsRes.data || [])
    setPurchases(purchasesRes.data || [])
    setLoading(false)
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

      <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Recent Purchases</h3>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Date</th>
              <th>Item</th>
              <th>Purity</th>
              <th>Huid</th>
              <th>Weight</th>
              <th>Qty</th>
              <th>Supplier</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p, i) => (
              <tr key={p.id}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td className="text-sm text-secondary">{p.date}</td>
                <td style={{ fontWeight: 600 }}>{p.item_master?.name}</td>
                <td><span className="badge badge-gold" style={{ fontSize: '10px' }}>{p.purity}</span></td>
                <td><span className={`badge ${p.huid ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '10px' }}>{p.huid ? 'Yes' : 'No'}</span></td>
                <td className="font-mono">{Number(p.weight).toFixed(3)}</td>
                <td className="font-mono">{p.pcs}</td>
                <td className="text-sm text-secondary">{p.supplier_name}</td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state"><p>No purchases yet</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


