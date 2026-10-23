import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { logAction } from '../lib/audit'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { coinLabel, coinLineWeight } from '../lib/coins'

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
  { key: 'fine_coins', label: 'Fine Coins' },
]

const COIN_TABS = [
  { key: 'gold_coin', label: 'Gold Coin' },
  { key: 'silver_coin', label: 'Silver Coin' },
]

export default function MaterialPage() {
  const [activeType, setActiveType] = useState('gold_18k')
  const [coinType, setCoinType] = useState('gold_coin')

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
      {activeType === 'fine_coins' ? (
        <>
          <div className="tab-container" style={{ marginTop: '-0.5rem' }}>
            {COIN_TABS.map(t => (
              <button key={t.key} className={`tab-btn ${coinType === t.key ? 'active' : ''}`} onClick={() => setCoinType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <CoinDashboard type={coinType} />
        </>
      ) : (
        <MaterialDashboard type={activeType} />
      )}
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [hasMorePurchases, setHasMorePurchases] = useState(false)
  const [totalWeight, setTotalWeight] = useState(0)
  const [soldWeight, setSoldWeight] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], supplier: '', weight: '', notes: '' })

  // Guards against a slow query for a previous tab overwriting the current one
  const typeRef = useRef(type)
  useEffect(() => { typeRef.current = type }, [type])

  useEffect(() => {
    // Switching tabs mid-edit would try to update a row from another type —
    // close any open form/confirm so edits never leak across tabs.
    setShowForm(false)
    setEditingId(null)
    setConfirmDelete(null)
    loadData()
  }, [type])

  async function loadData() {
    const reqType = type
    setLoading(true)
    try {
      const [pRes, sRes, stockRes] = await Promise.all([
        supabase.from('material_purchases').select('*').eq('type', type).order('date', { ascending: false }).range(0, 200),
        supabase.from('material_sales').select('*').eq('type', type).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 200),
        supabase.from('material_purchases').select('weight, sold_weight').eq('type', type),
      ])
      if (typeRef.current !== reqType) return
      if (pRes.error) addToast('Failed to load purchases', 'error')
      if (sRes.error) addToast('Failed to load sales', 'error')
      if (stockRes.error) addToast('Failed to load stock', 'error')
      if (pRes.data) setPurchases(pRes.data.slice(0, 200))
      if (sRes.data) setSales(sRes.data.slice(0, 200))
      setHasMore((sRes.data || []).length > 200)
      setHasMorePurchases((pRes.data || []).length > 200)
      if (stockRes.data) {
        setTotalWeight(stockRes.data.reduce((s, p) => s + parseFloat(p.weight), 0))
        setSoldWeight(stockRes.data.reduce((s, p) => s + parseFloat(p.sold_weight ?? 0), 0))
      }
    } catch (err) {
      addToast('Failed to load data', 'error')
    }
    if (typeRef.current === reqType) setLoading(false)
  }

  async function loadMoreSales() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const { data, error } = await supabase
        .from('material_sales')
        .select('*')
        .eq('type', type)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(sales.length, sales.length + 200)
      if (error) { addToast('Failed to load sales', 'error') } else if (data) {
        setSales(prev => [...prev, ...data.slice(0, 200)])
        setHasMore(data.length > 200)
      }
    } catch (err) { addToast('Failed to load sales', 'error') }
    finally { setLoadingMore(false) }
  }

  async function loadMorePurchases() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const { data, error } = await supabase
        .from('material_purchases')
        .select('*')
        .eq('type', type)
        .order('date', { ascending: false })
        .range(purchases.length, purchases.length + 200)
      if (error) { addToast('Failed to load purchases', 'error') } else if (data) {
        setPurchases(prev => [...prev, ...data.slice(0, 200)])
        setHasMorePurchases(data.length > 200)
      }
    } catch (err) { addToast('Failed to load purchases', 'error') }
    finally { setLoadingMore(false) }
  }

  const availWeight = totalWeight - soldWeight
  const soldOfEditing = editingId ? (parseFloat(purchases.find(p => p.id === editingId)?.sold_weight) || 0) : 0

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

      {!canEdit && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(13,60,97,0.08)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          You have read-only access to materials. Contact the owner to add or edit purchases.
        </div>
      )}

      {!showForm && canEdit && (
        <button className="btn btn-primary btn-full" style={{ marginBottom: '1rem' }} onClick={startNew}>
          <Plus size={16} /> Add Purchase
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">{editingId ? 'Edit Purchase' : 'New Purchase'}</h3></div>
          <form onSubmit={savePurchase} style={{ padding: '0.75rem 1rem' }}>
            {editingId && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Sold so far: {fmtW(soldOfEditing)} g — weight cannot be reduced below this.
              </div>
            )}
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
                        {canEdit && (
                          <>
                            {/* Edit is allowed even for sold lots — the save
                                validation blocks reducing weight below sold. */}
                            <button className="btn btn-sm btn-outline" title="Edit" onClick={() => startEdit(p)}>
                              <Pencil size={12} />
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              style={{ color: 'var(--red)' }}
                              title={(parseFloat(p.sold_weight) || 0) > 0
                                ? 'Delete disabled — this lot has sales. Delete the linked invoices first to release its weight.'
                                : 'Delete'}
                              onClick={() => setConfirmDelete(p.id)}
                              disabled={(parseFloat(p.sold_weight) || 0) > 0}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMorePurchases && (
          <div style={{ textAlign: 'center', padding: '0.75rem' }}>
            <button className="btn btn-sm btn-outline" onClick={loadMorePurchases} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load more purchases'}
            </button>
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

        {hasMore && (
          <div style={{ textAlign: 'center', padding: '0.75rem' }}>
            <button className="btn btn-sm btn-outline" onClick={loadMoreSales} disabled={loadingMore}>
              {loadingMore ? 'Loading...' : 'Load more sales'}
            </button>
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

// ─── FINE COINS ─────────────────────────────────────────
// Purchases are bought by the piece (weight per coin + pcs); billing sells
// pieces at MRP from the rate card. stock tracks both pcs and grams.

function CoinDashboard({ type }) {
  const { addToast } = useToast()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('allow_stock_edit')

  const [purchases, setPurchases] = useState([])
  const [sales, setSales] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [totals, setTotals] = useState({ pcs: 0, soldPcs: 0, weight: 0, soldWeight: 0 })
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], supplier: '', unit_weight: '', pcs: '', notes: '' })
  const [rateForm, setRateForm] = useState({ id: null, unit_weight: '', mrp: '' })
  const typeRef = useRef(type)
  useEffect(() => { typeRef.current = type }, [type])

  useEffect(() => {
    setShowForm(false)
    setEditingId(null)
    setConfirmDelete(null)
    setRateForm({ id: null, unit_weight: '', mrp: '' })
    loadData()
  }, [type])

  async function loadData() {
    const reqType = type
    setLoading(true)
    try {
      const [pRes, sRes, stockRes, rRes] = await Promise.all([
        supabase.from('material_purchases').select('*').eq('type', type).order('date', { ascending: false }).range(0, 200),
        supabase.from('material_sales').select('*').eq('type', type).order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 200),
        supabase.from('material_purchases').select('pcs, sold_pcs, weight, sold_weight').eq('type', type),
        supabase.from('coin_rates').select('*').eq('type', type).order('unit_weight', { ascending: true }),
      ])
      if (typeRef.current !== reqType) return
      if (pRes.error) addToast('Failed to load purchases', 'error')
      if (sRes.error) addToast('Failed to load sales', 'error')
      if (stockRes.error) addToast('Failed to load stock', 'error')
      if (rRes.error) addToast('Failed to load coin rates', 'error')
      if (pRes.data) setPurchases(pRes.data)
      if (sRes.data) setSales(sRes.data)
      if (rRes.data) setRates(rRes.data)
      if (stockRes.data) {
        setTotals(stockRes.data.reduce((t, p) => ({
          pcs: t.pcs + (parseInt(p.pcs) || 0),
          soldPcs: t.soldPcs + (parseInt(p.sold_pcs) || 0),
          weight: t.weight + (parseFloat(p.weight) || 0),
          soldWeight: t.soldWeight + (parseFloat(p.sold_weight) || 0),
        }), { pcs: 0, soldPcs: 0, weight: 0, soldWeight: 0 }))
      }
    } catch (err) {
      addToast('Failed to load data', 'error')
    }
    if (typeRef.current === reqType) setLoading(false)
  }

  const editing = editingId ? purchases.find(p => p.id === editingId) : null
  const soldOfEditing = editing ? (parseInt(editing.sold_pcs) || 0) : 0

  async function savePurchase(e) {
    e.preventDefault()
    if (!form.supplier.trim()) { addToast('Supplier name is required', 'error'); return }
    const unit = parseFloat(form.unit_weight)
    const pcs = parseInt(form.pcs, 10)
    if (!unit || unit <= 0) { addToast('Enter a valid weight per coin', 'error'); return }
    if (!pcs || pcs <= 0) { addToast('Enter a valid number of coins', 'error'); return }
    if (editing && (parseInt(editing.sold_pcs) || 0) > 0 && Math.abs((parseFloat(editing.unit_weight) || 0) - unit) > 0.0005) {
      addToast('Weight per coin cannot change once coins are sold. Delete the linked invoices first.', 'error')
      return
    }
    if (editing && pcs < (parseInt(editing.sold_pcs) || 0)) {
      addToast(`Coins cannot be reduced below sold amount (${editing.sold_pcs} pcs)`, 'error')
      return
    }
    try {
      const payload = {
        type,
        date: form.date,
        supplier: form.supplier.trim(),
        unit_weight: unit,
        pcs,
        weight: coinLineWeight(unit, pcs),
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
      logAction(editingId ? 'material_purchase_updated' : 'material_purchase_created', 'material_purchases', editingId, { type, supplier: payload.supplier, pcs, unit_weight: unit })
      setShowForm(false)
      setEditingId(null)
      setForm({ date: new Date().toISOString().split('T')[0], supplier: '', unit_weight: '', pcs: '', notes: '' })
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to save', 'error')
    }
  }

  function startEdit(p) {
    setForm({
      date: p.date?.slice(0, 10),
      supplier: p.supplier,
      unit_weight: p.unit_weight?.toString(),
      pcs: p.pcs?.toString(),
      notes: p.notes || '',
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  function startNew() {
    setForm({ date: new Date().toISOString().split('T')[0], supplier: '', unit_weight: '', pcs: '', notes: '' })
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

  async function saveRate(e) {
    e.preventDefault()
    const unit = parseFloat(rateForm.unit_weight)
    const mrp = parseFloat(rateForm.mrp)
    if (!unit || unit <= 0) { addToast('Enter a valid coin weight', 'error'); return }
    if (!mrp || mrp <= 0) { addToast('Enter a valid MRP', 'error'); return }
    const clash = rates.find(r => r.id !== rateForm.id && Math.abs((Number(r.unit_weight) || 0) - unit) < 0.0005)
    if (clash) { addToast('That coin weight already has an MRP', 'error'); return }
    try {
      const payload = { type, unit_weight: unit, mrp, active: true }
      let error
      if (rateForm.id) {
        ({ error } = await supabase.from('coin_rates').update(payload).eq('id', rateForm.id))
      } else {
        ({ error } = await supabase.from('coin_rates').insert(payload))
      }
      if (error) throw error
      addToast(rateForm.id ? 'MRP updated' : 'MRP added', 'success')
      setRateForm({ id: null, unit_weight: '', mrp: '' })
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to save MRP', 'error')
    }
  }

  async function deleteRate(id) {
    try {
      const { error } = await supabase.from('coin_rates').delete().eq('id', id)
      if (error) throw error
      addToast('MRP deleted', 'success')
      if (rateForm.id === id) setRateForm({ id: null, unit_weight: '', mrp: '' })
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to delete MRP', 'error')
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const availPcs = totals.pcs - totals.soldPcs
  const availWeight = totals.weight - totals.soldWeight
  const cellStyle = { textAlign: 'center' }
  const capStyle = { fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">{coinLabel(type)} Stock</h3></div>
        <div className="form-row three" style={{ padding: '0.75rem 1rem' }}>
          <div style={cellStyle}>
            <div style={capStyle}>Total</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{totals.pcs} pcs</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtW(totals.weight)} g</div>
          </div>
          <div style={cellStyle}>
            <div style={capStyle}>Sold</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>{totals.soldPcs} pcs</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtW(totals.soldWeight)} g</div>
          </div>
          <div style={cellStyle}>
            <div style={capStyle}>Available</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)' }}>{availPcs} pcs</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{fmtW(availWeight)} g</div>
          </div>
        </div>
      </div>

      {!canEdit && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(13,60,97,0.08)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          You have read-only access to materials. Contact the owner to add or edit purchases.
        </div>
      )}

      {!showForm && canEdit && (
        <button className="btn btn-primary btn-full" style={{ marginBottom: '1rem' }} onClick={startNew}>
          <Plus size={16} /> Add Coin Purchase
        </button>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">{editingId ? 'Edit Coin Purchase' : 'New Coin Purchase'}</h3></div>
          <form onSubmit={savePurchase} style={{ padding: '0.75rem 1rem' }}>
            {editingId && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Sold so far: {soldOfEditing} pcs — coins cannot be reduced below this and the per-coin weight is locked.
              </div>
            )}
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
            <div className="form-row three">
              <div className="form-group">
                <label className="label">Weight / coin (g) *</label>
                <input className="input" type="number" step="0.001" min="0" value={form.unit_weight} onChange={e => setForm({ ...form, unit_weight: e.target.value })} placeholder="10.000" />
              </div>
              <div className="form-group">
                <label className="label">Coins (pcs) *</label>
                <input className="input" type="number" step="1" min="1" value={form.pcs} onChange={e => setForm({ ...form, pcs: e.target.value })} placeholder="1" />
              </div>
              <div className="form-group">
                <label className="label">Total weight</label>
                <input className="input" readOnly value={`${fmtW(coinLineWeight(form.unit_weight, form.pcs))} g`} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
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
                  <th>Pcs</th>
                  <th>Wt / coin (g)</th>
                  <th>Total (g)</th>
                  <th>Sold</th>
                  <th>Available</th>
                  <th style={{ width: 0 }}></th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => {
                  const sold = parseInt(p.sold_pcs) || 0
                  return (
                    <tr key={p.id}>
                      <td>{p.date?.slice(0, 10)}</td>
                      <td>{p.supplier}</td>
                      <td className="font-mono">{p.pcs}</td>
                      <td className="font-mono">{fmtW(p.unit_weight)}</td>
                      <td className="font-mono">{fmtW(p.weight)}</td>
                      <td className="font-mono">{sold}</td>
                      <td className="font-mono">{(parseInt(p.pcs) || 0) - sold}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {canEdit && (
                            <>
                              <button className="btn btn-sm btn-outline" title="Edit" onClick={() => startEdit(p)}>
                                <Pencil size={12} />
                              </button>
                              <button
                                className="btn btn-sm btn-outline"
                                style={{ color: 'var(--red)' }}
                                title={sold > 0
                                  ? 'Delete disabled — this lot has sales. Delete the linked invoices first.'
                                  : 'Delete'}
                                onClick={() => setConfirmDelete(p.id)}
                                disabled={sold > 0}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">MRP Rate Card</h3></div>
        <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Billing auto-fills the MRP for a coin weight. Change it here when your MRP changes.
        </div>
        {canEdit && (
          <form onSubmit={saveRate} style={{ padding: '0 1rem 0.75rem', display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
              <label className="label">Weight / coin (g)</label>
              <input className="input" type="number" step="0.001" min="0" value={rateForm.unit_weight} onChange={e => setRateForm({ ...rateForm, unit_weight: e.target.value })} placeholder="10.000" />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
              <label className="label">MRP / coin (₹)</label>
              <input className="input" type="number" step="0.01" min="0" value={rateForm.mrp} onChange={e => setRateForm({ ...rateForm, mrp: e.target.value })} placeholder="0.00" />
            </div>
            <button type="submit" className="btn btn-primary">{rateForm.id ? 'Update MRP' : 'Add MRP'}</button>
            {rateForm.id && (
              <button type="button" className="btn btn-outline" onClick={() => setRateForm({ id: null, unit_weight: '', mrp: '' })}>Cancel</button>
            )}
          </form>
        )}
        {rates.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No MRP set yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Weight / coin (g)</th>
                  <th>MRP / coin</th>
                  {canEdit && <th style={{ width: 0 }}></th>}
                </tr>
              </thead>
              <tbody>
                {rates.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono">{fmtW(r.unit_weight)}</td>
                    <td className="font-mono">{fmt(r.mrp)}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-sm btn-outline" title="Edit" onClick={() => setRateForm({ id: r.id, unit_weight: r.unit_weight?.toString(), mrp: r.mrp?.toString() })}>
                            <Pencil size={12} />
                          </button>
                          <button className="btn btn-sm btn-outline" style={{ color: 'var(--red)' }} title="Delete" onClick={() => deleteRate(r.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
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
                  <th>Qty</th>
                  <th>Wt / coin (g)</th>
                  <th>Total (g)</th>
                  <th>MRP / coin</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id}>
                    <td><span className="font-mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{s.invoice_no || '—'}</span></td>
                    <td>{s.description || coinLabel(s.type)}</td>
                    <td className="font-mono">{s.qty}</td>
                    <td className="font-mono">{fmtW(s.unit_weight)}</td>
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
