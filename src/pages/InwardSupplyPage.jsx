import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import { Plus, Search, X, Eye, Trash2, RotateCcw, Edit3 } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const METAL_OPTIONS = [
  { id: 'gold', label: 'Gold', purities: ['22K', '24K', '18K'] },
  { id: 'silver', label: 'Silver', purities: ['Silver'] },
]

function metalLabel(id) {
  return METAL_OPTIONS.find(m => m.id === id)?.label || id
}

export default function InwardSupplyPage() {
  const { addToast } = useToast()
  const { profile } = useAuth()

  const [vouchers, setVouchers] = useState([])
  const [metalItems, setMetalItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Create/Edit form
  const [showForm, setShowForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editInvNo, setEditInvNo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [invNo, setInvNo] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [notes, setNotes] = useState('')

  // Aadhaar
  const [aadhaarInput, setAadhaarInput] = useState('')
  const [aadhaarSaving, setAadhaarSaving] = useState(false)

  const [lineItems, setLineItems] = useState([
    { metal: 'gold', purity: '22K', weight: '', pcs: '1', rate: '' }
  ])

  // View modal
  const [showModal, setShowModal] = useState(false)
  const [viewVoucher, setViewVoucher] = useState(null)
  const [viewItems, setViewItems] = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [vouchRes, custRes, metalRes] = await Promise.all([
      supabase.from('inward_supply_vouchers').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('customers').select('id, name, phone, aadhaar').order('name'),
      supabase.from('item_master').select('id, name, purity').eq('active', true).eq('category', 'Metal'),
    ])
    if (vouchRes.error) addToast('Failed to load vouchers', 'error')
    if (custRes.error) addToast('Failed to load customers', 'error')
    setVouchers(vouchRes.data || [])
    setCustomers(custRes.data || [])
    setMetalItems(metalRes.data || [])
    setLoading(false)
  }

  // Inv no generation
  async function getFy() {
    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth() + 1
    return m >= 4 ? `${y}-${(y + 1).toString().slice(-2)}` : `${y - 1}-${y.toString().slice(-2)}`
  }

  async function generateInvNo() {
    const fy = await getFy()
    const { data: existing } = await supabase.from('inward_supply_vouchers').select('inv_no').ilike('inv_no', `SJS/IWS/${fy}/%`).order('inv_no')
    const used = (existing || []).map(v => parseInt(v.inv_no.split('/').pop())).filter(n => !isNaN(n)).sort((a, b) => a - b)
    let next = 1
    for (const n of used) {
      if (n === next) next++
      else break
    }
    const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'inward').eq('fy', fy).maybeSingle()
    const seqNext = cur ? (parseInt(cur.last_no) || 0) + 1 : null
    const suggest = seqNext !== null ? Math.min(next, seqNext) : next
    setInvNo(`SJS/IWS/${fy}/${String(suggest).padStart(3, '0')}`)
  }

  async function openCreateForm() {
    await generateInvNo()
    setEditMode(false)
    setEditInvNo(null)
    setDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null)
    setNotes('')
    setLineItems([{ metal: 'gold', purity: '22K', weight: '', pcs: '1', rate: '' }])
    setAadhaarInput('')
    setShowForm(true)
  }

  function handleCustomerSelect(cust) {
    setSelectedCustomer(cust || null)
    setAadhaarInput('')
  }

  async function saveAadhaar() {
    if (!selectedCustomer || !aadhaarInput.trim()) return
    const aadhaar = aadhaarInput.trim()
    if (aadhaar.length < 4) { addToast('Enter a valid Aadhaar number', 'error'); return }
    setAadhaarSaving(true)
    const { error } = await supabase.from('customers').update({ aadhaar }).eq('id', selectedCustomer.id)
    if (error) { addToast('Failed to save Aadhaar', 'error'); setAadhaarSaving(false); return }
    setSelectedCustomer({ ...selectedCustomer, aadhaar })
    setCustomers(customers.map(c => c.id === selectedCustomer.id ? { ...c, aadhaar } : c))
    setShowAadhaarPrompt(false)
    setAadhaarSaving(false)
    addToast('Aadhaar saved', 'success')
  }

  async function loadEditVoucher(invNoToEdit) {
    const { data, error } = await supabase
      .from('inward_supply_vouchers')
      .select('*, item_master!inner(name)')
      .eq('inv_no', invNoToEdit)
      .order('id')
    if (error || !data || data.length === 0) { addToast('Voucher not found', 'error'); return }

    const first = data[0]
    setEditMode(true)
    setEditInvNo(invNoToEdit)
    setInvNo(first.inv_no)
    setDate(first.date)
    setNotes(first.notes || '')
    setAadhaarInput('')

    const cust = customers.find(c => c.id === first.customer_id)
    setSelectedCustomer(cust || null)

    const items = data.map(d => {
      const metal = metalItems.find(m => m.id === d.item_id)
      return {
        metal: metal ? metal.name.toLowerCase() : 'gold',
        purity: d.purity,
        weight: d.weight.toString(),
        pcs: d.pcs.toString(),
        rate: d.rate.toString(),
      }
    })
    setLineItems(items)
    setShowForm(true)
  }

  // Items
  function addLine() {
    setLineItems([...lineItems, { metal: 'gold', purity: '22K', weight: '', pcs: '1', rate: '' }])
  }

  function updateLine(index, field, value) {
    const updated = lineItems.map((line, i) => {
      if (i !== index) return line
      const newLine = { ...line, [field]: value }
      if (field === 'metal') {
        const metal = METAL_OPTIONS.find(m => m.id === value)
        if (metal) newLine.purity = metal.purities[0]
      }
      return newLine
    })
    setLineItems(updated)
  }

  function removeLine(index) {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function calcLine(line) {
    const w = parseFloat(line.weight) || 0
    const rate = parseFloat(line.rate) || 0
    const total = w * rate
    return { total }
  }

  const lineTotals = lineItems.map(calcLine)
  const grandTotal = lineTotals.reduce((s, l) => s + l.total, 0)

  async function saveVoucher(e) {
    e.preventDefault()
    if (!invNo) { addToast('Invoice number not generated', 'error'); return }
    if (!selectedCustomer) { addToast('Select a customer', 'error'); return }
    const validLines = lineItems.filter(l => l.metal && parseFloat(l.weight) > 0)
    if (validLines.length === 0) { addToast('Add at least one item with weight', 'error'); return }

    setSaving(true)
    try {
      const rows = validLines.map((line, idx) => {
        const ct = lineTotals[lineItems.indexOf(line)]
        const metalItem = metalItems.find(m => m.name.toLowerCase() === line.metal)
        if (!metalItem) throw new Error('Metal type not found: ' + line.metal)
        return {
          inv_no: invNo,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.name,
          customer_phone: selectedCustomer.phone || '',
          item_id: metalItem.id,
          weight: parseFloat(line.weight),
          pcs: parseInt(line.pcs) || 1,
          purity: line.purity,
          rate: parseFloat(line.rate) || 0,
          total: Math.round(ct.total * 100) / 100,
          grand_total: 0,
          date,
          notes: notes.trim(),
          created_by: profile?.id || null,
        }
      })

      const finalRows = rows.map(r => ({ ...r, grand_total: Math.round(grandTotal * 100) / 100 }))

      if (editMode && editInvNo) {
        // Insert new rows first, then delete old to avoid data loss on failure
        const { error: insErr } = await supabase.from('inward_supply_vouchers').insert(finalRows)
        if (insErr) throw new Error(insErr.message)
        const { error: delErr } = await supabase.from('inward_supply_vouchers').delete().eq('inv_no', editInvNo)
        if (delErr) throw new Error(delErr.message)
        addToast(`Voucher ${editInvNo} updated`, 'success')
      } else {
        const { error } = await supabase.from('inward_supply_vouchers').insert(finalRows)
        if (error) throw error

        // Update inv_sequences
        const seqMatch = invNo.match(/\/(\d+)$/)
        if (seqMatch) {
          const seqNum = parseInt(seqMatch[1])
          const fy = await getFy()
          const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'inward').eq('fy', fy).maybeSingle()
          const curNo = cur ? parseInt(cur.last_no) || 0 : 0
          if (seqNum > curNo) {
            const { error: seqErr } = await supabase.from('inv_sequences').upsert({ type: 'inward', fy, last_no: seqNum }, { onConflict: 'type,fy' })
            if (seqErr) console.warn('Sequence update failed (non-critical):', seqErr.message)
          }
        }
        addToast(`Voucher ${invNo} created`, 'success')
      }

      setShowForm(false)
      loadData()
    } catch (err) {
      addToast(err.message || 'Failed to save voucher', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function viewDetails(invNoToView) {
    const { data, error } = await supabase
      .from('inward_supply_vouchers')
      .select('*, item_master!inner(name)')
      .eq('inv_no', invNoToView)
      .order('id')
    if (error || !data || data.length === 0) { addToast('Voucher not found', 'error'); return }
    setViewVoucher(data[0])
    setViewItems(data)
    setShowModal(true)
  }

  async function deleteVoucher(invNoToDel) {
    if (!window.confirm(`Delete voucher "${invNoToDel}"? This cannot be undone.`)) return
    const { error } = await supabase.rpc('delete_inward_supply', { p_inv_no: invNoToDel })
    if (error) {
      addToast(error.message, 'error')
      return
    }
    addToast(`Voucher ${invNoToDel} deleted`, 'success')
    setShowModal(false)
    loadData()
  }

  // Derive unique vouchers from line-item table
  const uniqueVouchers = useMemo(() => {
    const map = {}
    for (const v of vouchers) {
      if (!map[v.inv_no]) {
        map[v.inv_no] = { ...v, items: [] }
      }
      map[v.inv_no].items.push(v)
    }
    return Object.values(map)
  }, [vouchers])

  const filtered = uniqueVouchers.filter(v => {
    const s = search.toLowerCase()
    return (
      (!s || v.inv_no?.toLowerCase().includes(s) || v.customer_name?.toLowerCase().includes(s) || v.customer_phone?.includes(s)) &&
      (!dateFrom || v.date >= dateFrom) &&
      (!dateTo || v.date <= dateTo)
    )
  })

  const lastVoucherInvNo = uniqueVouchers.length > 0
    ? uniqueVouchers.reduce((a, b) => ((b.id || 0) > (a.id || 0) ? b : a)).inv_no
    : null

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><h2>Inward Supply</h2></div>
        <div className="loading-center"><div className="spinner" /></div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Inward Supply</h2>
        <p className="text-xs text-muted">Exchange / trade-in valuation vouchers</p>
      </div>

      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by voucher no, customer name, phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '150px' }} />
        <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '150px' }} />
        <button className="btn btn-outline" onClick={loadData}><RotateCcw size={16} /> Refresh</button>
        <button className="btn btn-primary" onClick={openCreateForm}><Plus size={16} /> New Voucher</button>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><p>No inward supply vouchers found</p></div></div>
      ) : (
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Voucher No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Items</th>
              <th>Total Value</th>
              <th style={{ width: 130 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr key={v.inv_no}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td><span className="font-mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>{v.inv_no}</span></td>
                <td className="text-sm text-secondary">{v.date}</td>
                <td style={{ fontWeight: 600 }}>{v.customer_name || '—'}</td>
                <td className="font-mono text-sm">{v.customer_phone || '—'}</td>
                <td className="text-sm">{v.items.length}</td>
                <td className="font-mono" style={{ fontWeight: 700 }}>{fmt(v.grand_total || v.total)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon btn-sm" onClick={() => viewDetails(v.inv_no)} title="View"><Eye size={15} /></button>
                    <button className="btn-icon btn-sm" onClick={() => loadEditVoucher(v.inv_no)} title="Edit"><Edit3 size={15} /></button>
                    {v.inv_no === lastVoucherInvNo && (
                      <button className="btn-icon btn-sm" onClick={() => deleteVoucher(v.inv_no)} title="Delete" style={{ color: 'var(--red)' }}><Trash2 size={15} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* ─── Create/Edit Form Modal ─── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="modal-card" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editMode ? 'Edit Inward Supply Voucher' : 'New Inward Supply Voucher'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveVoucher}>
              <div style={{ padding: '1rem' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label">Date</label>
                    <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label">Voucher No.</label>
                    <input className="input" value={invNo} onChange={e => setInvNo(e.target.value)}
                      style={{ fontWeight: 700, color: 'var(--accent)' }} readOnly={editMode} />
                  </div>
                  <div className="form-group">
                    <label className="label">Customer</label>
                    <ComboBox
                      options={customers.map(c => ({ value: c.id.toString(), label: `${c.name} — ${c.phone}` }))}
                      value={selectedCustomer?.id?.toString() || ''}
                      onChange={val => {
                        const c = customers.find(c => c.id === parseInt(val))
                        handleCustomerSelect(c || null)
                      }}
                      placeholder="Search customer..."
                    />
                  </div>
                </div>

                {selectedCustomer && (
                  <div className="form-row" style={{ marginTop: '0.5rem' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">Aadhaar No. {selectedCustomer.aadhaar ? '' : '(optional)'}</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input className="input" value={aadhaarInput} onChange={e => setAadhaarInput(e.target.value)}
                          placeholder={selectedCustomer.aadhaar || 'Enter Aadhaar number...'} style={{ flex: 1 }} />
                        {aadhaarInput.trim() && aadhaarInput.trim() !== (selectedCustomer?.aadhaar || '') && (
                          <button type="button" className="btn btn-sm btn-primary" onClick={saveAadhaar} disabled={aadhaarSaving}>
                            {aadhaarSaving ? 'Saving...' : 'Save'}
                          </button>
                        )}
                      </div>
                      {selectedCustomer.aadhaar && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>Saved: {selectedCustomer.aadhaar}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="divider" />

                <label className="label" style={{ marginBottom: '0.5rem' }}>Items</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '0.75rem' }}>
                  {lineItems.map((line, i) => {
                    const ct = lineTotals[i]
                    return (
                      <div key={i} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '0.75rem', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span className="text-xs font-bold text-muted">Item #{i + 1}</span>
                          {lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><X size={16} /></button>
                          )}
                        </div>
                        <div className="form-row" style={{ marginBottom: '6px' }}>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Metal</label>
                            <select className="input" value={line.metal} onChange={e => updateLine(i, 'metal', e.target.value)}>
                              {METAL_OPTIONS.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Purity</label>
                            <select className="input" value={line.purity} onChange={e => updateLine(i, 'purity', e.target.value)}>
                              {(METAL_OPTIONS.find(m => m.id === line.metal)?.purities || []).map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="form-row four" style={{ marginBottom: 0 }}>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Weight (g)</label>
                            <input className="input" type="number" step="0.001" min="0" value={line.weight}
                              onChange={e => updateLine(i, 'weight', e.target.value)} placeholder="0.000" />
                          </div>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Pcs</label>
                            <input className="input" type="number" min="1" value={line.pcs}
                              onChange={e => updateLine(i, 'pcs', e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Rate /g (₹)</label>
                            <input className="input" type="number" step="0.01" min="0" value={line.rate}
                              onChange={e => updateLine(i, 'rate', e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="form-group">
                            <label className="label" style={{ fontSize: '0.7rem' }}>Value</label>
                            <div className="font-mono" style={{ fontWeight: 700, height: '44px', display: 'flex', alignItems: 'center' }}>{fmt(ct.total)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button type="button" className="btn btn-sm btn-outline" onClick={addLine} style={{ marginBottom: '1rem', width: '100%' }}>
                  <Plus size={14} /> Add Item
                </button>

                <div className="divider" />

                <div className="form-row">
                  <div className="form-group full">
                    <label className="label">Notes</label>
                    <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--accent-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--gold)', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Valuation:</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>{fmt(grandTotal)}</span>
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : <><Plus size={16} /> {editMode ? 'Update Voucher' : 'Create Voucher'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Details Modal ─── */}
      {showModal && viewVoucher && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal-card" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Inward Supply Voucher</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div style={{ padding: '0 1rem 1rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontWeight: 700 }}>Voucher No</span>
                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{viewVoucher.inv_no}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontWeight: 700 }}>Date</span>
                <span>{viewVoucher.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontWeight: 700 }}>Customer</span>
                <span style={{ fontWeight: 600 }}>{viewVoucher.customer_name || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ fontWeight: 700 }}>Phone</span>
                <span className="font-mono">{viewVoucher.customer_phone || '—'}</span>
              </div>
              {viewVoucher.customer_id && (() => {
                const cust = customers.find(c => c.id === viewVoucher.customer_id)
                return cust?.aadhaar ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span style={{ fontWeight: 700 }}>Aadhaar</span>
                    <span className="font-mono">{cust.aadhaar}</span>
                  </div>
                ) : null
              })()}

              <div className="divider" />

              <div className="table-wrapper" style={{ marginBottom: '0.5rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}>#</th>
                      <th>Item</th>
                      <th>Purity</th>
                      <th>Weight</th>
                      <th>Pcs</th>
                      <th>Rate /g</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item, i) => (
                      <tr key={item.id}>
                        <td className="text-xs text-secondary">{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.item_master?.name || `Item #${item.item_id}`}</td>
                        <td><span className="badge badge-gold" style={{ fontSize: '10px' }}>{item.purity}</span></td>
                        <td className="font-mono text-xs">{Number(item.weight).toFixed(3)}</td>
                        <td className="font-mono text-xs">{item.pcs}</td>
                        <td className="font-mono text-xs">{fmt(item.rate)}</td>
                        <td className="font-mono text-xs" style={{ fontWeight: 700 }}>{fmt(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--gold)' }}>
                      <td colSpan={5}></td>
                      <td className="font-mono" style={{ fontWeight: 700, fontSize: '0.85rem' }}>Total</td>
                      <td className="font-mono" style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent)' }}>{fmt(viewVoucher.grand_total || viewItems.reduce((s, i) => s + Number(i.total), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {viewVoucher.notes && (
                <div style={{ padding: '3px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  Notes: {viewVoucher.notes}
                </div>
              )}

              <div className="divider" />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}