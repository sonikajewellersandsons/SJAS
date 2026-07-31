import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const state = vi.hoisted(() => ({
  purchases: [],
  sales: [],
  inserted: [],
  updated: null,
  deleted: null,
  errors: {},
}))

function buildGetResult(ctx) {
  const { table, action, eqCol, eqVal } = ctx
  if (state.errors[table]) return { data: null, error: { message: state.errors[table] } }
  if (table === 'material_purchases') {
    if (action === 'insert') { state.inserted.push(ctx.payload); return { data: null, error: null } }
    if (action === 'update') { state.updated = { id: eqVal, ...ctx.payload }; return { data: null, error: null } }
    if (action === 'delete') { state.deleted = eqVal; return { data: null, error: null } }
    // select: if only weight/sold_weight selected, it's the stock summary
    if (ctx.columns && ctx.columns !== '*') return { data: state.purchases.map(p => ({ weight: p.weight, sold_weight: p.sold_weight })), error: null }
    return { data: state.purchases, error: null }
  }
  if (table === 'material_sales') return { data: state.sales, error: null }
  if (table === 'logs') return { data: null, error: null }
  if (table === 'users') return { data: { id: 1 }, error: null }
  return { data: [], error: null }
}

vi.mock('../lib/supabase', () => {
  function makeQuery(ctx, isDelete = false) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve, reject) => { Promise.resolve(buildGetResult(ctx)).then(resolve, reject) }
        }
        if (prop === 'eq') return (col, val) => { ctx.eqCol = col; ctx.eqVal = val; return makeQuery(ctx, isDelete) }
        if (prop === 'in') return () => makeQuery(ctx, isDelete)
        return () => makeQuery(ctx, isDelete)
      },
    })
  }
  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
      from: vi.fn((table) => ({
        select: (columns) => { const ctx = { table, columns }; return makeQuery(ctx) },
        insert: (payload) => { const ctx = { table, action: 'insert', payload }; return makeQuery(ctx) },
        update: (payload) => { const ctx = { table, action: 'update', payload }; return makeQuery(ctx) },
        upsert: () => makeQuery({ table, action: 'upsert' }),
        delete: () => makeQuery({ table, action: 'delete' }, true),
      })),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 1, name: 'Owner', role: 'owner' }, hasPermission: (perm) => perm === 'allow_stock_edit' }),
}))

import MaterialPage from './MaterialPage'
import { ToastProvider } from '../components/Toast'

describe('MaterialPage CRUD', () => {
  beforeEach(() => {
    state.purchases = [
      { id: 1, type: 'gold_18k', date: '2026-07-01', supplier: 'Ram Traders', weight: 100, sold_weight: 0, notes: '' },
      { id: 2, type: 'gold_18k', date: '2026-07-02', supplier: 'Shyam Traders', weight: 50, sold_weight: 50, notes: 'fully sold' },
    ]
    state.sales = []
    state.inserted = []
    state.updated = null
    state.deleted = null
    state.errors = {}
    window.history.replaceState({}, '', '/materials')
  })

  it('loads purchases into the table', async () => {
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    expect(await screen.findByText('Ram Traders')).toBeInTheDocument()
    expect(screen.getByText('Shyam Traders')).toBeInTheDocument()
    // weight appears in the stock card and the row table
    expect(screen.getAllByText('100.000').length).toBeGreaterThan(0)
  })

  it('adds a purchase (insert called with the active tab type)', async () => {
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Add Purchase'))
    fireEvent.change(screen.getByPlaceholderText('Supplier name'), { target: { value: 'New Supplier' } })
    fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '25.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Purchase/i }))

    await waitFor(() => expect(state.inserted).toHaveLength(1))
    expect(state.inserted[0]).toMatchObject({ type: 'gold_18k', supplier: 'New Supplier', weight: 25.5 })
  })

  it('edits a purchase (update called with the row id)', async () => {
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    await screen.findByText('Ram Traders')
    fireEvent.click(screen.getAllByTitle('Edit')[0])
    fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: /Update/i }))

    await waitFor(() => expect(state.updated).not.toBeNull())
    expect(state.updated).toMatchObject({ id: 1, weight: 120, type: 'gold_18k' })
  })

  it('disables edit/delete on a lot that has been sold', async () => {
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    await screen.findByText('Ram Traders')
    // Ram Traders (sold_weight 0) editable; Shyam Traders (sold 50/50) not
    const editButtons = screen.getAllByTitle('Edit')
    expect(editButtons[0]).not.toBeDisabled()
    expect(editButtons[1]).toBeDisabled()
  })

  it('deletes a purchase after confirmation', async () => {
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    await screen.findByText('Ram Traders')
    fireEvent.click(screen.getAllByTitle('Delete')[0])
    const modal = screen.getByText('This action cannot be undone.').closest('.modal-card')
    fireEvent.click(within(modal).getByRole('button', { name: /^Delete$/ }))

    await waitFor(() => expect(state.deleted).toBe(1))
  })

  it('shows an error toast when the insert is denied', async () => {
    state.errors['material_purchases'] = 'new row violates row-level security policy'
    render(<ToastProvider><MaterialPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Add Purchase'))
    fireEvent.change(screen.getByPlaceholderText('Supplier name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Purchase/i }))

    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument()
  })
})
