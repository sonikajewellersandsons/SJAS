import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
})

export const ROLES = {
  OWNER: 'owner',
  ACCOUNTANT: 'accountant',
  SALESPERSON: 'salesperson',
  STOCK_MANAGER: 'stock_manager'
}

export const ROLE_LABELS = {
  owner: 'Owner',
  accountant: 'Accountant',
  salesperson: 'Salesperson',
  stock_manager: 'Stock Manager'
}

export const ROLE_COLORS = {
  owner: '#c0392b',
  accountant: '#8e44ad',
  salesperson: '#2980b9',
  stock_manager: '#27ae60'
}
