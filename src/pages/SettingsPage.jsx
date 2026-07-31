import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { logAction } from '../lib/audit'
import { Building2, Banknote, Users, ShieldCheck, History, RotateCcw } from 'lucide-react'

const TABS = [
  { key: 'shop', label: 'Shop Details', icon: Building2 },
  { key: 'bank', label: 'Bank Details', icon: Banknote },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'roles', label: 'Roles', icon: ShieldCheck },
  { key: 'logs', label: 'Activity Log', icon: History },
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
      {activeTab === 'logs' && <ActivityLogTab />}
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
    logAction('settings_saved', 'settings', null, { keys: Object.keys(form) })
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
      let b = {}
    try { b = data.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : {} } catch { b = {} }
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
    logAction('bank_details_saved', 'settings', null, { bank_name: form.bank_name })
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
    logAction('user_role_updated', 'users', userId, { role: newRole })
    loadUsers()
  }

  async function toggleActive(userId, current) {
    const { error } = await supabase.from('users').update({ is_active: !current }).eq('id', userId)
    if (error) { addToast(error.message, 'error'); return }
    addToast(`User ${current ? 'deactivated' : 'activated'}`, 'success')
    logAction(current ? 'user_deactivated' : 'user_activated', 'users', userId)
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
                    {roles.map(r => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
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
              const perms = (() => {
                if (typeof r.permissions === 'string') {
                  try { return JSON.parse(r.permissions) } catch { return {} }
                }
                return r.permissions || {}
              })()
              return (
                <tr key={r.id}>
                  <td className="text-xs text-muted">{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{r.label || r.role}</td>
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

/* ─── ACTIVITY LOG TAB ───────────────────────────────── */

const ACTION_LABELS = {
  login: 'Login',
  logout: 'Logout',
  invoice_created: 'Invoice created',
  invoice_updated: 'Invoice updated',
  invoice_deleted: 'Invoice deleted',
  voucher_created: 'Inward voucher created',
  voucher_updated: 'Inward voucher updated',
  voucher_deleted: 'Inward voucher deleted',
  purchase_created: 'Purchase created',
  item_created: 'Item created',
  item_updated: 'Item updated',
  item_deleted: 'Item deleted',
  customer_created: 'Customer created',
  customer_updated: 'Customer updated',
  customer_deleted: 'Customer deleted',
  material_purchase_created: 'Material purchase created',
  material_purchase_updated: 'Material purchase updated',
  material_purchase_deleted: 'Material purchase deleted',
  settings_saved: 'Settings saved',
  bank_details_saved: 'Bank details saved',
  user_role_updated: 'User role updated',
  user_activated: 'User activated',
  user_deactivated: 'User deactivated',
}

function fmtDetails(details) {
  if (!details || typeof details !== 'object') return ''
  return Object.entries(details)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    .join(', ')
}

function ActivityLogTab() {
  const { addToast } = useToast()
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadLogs() }, [])

  async function loadLogs() {
    setLoading(true)
    const [logRes, userRes] = await Promise.all([
      supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('users').select('id, name').order('name'),
    ])
    if (logRes.error) addToast('Failed to load activity log', 'error')
    if (userRes.error) addToast('Failed to load users', 'error')
    setLogs(logRes.data || [])
    setUsers(userRes.data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const userMap = {}
  for (const u of users) userMap[u.id] = u.name

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Activity Log</h3>
        <button className="btn btn-sm btn-outline" onClick={loadLogs}><RotateCcw size={14} /> Refresh</button>
      </div>
      {logs.length === 0 ? (
        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No activity recorded yet</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="text-xs text-secondary" style={{ whiteSpace: 'nowrap' }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="text-sm" style={{ fontWeight: 600 }}>{userMap[l.user_id] || '—'}</td>
                  <td><span className="badge badge-blue">{ACTION_LABELS[l.action] || l.action}</span></td>
                  <td className="text-xs text-secondary">{fmtDetails(l.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
