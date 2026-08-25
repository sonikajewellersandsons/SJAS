import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const state = vi.hoisted(() => ({
  customers: [],
  masterItems: [],
  seqLastNo: 0,
  jobs: [],
  items: [],
  savedPayloads: [],
  saveError: null,
  deletedId: null,
}))

vi.mock('../lib/supabase', () => {
  function resultFor(ctx) {
    switch (ctx.table) {
      case 'customers':
        return { data: state.customers, error: null }
      case 'item_master':
        return { data: state.masterItems, error: null }
      case 'inv_sequences':
        // queried with .eq('type','labour').eq('fy', fy).maybeSingle()
        return { data: state.seqLastNo > 0 ? { last_no: state.seqLastNo } : null, error: null }
      case 'labour_jobs':
        return { data: state.jobs, error: null }
      case 'labour_job_items': {
        const jobIdEq = (ctx.eqs || []).find(([c]) => c === 'job_id')
        const filtered = jobIdEq ? state.items.filter(i => i.job_id === jobIdEq[1]) : state.items
        return { data: filtered, error: null }
      }
      case 'logs':
      case 'users':
      case 'settings':
        return { data: null, error: null }
      default:
        return { data: [], error: null }
    }
  }

  function makeQuery(table) {
    const ctx = { table, eqs: [] }
    function proxy() {}
    const p = new Proxy(proxy, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve) => { Promise.resolve(resultFor(ctx)).then(resolve) }
        }
        if (prop === 'maybeSingle') return () => p
        if (prop === 'eq') return (col, val) => { ctx.eqs.push([col, val]); return p }
        if (prop === 'range') return () => p
        return () => p
      },
    })
    return p
  }

  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
      from: vi.fn((table) => makeQuery(table)),
      rpc: vi.fn((name, args) => {
        if (name === 'save_labour_job') {
          if (state.saveError) return Promise.resolve({ data: null, error: state.saveError })
          state.savedPayloads.push(args.p_job)
          return Promise.resolve({ data: [{ job_id: 99, job_inv_no: args.p_job.inv_no }], error: null })
        }
        if (name === 'delete_labour_job') {
          state.deletedId = args.p_job_id
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 7, name: 'Owner', role: 'owner' }, hasPermission: () => true }),
}))

import LabourJobPage from './LabourJobPage'
import { ToastProvider } from '../components/Toast'

async function fillAndSave() {
  // Pick an existing customer through the search dropdown
  const search = screen.getByPlaceholderText(/Search customer by name/)
  fireEvent.change(search, { target: { value: 'Ram' } })
  fireEvent.mouseDown(await screen.findByText('Ram Kumar'))

  // Item name via the master-data ComboBox (type to filter, Enter commits)
  const itemInput = screen.getByPlaceholderText('Type to search item...')
  fireEvent.change(itemInput, { target: { value: 'Chain' } })
  fireEvent.keyDown(itemInput, { key: 'Enter' })
  fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '12.5' } })

  // Charges — service ₹10,000 inclusive; hallmark left empty
  fireEvent.change(screen.getByPlaceholderText('e.g. 10000'), { target: { value: '10000' } })

  fireEvent.click(screen.getByRole('button', { name: /Save Job/i }))
  await waitFor(() => expect(state.savedPayloads.length + (state.saveError ? 1 : 0)).toBeGreaterThan(0))
}

describe('LabourJobPage', () => {
  beforeEach(() => {
    state.customers = [
      { id: 3, name: 'Ram Kumar', phone: '9876543210', address: 'Faridabad', state: 'Haryana', aadhaar: '111122223333', gstin: '' },
    ]
    state.masterItems = [
      { name: 'Bangles', purity: '22K' },
      { name: 'Chain', purity: '22K' },
      { name: 'Ring', purity: '18K' },
    ]
    state.seqLastNo = 0
    state.jobs = []
    state.items = []
    state.savedPayloads = []
    state.saveError = null
    state.deletedId = null
  })

  it('suggests the next SJS/LB voucher number on load', async () => {
    render(<ToastProvider><LabourJobPage /></ToastProvider>)
    const noInput = await screen.findByDisplayValue(/^SJS\/LB\//)
    expect(noInput.value).toMatch(/^SJS\/LB\/\d{4}-\d{2}\/001$/)
  })

  it('item picker offers master names and auto-fills purity', async () => {
    render(<ToastProvider><LabourJobPage /></ToastProvider>)
    const itemInput = screen.getByPlaceholderText('Type to search item...')
    // Open the dropdown and wait for master names to arrive
    fireEvent.focus(itemInput)
    expect(await screen.findByText('Bangles')).toBeInTheDocument()
    fireEvent.change(itemInput, { target: { value: 'Ring' } })
    fireEvent.keyDown(itemInput, { key: 'Enter' })
    // 'Ring' is an 18K master item — purity dropdown must follow
    expect(screen.getByDisplayValue('Ring')).toBeInTheDocument()
    expect(screen.getByDisplayValue('18K')).toBeInTheDocument()

    // Custom (non-master) names still commit via free text
    fireEvent.change(itemInput, { target: { value: 'Anklet Pair' } })
    fireEvent.keyDown(itemInput, { key: 'Enter' })
    expect(screen.getByDisplayValue('Anklet Pair')).toBeInTheDocument()
  })

  it('saves via the save_labour_job RPC with server-matching totals and cleaned items', async () => {
    render(<ToastProvider><LabourJobPage /></ToastProvider>)
    await fillAndSave()

    expect(state.savedPayloads).toHaveLength(1)
    const p = state.savedPayloads[0]
    expect(p.inv_no).toMatch(/^SJS\/LB\//)
    expect(p.customer_name).toBe('Ram Kumar')
    expect(p.service_charge).toBe(10000)
    // inclusive back-calculation must match save_labour_job's SQL exactly
    expect(p.service_taxable).toBe(8474.58)
    expect(p.service_tax).toBe(1525.42)
    expect(p.hallmark_charge).toBe(0)
    expect(p.grand_total).toBe(10000)
    expect(p.items).toEqual([{ sno: 1, item_name: 'Chain', purity: '22K', huid: '', weight: 12.5 }])
    expect(p.created_by).toBe(7)
  })

  it('recovers cleanly when the voucher number is already in use', async () => {
    state.saveError = { message: 'DUPLICATE_INV_NO: SJS/LB/2026-27/001 is already in use' }
    render(<ToastProvider><LabourJobPage /></ToastProvider>)
    await fillAndSave()

    expect(await screen.findByText(/already in use/i)).toBeInTheDocument()
    // nothing was committed
    expect(state.savedPayloads).toHaveLength(0)
  })

  it('lists saved jobs in History with items summary', async () => {
    state.jobs = [{
      id: 5, inv_no: 'SJS/LB/2026-27/003', date: '2026-08-01',
      customer_name: 'Ram Kumar', customer_phone: '9876543210',
      service_charge: 10000, service_taxable: 8474.58, hallmark_charge: 500,
      tax_pct: 18, service_tax: 1525.42, hallmark_tax: 90,
      tax_total: 1615.42, grand_total: 10590, notes: '',
    }]
    state.items = [{ job_id: 5, weight: 12.5 }]
    render(<ToastProvider><LabourJobPage /></ToastProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /History/i }))
    expect(await screen.findByText('SJS/LB/2026-27/003')).toBeInTheDocument()
    expect(screen.getByText('Ram Kumar')).toBeInTheDocument()
    // weight summary hydrated from labour_job_items
    expect(screen.getByText('12.500')).toBeInTheDocument()
    expect(screen.getByText('₹10,590.00')).toBeInTheDocument()
  })

  it('deletes a job through the delete_labour_job RPC after confirmation', async () => {
    state.jobs = [{
      id: 5, inv_no: 'SJS/LB/2026-27/003', date: '2026-08-01',
      customer_name: 'Ram Kumar', customer_phone: '',
      service_charge: 10000, service_taxable: 8474.58, hallmark_charge: 0,
      tax_pct: 18, service_tax: 1525.42, hallmark_tax: 0,
      tax_total: 1525.42, grand_total: 10000, notes: '',
    }]
    render(<ToastProvider><LabourJobPage /></ToastProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /History/i }))
    await screen.findByText('SJS/LB/2026-27/003')

    fireEvent.click(screen.getByTitle('Delete'))
    const modal = document.querySelector('.modal-card')
    fireEvent.click(within(modal).getByRole('button', { name: /^Delete$/ }))

    await waitFor(() => expect(state.deletedId).toBe(5))
  })

  it('lets you re-edit the same job immediately after a successful update', async () => {
    state.jobs = [{
      id: 5, inv_no: 'SJS/LB/2026-27/003', date: '2026-08-01',
      customer_name: 'Ram Kumar', customer_phone: '',
      service_charge: 10000, service_taxable: 8474.58, hallmark_charge: 500,
      tax_pct: 18, service_tax: 1525.42, hallmark_tax: 90,
      tax_total: 1615.42, grand_total: 10590, notes: '',
    }]
    state.items = [{ job_id: 5, sno: 1, item_name: 'Chain', purity: '22K', weight: 12.5 }]
    render(<ToastProvider><LabourJobPage /></ToastProvider>)

    // First edit pass
    fireEvent.click(await screen.findByRole('button', { name: /History/i }))
    await screen.findByText('SJS/LB/2026-27/003')
    fireEvent.click(screen.getByTitle('Edit'))
    expect(await screen.findByText(/Editing voucher/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('SJS/LB/2026-27/003')).toBeInTheDocument()

    // Save the update — must send the row id
    fireEvent.click(screen.getByRole('button', { name: /Update Job/i }))
    await waitFor(() => expect(state.savedPayloads).toHaveLength(1))
    expect(state.savedPayloads[0].id).toBe(5)

    // Banner clears and a fresh number is generated
    await waitFor(() => expect(screen.queryByText(/Editing voucher/)).not.toBeInTheDocument())

    // Second edit pass on the SAME job must reload it (not show a blank form)
    fireEvent.click(screen.getByRole('button', { name: /History/i }))
    await screen.findByText('SJS/LB/2026-27/003')
    fireEvent.click(screen.getByTitle('Edit'))
    expect(await screen.findByText(/Editing voucher/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('SJS/LB/2026-27/003')).toBeInTheDocument()
  })
})
