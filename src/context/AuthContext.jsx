import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, ROLES } from '../lib/supabase'
import { logAction, resetAuditUserCache } from '../lib/audit'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    }).catch(() => setLoading(false))

    let initialSession = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        if (initialSession) {
          initialSession = false
          if (event === 'INITIAL_SESSION') return
        }
        fetchProfile(session.user.id)
      } else { setProfile(null); setPermissions({}); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, role, name, email, permissions, is_active, created_at')
        .eq('auth_id', userId)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        console.warn('No user profile found. Create a row in the "users" table linked to this auth user.')
        setProfile(null)
        setPermissions({})
        return null
      }

      // Deactivated users must not get a session — sign them out so they see
      // the login screen instead of a broken empty app.
      if (data.is_active === false) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setPermissions({})
        return null
      }

      let perms = {}
      if (data?.role === ROLES.OWNER) {
        perms = {
          allow_billing: true, allow_stock_view: true, allow_stock_edit: true,
          allow_customers: true, allow_reports: true, allow_settings: true,
          allow_item_master: true
        }
      } else if (data?.permissions) {
        if (typeof data.permissions === 'string') {
          try { perms = JSON.parse(data.permissions) } catch { perms = {} }
        } else {
          perms = data.permissions || {}
        }
      }

      setProfile(data)
      setPermissions(perms)
      return data
    } catch {
      setProfile(null)
      setPermissions({})
      return null
    } finally {
      setLoading(false)
    }
  }

  const hasPermission = (permKey) => {
    if (profile?.role === ROLES.OWNER) return true
    return !!permissions[permKey]
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Reject deactivated accounts at the login screen with a clear message.
    const { data: row } = await supabase.from('users').select('is_active').eq('auth_id', data.user.id).maybeSingle()
    if (row && row.is_active === false) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setPermissions({})
      const err = new Error('Your account has been deactivated. Contact the owner.')
      err.deactivated = true
      throw err
    }
    await fetchProfile(data.user.id)
    logAction('login', 'auth', null, { email })
    return data
  }

  async function signOut() {
    const uid = profile?.id ?? null
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setPermissions({})
    resetAuditUserCache()
    logAction('logout', 'auth', null, {}, uid)
  }

  return (
    <AuthContext.Provider value={{ user, profile, permissions, loading, signIn, signOut, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
