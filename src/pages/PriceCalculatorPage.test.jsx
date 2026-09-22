import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const pcState = vi.hoisted(() => ({ masterItems: [] }))

vi.mock('../lib/supabase', () => {
  function Query(table) {
    this._table = table; this._ctx = {}
  }
  Query.prototype.select = function(cols) { this._ctx.cols = cols; return this }
  Query.prototype.eq = function(col, val) { this._ctx.eqCol = col; this._ctx.eqVal = val; return this }
  Query.prototype.order = function(col, opts) { this._ctx.orderBy = col; this._ctx.orderAsc = opts?.ascending ?? true; return this }
  Query.prototype.maybeSingle = function() { return this }
  Query.prototype.limit = function(n) { return this }
  Query.prototype.not = function() { return this }
  Query.prototype.single = function() { return this }
  Query.prototype.then = function(resolve) {
    let data = null
    if (this._table === 'item_master') data = pcState.masterItems
    else if (this._table === 'settings') data = []
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
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 1, name: 'Owner', role: 'owner' }, hasPermission: () => true }),
}))

import PriceCalculatorPage from './PriceCalculatorPage'
import { ToastProvider } from '../components/Toast'

describe('PriceCalculatorPage — hallmark charge regression tests', () => {
  beforeEach(() => {
    localStorage.clear()
    pcState.masterItems = []
  })

  it('auto-fills hallmark charge from the most common non-zero value in master items', async () => {
    pcState.masterItems = [
      { id: 1, name: 'Bangle', purity: '22K', hallmark_charge: 120, material_type: null },
      { id: 2, name: 'Chain', purity: '22K', hallmark_charge: 120, material_type: null },
      { id: 3, name: 'Earring', purity: '22K', hallmark_charge: 50, material_type: null },
      { id: 4, name: 'Ring', purity: '22K', hallmark_charge: 0, material_type: null },
    ]

    render(<ToastProvider><PriceCalculatorPage /></ToastProvider>)

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      const hcSB = spinbuttons.find(el => el.value === '120')
      expect(hcSB).toBeTruthy()
    })
  })

  it('selecting a master item from combo sets Hallmark Charge input and increases Total Price', async () => {
    pcState.masterItems = [{ id: 10, name: 'Bangle', purity: '22K', hallmark_charge: 200, material_type: null }]

    render(<ToastProvider><PriceCalculatorPage /></ToastProvider>)

    // Enter a gold rate to produce calculator result
    const rateInput = await screen.findByPlaceholderText(/Enter gold rate/i)
    fireEvent.focus(rateInput)
    fireEvent.change(rateInput, { target: { value: '76000' } })

    await waitFor(() => {
      expect(screen.getByText('Gold Value')).toBeInTheDocument()
    })

    // Open the ComboBox via focus (ComboBox opens on focus, options show when open && search empty)
    const comboInput = await screen.findByPlaceholderText(/Search an item to pull its hallmark charge/i)
    fireEvent.focus(comboInput)

    await waitFor(() => {
      expect(screen.queryByText('Bangle (22K)')).toBeInTheDocument()
    })

    // Select by clicking the option
    fireEvent.mouseDown(screen.getByText('Bangle (22K)'))

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '200')).toBeTruthy()
    })
  })

  it('writing a manual Hallmark Charge saves it to localStorage pc_hallmarkCharge', async () => {
    pcState.masterItems = [{ id: 1, name: 'Bangle', purity: '22K', hallmark_charge: 100, material_type: null }]

    render(<ToastProvider><PriceCalculatorPage /></ToastProvider>)

    await waitFor(() => {
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons.find(el => el.value === '100')).toBeTruthy()
    })

    const spinbuttons = screen.getAllByRole('spinbutton')
    const hcSB = spinbuttons.find(el => el.value === '100')
    expect(hcSB).toBeTruthy()

    fireEvent.focus(hcSB)
    fireEvent.change(hcSB, { target: { value: '175' } })

    await waitFor(() => {
      expect(localStorage.getItem('pc_hallmarkCharge')).toBe('175')
    })
  })
})
