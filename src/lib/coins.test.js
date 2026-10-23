import { describe, it, expect } from 'vitest'
import {
  isCoinType,
  coinLabel,
  coinMrpFor,
  coinLineTotal,
  coinLineWeight,
  coinDemand,
  COIN_HSN,
} from './coins'

describe('coins', () => {
  it('recognises only coin types', () => {
    expect(isCoinType('gold_coin')).toBe(true)
    expect(isCoinType('silver_coin')).toBe(true)
    expect(isCoinType('gold_18k')).toBe(false)
    expect(isCoinType(undefined)).toBe(false)
  })

  it('labels coin types and maps HSN codes', () => {
    expect(coinLabel('gold_coin')).toBe('Gold Coin')
    expect(coinLabel('silver_coin')).toBe('Silver Coin')
    expect(COIN_HSN.gold_coin).toBe('71189010')
    expect(COIN_HSN.silver_coin).toBe('71189020')
  })

  it('line total is MRP × qty (money), line weight is unit × qty (grams)', () => {
    expect(coinLineTotal(5500, 3)).toBe(16500)
    expect(coinLineTotal('5500.5', '2')).toBe(11001)
    expect(coinLineWeight(5, 3)).toBe(15)
    expect(coinLineWeight('2.5', '4')).toBe(10)
    expect(coinLineWeight('', 4)).toBe(0)
  })

  it('finds MRP only for the exact active denomination', () => {
    const rates = [
      { type: 'gold_coin', unit_weight: 5, mrp: 5500, active: true },
      { type: 'gold_coin', unit_weight: 10, mrp: 11000, active: false },
    ]
    expect(coinMrpFor(rates, 'gold_coin', 5)).toBe(5500)
    expect(coinMrpFor(rates, 'gold_coin', '5.000')).toBe(5500)
    expect(coinMrpFor(rates, 'gold_coin', 10)).toBe(null)
    expect(coinMrpFor(rates, 'silver_coin', 5)).toBe(null)
    expect(coinMrpFor(rates, 'gold_coin', '')).toBe(null)
  })

  it('nets edit-mode demand by type and denomination', () => {
    const lines = [
      { coin_type: 'gold_coin', unit_weight: 5, qty: 2 },
      { coin_type: 'gold_coin', unit_weight: 5, qty: 1 },
      { coin_type: 'silver_coin', unit_weight: 10, qty: 4 },
    ]
    const original = [{ material_type: 'gold_coin', unit_weight: 5, qty: 2 }]
    const demand = coinDemand(lines, original)
    expect(demand['gold_coin|5']).toEqual({ type: 'gold_coin', unit_weight: 5, pcs: 1, grams: 5 })
    expect(demand['silver_coin|10']).toEqual({ type: 'silver_coin', unit_weight: 10, pcs: 4, grams: 40 })
  })

  it('ignores incomplete coin lines', () => {
    const demand = coinDemand([
      { coin_type: 'gold_coin', unit_weight: '', qty: 2 },
      { coin_type: 'gold_coin', unit_weight: 5, qty: 0 },
      { item_id: 7 },
    ])
    expect(demand).toEqual({})
  })
})
