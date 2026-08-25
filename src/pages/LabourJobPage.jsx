import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../lib/audit'
import { fmt, cleanPhone, financialYear } from '../lib/format'
import { computeLabourTotals, cleanLabourItems, LABOUR_PURITIES } from '../lib/labour'
import { Search, X, Plus, Trash2, Eye, Printer, Pencil, Save, Hammer, Receipt, Ban } from 'lucide-react'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
const PAGE_SIZE = 500

// Blank row shape for the items editor
const blankItem = () => ({ item_name: '', purity: '22K', weight: '' })
const blankNewCust = () => ({ name: '', phone: '', address: '', state: 'Haryana', aadhaar: '', pincode: '', gstin: '' })

export default function LabourJobPage() {
  const [activeTab, setActiveTab] = useState('new')
  const [editJob, setEditJob] = useState(null)

  function startEdit(job) {
    setEditJob(job)
    setActiveTab('new')
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Labour Jobs</h2>
      </div>
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`} onClick={() => setActiveTab('new')}>
          <Hammer size={16} /> New Job
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <Receipt size={16} /> History
        </button>
      </div>

      {activeTab === 'new' && <NewJobTab editJob={editJob} clearEdit={() => setEditJob(null)} />}
      {activeTab === 'history' && <HistoryTab onEdit={startEdit} />}
    </div>
  )
}

/* ═══════════════════════ NEW JOB TAB ═══════════════════════ */

function NewJobTab({ editJob, clearEdit }) {
  const { addToast } = useToast()
  const { profile } = useAuth()

  const [customers, setCustomers] = useState([])
  const [saving, setSaving] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Header
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [invNo, setInvNo] = useState('')
  const [notes, setNotes] = useState('')

  // Customer picker (same UX as BillingPage)
  const [custSearch, setCustSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustDropdown, setShowCustDropdown] = useState(false)
  const [newCust, setNewCust] = useState(blankNewCust())
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [custHighlightIdx, setCustHighlightIdx] = useState(-1)
  const custRef = useRef(null)

  // Items
  const [lineItems, setLineItems] = useState([blankItem()])

  // Charges (entered as text so the inputs stay forgiving)
  const [serviceChargeStr, setServiceChargeStr] = useState('')
  const [hallmarkChargeStr, setHallmarkChargeStr] = useState('')

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const editModeRef = useRef(false)
  const appliedEditRef = useRef(null)
  // Render-time-synced so generateJobNo() can see an incoming edit even on
  // the very first mount (its async resolution must never overwrite the
  // voucher number loaded from History).
  const editJobRef = useRef(null)
  editJobRef.current = editJob
  useEffect(() => { editModeRef.current = editMode }, [editMode])

  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase()
    const digits = cleanPhone(custSearch)
    const digitsNo91 = digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits
    return customers.filter(c => {
      if (q && c.name.toLowerCase().includes(q)) return true
      if (custSearch && c.phone?.includes(custSearch)) return true
      if (digits && c.phone?.includes(digits)) return true
      if (digitsNo91 && c.phone?.includes(digitsNo91)) return true
      if (digits && c.aadhaar?.includes(digits)) return true
      return false
    })
  }, [customers, custSearch])

  useEffect(() => {
    function handleClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) {
        setShowCustDropdown(false)
        setCustHighlightIdx(-1)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Number inputs shouldn't zoom-jump on wheel scroll
  useEffect(() => {
    const handler = (e) => { if (e.target.type === 'number') e.preventDefault() }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  async function generateJobNo() {
    if (editModeRef.current || appliedEditRef.current != null || editJobRef.current) return
    const fy = financialYear()
    const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'labour').eq('fy', fy).maybeSingle()
    const seqNext = cur ? (parseInt(cur.last_no) || 0) + 1 : 1
    setInvNo(`SJS/LB/${fy}/${String(seqNext).padStart(3, '0')}`)
  }

  useEffect(() => { generateJobNo() }, [])

  // Customer list for the picker
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.from('customers')
          .select('id, name, phone, address, state, aadhaar, gstin')
          .order('name')
          .limit(1000)
        if (!cancelled) {
          if (error) throw error
          setCustomers(data || [])
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) addToast('Failed to load customers', 'error')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Apply / clear an incoming edit job from the History tab.
  // Tracked by OBJECT reference, not id — History always hands us a fresh
  // object per click, so re-editing the same job re-applies even after a
  // successful save (an id-based guard would skip it and show a blank form).
  useEffect(() => {
    if (editJob && appliedEditRef.current !== editJob) {
      appliedEditRef.current = editJob
      applyEdit(editJob)
    } else if (!editJob && appliedEditRef.current !== null) {
      appliedEditRef.current = null
      setEditMode(false)
      resetForm(false)
      generateJobNo()
    }
  }, [editJob])

  function applyEdit(job) {
    setEditMode(true)
    setDate(job.date || new Date().toISOString().split('T')[0])
    setInvNo(job.inv_no || '')
    setNotes(job.notes || '')
    setServiceChargeStr(job.service_charge != null ? String(job.service_charge) : '')
    setHallmarkChargeStr(job.hallmark_charge != null ? String(job.hallmark_charge) : '')
    setSelectedCustomer({
      id: job.customer_id,
      name: job.customer_name || '',
      address: job.customer_address || '',
      phone: job.customer_phone || '',
      state: job.customer_state || 'Haryana',
      gstin: job.customer_gstin || '',
    })
    setIsNewCustomer(false)
    setCustSearch('')
    const rows = (job.items || []).map(it => ({
      item_name: it.item_name || '',
      purity: it.purity || '22K',
      weight: String(it.weight ?? ''),
    }))
    setLineItems(rows.length > 0 ? rows : [blankItem()])
    window.scrollTo({ top: 0 })
  }

  async function resetForm(regen = true) {
    setDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null)
    setIsNewCustomer(false)
    setNewCust(blankNewCust())
    setCustSearch('')
    setLineItems([blankItem()])
    setServiceChargeStr('')
    setHallmarkChargeStr('')
    setNotes('')
    if (regen) await generateJobNo()
  }

  function handleCustKeyDown(e) {
    if (!showCustDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustHighlightIdx(i => Math.min(i + 1, filteredCustomers.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && custHighlightIdx >= 0 && filteredCustomers[custHighlightIdx]) {
      e.preventDefault()
      selectCustomer(filteredCustomers[custHighlightIdx])
    } else if (e.key === 'Escape') {
      setShowCustDropdown(false)
      setCustHighlightIdx(-1)
    }
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setIsNewCustomer(false)
    setCustSearch('')
    setShowCustDropdown(false)
  }

  function startNewCustomer() {
    setSelectedCustomer(null)
    setIsNewCustomer(true)
    setShowCustDropdown(false)
  }

  function updateLine(idx, patch) {
    setLineItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeLine(idx) {
    setLineItems(items => (items.length === 1 ? [blankItem()] : items.filter((_, i) => i !== idx)))
  }

  const totals = useMemo(() => computeLabourTotals({
    serviceCharge: parseFloat(serviceChargeStr),
    hallmarkCharge: parseFloat(hallmarkChargeStr),
  }), [serviceChargeStr, hallmarkChargeStr])

  const totalWeight = useMemo(
    () => lineItems.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0),
    [lineItems]
  )

  // Shared validation for BOTH save and preview. Returns an error message or null.
  function validateForm() {
    if (!invNo.trim()) return 'Voucher number is required'
    if (!selectedCustomer && !(isNewCustomer && newCust.name.trim())) return 'Select a customer or add a new one'
    const svc = parseFloat(serviceChargeStr)
    const hall = parseFloat(hallmarkChargeStr)
    if (serviceChargeStr.trim() === '' || isNaN(svc) || svc < 0) return 'Service charges must be a valid amount'
    if (hallmarkChargeStr.trim() !== '' && (isNaN(hall) || hall < 0)) return 'Hallmark charges must be a valid amount'
    if (svc <= 0 && hall <= 0) return 'Enter service charges or hallmark charges'
    const r = cleanLabourItems(lineItems)
    if (r.error) return r.error
    return null
  }

  // Resolve the picked/new customer into header fields. Creates the new
  // customer row first (cleaned phone, uppercased GSTIN) exactly like billing.
  async function resolveCustomer() {
    if (selectedCustomer) {
      return {
        customer_id: selectedCustomer.id ?? null,
        customer_name: selectedCustomer.name || '',
        customer_address: selectedCustomer.address || '',
        customer_phone: selectedCustomer.phone || '',
        customer_state: selectedCustomer.state || 'Haryana',
        customer_gstin: selectedCustomer.gstin || '',
      }
    }
    const name = newCust.name.trim()
    const cleanedPhoneVal = cleanPhone(newCust.phone)
    const { data: inserted, error } = await supabase.from('customers').insert({
      name,
      phone: cleanedPhoneVal,
      address: newCust.address.trim(),
      state: newCust.state || 'Haryana',
      aadhaar: newCust.aadhaar.trim(),
      pincode: newCust.pincode.trim(),
      gstin: newCust.gstin.trim().toUpperCase(),
    }).select('id').single()
    if (error) throw new Error('Failed to save customer: ' + error.message)
    const cust = {
      id: inserted.id, name, address: newCust.address.trim(),
      phone: cleanedPhoneVal, state: newCust.state || 'Haryana',
      gstin: newCust.gstin.trim().toUpperCase(), aadhaar: newCust.aadhaar.trim(),
    }
    setCustomers(prev => [...prev, cust])
    setSelectedCustomer(cust)
    setIsNewCustomer(false)
    return {
      customer_id: cust.id,
      customer_name: cust.name,
      customer_address: cust.address,
      customer_phone: cust.phone,
      customer_state: cust.state,
      customer_gstin: cust.gstin,
    }
  }

  function buildPayload(custFields, cleanedItems, previewSuffix) {
    return {
      id: editMode && !previewSuffix ? editJob.id : undefined,
      inv_no: previewSuffix ? `${invNo.trim()}/${previewSuffix}` : invNo.trim(),
      date,
      ...custFields,
      service_charge: totals.serviceCharge,
      service_taxable: totals.serviceTaxable,
      hallmark_charge: totals.hallmarkCharge,
      tax_pct: totals.taxPct,
      service_tax: totals.serviceTax,
      hallmark_tax: totals.hallmarkTax,
      tax_total: totals.taxTotal,
      grand_total: totals.grandTotal,
      notes: notes.trim(),
      created_by: profile?.id || null,
      items: cleanedItems,
    }
  }

  async function saveJob() {
    const vErr = validateForm()
    if (vErr) { addToast(vErr, 'error'); return }

    setSaving(true)
    try {
      const custFields = await resolveCustomer()
      const cleaned = cleanLabourItems(lineItems)
      const payload = buildPayload(custFields, cleaned.items, null)

      const { data, error } = await supabase.rpc('save_labour_job', { p_job: payload })
      if (error) {
        if (error.message?.includes('DUPLICATE_INV_NO')) {
          addToast(`Voucher ${payload.inv_no} is already in use — generating a fresh number`, 'error')
          await generateJobNoForce()
          return
        }
        if (error.code === 'PGRST202') {
          addToast('save_labour_job missing in DB — re-run sql/schema.sql in Supabase SQL Editor', 'error')
          return
        }
        throw new Error(error.message)
      }

      const saved = Array.isArray(data) ? data[0] : data
      logAction(editMode ? 'labour_job_updated' : 'labour_job_created', 'labour_jobs', saved?.job_id ?? null,
        { inv_no: saved?.job_inv_no || payload.inv_no, grand_total: totals.grandTotal, customer: custFields.customer_name })
      addToast(`Labour job ${saved?.job_inv_no || payload.inv_no} ${editMode ? 'updated' : 'saved'}`, 'success')

      if (editMode) {
        // Clears the parent's editJob — the cleanup effect resets the form and
        // regenerates a fresh voucher number. Also lets History re-edit this
        // same job immediately (the ref-based apply guard needs editJob gone).
        clearEdit()
      } else {
        await resetForm(true)
      }
    } catch (err) {
      console.error(err)
      addToast(err.message || 'Failed to save labour job', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Regenerate even in edit mode (duplicate-number recovery path)
  async function generateJobNoForce() {
    appliedEditRef.current = null
    editModeRef.current = false
    editJobRef.current = null
    const fy = financialYear()
    const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'labour').eq('fy', fy).maybeSingle()
    const seqNext = cur ? (parseInt(cur.last_no) || 0) + 1 : 1
    setInvNo(`SJS/LB/${fy}/${String(seqNext).padStart(3, '0')}`)
  }

  // Preview — renders via the edge function WITHOUT saving anything.
  async function previewJob() {
    const vErr = validateForm()
    if (vErr) { addToast(vErr, 'error'); return }

    setPreviewLoading(true)
    try {
      const custFields = selectedCustomer
        ? {
          customer_id: selectedCustomer.id ?? null,
          customer_name: selectedCustomer.name || '',
          customer_address: selectedCustomer.address || '',
          customer_phone: selectedCustomer.phone || '',
          customer_state: selectedCustomer.state || 'Haryana',
          customer_gstin: selectedCustomer.gstin || '',
        }
        : {
          customer_id: null,
          customer_name: newCust.name.trim(),
          customer_address: newCust.address.trim(),
          customer_phone: cleanPhone(newCust.phone),
          customer_state: newCust.state || 'Haryana',
          customer_gstin: newCust.gstin.trim().toUpperCase(),
        }
      const cleaned = cleanLabourItems(lineItems)
      const job = buildPayload(custFields, cleaned.items, 'Preview')

      const sess = await supabase.auth.getSession()
      const token = sess?.data?.session?.access_token
      if (!token) { addToast('Not authenticated', 'error'); return }

      const res = await fetch(FUNCTIONS_URL + '/generate-invoice-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ docType: 'labour', preview: true, job, items: cleaned.items, customer: selectedCustomer || null }),
      })
      if (!res.ok) {
        const t = await res.text()
        addToast('Preview error (' + res.status + '): ' + t, 'error')
        return
      }
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) addToast('Please allow popups to preview', 'warning')
    } catch (err) {
      console.error(err)
      addToast('Failed to generate preview', 'error')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div>
      {editMode && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid var(--accent, #b8860b)' }}>
          <span style={{ fontWeight: 600 }}>Editing voucher <span className="font-mono">{editJob?.inv_no}</span></span>
          <button className="btn btn-sm btn-outline" onClick={() => clearEdit()}>
            <Ban size={14} /> Cancel Edit
          </button>
        </div>
      )}

      {/* ─── Voucher details ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Voucher Details</h3></div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <div className="form-row three">
            <div className="form-group">
              <label className="label">Date *</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Voucher No. * (editable)</label>
              <input className="input font-mono" value={invNo} onChange={e => setInvNo(e.target.value)} placeholder="SJS/LB/{fy}/{seq}" />
            </div>
            <div className="form-group">
              <label className="label">Notes</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="optional" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Customer ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Customer</h3></div>
        <div ref={custRef} style={{ padding: '0.75rem 1rem', position: 'relative' }}>
          <div className="cust-search-wrapper">
            <Search size={16} className="cust-search-icon" />
            <input className="input cust-search-input" placeholder="Search customer by name, phone, aadhaar..." value={custSearch}
              onChange={e => { setCustSearch(e.target.value); setShowCustDropdown(true); setIsNewCustomer(false); setCustHighlightIdx(-1) }}
              onFocus={() => { if (custSearch) setShowCustDropdown(true) }}
              onKeyDown={handleCustKeyDown} />
          </div>
          {showCustDropdown && custSearch && (
            <div className="cust-dropdown">
              {filteredCustomers.map((c, i) => (
                <div key={c.id} className={`cust-option ${custHighlightIdx === i ? 'highlight' : ''}`} onMouseDown={() => selectCustomer(c)}
                  onMouseEnter={() => setCustHighlightIdx(i)}>
                  <span className="cust-option-name">{c.name}</span>
                  <span className="cust-option-phone">{c.phone}</span>
                </div>
              ))}
              <div className="cust-add-new" onMouseDown={startNewCustomer}>+ Add new customer</div>
            </div>
          )}
        </div>

        {selectedCustomer && (
          <div className="cust-details">
            <span className="cust-details-name">{selectedCustomer.name}</span>
            <span className="cust-details-muted">{selectedCustomer.phone}</span>
            <span className="cust-details-muted">{selectedCustomer.address}</span>
            <span className="cust-details-muted">{selectedCustomer.state}</span>
            {selectedCustomer.aadhaar && <span className="cust-details-muted">Aadhaar: {selectedCustomer.aadhaar}</span>}
            {selectedCustomer.gstin && <span className="cust-details-muted">GSTIN: {selectedCustomer.gstin}</span>}
            <button type="button" className="btn-icon btn-sm" onClick={() => { setSelectedCustomer(null); setIsNewCustomer(false) }} title="Change"><X size={16} /></button>
          </div>
        )}

        {isNewCustomer && (
          <div style={{ padding: '0 1rem 0.75rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Name *</label>
                <input className="input" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Phone</label>
                <input className="input" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group full">
                <label className="label">Address</label>
                <input className="input" value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} />
              </div>
            </div>
            <div className="form-row four">
              <div className="form-group">
                <label className="label">State</label>
                <input className="input" value={newCust.state} onChange={e => setNewCust({ ...newCust, state: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Aadhaar</label>
                <input className="input" value={newCust.aadhaar} onChange={e => setNewCust({ ...newCust, aadhaar: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Pincode</label>
                <input className="input" value={newCust.pincode} onChange={e => setNewCust({ ...newCust, pincode: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">GSTIN</label>
                <input className="input" value={newCust.gstin} onChange={e => setNewCust({ ...newCust, gstin: e.target.value.toUpperCase() })} placeholder="optional" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Items (customer's metal) ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3 className="card-title">Items — Metal Received from Customer</h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setLineItems(items => [...items, blankItem()])}>
            <Plus size={14} /> Add Item
          </button>
        </div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  <th>Item Name</th>
                  <th style={{ width: '110px' }}>Purity</th>
                  <th style={{ width: '130px' }}>Weight (g)</th>
                  <th style={{ width: '44px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((it, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <input className="input" style={{ width: '100%' }} placeholder="e.g. Chain, Bangles…" value={it.item_name}
                        onChange={e => updateLine(idx, { item_name: e.target.value })} maxLength={100} />
                    </td>
                    <td>
                      <select className="input" style={{ width: '100%' }} value={it.purity}
                        onChange={e => updateLine(idx, { purity: e.target.value })}>
                        {LABOUR_PURITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="number" step="0.001" min="0" className="input" style={{ width: '100%', textAlign: 'right' }} placeholder="0.000"
                        value={it.weight} onChange={e => updateLine(idx, { weight: e.target.value })} />
                    </td>
                    <td>
                      <button type="button" className="btn-icon btn-sm" title="Remove"
                        onClick={() => removeLine(idx)} disabled={lineItems.length === 1}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3" style={{ textAlign: 'right', fontWeight: 700 }}>Total Weight</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalWeight.toFixed(3)} g</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Charges & Totals ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Charges</h3></div>
        <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Service Charges ₹ * <span className="text-xs text-muted">(incl. {totals.taxPct}% GST)</span></label>
                <input type="number" step="0.01" min="0" className="input" style={{ textAlign: 'right' }} placeholder="e.g. 10000"
                  value={serviceChargeStr} onChange={e => setServiceChargeStr(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label">Hallmark Charges ₹ <span className="text-xs text-muted">(GST {totals.taxPct}% extra)</span></label>
                <input type="number" step="0.01" min="0" className="input" style={{ textAlign: 'right' }} placeholder="e.g. 500"
                  value={hallmarkChargeStr} onChange={e => setHallmarkChargeStr(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
              The service amount you type is what the customer pays for services — tax is shown separately on the print, back-calculated from it.
            </p>
          </div>

          <div style={{ minWidth: '260px', flexShrink: 0 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem 1rem', background: 'var(--bg-card, transparent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span className="text-muted">Service Charges (you enter)</span>
                <span className="font-mono">{fmt(totals.serviceCharge)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span className="text-muted">&nbsp;&nbsp;├ Taxable Value</span>
                <span className="font-mono text-muted">{fmt(totals.serviceTaxable)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span className="text-muted">&nbsp;&nbsp;└ GST @{totals.taxPct}%</span>
                <span className="font-mono text-muted">{fmt(totals.serviceTax)}</span>
              </div>
              {totals.hallmarkCharge > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    <span className="text-muted">Hallmark Charges</span>
                    <span className="font-mono">{fmt(totals.hallmarkCharge)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span className="text-muted">&nbsp;&nbsp;└ GST @{totals.taxPct}%</span>
                    <span className="font-mono text-muted">{fmt(totals.hallmarkTax)}</span>
                  </div>
                </>
              )}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem' }}>
                <span>Grand Total</span>
                <span className="font-mono">{fmt(totals.grandTotal)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={previewJob} disabled={previewLoading || saving}>
                <Eye size={16} /> {previewLoading ? 'Generating…' : 'Preview'}
              </button>
              <button className="btn" onClick={saveJob} disabled={saving || previewLoading}>
                <Save size={16} /> {saving ? 'Saving…' : editMode ? 'Update Job' : 'Save Job'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ HISTORY TAB ═══════════════════════ */

function HistoryTab({ onEdit }) {
  const { addToast } = useToast()

  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [printingId, setPrintingId] = useState(null)

  useEffect(() => { loadJobs(true) }, [])

  async function loadJobs(reset = true) {
    setLoading(true)
    try {
      const start = reset ? 0 : offset
      const { data, error } = await supabase.from('labour_jobs')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(start, start + PAGE_SIZE - 1)
      if (error) throw error
      const rows = data || []
      setJobs(prev => reset ? rows : [...prev, ...rows])
      setOffset(start + rows.length)
      setHasMore(rows.length === PAGE_SIZE)

      const ids = rows.map(r => r.id)
      if (ids.length > 0) {
        const { data: its, error: ie } = await supabase.from('labour_job_items')
          .select('job_id, weight').in('job_id', ids)
        if (ie) throw ie
        setStats(prev => {
          const next = reset ? {} : { ...prev }
          for (const it of its || []) {
            const s = next[it.job_id] || { count: 0, wt: 0 }
            s.count += 1
            s.wt += parseFloat(it.weight) || 0
            next[it.job_id] = s
          }
          return next
        })
      } else if (reset) {
        setStats({})
      }
    } catch (e) {
      console.error(e)
      const missing = e?.code === 'PGRST202' || e?.message?.includes('schema cache') || e?.message?.includes('does not exist')
      addToast(missing
        ? 'Labour tables/RPC missing — re-run sql/schema.sql in Supabase SQL Editor'
        : 'Failed to load labour jobs: ' + (e.message || 'unknown error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim()
    const digits = cleanPhone(search)
    return jobs.filter(j => {
      if (s && !(j.inv_no?.toLowerCase().includes(s) || j.customer_name?.toLowerCase().includes(s) ||
        (digits && j.customer_phone?.includes(digits)))) return false
      if (dateFrom && j.date < dateFrom) return false
      if (dateTo && j.date > dateTo) return false
      return true
    })
  }, [jobs, search, dateFrom, dateTo])

  async function printJob(job) {
    setPrintingId(job.id)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess?.data?.session?.access_token
      if (!token) { addToast('Not authenticated', 'error'); setPrintingId(null); return }
      const res = await fetch(FUNCTIONS_URL + '/generate-invoice-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ docType: 'labour', jobId: job.id })
      })
      if (!res.ok) {
        const errText = await res.text()
        addToast('Print error (' + res.status + '): ' + errText, 'error')
        setPrintingId(null)
        return
      }
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) addToast('Please allow popups to print', 'warning')
      setPrintingId(null)
    } catch (e) {
      console.error(e)
      addToast('Failed to generate print', 'error')
      setPrintingId(null)
    }
  }

  async function startEdit(job) {
    try {
      const { data: its, error } = await supabase.from('labour_job_items')
        .select('*').eq('job_id', job.id).order('sno')
      if (error) throw error
      onEdit({ ...job, items: its || [] })
    } catch (e) {
      console.error(e)
      addToast('Failed to load job items: ' + (e.message || ''), 'error')
    }
  }

  async function deleteJob() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase.rpc('delete_labour_job', { p_job_id: confirmDelete.id })
      if (error) {
        if (error.code === 'PGRST202') {
          addToast('delete_labour_job missing in DB — re-run sql/schema.sql in Supabase SQL Editor', 'error')
        } else {
          addToast('Delete failed: ' + error.message, 'error')
        }
        return
      }
      logAction('labour_job_deleted', 'labour_jobs', confirmDelete.id, { inv_no: confirmDelete.inv_no })
      addToast(`Voucher ${confirmDelete.inv_no} deleted`, 'success')
      loadJobs(true)
    } catch (e) {
      console.error(e)
      addToast('Delete failed: ' + (e.message || ''), 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Saved Labour Jobs</h3>
      </div>
      <div className="filter-bar" style={{ display: 'flex', gap: '0.6rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ maxWidth: '260px' }} placeholder="Search voucher / customer / phone…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <input type="date" className="input" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
        <span className="text-xs text-muted">to</span>
        <input type="date" className="input" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
        {(search || dateFrom || dateTo) && (
          <button className="btn btn-sm btn-outline" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
            <X size={14} /> Clear
          </button>
        )}
        <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{filtered.length} shown</span>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }} className="text-muted">
          No labour jobs found. Create one from the “New Job” tab.
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th style={{ textAlign: 'right' }}>Weight (g)</th>
                <th style={{ textAlign: 'right' }}>Service</th>
                <th style={{ textAlign: 'right' }}>Hallmark</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Grand Total</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => {
                const st = stats[j.id] || { count: 0, wt: 0 }
                return (
                  <tr key={j.id}>
                    <td className="text-xs">{j.date}</td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{j.inv_no}</td>
                    <td>{j.customer_name}</td>
                    <td style={{ textAlign: 'right' }}>{st.count}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono">{st.wt.toFixed(3)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono">{fmt(j.service_charge)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono">{fmt(j.hallmark_charge)}</td>
                    <td style={{ textAlign: 'right' }} className="font-mono">{fmt(j.tax_total)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="font-mono">{fmt(j.grand_total)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button className="btn-icon btn-sm" title="Print" onClick={() => printJob(j)} disabled={printingId === j.id}>
                        <Printer size={15} />
                      </button>
                      <button className="btn-icon btn-sm" title="Edit" onClick={() => startEdit(j)}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn-icon btn-sm" title="Delete" onClick={() => setConfirmDelete(j)}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && !loading && (
        <div style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
          <button className="btn btn-outline" onClick={() => loadJobs(false)}>Load More</button>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !deleting) setConfirmDelete(null) }}>
          <div className="modal-card" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete Voucher</h3>
              <button className="modal-close" disabled={deleting} onClick={() => setConfirmDelete(null)}>&times;</button>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              <p style={{ marginBottom: '1rem' }}>
                Delete labour voucher <strong className="font-mono">{confirmDelete.inv_no}</strong> for{' '}
                <strong>{confirmDelete.customer_name}</strong>? This cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-outline" disabled={deleting} onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={deleteJob} disabled={deleting}>
                  <Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
