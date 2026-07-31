import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const state = vi.hoisted(() => ({
  invoice: null,
  oldItems: [],
  customers: [],
  masterItems: [],
  settings: [],
  deleteCalls: 0,
  lastDeleteEq: null,
  lastDeleteIn: null,
  processCalls: 0,
}))

function buildGetResult(ctx) {
  const { table, action, eqCol } = ctx
  if (table === 'invoices') {
    if (action === 'insert') return { data: [{ id: 1 }], error: null }
    if (action === 'update') return { data: null, error: null }
    if (eqCol === 'inv_no') return { data: null, error: null }
    if (eqCol === 'id') return { data: state.invoice, error: null }
    return { data: [], error: null }
  }
  if (table === 'invoice_items') {
    if (action === 'delete') return { data: null, error: null }
    if (action === 'insert') return { data: null, error: null }
    if (eqCol === 'invoice_id') return { data: state.oldItems, error: null }
    return { data: [], error: null }
  }
  if (table === 'customers') return { data: state.customers, error: null }
  if (table === 'item_master') return { data: state.masterItems, error: null }
  if (table === 'settings') return { data: state.settings, error: null }
  if (table === 'inward_supply_vouchers') return { data: [], error: null }
  if (table === 'material_purchases') return { data: [], error: null }
  if (table === 'inv_sequences') return { data: { last_no: 1 }, error: null }
  if (table === 'users') return { data: { id: 1 }, error: null }
  if (table === 'logs') return { data: null, error: null }
  return { data: [], error: null }
}

vi.mock('../lib/supabase', () => {
  function makeQuery(ctx, isDelete = false) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve, reject) => { Promise.resolve(buildGetResult(ctx)).then(resolve, reject) }
        }
        if (prop === 'eq') {
          return (col, val) => { if (isDelete) state.lastDeleteEq = [col, val]; ctx.eqCol = col; ctx.eqVal = val; return makeQuery(ctx, isDelete) }
        }
        if (prop === 'in') {
          return (col, vals) => { if (isDelete) state.lastDeleteIn = [col, vals]; return makeQuery(ctx, isDelete) }
        }
        if (prop === 'delete') {
          return () => { state.deleteCalls++; return makeQuery(ctx, true) }
        }
        return () => makeQuery(ctx, isDelete)
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
        delete: () => { state.deleteCalls++; return makeQuery({ table, action: 'delete' }, true) },
      })),
      rpc: vi.fn((name) => {
        if (name === 'process_invoice_stock' || name === 'process_material_sale') state.processCalls++
        return Promise.resolve({ data: name === 'get_stock_lots' ? [] : null, error: null })
      }),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 1, name: 'Owner', role: 'owner' }, hasPermission: () => true }),
}))

import BillingPage from './BillingPage'
import { ToastProvider } from '../components/Toast'

describe('BillingPage edit-save (regression: items deleted after insert)', () => {
  beforeEach(() => {
    state.invoice = {
      id: 1,
      inv_no: 'SJS/2026-27/001',
      date: '2026-07-15',
      customer_id: 5,
      customer_name: 'Rohit',
      customer_state: 'Haryana',
      customer_gstin: '',
      gold_rate: 76000,
      subtotal: 172727.27,
      hallmark_total: 0,
      tax_total: 5181.82,
      discount: 0,
      adj_amount: 0,
      payment_mode: 'CASH',
      cash_amt: 177909.09,
      bank_amt: 0,
      invoice_items: [{
        id: 1, invoice_id: 1, item_id: 10, weight: '5', rate_per_gram: 34545.45,
        price: 172727.27, tax_amount: 5181.82, tax_pct: 3, labour_rate: 0,
        labour_pct: 10, hallmark_charge: 0, huid: true, huid_code: '', sno: 1,
        item_master: { name: 'Bangle', hsn_code: '71131913' },
      }],
    }
    state.oldItems = [state.invoice.invoice_items[0]]
    state.customers = [{ id: 5, name: 'Rohit', phone: '9876543210', address: 'Faridabad', state: 'Haryana', gstin: '' }]
    state.masterItems = [{ id: 10, name: 'Bangle', hallmark_charge: 0, purity: '22K', material_type: null }]
    state.settings = []
    state.deleteCalls = 0
    state.lastDeleteEq = null
    state.lastDeleteIn = null
    state.processCalls = 0
    window.history.replaceState({}, '', '/billing?edit=1')
  })

  it('deletes ONLY the old items by id, then processes stock', async () => {
    render(
      <ToastProvider>
        <BillingPage />
      </ToastProvider>
    )

    const btn = await screen.findByRole('button', { name: /Update Invoice/i })
    expect(btn).not.toBeDisabled()

    fireEvent.click(btn)

    await waitFor(() => {
      expect(state.deleteCalls).toBe(1)
    })
    // The delete must target the OLD rows by their ids...
    expect(state.lastDeleteIn).toEqual(['id', [1]])
    // ...and must NOT be a blanket delete by invoice_id (which would also wipe
    // the just-inserted new rows — the original C1 bug).
    expect(state.lastDeleteEq).not.toEqual(['invoice_id', 1])
    // Stock is re-processed against the NEW rows after the old ones are gone.
    expect(state.processCalls).toBe(2)
  })
})
