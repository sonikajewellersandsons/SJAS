import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, ROLE_COLORS } from '../lib/supabase'
import { User, Mail, Shield, Calendar, LogOut } from 'lucide-react'

export default function ProfilePage() {
  const { profile, signOut } = useAuth()
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleLogout() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
    setShowConfirm(false)
  }

  return (
    <div className="page">
      <div className="page-header"><h2>Profile</h2></div>

      <div className="profile-page" style={{ margin: '0 auto' }}>
        <div className="profile-header">
          <div className="profile-avatar">
            <User size={28} />
          </div>
          <h2 className="profile-name">{profile?.name || 'User'}</h2>
          <p className="profile-email">{profile?.email}</p>
          <span className="profile-role-badge" style={{ background: `${ROLE_COLORS[profile?.role] || '#888'}20`, color: ROLE_COLORS[profile?.role] || '#888' }}>
            <Shield size={14} />
            {ROLE_LABELS[profile?.role] || profile?.role}
          </span>
        </div>

        <div className="profile-card">
          <div className="profile-field">
            <span className="field-label"><Mail size={14} /> Email</span>
            <span className="field-value">{profile?.email}</span>
          </div>
          <div className="profile-field">
            <span className="field-label"><Shield size={14} /> Role</span>
            <span className="field-value">{ROLE_LABELS[profile?.role] || profile?.role}</span>
          </div>
          <div className="profile-field">
            <span className="field-label"><Calendar size={14} /> Joined</span>
            <span className="field-value">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN') : '—'}</span>
          </div>
        </div>

        <button className="logout-btn" onClick={() => setShowConfirm(true)}>
          <LogOut size={18} /> Sign Out
        </button>
      </div>

      {showConfirm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}>
          <div className="modal-card" style={{ maxWidth: '380px', textAlign: 'center', padding: '2rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <LogOut size={32} style={{ color: 'var(--accent)', marginBottom: '0.75rem' }} />
              <h3 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Sign Out</h3>
              <p className="text-sm text-muted">Are you sure you want to sign out?</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLogout}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
