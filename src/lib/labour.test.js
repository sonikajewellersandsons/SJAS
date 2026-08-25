import { describe, it, expect } from 'vitest'
import { computeLabourTotals, cleanLabourItems, round2 } from './labour'

describe('computeLabourTotals — inclusive service charge', () => {
  it('back-calculates the ₹10,000 example exactly', () => {
    const t = computeLabourTotals({ serviceCharge: 10000 })
    expect(t.serviceTaxable).toBe(8474.58)
    expect(t.serviceTax).toBe(1525.42)
    // taxable + tax must equal the entered charge with zero drift
    expect(t.serviceTaxable + t.serviceTax).toBe(10000)
  })

  it('handles a custom tax rate', () => {
    const t = computeLabourTotals({ serviceCharge: 1120, taxPct: 12 })
    expect(t.serviceTaxable).toBe(1000)
    expect(t.serviceTax).toBe(120)
  })

  it('never produces NaN from empty inputs', () => {
    const t = computeLabourTotals({})
    expect(t.serviceCharge).toBe(0)
    expect(t.serviceTaxable).toBe(0)
    expect(t.serviceTax).toBe(0)
    expect(t.grandTotal).toBe(0)
  })

  it('clamps negative charges to zero', () => {
    const t = computeLabourTotals({ serviceCharge: -500, hallmarkCharge: -10 })
    expect(t.serviceCharge).toBe(0)
    expect(t.hallmarkCharge).toBe(0)
  })

  it('falls back to 18% for invalid rates', () => {
    const t = computeLabourTotals({ serviceCharge: 1180, taxPct: 'abc' })
    expect(t.taxPct).toBe(18)
    expect(t.serviceTaxable).toBe(1000)
  })
})

describe('computeLabourTotals — exclusive hallmark charge', () => {
  it('adds GST on top of the hallmark amount', () => {
    const t = computeLabourTotals({ serviceCharge: 10000, hallmarkCharge: 500 })
    expect(t.hallmarkTax).toBe(90)
    expect(t.grandTotal).toBe(10590) // 10000 (incl.) + 500 + 90
  })

  it('zero hallmark contributes nothing', () => {
    const t = computeLabourTotals({ serviceCharge: 11800 })
    expect(t.hallmarkTax).toBe(0)
    expect(t.grandTotal).toBe(11800)
  })

  it('taxTotal is the sum of both taxes', () => {
    const t = computeLabourTotals({ serviceCharge: 23600, hallmarkCharge: 200 })
    // 23600/1.18 = 20000 taxable → tax 3600; hall tax 36
    expect(t.taxTotal).toBeCloseTo(3636, 2)
  })
})

describe('rounding-drift property', () => {
  it('taxable + tax equals the charge for awkward amounts', () => {
    for (const c of [1, 7.5, 999.99, 12345.67, 54321, 99999.99]) {
      const t = computeLabourTotals({ serviceCharge: c })
      expect(round2(t.serviceTaxable + t.serviceTax)).toBe(round2(c))
    }
  })
})

describe('cleanLabourItems', () => {
  it('drops fully-blank rows and renumbers sno', () => {
    const r = cleanLabourItems([
      { item_name: '', weight: '' },
      { item_name: 'Chain', purity: '22K', weight: '12.5' },
      { item_name: '', weight: '' },
      { item_name: 'Bangles', purity: '18K', weight: '30' },
    ])
    expect(r.error).toBeUndefined()
    expect(r.items).toEqual([
      { sno: 1, item_name: 'Chain', purity: '22K', weight: 12.5 },
      { sno: 2, item_name: 'Bangles', purity: '18K', weight: 30 },
    ])
  })

  it('errors on a row with weight but no name', () => {
    const r = cleanLabourItems([{ item_name: '', weight: '10' }])
    expect(r.error).toMatch(/name is required/)
  })

  it('errors on a row with a name but no/invalid weight', () => {
    expect(cleanLabourItems([{ item_name: 'Chain', weight: '' }]).error).toMatch(/weight/)
    expect(cleanLabourItems([{ item_name: 'Chain', weight: '-3' }]).error).toMatch(/weight/)
    expect(cleanLabourItems([{ item_name: 'Chain', weight: 'abc' }]).error).toMatch(/weight/)
  })

  it('errors when no items remain after cleaning', () => {
    expect(cleanLabourItems([{ item_name: '', weight: '' }]).error).toMatch(/at least one item/i)
    expect(cleanLabourItems([]).error).toMatch(/at least one item/i)
    expect(cleanLabourItems(null).error).toMatch(/at least one item/i)
  })

  it('defaults missing purity to 22K and trims names', () => {
    const r = cleanLabourItems([{ item_name: '  Ring  ', weight: '4' }])
    expect(r.items[0].purity).toBe('22K')
    expect(r.items[0].item_name).toBe('Ring')
  })
})
