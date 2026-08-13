import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const state = vi.hoisted(() => ({
  purchases: [],
  items: [],
  rpcCalls: [],
  updated: [],
}))

function buildGetResult(ctx) {
  const { table } = ctx
  if (table === 'item_master') return { data: state.items, error: null }
  if (table === 'purchases') {
    if (ctx.action === 'insert') { state.updated.push(ctx.payload); return { data: null, error: null } }
    if (ctx.eqCol === 'created_at') return { data: state.purchases.filter(p => p.created_at === ctx.eqVal), error: null }
    return { data: state.purchases, error: null }
  }
  if (table === 'logs') return { data: null, error: null }
  if (table === 'users') return { data: { id: 1 }, error: null }
  return { data: [], error: null }
}

vi.mock('../lib/supabase', () => {
  function makeQuery(ctx, isDelete = false) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve, reject) => Promise.resolve(buildGetResult(ctx)).then(resolve, reject)
        }
        if (prop === 'eq') return (col, val) => { ctx.eqCol = col; ctx.eqVal = val; return makeQuery(ctx, isDelete) }
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
        delete: () => makeQuery({ table, action: 'delete' }, true),
      })),
      rpc: vi.fn((name, args) => { state.rpcCalls.push({ name, args }); return Promise.resolve({ data: null, error: null }) }),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 1, name: 'Owner', role: 'owner' }, hasPermission: (perm) => ['allow_stock_view', 'allow_stock_edit', 'allow_item_master'].includes(perm) }),
}))

import StockPage from './StockPage'
import { ToastProvider } from '../components/Toast'

describe('StockPage PurchaseTab', () => {
  beforeEach(() => {
    state.purchases = [
      { id: 1, created_at: '2026-07-01T10:00:00.000000+00:00', supplier_name: 'Ram Traders', supplier_phone: '9812345678', item_id: 1, purity: '22K', weight: '5.800', pcs: 1, sold_pcs: 0, date: '2026-07-01', notes: 'n1', huid: true },
      { id: 2, created_at: '2026-07-02T10:00:00.000000+00:00', supplier_name: 'Shyam Traders', supplier_phone: '', item_id: 1, purity: '18K', weight: '3.200', pcs: 2, sold_pcs: 0, date: '2026-07-02', notes: '', huid: false },
    ]
    state.items = [{ id: 1, name: 'Ring(22K)', purity: '22K' }]
    state.rpcCalls = []
    state.updated = []
    window.history.replaceState({}, '', '/stock')
  })

  it('loads purchase history', async () => {
    render(<ToastProvider><StockPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Purchase'))
    expect(await screen.findByText(/Ram Traders/)).toBeInTheDocument()
  })

  it('edit loads the form and save calls replace_purchase RPC', async () => {
    render(<ToastProvider><StockPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Purchase'))
    await screen.findByText(/Ram Traders/)

    // list is sorted newest-first, so the second entry (Ram, 07-01) is [1]
    fireEvent.click(screen.getAllByTitle('Edit purchase')[1])
    // Edit form appears
    expect(await screen.findByText('Edit Purchase')).toBeInTheDocument()
    // weight pre-filled
    expect(screen.getAllByDisplayValue('5.800').length).toBeGreaterThan(0)

    // change weight and save
    fireEvent.change(screen.getAllByPlaceholderText('0.000')[0], { target: { value: '6.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Update Purchase/i }))

    await waitFor(() => expect(state.rpcCalls.filter(c => c.name === 'replace_purchase').length).toBe(1))
    const call = state.rpcCalls.find(c => c.name === 'replace_purchase')
    expect(call.args.p_created_at).toBe('2026-07-01T10:00:00.000000+00:00')
    expect(call.args.p_rows[0]).toMatchObject({ item_id: 1, weight: 6.5, pcs: 1 })
  })

  it('delete shows confirm modal and calls delete_purchase RPC', async () => {
    render(<ToastProvider><StockPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Purchase'))
    await screen.findByText(/Ram Traders/)

    fireEvent.click(screen.getAllByTitle('Delete purchase')[0])
    expect(await screen.findByText('Delete Purchase?')).toBeInTheDocument()

    const modal = screen.getByText('Delete Purchase?').closest('.modal-card')
    fireEvent.click(within(modal).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(state.rpcCalls.filter(c => c.name === 'delete_purchase').length).toBe(1))
    const call = state.rpcCalls.find(c => c.name === 'delete_purchase')
    expect(call.args.p_created_at).toBe('2026-07-02T10:00:00.000000+00:00')
  })

  it('disables edit and delete buttons on sold purchases', async () => {
    state.purchases[0].sold_pcs = 1
    render(<ToastProvider><StockPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Purchase'))
    await screen.findByText(/Ram Traders/)

    const editBtn = screen.getAllByTitle(/Edit disabled/)[0]
    const delBtn = screen.getAllByTitle(/Delete disabled/)[0]
    expect(editBtn).toBeDisabled()
    expect(delBtn).toBeDisabled()
  })

  it('shows HUID/non-HUID purchase split counting 22K only', async () => {
    render(<ToastProvider><StockPage /></ToastProvider>)
    fireEvent.click(await screen.findByText('Purchase'))

    const yesCard = (await screen.findByText('HUID Purchase')).closest('.stat-card')
    expect(within(yesCard).getByText(/^5\.800/)).toBeInTheDocument()
    expect(within(yesCard).getByText('1 pcs')).toBeInTheDocument()

    const noCard = screen.getByText('Non-HUID Purchase').closest('.stat-card')
    expect(within(noCard).getByText(/^0\.000/)).toBeInTheDocument()
    expect(within(noCard).getByText('0 pcs')).toBeInTheDocument()
  })
})
