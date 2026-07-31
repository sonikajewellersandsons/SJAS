import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { logAction } from '../lib/audit'
import { Plus, Pencil, Trash2 } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtW(n) {
  return (Number(n) || 0).toFixed(3)
}

const TYPES = [
  { key: 'gold_18k', label: '18K Gold' },
  { key: 'silver_925', label: 'Silver 925' },
  { key: 'silver_ornaments', label: 'Silver Ornaments' },
]

export default function MaterialPage() {
  const { hasPermission } = useAuth()
  const [activeType, setActiveType] = useState('gold_18k')

  return (
    <div className="page">
      <div className="page-header">
        <h2>Materials</h2>
      </div>
      <div className="tab-container">
        {TYPES.map(t => (
          <button key={t.key} className={`tab-btn ${activeType === t.key ? 'active' : ''}`} onClick={() => setActiveType(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <MaterialDashboard type={activeType} />
    </div>
  )
}

function MaterialDashboard({ type }) {
  const { addToast } = useToast()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('allow_stock_edit')

  const [purchases, setPurchases] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], supplier: '', weight: '', notes: '' })

  useEffect(() => { loadData() }, [type])

  async function loadData() {
    setLoading(true)
    try {
      const [pRes, sRes] = await Promise.all([
        supabase.from('material_purchases').select('*').eq('type', type).order('date', { ascending: false }),
        supabase.from('material_sales').select('*').eq('type', type).order('created_at', { ascending: false }).limit(200),
      ])
      if (pRes.error) addToast('Failed to load purchases', 'error')
      if (sRes.error) addToast('Failed to load sales', 'error')
      if (pRes.data) setPurchases(pRes.data)
      if (sRes.data) setSales(sRes.data)
    } catch (err) {
      addToast('Failed to load data', 'error')
    }
    setLoading(false)
  }

  const totalWeight = purchases.reduce((s, p) => s + parseFloat(p.weight), 0)
  const soldWeight = purchases.reduce((s, p) => s + parseFloat(p.sold_weight ?? 0), 0)
  const availWeight = totalWeight - soldWeight

  async function savePurchase(e) {
    e.preventDefault()
    if (!form.supplier.trim()) { addToast('Supplier name is required', 'error'); return }
    const fw = parseFloat(form.weight)
    if (!fw || fw <= 0) { addToast('Enter a valid weight', 'error'); return }
    if (editingId) {
      const orig = purchases.find(p => p.id === editingId)
      const sold = parseFloat(orig?.sold_weight) || 0
      if (parseFloat(form.weight) < sold) {
        addToast(`Weight cannot be reduced below sold amount (${fmtW(sold)} g)`, 'error')
        return
      }
    }
    try {
      const payload = {
        type,
        date: form.date,
        supplier: form.supplier.trim(),
        weight: parseFloat(form.weight),
        notes: form.notes.trim(),
      }
      let error
      if (editingId) {
        ({ error } = await supabase.from('material_purchases').update(payload).eq('id', editingId))
      } else {
        ({ error } = await supabase.from('material_purchases').insert(payload))
      }
      if (error) throw error
      addToast(editingId ? 'Purchase updated' : 'Purchase added', 'success')
      logAction(editingId ? 'material_purchase_updated' : 'material_purchase_created', 'material_purchases', editingId, { type, supplier: form.supplier.trim(), weight: parseFloat(form.weight) })
      setShowForm(false)
      setEditingId(null)
      setForm({ date: new Date().toISOString().split('T')[0], supplier: '', weight: '', notes: '' })
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to save', 'error')
    }
  }

  function startEdit(p) {
    setForm({
      date: p.date?.slice(0, 10),
      supplier: p.supplier,
      weight: p.weight?.toString(),
      notes: p.notes || '',
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  function startNew() {
    setForm({ date: new Date().toISOString().split('T')[0], supplier: '', weight: '', notes: '' })
    setEditingId(null)
    setShowForm(true)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('material_purchases').delete().eq('id', confirmDelete)
      if (error) throw error
      addToast('Purchase deleted', 'success')
      logAction('material_purchase_deleted', 'material_purchases', confirmDelete, { type })
      setConfirmDelete(null)
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to delete', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner" /></div>
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3 className="card-title">Stock</h3>
        </div>
        <div className="form-row three" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmtW(totalWeight)} g</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sold</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>{fmtW(soldWeight)} g</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)' }}>{fmtW(availWeight)} g</div>
          </div>
        </div>
      </div>

      {!showForm && (
        <button className="btn btn-primary btn-full" style={{ marginBottom: '1rem' }} onClick={startNew}>
          <Plus size={16} /> Add Purchase
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">{editingId ? 'Edit Purchase' : 'New Purchase'}</h3></div>
          <form onSubmit={savePurchase} style={{ padding: '0.75rem 1rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Date</label>
                <input className="input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Supplier *</label>
                <input className="input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Weight (g) *</label>
                <input className="input" type="number" step="0.001" min="0" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="0.000" />
              </div>
              <div className="form-group">
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary"><Plus size={14} /> {editingId ? 'Update' : 'Save'} Purchase</button>
              <button type="button" className="btn btn-outline" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Purchase History</h3></div>
        {purchases.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No purchases yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Weight (g)</th>
                  <th>Sold</th>
                  <th>Available</th>
                  <th>Notes</th>
                  <th style={{ width: 0 }}></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id}>
                    <td>{p.date?.slice(0, 10)}</td>
                    <td>{p.supplier}</td>
                    <td className="font-mono">{fmtW(p.weight)}</td>
                    <td className="font-mono">{fmtW(p.sold_weight)}</td>
                    <td className="font-mono">{fmtW((parseFloat(p.weight) || 0) - (parseFloat(p.sold_weight) || 0))}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-sm btn-outline" title="Edit" onClick={() => startEdit(p)} disabled={(parseFloat(p.sold_weight) || 0) > 0}>
                          <Pencil size={12} />
                        </button>
                        <button className="btn btn-sm btn-outline" style={{ color: 'var(--red)' }} title="Delete" onClick={() => setConfirmDelete(p.id)} disabled={(parseFloat(p.sold_weight) || 0) > 0}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h3 className="card-title">Sale History</h3></div>
        {sales.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No sales yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Description</th>
                  <th>Weight (g)</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id}>
                    <td><span className="font-mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{s.invoice_no || '—'}</span></td>
                    <td>{s.description || '—'}</td>
                    <td className="font-mono">{fmtW(s.weight)}</td>
                    <td className="font-mono">{s.rate ? fmt(s.rate) : '—'}</td>
                    <td className="font-mono">{fmt(s.amount)}</td>
                    <td>{s.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Delete Purchase?</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</button>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
