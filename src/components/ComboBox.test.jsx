import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ComboBox from './ComboBox'

describe('ComboBox search', () => {
  const options = [
    { value: '1', label: 'SONIKA JEWELLERS' },
    { value: '2', label: 'ANKIT' },
    { value: '3', label: 'ROHIT SHARMA' },
  ]

  it('opens and filters when typing', () => {
    const onChange = vi.fn()
    render(<ComboBox options={options} value="" onChange={onChange} placeholder="Type to search..." />)
    const input = screen.getByPlaceholderText('Type to search...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ankit' } })
    expect(screen.getAllByText('ANKIT').length).toBeGreaterThan(0)
    expect(screen.queryByText('SONIKA JEWELLERS')).not.toBeInTheDocument()
  })

  it('selects an option on click', () => {
    const onChange = vi.fn()
    render(<ComboBox options={options} value="" onChange={onChange} placeholder="Select..." />)
    const input = screen.getByPlaceholderText('Select...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'rohit' } })
    fireEvent.mouseDown(screen.getByText('ROHIT SHARMA'))
    expect(onChange).toHaveBeenCalledWith('3')
  })
})

describe('ComboBox freeText={false} (searchable but not editable)', () => {
  const voucherOptions = [
    { value: '1', label: 'SJS/IWS/2026-27/001 — Raju — ₹10,000.00' },
    { value: '2', label: 'SJS/IWS/2026-27/002 — Sita — ₹20,000.00' },
    { value: '', label: '— None —' },
  ]

  it('does NOT pre-fill the selected label into the box on focus', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ComboBox options={voucherOptions} value="1" onChange={onChange} placeholder="Select voucher..." freeText={false} />
    )
    const input = screen.getByPlaceholderText('Select voucher...')
    fireEvent.focus(input)
    expect(input.value).not.toContain('Raju')
    expect(screen.getByText(/Raju/)).toBeInTheDocument()
  })

  it('shows the selected label ONLY when closed (never as editable text)', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ComboBox options={voucherOptions} value="1" onChange={onChange} placeholder="Select voucher..." freeText={false} />
    )
    const input = screen.getByPlaceholderText('Select voucher...')
    // Closed state -> label shown as display
    expect(input.value).toContain('Raju')
    // Open it and clear the search -> text typed is only a filter, no commit
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '002' } })
    // Clicked outside (like deselecting an edit) reverts the box, no stray text
    fireEvent.mouseDown(document.body)
    expect(input.value).toContain('Raju')
    expect(input.value).not.toContain('002')
  })

  it('does NOT commit free text on Enter', () => {
    const onChange = vi.fn()
    render(<ComboBox options={voucherOptions} value="" onChange={onChange} placeholder="Select voucher..." freeText={false} />)
    const input = screen.getByPlaceholderText('Select voucher...')
    fireEvent.focus(input)
    // A string that matches NO voucher label must not be committed on Enter
    fireEvent.change(input, { target: { value: 'no-such-voucher-xyz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does NOT reopen after selecting (no label pushed back into the field)', () => {
    // Uses a stateful wrapper so the parent actually re-renders with the value.
    function Wrapper() {
      const [v, setV] = React.useState('')
      return <ComboBox options={voucherOptions} value={v} onChange={setV} placeholder="Select voucher..." freeText={false} />
    }
    const { container } = render(<Wrapper />)
    const input = screen.getByPlaceholderText('Select voucher...')
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getAllByText(/Sita/)[0])
    // Dropdown must stay closed after selection so the label is not pushed in
    expect(container.querySelector('.combobox-dropdown')).not.toBeInTheDocument()
    expect(input.value).toContain('Sita')
  })

  it('still selects the single filtered match on Enter', () => {
    const onChange = vi.fn()
    render(<ComboBox options={voucherOptions} value="" onChange={onChange} placeholder="Select voucher..." freeText={false} />)
    const input = screen.getByPlaceholderText('Select voucher...')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '002' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('2')
  })
})