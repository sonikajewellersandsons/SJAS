import { useState, useMemo, useEffect, useRef } from 'react'
import { Calculator } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ComboBox from '../components/ComboBox'

const HALLMARK_TAX_PCT = 18

function fmt(n) {
  return '\u20B9' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtWhole(n) {
  return '\u20B9' + (Number(n) || 0).toLocaleString('en-IN')
}

const purityOptions = [
  { value: '999', label: '24K' },
  { value: '916', label: '22K' },
  { value: '875', label: '21K' },
  { value: '750', label: '18K' },
  { value: '585', label: '14K' },
]

function RateCard({ label, total, gold, gst, color }) {
  return (
    <div className="stat-card" style={{ textAlign: 'center', padding: '1.2rem 1rem' }}>
      <div className="stat-label" style={{ fontSize: '0.85rem', marginBottom: '6px', fontWeight: 600 }}>{label}</div>
      <div className="stat-value" style={{ fontSize: '1.5rem', color }}>{fmtWhole(total)}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.6' }}>
        <div>Gold: {fmtWhole(gold)}</div>
        <div>GST (3%): {fmtWhole(gst)}</div>
      </div>
    </div>
  )
}

export default function PriceCalculatorPage() {
  const [rateInput, setRateInput] = useState(() => { try { return localStorage.getItem('pc_goldRate') || '' } catch { return '' } })
  const [weight, setWeight] = useState('10')
  const [purity, setPurity] = useState('916')
  const [labourPct, setLabourPct] = useState('10')
  const [hallmarkCharge, setHallmarkCharge] = useState(() => {
    try { return localStorage.getItem('pc_hallmarkCharge') ?? '' } catch { return '' }
  })
  const [masterItems, setMasterItems] = useState([])
  const [masterItemId, setMasterItemId] = useState('')
  const autoFilledHallmark = useRef(false)

  useEffect(() => {
    try { localStorage.setItem('pc_goldRate', rateInput) } catch {}
  }, [rateInput])

  useEffect(() => {
    try { localStorage.setItem('pc_hallmarkCharge', hallmarkCharge) } catch {}
  }, [hallmarkCharge])

  // Hallmark charges are maintained in Stock → Item Master. Pull them here so the
  // calculator always reflects the shop's current hallmark price instead of a
  // hardcoded default (which is what made this page look "stuck").
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('item_master')
        .select('id, name, purity, hallmark_charge, material_type')
        .eq('active', true)
        .order('name')
      if (cancelled || error || !data) return
      setMasterItems(data)
    })()
    return () => { cancelled = true }
  }, [])

  // Most common hallmark charge among active master items — used ONCE as the
  // initial value so a first-time visitor never sees a stale hardcoded number.
  const masterHallmarkDefault = useMemo(() => {
    const counts = new Map()
    for (const m of masterItems) {
      const v = Number(m.hallmark_charge) || 0
      if (v > 0) counts.set(v, (counts.get(v) || 0) + 1)
    }
    let best = 0
    let bestCount = 0
    for (const [v, c] of counts) {
      if (c > bestCount) { best = v; bestCount = c }
    }
    return best
  }, [masterItems])

  useEffect(() => {
    if (autoFilledHallmark.current || hallmarkCharge !== '' || !masterHallmarkDefault) return
    autoFilledHallmark.current = true
    setHallmarkCharge(String(masterHallmarkDefault))
  }, [masterHallmarkDefault, hallmarkCharge])

  const hallmarkItemOptions = useMemo(
    () => masterItems
      .filter(m => m.material_type !== 'gold_18k')
      .map(m => ({ value: String(m.id), label: `${m.name} (${m.purity})` })),
    [masterItems]
  )

  function handleMasterItemChange(val) {
    setMasterItemId(val)
    const item = masterItems.find(m => String(m.id) === String(val))
    if (item) setHallmarkCharge(String(Number(item.hallmark_charge) || 0))
  }

  const goldRateTotal = useMemo(() => {
    const parsed = parseFloat(rateInput.replace(/,/g, ''))
    return !isNaN(parsed) && parsed > 0 ? parsed : null
  }, [rateInput])

  const goldRateExclGst = goldRateTotal ? Math.round(goldRateTotal / 1.03) : null
  const goldRateGst = goldRateTotal ? goldRateTotal - goldRateExclGst : null

  const gold22kExclGst = goldRateExclGst ? Math.round(goldRateExclGst * 916 / 999) : null
  const gold22kTotal = gold22kExclGst ? Math.round(gold22kExclGst * 1.03) : null
  const gold22kGst = gold22kTotal ? gold22kTotal - gold22kExclGst : null

  const gold18kExclGst = goldRateExclGst ? Math.round(goldRateExclGst * 750 / 999) : null
  const gold18kTotal = gold18kExclGst ? Math.round(gold18kExclGst * 1.03) : null
  const gold18kGst = gold18kTotal ? gold18kTotal - gold18kExclGst : null

  const gold14kExclGst = goldRateExclGst ? Math.round(goldRateExclGst * 585 / 999) : null
  const gold14kTotal = gold14kExclGst ? Math.round(gold14kExclGst * 1.03) : null
  const gold14kGst = gold14kTotal ? gold14kTotal - gold14kExclGst : null

  function calcResult() {
    const w = parseFloat(weight) || 0
    if (!goldRateExclGst || w <= 0) return null
    const ratePerGram = goldRateExclGst / 10
    const purityFactor = parseInt(purity) / 999
    const lp = Math.max(0, parseFloat(labourPct) || 0)
    const goldValue = Math.round(w * ratePerGram * purityFactor * 100) / 100
    const labour = Math.round(goldValue * lp / 100 * 100) / 100
    const subtotal = goldValue + labour
    const gst = Math.round(subtotal * 0.03 * 100) / 100
    const hc = parseFloat(hallmarkCharge) || 0
    const hcTax = Math.round(hc * HALLMARK_TAX_PCT / 100 * 100) / 100
    const total = subtotal + gst + hc + hcTax
    return { weight: w, purity: parseInt(purity), ratePerGram: Math.round(ratePerGram * purityFactor * 100) / 100, goldValue, labour, gst, hc, hcTax, total }
  }

  const result = calcResult()

  const cards = [
    { label: '24K Gold Rate', total: goldRateTotal, gold: goldRateExclGst, gst: goldRateGst, color: 'var(--accent)' },
    { label: '22K Gold Rate', total: gold22kTotal, gold: gold22kExclGst, gst: gold22kGst, color: 'var(--blue)' },
    { label: '18K Gold Rate', total: gold18kTotal, gold: gold18kExclGst, gst: gold18kGst, color: 'var(--green)' },
    { label: '14K Gold Rate', total: gold14kTotal, gold: gold14kExclGst, gst: gold14kGst, color: 'var(--orange)' },
  ]

  function handleRateChange(e) {
    const raw = e.target.value.replace(/[^0-9,]/g, '')
    setRateInput(raw)
  }

  function handleRateBlur() {
    if (goldRateTotal) {
      const formatted = goldRateTotal.toLocaleString('en-IN')
      if (rateInput !== formatted) setRateInput(formatted)
    }
  }

  function handleRateFocus() {
    if (goldRateTotal) {
      setRateInput(String(goldRateTotal))
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Price Calculator</h2>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Gold Rate
          </h3>
        </div>
        <div style={{ padding: '1.2rem' }}>
          <div className="form-group">
            <label className="label" style={{ fontSize: '0.95rem', fontWeight: 600 }}>24K Gold Rate (incl. GST) per 10g</label>
            <div className="input-group">
              <span className="input-group-text" style={{ fontSize: '1.1rem', padding: '0.6rem 0.8rem' }}>{'\u20B9'}</span>
              <input className="input" type="text" inputMode="numeric"
                placeholder="Enter gold rate"
                value={rateInput}
                onChange={handleRateChange}
                onFocus={handleRateFocus}
                onBlur={handleRateBlur}
                style={{ padding: '0.6rem 0.8rem', fontSize: '1.1rem', flex: '1' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {goldRateTotal ? cards.map(card => (<RateCard key={card.label} {...card} />)) : <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Enter 24K gold rate above to see rate breakdown</p>}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calculator size={16} /> Gold Price Calculator
          </h3>
        </div>
        <div style={{ padding: '1rem' }}>
          <div className="form-row" style={{ gap: '12px', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: '2' }}>
              <label className="label">Hallmark from Item Master</label>
              <ComboBox
                options={hallmarkItemOptions}
                value={masterItemId}
                onChange={handleMasterItemChange}
                freeText={false}
                placeholder="Search an item to pull its hallmark charge..."
              />
              <span className="text-xs text-muted" style={{ display: 'block', marginTop: '3px' }}>
                Hallmark charges are set in Stock → Item Master. Picking an item fills the charge below.
              </span>
            </div>
          </div>

          <div className="form-row" style={{ gap: '12px', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: '1' }}>
              <label className="label">Weight (grams)</label>
              <input className="input" type="number" step="0.1" min="0" value={weight}
                onChange={e => setWeight(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} />
            </div>
            <div className="form-group" style={{ flex: '1' }}>
              <label className="label">Purity</label>
              <select className="input" value={purity} onChange={e => setPurity(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}>
                <option value="999">24K / 999 (99.9%)</option>
                <option value="916">22K / 916 (91.6%)</option>
                <option value="875">21K / 875 (87.5%)</option>
                <option value="750">18K / 750 (75.0%)</option>
                <option value="585">14K / 585 (58.5%)</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: '1' }}>
              <label className="label">Labour (%)</label>
              <input className="input" type="number" step="0.5" min="0" value={labourPct}
                onChange={e => setLabourPct(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} />
            </div>
            <div className="form-group" style={{ flex: '1' }}>
              <label className="label">Hallmark Charge</label>
              <div className="input-group">
                <span className="input-addon">{'\u20B9'}</span>
                <input className="input input-group-field" type="number" min="0" step="1" value={hallmarkCharge}
                  onChange={e => setHallmarkCharge(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }} />
              </div>
              {masterItemId && (() => {
                const mi = masterItems.find(m => String(m.id) === String(masterItemId))
                if (!mi) return null
                const mv = Number(mi.hallmark_charge) || 0
                return Number(hallmarkCharge) === mv ? null : (
                  <span className="text-xs" style={{ display: 'block', marginTop: '3px', color: 'var(--orange)' }}>
                    Master value: {fmt(mv)} — edited here only
                  </span>
                )
              })()}
            </div>
          </div>

          {result && (
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '1rem', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <div className="text-xs text-muted">Weight</div>
                  <div className="font-bold">{result.weight}g</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Purity</div>
                  <div className="font-bold">{result.purity}/999 ({purityOptions.find(p => p.value === purity)?.label || purity})</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Gold Rate /g</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.ratePerGram)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Gold Value</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.goldValue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Labour ({labourPct}%)</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.labour)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">GST (3%)</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.gst)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Hallmark</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.hc)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">H. Tax ({HALLMARK_TAX_PCT}%)</div>
                  <div className="font-bold" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.hcTax)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Total Price</div>
                  <div className="font-bold" style={{ fontSize: '1.2rem', color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(result.total)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}