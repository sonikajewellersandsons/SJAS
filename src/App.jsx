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
import MaterialPage from './pages/MaterialPage'
import LabourJobPage from './pages/LabourJobPage'
import PriceCalculatorPage from './pages/PriceCalculatorPage'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { LayoutDashboard, Package, Users, FileText, Receipt, BarChart3, Settings, User, LogOut, Gem, ShoppingBag, RotateCcw, Layers, Calculator, Hammer } from 'lucide-react'

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
    { path: '/price-calculator', label: 'Price Calculator', icon: Calculator },
    { path: '/stock', label: 'Stock', icon: Package, permission: 'allow_stock_view' },
    { path: '/customers', label: 'Customers', icon: Users, permission: 'allow_customers' },
    { path: '/billing', label: 'Billing', icon: FileText, permission: 'allow_billing' },
    { path: '/invoices', label: 'Invoices', icon: Receipt, permission: 'allow_billing' },
    { path: '/inward-supply', label: 'Inward Supply', icon: RotateCcw, permission: 'allow_billing' },
    { path: '/labour-jobs', label: 'Labour Jobs', icon: Hammer, permission: 'allow_billing' },
    { path: '/materials', label: 'Materials', icon: Layers, permission: 'allow_stock_view' },
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
  return location.pathname === path || location.pathname.startsWith(path + '/')
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
          <button className="sidebar-logout" onClick={async () => { try { await signOut() } catch(e) { console.error(e) } }} title="Sign Out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_reports') ? <DashboardPage /> : <Navigate to="/profile" replace />}</RouteErrorBoundary>} />
          <Route path="/price-calculator" element={<RouteErrorBoundary key={location.pathname}><PriceCalculatorPage /></RouteErrorBoundary>} />
          <Route path="/stock" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_stock_view') ? <StockPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/customers" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_customers') ? <CustomersPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/billing" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_billing') ? <BillingPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/invoices" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_billing') ? <InvoiceHistoryPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/inward-supply" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_billing') ? <InwardSupplyPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/labour-jobs" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_billing') ? <LabourJobPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/materials" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_stock_view') ? <MaterialPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/sales" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_reports') ? <SalesPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/reports" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_reports') ? <ReportsPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/settings" element={<RouteErrorBoundary key={location.pathname}>{hasPermission('allow_settings') ? <SettingsPage /> : <Navigate to="/" replace />}</RouteErrorBoundary>} />
          <Route path="/profile" element={<RouteErrorBoundary key={location.pathname}><ProfilePage /></RouteErrorBoundary>} />
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
