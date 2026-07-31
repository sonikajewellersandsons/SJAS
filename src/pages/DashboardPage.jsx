import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Package, Users, FileText, TrendingUp } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const { addToast } = useToast()
  const [stats, setStats] = useState({ items: 0, customers: 0, invoices: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const results = await Promise.allSettled([
        supabase.from('item_master').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('invoices').select('id', { count: 'exact', head: true }),
      ])
      const counts = { items: 0, customers: 0, invoices: 0 }
      const labels = ['items', 'customers', 'invoices']
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          addToast(r.reason?.message || `Query ${i} failed`, 'error')
        } else if (r.value?.count != null) {
          counts[labels[i]] = r.value.count
        }
      })
      setStats(counts)
    } catch (err) {
      addToast('Failed to load dashboard stats', 'error')
    } finally {
      setLoading(false)
    }
  }

  const cards = [
    { label: 'Active Items', value: stats.items, icon: Package, color: 'var(--accent)' },
    { label: 'Customers', value: stats.customers, icon: Users, color: 'var(--blue)' },
    { label: 'Invoices', value: stats.invoices, icon: FileText, color: 'var(--green)' },
  ]

  if (loading) return (
    <div className="page">
      <div className="page-header"><h2>Dashboard</h2></div>
      <div className="loading-center"><div className="spinner" /></div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Welcome, {profile?.name || 'User'}</p>
      </div>

      <div className="stats-grid">
        {cards.map(card => (
          <div key={card.label} className="stat-card">
            <div className="stat-icon" style={{ background: `${card.color}15` }}>
              <card.icon size={20} color={card.color} />
            </div>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
