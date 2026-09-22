import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const s = vi.hoisted(() => ({
  invoice: null, oldItems: [], customers: [], masterItems: [], settings: [],
  deleteCalls: 0, lastDeleteEq: null, lastDeleteIn: null, processCalls: 0,
}))

vi.mock('../lib/supabase', () => {
  function Query(table) {
    this._table = table; this._ctx = {}; this._isDel = false
  }
  Query.prototype.select = function(cols) { this._ctx.cols = cols; return this }
  Query.prototype.eq = function(col, val) { this._ctx.eqCol = col; this._ctx.eqVal = val; return this }
  Query.prototype.in = function(col, vals) { this._ctx.inCol = col; this._ctx.inVals = vals; return this }
  Query.prototype.order = function(col, opts) { this._ctx.orderBy = col; this._ctx.orderAsc = opts?.ascending ?? true; return this }
  Query.prototype.not = function() { return this }
  Query.prototype.maybeSingle = function() { return this }
  Query.prototype.limit = function(n) { return this }
  Query.prototype.single = function() { return this }
  Query.prototype.upsert = function(data, opts) { this._ctx.action = 'upsert'; this._ctx.data = data; return this }

  Query.prototype.delete = function() { this._isDel = true; if (s.lastDeleteEq === null && s.invoice) { s.lastDeleteEq = [this._ctx.eqCol, this._ctx.eqVal]; s.deleteCalls++; } else if (!s.invoice) { s.deleteCalls++; } return this }

  Query.prototype.insert = function(data) { this._ctx.action = 'insert'; this._ctx.data = data; return this }
  Query.prototype.update = function(data) { this._ctx.action = 'update'; this._ctx.data = data; return this }
  Query.prototype.catch = function(fn) { return this.then(function(r) { return r }) }

  Query.prototype.then = function(resolve) {
    const t = this._table
    let data = null
    if (t === 'invoices') {
      if (this._ctx.action === 'insert') data = [{ id: s.invoice ? s.invoice.id : 1 }]
      else if (this._ctx.action === 'update') data = null
      else if (this._ctx.eqCol === 'inv_no') data = null
      else if (this._ctx.eqCol === 'id') data = s.invoice || null
      else data = []
    } else if (t === 'invoice_items') {
      if (this._ctx.action === 'delete') { data = null }
      else if (this._ctx.action === 'insert') { data = null }
      else if (this._ctx.eqCol === 'invoice_id') { data = s.oldItems || [] }
      else data = []
    } else if (t === 'customers') { data = s.customers }
    else if (t === 'item_master') { data = s.masterItems }
    else if (t === 'settings') { data = s.settings }
    else if (t === 'inward_supply_vouchers') { data = [] }
    else if (t === 'material_purchases') { data = [] }
    else if (t === 'inv_sequences') { data = { last_no: 1 } }
    else if (t === 'users') { data = { id: 1 } }
    else if (t === 'logs') { data = null }

    // Track delete-by-in('id', [...])
    if (this._isDel && this._ctx.inCol === 'id' && this._ctx.inVals) {
      s.lastDeleteIn = ['id', this._ctx.inVals]
    } else if (this._isDel && this._ctx.eqCol) {
      s.lastDeleteEq = [this._ctx.eqCol, this._ctx.eqVal]
    }

    resolve({ data, error: null })
    return Promise.resolve({ data, error: null })
  }

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })),
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
      from: vi.fn((table) => new Query(table)),
      rpc: vi.fn((name) => {
        if (name === 'process_invoice_stock' || name === 'process_material_sale') s.processCalls++
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
    s.invoice = {
      id: 1, inv_no: 'SJS/2026-27/001', date: '2026-07-15', customer_id: 5,
      customer_name: 'Rohit', customer_state: 'Haryana', customer_gstin: '',
      gold_rate: 76000, subtotal: 172727.27, hallmark_total: 0, tax_total: 5181.82,
      discount: 0, adj_amount: 0, payment_mode: 'CASH', cash_amt: 177909.09, bank_amt: 0,
      invoice_items: [{
        id: 1, invoice_id: 1, item_id: 10, weight: '5', rate_per_gram: 34545.45,
        price: 172727.27, tax_amount: 5181.82, tax_pct: 3, labour_rate: 0,
        labour_pct: 10, hallmark_charge: 0, huid: true, huid_code: '', sno: 1,
        item_master: { name: 'Bangle', hsn_code: '71131913' },
      }],
    }
    s.oldItems = [s.invoice.invoice_items[0]]
    s.customers = [{ id: 5, name: 'Rohit', phone: '9876543210', address: 'Faridabad', state: 'Haryana', gstin: '' }]
    s.masterItems = [{ id: 10, name: 'Bangle', hallmark_charge: 0, purity: '22K', material_type: null }]
    s.settings = []
    s.deleteCalls = 0; s.lastDeleteEq = null; s.lastDeleteIn = null; s.processCalls = 0
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/billing?edit=1', search: '?edit=1' }, configurable: true, writable: true })
  })

  it('deletes ONLY the old items by id, then processes stock', async () => {
    render(<ToastProvider><BillingPage /></ToastProvider>)
    const btn = await screen.findByRole('button', { name: /Update Invoice/i })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await waitFor(() => { expect(s.deleteCalls).toBe(1) })
    expect(s.lastDeleteIn).toEqual(['id', [1]])
    expect(s.lastDeleteEq).not.toEqual(['invoice_id', 1])
    expect(s.processCalls).toBe(2)
  })

  it('filters the customer search dropdown while typing', async () => {
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/billing', search: '' }, configurable: true, writable: true })
    render(<ToastProvider><BillingPage /></ToastProvider>)
    const input = await screen.findByPlaceholderText('Search customer by name, phone, aadhaar...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'rohi' } })
    expect(await screen.findByText('Rohit')).toBeInTheDocument()
    expect(screen.queryByText(/Add new customer/)).toBeInTheDocument()
  })
})

describe('BillingPage — hallmark charge updates (regression)', () => {
  beforeEach(() => {
    localStorage.clear()
    s.invoice = null; s.oldItems = []
    s.customers = [{ id: 1, name: 'Test Customer', phone: '9876543210', address: 'Faridabad', state: 'Haryana', gstin: '' }]
    s.masterItems = [
      { id: 1, name: 'Bangle', hallmark_charge: 80, purity: '22K', material_type: null },
      { id: 2, name: 'Chain', hallmark_charge: 120, purity: '22K', material_type: null },
    ]
    s.settings = []
    s.deleteCalls = 0; s.lastDeleteEq = null; s.lastDeleteIn = null; s.processCalls = 0
    Object.defineProperty(window, 'location', { value: { href: 'http://localhost/billing', search: '' }, configurable: true, writable: true })
  })

  it('selecting an Item Master item populates Hallmark (₹) and updates Total Hallmark Price (Without Tax)', async () => {
    render(<ToastProvider><BillingPage /></ToastProvider>)

    const comboInput = await screen.findByPlaceholderText('Type to search item...')
    fireEvent.focus(comboInput)
    fireEvent.change(comboInput, { target: { value: 'Bang' } })

    await waitFor(() => {
      expect(screen.queryByText('Bangle (22K)')).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText('Bangle (22K)'))

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '80')).toBeTruthy()
    })

    await waitFor(() => {
      expect(document.body.innerHTML).toContain('Total Hallmark Price (Without Tax)')
    })
  })

  it('typing directly into line Hallmark (₹) overrides the master value and totals use the typed value', async () => {
    render(<ToastProvider><BillingPage /></ToastProvider>)

    const comboInput = await screen.findByPlaceholderText('Type to search item...')
    fireEvent.focus(comboInput)
    fireEvent.change(comboInput, { target: { value: 'Bang' } })

    await waitFor(() => {
      expect(screen.queryByText('Bangle (22K)')).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText('Bangle (22K)'))

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '80')).toBeTruthy()
    })

    const spinbuttons = screen.getAllByRole('spinbutton')
    const hcSB = spinbuttons.find(el => el.value === '80')
    expect(hcSB).toBeTruthy()

    fireEvent.focus(hcSB)
    fireEvent.change(hcSB, { target: { value: '75' } })

    await waitFor(() => {
      expect(document.body.innerHTML).toContain('Master:')
    })

    await waitFor(() => {
      const updatedSBs = screen.getAllByRole('spinbutton')
      expect(updatedSBs.find(el => el.value === '75')).toBeTruthy()
    })
  })

  it('firing a window focus event re-queries item_master and updated hallmark_charge is picked up on subsequent item selection', async () => {
    render(<ToastProvider><BillingPage /></ToastProvider>)

    const comboInput = await screen.findByPlaceholderText('Type to search item...')
    fireEvent.focus(comboInput)
    fireEvent.change(comboInput, { target: { value: 'Bang' } })

    await waitFor(() => {
      expect(screen.queryByText('Bangle (22K)')).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText('Bangle (22K)'))

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '80')).toBeTruthy()
    })

    s.masterItems = [
      { id: 1, name: 'Bangle', hallmark_charge: 95, purity: '22K', material_type: null },
      { id: 2, name: 'Chain', hallmark_charge: 120, purity: '22K', material_type: null },
    ]

    fireEvent.focus(window)

    fireEvent.mouseDown(comboInput)
    fireEvent.change(comboInput, { target: { value: 'Bang' } })

    await waitFor(() => {
      expect(screen.queryByText('Bangle (22K)')).toBeInTheDocument()
    })

    fireEvent.mouseDown(screen.getByText('Bangle (22K)'))

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '95')).toBeTruthy()
    })
  })
})
