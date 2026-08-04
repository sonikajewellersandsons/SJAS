import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({ customers: [] }))

function buildGetResult(ctx) {
  const { table, action } = ctx
  if (table === 'customers') return { data: state.customers, error: null }
  return { data: [], error: null }
}

vi.mock('../lib/supabase', () => {
  function makeQuery(ctx) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve, reject) => { Promise.resolve(buildGetResult(ctx)).then(resolve, reject) }
        }
        return () => makeQuery(ctx)
      },
    })
  }
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
      },
      from: vi.fn((table) => ({
        select: () => makeQuery({ table }),
        insert: () => makeQuery({ table, action: 'insert' }),
        update: () => makeQuery({ table, action: 'update' }),
        upsert: () => makeQuery({ table, action: 'upsert' }),
        delete: () => makeQuery({ table, action: 'delete' }),
      })),
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 1, name: 'Owner', role: 'owner' }, hasPermission: () => true }),
}))

import CustomersPage from './CustomersPage'
import { ToastProvider } from '../components/Toast'

describe('CustomersPage search', () => {
  beforeEach(() => {
    state.customers = [
      { id: 1, name: 'SONIKA JEWELLERS', phone: '9812345678', address: 'Street A', state: 'Haryana', aadhaar: '111122223333', pan: '', pincode: '121001', gstin: '' },
      { id: 2, name: 'ROHIT SHARMA', phone: '9876543210', address: 'Street B', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' },
      { id: 3, name: 'RAMESH KUMAR', phone: '9765432109', address: 'Street C', state: 'Delhi', aadhaar: '', pan: '', pincode: '', gstin: '' },
    ]
  })

  it('shows ALL customers when the search box is empty', async () => {
    render(
      <ToastProvider>
        <CustomersPage />
      </ToastProvider>
    )
    await screen.findByText('SONIKA JEWELLERS')
    expect(screen.getByText('ROHIT SHARMA')).toBeInTheDocument()
    expect(screen.getByText('RAMESH KUMAR')).toBeInTheDocument()
    expect(screen.queryByText('No customers found')).not.toBeInTheDocument()
  })

  it('filters customers as the user types a name', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <CustomersPage />
      </ToastProvider>
    )
    await screen.findByText('SONIKA JEWELLERS')
    const input = screen.getByPlaceholderText('Search by name, phone, address...')
    await user.type(input, 'ROHIT')
    expect(screen.getByText('ROHIT SHARMA')).toBeInTheDocument()
    expect(screen.queryByText('SONIKA JEWELLERS')).not.toBeInTheDocument()
    expect(screen.queryByText('RAMESH KUMAR')).not.toBeInTheDocument()
  })

  it('shows all customers again when the search is cleared', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <CustomersPage />
      </ToastProvider>
    )
    await screen.findByText('SONIKA JEWELLERS')
    const input = screen.getByPlaceholderText('Search by name, phone, address...')
    await user.type(input, 'ROHIT')
    await user.clear(input)
    expect(screen.getByText('SONIKA JEWELLERS')).toBeInTheDocument()
    expect(screen.getByText('RAMESH KUMAR')).toBeInTheDocument()
  })
})