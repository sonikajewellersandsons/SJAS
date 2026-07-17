import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StockPage from './pages/StockPage'
import CustomersPage from './pages/CustomersPage'
import BillingPage from './pages/BillingPage'
import InvoiceHistoryPage from './pages/InvoiceHistoryPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import SalesPage from './pages/SalesPage'
import InwardSupplyPage from './pages/InwardSupplyPage'
import { LayoutDashboard, Package, Users, FileText, Receipt, BarChart3, Settings, User, LogOut, Gem, ShoppingBag, RotateCcw } from 'lucide-react'

function AppLayout() {
  const { profile, loading, hasPermission, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <p className="text-muted text-sm">Loading…</p>
    </div>
  )

  if (!profile) return <LoginPage />

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'allow_reports' },
    { path: '/stock', label: 'Stock', icon: Package, permission: 'allow_stock_view' },
    { path: '/customers', label: 'Customers', icon: Users, permission: 'allow_customers' },
    { path: '/billing', label: 'Billing', icon: FileText, permission: 'allow_billing' },
    { path: '/invoices', label: 'Invoices', icon: Receipt, permission: 'allow_billing' },
    { path: '/inward-supply', label: 'Inward Supply', icon: RotateCcw, permission: 'allow_billing' },
    { path: '/sales', label: 'Sales', icon: ShoppingBag, permission: 'allow_reports' },
    { path: '/reports', label: 'Reports', icon: BarChart3, permission: 'allow_reports' },
  ]

  const visibleNavItems = navItems.filter(item => {
    if (!item.permission) return true
    return hasPermission(item.permission)
  })

  const bottomItems = [
    ...(hasPermission('allow_settings') ? [{ path: '/settings', label: 'Settings', icon: Settings }] : []),
    { path: '/profile', label: 'Profile', icon: User },
  ]

  function isActive(path) {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Gem size={24} />
          </div>
          <span>SJS Jewellery</span>
        </div>

        <nav className="sidebar-nav">
          {visibleNavItems.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={`sidebar-item ${isActive(path) ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav">
          {bottomItems.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              className={`sidebar-item ${isActive(path) ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              <User size={16} />
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{profile?.name}</span>
              <span className="sidebar-user-role">{profile?.role}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={() => signOut()} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={hasPermission('allow_reports') ? <DashboardPage /> : <Navigate to="/profile" replace />} />
          <Route path="/stock" element={hasPermission('allow_stock_view') ? <StockPage /> : <Navigate to="/" replace />} />
          <Route path="/customers" element={hasPermission('allow_customers') ? <CustomersPage /> : <Navigate to="/" replace />} />
          <Route path="/billing" element={hasPermission('allow_billing') ? <BillingPage /> : <Navigate to="/" replace />} />
          <Route path="/invoices" element={hasPermission('allow_billing') ? <InvoiceHistoryPage /> : <Navigate to="/" replace />} />
          <Route path="/inward-supply" element={hasPermission('allow_billing') ? <InwardSupplyPage /> : <Navigate to="/" replace />} />
          <Route path="/sales" element={hasPermission('allow_reports') ? <SalesPage /> : <Navigate to="/" replace />} />
          <Route path="/reports" element={hasPermission('allow_reports') ? <ReportsPage /> : <Navigate to="/" replace />} />
          <Route path="/settings" element={hasPermission('allow_settings') ? <SettingsPage /> : <Navigate to="/" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
