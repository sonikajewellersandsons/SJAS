import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import { logAction } from '../lib/audit'
import { Plus, Search, X, Edit2, Trash2 } from 'lucide-react'

const PAGE_SIZE = 500

export default function CustomersPage() {
  const { addToast } = useToast()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', address: '', phone: '', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadCustomers() }, [])

  async function loadCustomers() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('customers').select('*').order('name').range(0, PAGE_SIZE)
      if (error) addToast('Failed to load customers', 'error')
      setCustomers((data || []).slice(0, PAGE_SIZE))
      setHasMore((data || []).length > PAGE_SIZE)
    } catch (err) { addToast('Failed to load customers', 'error') }
    finally { setLoading(false) }
  }

  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const { data, error } = await supabase.from('customers').select('*').order('name').range(customers.length, customers.length + PAGE_SIZE)
      if (error) { addToast('Failed to load customers', 'error') } else if (data) {
        setCustomers(prev => [...prev, ...data.slice(0, PAGE_SIZE)])
        setHasMore(data.length > PAGE_SIZE)
      }
    } catch (err) { addToast('Failed to load customers', 'error') }
    finally { setLoadingMore(false) }
  }

  function resetForm() {
    setForm({ name: '', address: '', phone: '', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' })
    setEditing(null)
    setShowForm(false)
  }

  function editCustomer(c) {
    setForm({ name: c.name, address: c.address, phone: c.phone, state: c.state, aadhaar: c.aadhaar, pan: c.pan, pincode: c.pincode, gstin: c.gstin || '' })
    setEditing(c.id)
    setShowForm(true)
  }

  async function saveCustomer(e) {
    e.preventDefault()
    setSaving(true)
    if (!form.name.trim()) { addToast('Customer name is required', 'error'); setSaving(false); return }
    if (!form.phone.trim()) { addToast('Phone is required', 'error'); setSaving(false); return }
    const cleanedPhone = form.phone.trim().replace(/^\+91\s*/, '').replace(/\D/g, '')
    if (cleanedPhone.length !== 10) { addToast('Phone must be exactly 10 digits', 'error'); setSaving(false); return }
    if (!form.address.trim()) { addToast('Address is required', 'error'); setSaving(false); return }
    try {
      const payload = { ...form, name: form.name.trim(), phone: cleanedPhone, gstin: form.gstin.trim().toUpperCase() }
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing)
        if (error) throw error
        addToast('Customer updated', 'success')
        logAction('customer_updated', 'customers', editing, { name: payload.name, phone: payload.phone })
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
        addToast('Customer added', 'success')
        logAction('customer_created', 'customers', null, { name: payload.name, phone: payload.phone })
      }
      resetForm(); loadCustomers()
    } catch (err) { addToast(err.message || 'Failed to save customer', 'error') }
    finally { setSaving(false) }
  }

  async function deleteCustomer(id, name) {
    setConfirmDelete({ id, name })
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { id, name } = confirmDelete
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      addToast(error.code === '23503' ? `Cannot delete "${name}" — linked to existing invoices.` : error.message, 'error')
      setDeleting(false)
      setConfirmDelete(null)
      return
    }
    addToast('Customer deleted', 'success')
    logAction('customer_deleted', 'customers', id, { name })
    setDeleting(false)
    setConfirmDelete(null)
    loadCustomers()
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const digits = search.trim().replace(/^\+91\s*/, '').replace(/\D/g, '')
    return c.name.toLowerCase().includes(q) ||
      c.phone?.includes(search) ||
      c.phone?.includes(digits) ||
      c.address?.toLowerCase().includes(q)
  })

  if (loading) return <div className="page"><div className="page-header"><h2>Customers</h2></div><div className="loading-center"><div className="spinner" /></div></div>

  return (
    <div className="page">
      <div className="page-header"><h2>Customers</h2></div>

      <div className="filter-bar">
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Search by name, phone, address..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>State</th>
              <th>Aadhaar</th>
              <th>Pincode</th>
              <th>GSTIN</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td className="font-mono text-sm">{c.phone}</td>
                <td className="text-sm text-secondary">{c.address}</td>
                <td className="text-sm">{c.state}</td>
                <td className="font-mono text-xs text-muted">{c.aadhaar || '—'}</td>
                <td className="text-sm text-secondary">{c.pincode || '—'}</td>
                <td className="font-mono text-xs text-muted">{c.gstin || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon btn-sm" onClick={() => editCustomer(c)} title="Edit">
                      <Edit2 size={15} />
                    </button>
                    <button className="btn-icon btn-sm" onClick={() => deleteCustomer(c.id, c.name)} title="Delete" style={{ color: 'var(--red)' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9}><div className="empty-state"><p>No customers found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load more customers'}
          </button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Edit Customer' : 'Add Customer'}</h3>
              <button className="modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <form onSubmit={saveCustomer}>
              <div className="form-row">
                <div className="form-group full">
                  <label className="label">Name *</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">State</label>
                  <ComboBox
                    options={[
                      { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
                      { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
                      { value: 'Assam', label: 'Assam' },
                      { value: 'Bihar', label: 'Bihar' },
                      { value: 'Chhattisgarh', label: 'Chhattisgarh' },
                      { value: 'Goa', label: 'Goa' },
                      { value: 'Gujarat', label: 'Gujarat' },
                      { value: 'Haryana', label: 'Haryana' },
                      { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
                      { value: 'Jharkhand', label: 'Jharkhand' },
                      { value: 'Karnataka', label: 'Karnataka' },
                      { value: 'Kerala', label: 'Kerala' },
                      { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
                      { value: 'Maharashtra', label: 'Maharashtra' },
                      { value: 'Manipur', label: 'Manipur' },
                      { value: 'Meghalaya', label: 'Meghalaya' },
                      { value: 'Mizoram', label: 'Mizoram' },
                      { value: 'Nagaland', label: 'Nagaland' },
                      { value: 'Odisha', label: 'Odisha' },
                      { value: 'Punjab', label: 'Punjab' },
                      { value: 'Rajasthan', label: 'Rajasthan' },
                      { value: 'Sikkim', label: 'Sikkim' },
                      { value: 'Tamil Nadu', label: 'Tamil Nadu' },
                      { value: 'Telangana', label: 'Telangana' },
                      { value: 'Tripura', label: 'Tripura' },
                      { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
                      { value: 'Uttarakhand', label: 'Uttarakhand' },
                      { value: 'West Bengal', label: 'West Bengal' },
                      { value: 'Andaman and Nicobar Islands', label: 'Andaman and Nicobar Islands' },
                      { value: 'Chandigarh', label: 'Chandigarh' },
                      { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra and Nagar Haveli and Daman and Diu' },
                      { value: 'Delhi', label: 'Delhi' },
                      { value: 'Jammu and Kashmir', label: 'Jammu and Kashmir' },
                      { value: 'Ladakh', label: 'Ladakh' },
                      { value: 'Lakshadweep', label: 'Lakshadweep' },
                      { value: 'Puducherry', label: 'Puducherry' },
                    ]}
                    value={form.state}
                    onChange={val => setForm({ ...form, state: val })}
                    placeholder="Type to search state..."
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group full">
                  <label className="label">Address</label>
                  <textarea className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} maxLength={500} />
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label className="label">Aadhaar No.</label>
                  <input className="input" value={form.aadhaar} onChange={e => setForm({ ...form, aadhaar: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">PAN</label>
                  <input className="input" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Pincode</label>
                  <input className="input" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">GSTIN</label>
                  <input className="input" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="e.g. 06AABCU9603R1ZX" />
                </div>
              </div>
              <div className="flex gap-1" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : (editing ? 'Update' : 'Add')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setConfirmDelete(null); setDeleting(false) } }}>
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Delete Customer</h3>
              <button className="modal-close" onClick={() => { setConfirmDelete(null); setDeleting(false) }}><X size={20} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem' }}>
              <p>Delete customer <strong>"{confirmDelete.name}"</strong>? This cannot be undone.</p>
            </div>
            <div className="flex gap-1" style={{ justifyContent: 'flex-end', padding: '0 1.5rem 1.25rem' }}>
              <button className="btn btn-outline" onClick={() => { setConfirmDelete(null); setDeleting(false) }}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
