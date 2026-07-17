import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Building2, Banknote, Users, ShieldCheck } from 'lucide-react'

const TABS = [
  { key: 'shop', label: 'Shop Details', icon: Building2 },
  { key: 'bank', label: 'Bank Details', icon: Banknote },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'roles', label: 'Roles', icon: ShieldCheck },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('shop')

  return (
    <div className="page">
      <div className="page-header"><h2>Settings</h2></div>
      <div className="tab-container">
        {TABS.map(tab => (
          <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'shop' && <ShopDetailsTab />}
      {activeTab === 'bank' && <BankDetailsTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'roles' && <RolesTab />}
    </div>
  )
}

/* ─── SHOP DETAILS TAB ─────────────────────────────── */

function ShopDetailsTab() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    shop_name: '', shop_address: '', shop_gstin: '', shop_phone: '',
    shop_email: '', shop_state: '', shop_city: '', shop_pan: '',
    declaration: '', fy_start: '',
  })

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('key, value')
    if (error) { addToast('Failed to load settings', 'error'); setLoading(false); return }
    const map = {}
    for (const row of (data || [])) {
      const v = row.value
      map[row.key] = typeof v === 'string' ? v : JSON.stringify(v)
    }
    const rawVal = (key) => {
      const v = map[key]
      if (!v) return ''
      try { return JSON.parse(v) } catch { return v }
    }
    setForm({
      shop_name: rawVal('shop_name'),
      shop_address: rawVal('shop_address'),
      shop_gstin: rawVal('shop_gstin'),
      shop_phone: rawVal('shop_phone'),
      shop_email: rawVal('shop_email'),
      shop_state: rawVal('shop_state'),
      shop_city: rawVal('shop_city'),
      shop_pan: rawVal('shop_pan'),
      declaration: rawVal('declaration'),
      fy_start: rawVal('fy_start'),
    })
    setLoading(false)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const entries = Object.entries(form).map(([key, value]) => ({
      key, value: JSON.stringify(value)
    }))
    const { error } = await supabase.from('settings').upsert(entries, { onConflict: 'key' })
    if (error) { addToast(error.message, 'error'); setSaving(false); return }
    addToast('Settings saved', 'success')
    setSaving(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <form onSubmit={save}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Shop Information</h3></div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Shop Name</label>
              <input className="input" value={form.shop_name} onChange={e => setForm({...form, shop_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">GSTIN</label>
              <input className="input" value={form.shop_gstin} onChange={e => setForm({...form, shop_gstin: e.target.value.toUpperCase()})} placeholder="e.g. 06AABCU9603R1ZX" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group full">
              <label className="label">Address</label>
              <textarea className="input" value={form.shop_address} onChange={e => setForm({...form, shop_address: e.target.value})} rows={2} />
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group">
              <label className="label">City</label>
              <input className="input" value={form.shop_city} onChange={e => setForm({...form, shop_city: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">State</label>
              <input className="input" value={form.shop_state} onChange={e => setForm({...form, shop_state: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">PAN</label>
              <input className="input" value={form.shop_pan} onChange={e => setForm({...form, shop_pan: e.target.value.toUpperCase()})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Phone</label>
              <input className="input" value={form.shop_phone} onChange={e => setForm({...form, shop_phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.shop_email} onChange={e => setForm({...form, shop_email: e.target.value})} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Invoice Defaults</h3></div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <div className="form-row">
            <div className="form-group full">
              <label className="label">Declaration Text</label>
              <textarea className="input" value={form.declaration} onChange={e => setForm({...form, declaration: e.target.value})} rows={3} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Financial Year Start</label>
              <input className="input" type="date" value={form.fy_start} onChange={e => setForm({...form, fy_start: e.target.value})} />
            </div>
          </div>
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  )
}

/* ─── BANK DETAILS TAB ─────────────────────────────── */

function BankDetailsTab() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    bank_name: '', account_holder: '', account_no: '', ifsc: '', branch: '',
  })

  useEffect(() => { loadBank() }, [])

  async function loadBank() {
    setLoading(true)
    const { data, error } = await supabase.from('settings').select('value').eq('key', 'bank_details').maybeSingle()
    if (error) { addToast('Failed to load bank details', 'error'); setLoading(false); return }
    if (data?.value) {
      const b = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
      setForm({
        bank_name: b.bank_name || '',
        account_holder: b.account_holder || '',
        account_no: b.account_no || '',
        ifsc: b.ifsc || '',
        branch: b.branch || '',
      })
    }
    setLoading(false)
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('settings').upsert(
      { key: 'bank_details', value: JSON.stringify(form) },
      { onConflict: 'key' }
    )
    if (error) { addToast(error.message, 'error'); setSaving(false); return }
    addToast('Bank details saved', 'success')
    setSaving(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <form onSubmit={save}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h3 className="card-title">Bank Details</h3></div>
        <div style={{ padding: '0.75rem 1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Bank Name</label>
              <input className="input" value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">Account Holder</label>
              <input className="input" value={form.account_holder} onChange={e => setForm({...form, account_holder: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Account No.</label>
              <input className="input" value={form.account_no} onChange={e => setForm({...form, account_no: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="label">IFSC Code</label>
              <input className="input" value={form.ifsc} onChange={e => setForm({...form, ifsc: e.target.value.toUpperCase()})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group full">
              <label className="label">Branch</label>
              <input className="input" value={form.branch} onChange={e => setForm({...form, branch: e.target.value})} />
            </div>
          </div>
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
        {saving ? 'Saving...' : 'Save Bank Details'}
      </button>
    </form>
  )
}

/* ─── USERS TAB ─────────────────────────────────────── */

function UsersTab() {
  const { addToast } = useToast()
  const { profile: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    const [usersRes, rolesRes] = await Promise.all([
      supabase.from('users').select('*').order('name'),
      supabase.from('role_masters').select('*').order('role'),
    ])
    if (usersRes.error) addToast('Failed to load users', 'error')
    if (rolesRes.error) addToast('Failed to load roles', 'error')
    setUsers(usersRes.data || [])
    setRoles(rolesRes.data || [])
    setLoading(false)
  }

  async function updateRole(userId, newRole) {
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
    if (error) { addToast(error.message, 'error'); return }
    addToast('User role updated', 'success')
    loadUsers()
  }

  async function toggleActive(userId, current) {
    const { error } = await supabase.from('users').update({ is_active: !current }).eq('id', userId)
    if (error) { addToast(error.message, 'error'); return }
    addToast(`User ${current ? 'deactivated' : 'activated'}`, 'success')
    loadUsers()
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Users</h3></div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id}>
                <td className="text-xs text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{u.name} {u.id === currentUser?.id && <span className="badge badge-green" style={{ fontSize: '10px' }}>You</span>}</td>
                <td className="text-sm text-secondary">{u.email}</td>
                <td>
                  <select className="input" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                    value={u.role}
                    onChange={e => updateRole(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                  >
                    {roles.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => toggleActive(u.id, u.is_active)}
                    disabled={u.id === currentUser?.id}
                    style={{ color: u.is_active ? 'var(--red)' : 'var(--green)', fontSize: '0.75rem' }}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6}><div className="empty-state"><p>No users found</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── ROLES TAB ─────────────────────────────────────── */

function RolesTab() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRoles() }, [])

  async function loadRoles() {
    setLoading(true)
    const { data, error } = await supabase.from('role_masters').select('*').order('role')
    if (error) console.error('Failed to load roles:', error)
    setRoles(data || [])
    setLoading(false)
  }

  const PERM_LABELS = {
    allow_billing: 'Billing',
    allow_stock_view: 'Stock View',
    allow_stock_edit: 'Stock Edit',
    allow_customers: 'Customers',
    allow_reports: 'Reports',
    allow_settings: 'Settings',
    allow_item_master: 'Item Master',
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Role Permissions</h3></div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Role</th>
              {Object.values(PERM_LABELS).map(label => <th key={label} style={{ textAlign: 'center', fontSize: '0.75rem' }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => {
              const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || {})
              return (
                <tr key={r.id}>
                  <td className="text-xs text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{r.label}</td>
                  {Object.keys(PERM_LABELS).map(permKey => (
                    <td key={permKey} style={{ textAlign: 'center' }}>
                      <span className={`badge ${perms[permKey] ? 'badge-green' : 'badge-red'}`}>
                        {perms[permKey] ? '✓' : '✗'}
                      </span>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
