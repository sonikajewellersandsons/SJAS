import { describe, it, expect } from 'vitest'
import { cleanPhone, financialYear, fyFromInvNo, invNoSeq, monthEndDate, fmt, num } from './format'

describe('cleanPhone', () => {
  it('strips +91 prefix and non-digits', () => {
    expect(cleanPhone('+91 98765 43210')).toBe('9876543210')
  })
  it('handles digits with dashes/spaces', () => {
    expect(cleanPhone('987-654-3210')).toBe('9876543210')
  })
  it('leaves a bare 10-digit number untouched', () => {
    expect(cleanPhone('9876543210')).toBe('9876543210')
  })
  it('handles null/undefined/empty', () => {
    expect(cleanPhone(null)).toBe('')
    expect(cleanPhone(undefined)).toBe('')
    expect(cleanPhone('')).toBe('')
  })
})

describe('financialYear', () => {
  it('Apr–Dec belongs to the current FY', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27')
    expect(financialYear('2026-12-31')).toBe('2026-27')
  })
  it('Jan–Mar belongs to the previous FY', () => {
    expect(financialYear('2026-01-15')).toBe('2025-26')
    expect(financialYear('2026-03-31')).toBe('2025-26')
  })
})

describe('fyFromInvNo', () => {
  it('parses sale numbers', () => {
    expect(fyFromInvNo('SJS/2026-27/001')).toBe('2026-27')
    expect(fyFromInvNo('SJS/2025-26/050')).toBe('2025-26')
  })
  it('parses inward supply numbers', () => {
    expect(fyFromInvNo('SJS/IWS/2026-27/001')).toBe('2026-27')
  })
  it('parses labour job numbers', () => {
    expect(fyFromInvNo('SJS/LB/2026-27/005')).toBe('2026-27')
  })
  it('returns undefined for non-standard numbers', () => {
    expect(fyFromInvNo('INV-123')).toBeUndefined()
    expect(fyFromInvNo('')).toBeUndefined()
    expect(fyFromInvNo(null)).toBeUndefined()
  })
})

describe('invNoSeq', () => {
  it('extracts the trailing sequence', () => {
    expect(invNoSeq('SJS/2026-27/050')).toBe(50)
    expect(invNoSeq('SJS/IWS/2026-27/003')).toBe(3)
    expect(invNoSeq('SJS/LB/2026-27/007')).toBe(7)
  })
  it('returns null when there is no numeric suffix', () => {
    expect(invNoSeq('INV-123')).toBeNull()
    expect(invNoSeq('')).toBeNull()
    expect(invNoSeq(null)).toBeNull()
  })
})

describe('monthEndDate', () => {
  it('is timezone-safe for the last day of the month', () => {
    expect(monthEndDate('2026', '07')).toBe('2026-07-31')
    expect(monthEndDate('2026', '04')).toBe('2026-04-30')
  })
  it('handles leap-year February', () => {
    expect(monthEndDate('2024', '02')).toBe('2024-02-29')
    expect(monthEndDate('2026', '02')).toBe('2026-02-28')
  })
  it('zero-pads single-digit months', () => {
    expect(monthEndDate('2026', '3')).toBe('2026-03-31')
  })
})

describe('fmt / num', () => {
  it('formats currency with en-IN grouping', () => {
    expect(fmt(1234567.5)).toBe('₹12,34,567.50')
  })
  it('falls back to zero for invalid input', () => {
    expect(fmt('abc')).toBe('₹0.00')
    expect(fmt(null)).toBe('₹0.00')
  })
  it('num uses en-IN grouping without the rupee symbol', () => {
    expect(num(1234567.5)).toBe('12,34,567.50')
  })
})
