import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import { logAction } from '../lib/audit'
import { cleanPhone, financialYear, fyFromInvNo, invNoSeq } from '../lib/format'
import { Search, Plus, X, FileText } from 'lucide-react'

const DEFAULT_TAX_PCT = 3
const DEFAULT_LABOUR_PCT = 10
const HALLMARK_TAX_PCT = 18

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// True if the invoice/voucher number is already used by another record
async function invNoTaken(invNo, excludeId) {
  if (!invNo) return false
  const { data: inv } = await supabase.from('invoices').select('id').eq('inv_no', invNo).maybeSingle()
  if (inv && inv.id !== excludeId) return true
  const { data: iws } = await supabase.from('inward_supply_vouchers').select('inv_no').eq('inv_no', invNo).limit(1)
  if (iws && iws.length > 0) return true
  return false
}

export default function BillingPage() {
  const { addToast } = useToast()
  const { profile: userProfile } = useAuth()

  const [customers, setCustomers] = useState([])
  const [masterItems, setMasterItems] = useState([])
  const [stockLots, setStockLots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Header
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [invNo, setInvNo] = useState('')
  const [goldRate, setGoldRate] = useState(0)
  const [goldRateStr, setGoldRateStr] = useState('')
  const [useCustomGoldRate, setUseCustomGoldRate] = useState(false)

  // Customer
  const [custSearch, setCustSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustDropdown, setShowCustDropdown] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '', address: '', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' })
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [custHighlightIdx, setCustHighlightIdx] = useState(-1)
  const custRef = useRef(null)

  // Items bucket
  const [lineItems, setLineItems] = useState([
    { item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: DEFAULT_TAX_PCT.toString(), hallmark_charge: 0, huid_enabled: true, huid_code: '', is_silver: false, silver_rate: '', silver_type: 'silver_925' }
  ])
  const [expandedLot, setExpandedLot] = useState(-1)
  const [silverStock, setSilverStock] = useState({ silver_925: 0, silver_ornaments: 0 })
  const [goldStock, setGoldStock] = useState(0)

  // Inward Supply vouchers (exchange adjustment)
  const [inwardVouchers, setInwardVouchers] = useState([])

  // Totals
  const [adjAmt, setAdjAmt] = useState(0)
  const [adjBillNo, setAdjBillNo] = useState('')
  const [adjVoucherId, setAdjVoucherId] = useState(null)
  const [discount, setDiscount] = useState(0)
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [cashAmt, setCashAmt] = useState(0)
  const [bankAmt, setBankAmt] = useState(0)
  const [taxPct, setTaxPct] = useState(DEFAULT_TAX_PCT.toString())

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [editInvoiceId, setEditInvoiceId] = useState(null)
  const editModeRef = useRef(false)
  const editOriginalItems = useRef([])

  useEffect(() => { editModeRef.current = editMode }, [editMode])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const eid = params.get('edit')
    loadData(eid ? parseInt(eid) : null)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.target.type === 'number') e.preventDefault() }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  async function loadData(pendingEditId) {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        supabase.from('customers').select('id, name, phone, address, state, aadhaar, pan, pincode, gstin').order('name').limit(1000),
        supabase.from('item_master').select('id, name, hallmark_charge, purity, material_type').eq('active', true).order('name'),
        supabase.from('settings').select('key, value'),
        supabase.rpc('get_stock_lots'),
        supabase.from('inward_supply_vouchers').select('id, inv_no, customer_id, customer_name, grand_total, date')
          .not('grand_total', 'eq', 0).order('created_at', { ascending: false }).limit(200),
      ])
      const [custRes, itemsRes, settingsRes, stockRes, inwardRes] = results.map(r => r.status === 'fulfilled' ? r.value : { data: null })
      if (custRes.data) setCustomers(custRes.data)
      if (itemsRes.data) setMasterItems(itemsRes.data)
      if (stockRes.data) setStockLots(stockRes.data)
      if (inwardRes.data) setInwardVouchers(inwardRes.data)
      // Load silver stock
      const { data: silverPurchases } = await supabase.from('material_purchases').select('type, weight, sold_weight').in('type', ['silver_925', 'silver_ornaments'])
      if (silverPurchases) {
        const stock = { silver_925: 0, silver_ornaments: 0 }
        silverPurchases.forEach(p => { stock[p.type] = (stock[p.type] || 0) + parseFloat(p.weight) - parseFloat(p.sold_weight) })
        setSilverStock(stock)
      }
      // Load Gold 18K stock
      const { data: goldPurchases } = await supabase.from('material_purchases').select('weight, sold_weight').eq('type', 'gold_18k')
      if (goldPurchases) {
        setGoldStock(goldPurchases.reduce((s, p) => s + parseFloat(p.weight) - parseFloat(p.sold_weight), 0))
      }
      if (pendingEditId) {
        setEditInvoiceId(pendingEditId)
        setEditMode(true)
        await loadEditInvoice(pendingEditId, custRes.data || [], itemsRes.data || [])
      } else {
        await generateInvNo()
        // Auto-fill gold rate from Price Calculator (24K with GST → 22K without GST)
        let savedRate = null
        try { savedRate = localStorage.getItem('pc_goldRate') } catch { /* storage unavailable */ }
        if (savedRate) {
          const parsed = parseFloat(savedRate.replace(/,/g, ''))
          if (!isNaN(parsed) && parsed > 0) {
            const converted = Math.round(parsed / 1.03 * 916 / 999)
            setGoldRate(converted)
            setGoldRateStr(converted.toLocaleString('en-IN'))
          }
        } else {
          // Fallback: last saved billing gold rate from settings
          const goldSetting = (settingsRes.data || []).find(s => s.key === 'gold_rate')
          const savedGold = goldSetting?.value
          if (savedGold != null) {
            const g = parseFloat(savedGold)
            if (!isNaN(g) && g > 0) {
              setGoldRate(g)
              setGoldRateStr(g.toLocaleString('en-IN'))
            }
          }
        }
      }
    } catch (err) {
      addToast('Failed to load data', 'error')
    }
    setLoading(false)
  }

  async function loadEditInvoice(invId, custList, miList) {
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*, invoice_items(*, item_master!left(name, hsn_code))').eq('id', invId).single()
    if (invErr || !inv) { addToast('Failed to load invoice', 'error'); setEditMode(false); return }

    const invGoldRate = parseFloat(inv.gold_rate) || 0
    if (invGoldRate) { setGoldRate(invGoldRate); setGoldRateStr(invGoldRate.toLocaleString('en-IN')) }
    setUseCustomGoldRate(true)
    setDate(inv.date)
    setInvNo(inv.inv_no)
    setAdjAmt(parseFloat(inv.adj_amount) || 0)
    setAdjBillNo(inv.adj_bill_id ? String(inv.adj_bill_id) : '')
    setAdjVoucherId(inv.adj_bill_id)
    setDiscount(parseFloat(inv.discount) || 0)
    setPaymentMode(inv.payment_mode)
    setCashAmt(parseFloat(inv.cash_amt) || 0)
    setBankAmt(parseFloat(inv.bank_amt) || 0)

    const cust = (custList || []).find(c => c.id === inv.customer_id)
    if (cust) { setSelectedCustomer(cust) }

    const items = (inv.invoice_items || []).sort((a, b) => a.sno - b.sno)
    editOriginalItems.current = items
    setLineItems(items.map(item => {
      if (!item.item_id) {
        if (item.material_type === 'gold_18k') {
          return {
            item_id: 'gold18k',
            description: item.description_extra || 'Gold Jewellery (18K)',
            weight: item.weight.toString(),
            labour_pct: item.labour_pct != null && item.labour_pct !== '' ? item.labour_pct.toString() : DEFAULT_LABOUR_PCT.toString(),
            tax_pct: item.tax_pct != null && item.tax_pct !== undefined ? item.tax_pct.toString() : '0',
            hallmark_charge: 0,
            huid_enabled: false,
            huid_code: '',
            is_gold_18k: true,
          }
        }
        return {
          item_id: 'silver',
          description: item.description_extra || 'Quick Silver',
          weight: item.weight.toString(),
          labour_pct: '0',
          tax_pct: item.tax_pct != null && item.tax_pct !== undefined ? item.tax_pct.toString() : '0',
          hallmark_charge: 0,
          huid_enabled: false,
          huid_code: '',
          is_silver: true,
          silver_rate: item.rate_per_gram ? item.rate_per_gram.toString() : '',
          silver_type: item.material_type || 'silver_925',
        }
      }
      const mi = (miList || []).find(m => m.id === item.item_id)
      const is18k = mi?.material_type === 'gold_18k'
      const baseRate = is18k ? invGoldRate / 10 * 18 / 22 : invGoldRate / 10
      // Use stored labour_rate if available, else fallback to reverse calc
      const storedLabour = parseFloat(item.labour_rate)
      const computedLabour = storedLabour > 0 ? storedLabour : (invGoldRate > 0 ? Math.max(0, parseFloat(item.rate_per_gram) - baseRate) : 0)
      return {
        item_id: item.item_id.toString(),
        description: mi?.name || item.item_master?.name || '',
        weight: item.weight.toString(),
        labour_pct: item.labour_pct != null ? item.labour_pct.toString() : (storedLabour > 0 ? Math.round(computedLabour / baseRate * 100) : DEFAULT_LABOUR_PCT).toString(),
        tax_pct: item.tax_pct != null && item.tax_pct !== undefined ? item.tax_pct.toString() : DEFAULT_TAX_PCT.toString(),
        hallmark_charge: parseFloat(item.hallmark_charge) || 0,
        huid_enabled: item.huid,
        huid_code: item.huid_code || '',
        is_silver: false,
        silver_rate: '',
      }
    }))

  }

  async function getFy() {
    return financialYear()
  }

  async function generateInvNo() {
    const fy = await getFy()
    const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'sale').eq('fy', fy).maybeSingle()
    const seqNext = cur ? (parseInt(cur.last_no) || 0) + 1 : 1
    setInvNo(`SJS/${fy}/${String(seqNext).padStart(3, '0')}`)
  }

  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase()
    const digits = cleanPhone(custSearch)
    const digitsNo91 = digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone?.includes(custSearch) ||
      c.phone?.includes(digits) ||
      c.phone?.includes(digitsNo91) ||
      c.aadhaar?.includes(digits)
    )
  }, [customers, custSearch])

  useEffect(() => {
    function handleClick(e) {
      if (custRef.current && !custRef.current.contains(e.target)) {
        setShowCustDropdown(false)
        setCustHighlightIdx(-1)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleCustKeyDown(e) {
    if (!showCustDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCustHighlightIdx(i => Math.min(i + 1, filteredCustomers.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCustHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && custHighlightIdx >= 0 && filteredCustomers[custHighlightIdx]) {
      e.preventDefault()
      selectCustomer(filteredCustomers[custHighlightIdx])
    } else if (e.key === 'Escape') {
      setShowCustDropdown(false)
      setCustHighlightIdx(-1)
    }
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setIsNewCustomer(false)
    setCustSearch('')
    setShowCustDropdown(false)
  }

  function startNewCustomer() {
    setSelectedCustomer(null)
    setIsNewCustomer(true)
    setShowCustDropdown(false)
  }

  // Items
  const goldPerGram = goldRate / 10

  // Pre-index stock lots by name for O(1) lookup
  const stockLotsByName = useMemo(() => {
    const map = {}
    for (const lot of stockLots) {
      if (!map[lot.item_name]) map[lot.item_name] = []
      map[lot.item_name].push(lot)
    }
    return map
  }, [stockLots])

  // Match a current line to its original (edit mode) by content, not position,
  // so adding/removing/reordering lines during an edit stays correct.
  function findOrig(lineItemsArr, idx, itemId, weight, huidEnabled) {
    if (!editMode || !editOriginalItems.current || editOriginalItems.current.length === 0) return null
    const originals = editOriginalItems.current
    const claimed = new Set()
    for (let i = 0; i < idx; i++) {
      const ln = lineItemsArr[i]
      if (!ln.item_id) continue
      const oi = originals.findIndex((o, j) =>
        !claimed.has(j) && o.item_id != null &&
        parseInt(o.item_id) === parseInt(ln.item_id) &&
        parseFloat(o.weight) === parseFloat(ln.weight) &&
        o.huid === (ln.huid_enabled === true)
      )
      if (oi >= 0) claimed.add(oi)
    }
    if (!itemId) return null
    const oi = originals.findIndex((o, j) =>
      !claimed.has(j) && o.item_id != null &&
      parseInt(o.item_id) === parseInt(itemId) &&
      parseFloat(o.weight) === parseFloat(weight) &&
      o.huid === (huidEnabled === true)
    )
    return oi >= 0 ? originals[oi] : null
  }

  function checkStock(itemId, weight, huidEnabled, excludeIndex, agg) {
    if (!itemId || !weight) return null

    const a = agg || {}
    const silverDemand = a.silverDemand || {}
    const origSilverDemand = a.origSilverDemand || {}
    const goldDemand = a.goldDemand || 0
    const origGoldDemand = a.origGoldDemand || 0

    // ── Silver ──
    if (itemId === 'silver') {
      const line = lineItems[excludeIndex >= 0 ? excludeIndex : 0]
      const type = line?.silver_type
      if (!type) return { available: true }
      // Net new demand across ALL lines of this silver type vs original invoice
      const net = (silverDemand[type] || 0) - (origSilverDemand[type] || 0)
      return { available: net <= (silverStock[type] || 0) }
    }

    // ── Gold 18K ──
    if (itemId === 'gold18k') {
      const net = goldDemand - origGoldDemand
      return { available: net <= goldStock }
    }

    // ── Regular items (from item_master) ──
    const w = parseFloat(weight)
    if (!w) return null
    const item = masterItems.find(m => m.id === parseInt(itemId))
    if (!item) return null

    // Edit mode: line matches an original → its stock is already consumed
    const orig = findOrig(lineItems, excludeIndex, itemId, weight, huidEnabled)
    if (orig) {
      if (parseFloat(orig.weight) === w && orig.huid === !!huidEnabled) return { available: true }
      if (parseFloat(orig.weight) >= w && orig.huid === !!huidEnabled) return { available: true }
    }

    const lots = stockLotsByName[item.name]
    if (!lots) return { available: false }
    // Aggregate available pcs across ALL matching lots (multiple identical lots
    // can jointly satisfy a multi-piece line — previously only the top lot was
    // considered, producing false "out of stock").
    const matches = lots.filter(l =>
      Number(l.weight) === w && l.huid === !!huidEnabled && l.avail_pcs > 0
    )
    if (matches.length === 0) return { available: false }
    const alreadyClaimed = lineItems.filter((ln, i) => {
      if (i >= excludeIndex) return false
      // Skip lines unchanged from their original (their stock is already consumed)
      if (editMode && editOriginalItems.current) {
        const lnOrig = findOrig(lineItems, i, ln.item_id, ln.weight, ln.huid_enabled)
        if (lnOrig) return false
      }
      return ln.item_id && parseFloat(ln.weight) === w &&
        masterItems.find(m => m.id === parseInt(ln.item_id))?.name === item.name &&
        (ln.huid_enabled === true) === !!huidEnabled
    }).length
    const totalAvail = matches.reduce((s, l) => s + l.avail_pcs, 0)
    return (totalAvail - alreadyClaimed) > 0
      ? { available: true }
      : { available: false }
  }

  function addLine() {
    setLineItems([...lineItems, { item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: taxPct, hallmark_charge: 0, huid_enabled: true, huid_code: '', is_silver: false, silver_rate: '', silver_type: 'silver_925' }])
  }

  function addSilverLine() {
    setLineItems([...lineItems, { item_id: 'silver', description: 'Silver 925', weight: '', labour_pct: '0', tax_pct: DEFAULT_TAX_PCT.toString(), hallmark_charge: 0, huid_enabled: false, huid_code: '', is_silver: true, silver_rate: '', silver_type: 'silver_925' }])
  }

  function addGold18kLine() {
    setLineItems([...lineItems, { item_id: 'gold18k', description: 'Gold Jewellery (18K)', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: '0', hallmark_charge: 0, huid_enabled: false, huid_code: '', is_gold_18k: true }])
  }

  function updateLine(index, field, value) {
    const updated = lineItems.map((line, i) => {
      if (i !== index) return line
      const newLine = { ...line, [field]: value }
      if (field === 'item_id') {
        const item = masterItems.find(m => m.id === parseInt(value))
        if (item) {
          newLine.description = item.name
          newLine.hallmark_charge = Number(item.hallmark_charge)
          newLine.is_silver = false
          newLine.silver_rate = ''
          newLine.silver_type = ''
          newLine.is_gold_18k = false
        }
      }
      if (field === 'huid_enabled' && value === false) {
        newLine.huid_code = ''
      }
      if (field === 'silver_type') {
        newLine.description = value === 'silver_925' ? 'Silver 925' : 'Silver Ornaments'
        newLine.silver_rate = ''
      }
      return newLine
    })
    setLineItems(updated)
  }

  function removeLine(index) {
    if (lineItems.length === 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function getFilteredLots(line) {
    if (!line.item_id || line.is_silver || line.is_gold_18k) return []
    const item = masterItems.find(m => m.id === parseInt(line.item_id))
    if (!item) return []
    let lots = stockLotsByName[item.name]
    if (!lots) return []
    lots = lots.filter(l => l.avail_pcs > 0)
    const w = parseFloat(line.weight)
    if (w) lots = lots.filter(l => Number(l.weight) === w)
    return lots
  }

  // Memoized calculations — discount applied BEFORE tax per GST
  const {
    linePrices, lineTotals, totalPrice, totalHc, totalTax, totalHcTax,
    discAmt, beforeAdj, afterAdj, roundOff, grandTotal,
    stockResults, allStockAvailable, silverNet, goldNet,
  } = useMemo(() => {
    // Net silver/18K demand across ALL lines (new demand minus original demand
    // in edit mode) so multiple lines can't jointly exceed available stock.
    const silverDemand = { silver_925: 0, silver_ornaments: 0 }
    const origSilverDemand = { silver_925: 0, silver_ornaments: 0 }
    let goldDemand = 0
    let origGoldDemand = 0
    for (const ln of lineItems) {
      if (ln.is_silver) silverDemand[ln.silver_type] = (silverDemand[ln.silver_type] || 0) + (parseFloat(ln.weight) || 0)
      else if (ln.is_gold_18k) goldDemand += parseFloat(ln.weight) || 0
    }
    for (const o of (editOriginalItems.current || [])) {
      if (!o.item_id && o.material_type === 'gold_18k') origGoldDemand += parseFloat(o.weight) || 0
      else if (!o.item_id && o.material_type) origSilverDemand[o.material_type] = (origSilverDemand[o.material_type] || 0) + (parseFloat(o.weight) || 0)
    }

    function calcLinePrice(line) {
      const w = parseFloat(line.weight) || 0
      if (line.is_silver) {
        const rate = parseFloat(line.silver_rate) || 0
        return { ratePerGram: rate, price: w * rate, hc: 0 }
      }
      const item = masterItems.find(m => m.id === parseInt(line.item_id))
      const is18k = line.is_gold_18k || item?.material_type === 'gold_18k'
      const baseRate = is18k ? goldPerGram * 18 / 22 : goldPerGram
      const goldValue = w * baseRate
      const lp = parseFloat(line.labour_pct)
      const labourPct = !isNaN(lp) ? lp : DEFAULT_LABOUR_PCT
      return {
        ratePerGram: baseRate * (1 + labourPct / 100),
        price: goldValue * (1 + labourPct / 100),
        hc: parseFloat(line.hallmark_charge) || 0,
      }
    }
    const lp = lineItems.map(calcLinePrice)
    const tp = lp.reduce((s, l) => s + l.price, 0)
    const thc = lp.reduce((s, l) => s + l.hc, 0)
    const da = parseFloat(discount || 0)
    // Tax is computed on the FULL price; the discount is a flat deduction from
    // the final total (after tax), so a ₹669 discount takes exactly ₹669 off
    // the grand total (previously it also shrank the taxable base → tax).
    const lt = lineItems.map((l, i) => {
      const tax = lp[i].price * (parseFloat(l.tax_pct) || 0) / 100
      const hcTax = lp[i].hc * HALLMARK_TAX_PCT / 100
      return { ...lp[i], tax, hcTax, total: lp[i].price + tax + lp[i].hc + hcTax }
    })
    const tt = lt.reduce((s, l) => s + l.tax, 0)
    const thct = lt.reduce((s, l) => s + l.hcTax, 0)
    const ba = tp + tt + thc + thct - da
    const aa = ba - parseFloat(adjAmt || 0)
    const ro = Math.round(aa) - aa
    const sr = lineItems.map((l, i) => checkStock(l.item_id, l.weight, l.huid_enabled, i, { silverDemand, origSilverDemand, goldDemand, origGoldDemand }))
    return {
      linePrices: lp, totalPrice: tp, totalHc: thc,
      discAmt: da, lineTotals: lt, totalTax: tt, totalHcTax: thct,
      beforeAdj: ba, afterAdj: aa, roundOff: ro, grandTotal: aa + ro,
      stockResults: sr, allStockAvailable: lineItems.every((l, i) => !l.item_id || sr[i] === null || sr[i]?.available),
      silverNet: {
        silver_925: (silverDemand.silver_925 || 0) - (origSilverDemand.silver_925 || 0),
        silver_ornaments: (silverDemand.silver_ornaments || 0) - (origSilverDemand.silver_ornaments || 0),
      },
      goldNet: goldDemand - origGoldDemand,
    }
  }, [lineItems, goldRate, masterItems, stockLotsByName, silverStock, goldStock, discount, adjAmt, editMode, editOriginalItems])

  const savingRef = useRef(false)

  async function saveInvoice(e) {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true

    if (!selectedCustomer && !isNewCustomer) { addToast('Select or add a customer', 'error'); savingRef.current = false; return }
    if (!goldRate || goldRate <= 0) { addToast('Enter gold rate', 'error'); savingRef.current = false; return }
    if (isNewCustomer && !newCust.name.trim()) { addToast('Customer name is required', 'error'); savingRef.current = false; return }
    const validLines = lineItems.filter(l => l.item_id)
    if (validLines.length === 0) { addToast('Add at least one item', 'error'); savingRef.current = false; return }
    for (const l of validLines) {
      const origIdx = lineItems.indexOf(l)
      const w = parseFloat(l.weight)
      if (!w || w <= 0) { addToast(`Item #${origIdx+1}: enter a valid weight`, 'error'); savingRef.current = false; return }
      if (l.is_silver) {
        if (l.silver_rate === '' || isNaN(parseFloat(l.silver_rate)) || parseFloat(l.silver_rate) <= 0) { addToast(`Item #${origIdx+1}: enter a valid silver rate`, 'error'); savingRef.current = false; return }
      } else if (l.is_gold_18k) {
        if (l.labour_pct === '' || isNaN(parseFloat(l.labour_pct)) || parseFloat(l.labour_pct) < 0) { addToast(`Item #${origIdx+1}: enter a valid labour %`, 'error'); savingRef.current = false; return }
      } else {
        if (l.labour_pct === '' || isNaN(parseFloat(l.labour_pct)) || parseFloat(l.labour_pct) < 0) { addToast(`Item #${origIdx+1}: enter a valid labour %`, 'error'); savingRef.current = false; return }
        if (!l.item_id || isNaN(parseInt(l.item_id))) { addToast(`Item #${origIdx+1}: select an item`, 'error'); savingRef.current = false; return }
      }
    }
    if (paymentMode === 'BOTH' && Math.abs(parseFloat(cashAmt || 0) + parseFloat(bankAmt || 0) - grandTotal) > 0.01) {
      addToast('Cash + Bank amount must equal Grand Total', 'error'); savingRef.current = false; return
    }
    if (discount > totalPrice + totalTax + totalHcTax + totalHc) {
      addToast('Discount cannot exceed total amount', 'error'); savingRef.current = false; return
    }

    // Invoice number collision guard (second browser tab / manual override).
    // Runs before any stock reversal so a conflict never corrupts state.
    if (await invNoTaken(invNo, (editMode || editModeRef.current) && editInvoiceId ? editInvoiceId : null)) {
      addToast(`Invoice number ${invNo} is already in use. A new number has been generated.`, 'error')
      await generateInvNo()
      savingRef.current = false
      return
    }

    setSaving(true)
    let reversed = false
    let invId, finalInvNo
    let oldItems = []
    let originalHeader = null
    const isEdit = (editMode || editModeRef.current) && editInvoiceId
    try {
      // ── Resolve customer BEFORE any stock mutation so a failure here never
      //    leaves released stock behind. Use the DB record's details when the
      //    typed phone matches an existing customer (header must match the link).
      let customerId = selectedCustomer?.id
      let customerName = selectedCustomer ? selectedCustomer.name : newCust.name.trim()
      let customerAddress = selectedCustomer ? (selectedCustomer.address || '') : newCust.address.trim()
      let customerPhone = selectedCustomer ? (selectedCustomer.phone || '') : newCust.phone.trim()
      let customerState = selectedCustomer ? (selectedCustomer.state || 'Haryana') : newCust.state
      let customerGstin = selectedCustomer ? (selectedCustomer.gstin || '') : newCust.gstin.trim().toUpperCase()

      if (isNewCustomer) {
        let cleanedPhone = ''
        if (newCust.phone.trim()) {
          cleanedPhone = cleanPhone(newCust.phone)
          const { data: existing } = await supabase.from('customers').select('id, name, phone, address, state, gstin').eq('phone', cleanedPhone).maybeSingle()
          if (existing) {
            customerId = existing.id
            customerName = existing.name
            customerAddress = existing.address || ''
            customerPhone = existing.phone || ''
            customerState = existing.state || 'Haryana'
            customerGstin = existing.gstin || ''
          }
        }
        if (!customerId) {
          const { data: newCustData, error: custErr } = await supabase.from('customers').insert({
            name: newCust.name.trim(),
            phone: cleanedPhone,
            address: newCust.address.trim(),
            state: newCust.state,
            aadhaar: newCust.aadhaar.trim(),
            pan: newCust.pan.trim().toUpperCase(),
            pincode: newCust.pincode.trim(),
            gstin: newCust.gstin.trim().toUpperCase(),
          }).select('id').single()
          if (custErr) throw custErr
          customerId = newCustData.id
        }
      }

      if (isEdit) {
        invId = editInvoiceId
        finalInvNo = invNo
        // Snapshot the pre-edit rows so a failed save can fully restore them.
        const { data: curInv } = await supabase.from('invoices').select('*').eq('id', invId).single()
        if (curInv) originalHeader = curInv
        const { data: curItems } = await supabase.from('invoice_items').select('*').eq('invoice_id', invId)
        oldItems = curItems || []
        const { error: revMatErr } = await supabase.rpc('reverse_material_sale', { p_invoice_id: invId })
        if (revMatErr) throw revMatErr
        reversed = true
        const { error: revErr } = await supabase.rpc('reverse_invoice_stock', { p_invoice_id: invId })
        if (revErr) throw revErr
        const { data: freshLots } = await supabase.rpc('get_stock_lots')
        if (freshLots) setStockLots(freshLots)
      } else {
        finalInvNo = invNo
      }

      const invoiceData = {
        inv_no: finalInvNo,
        date,
        customer_id: customerId,
        customer_name: customerName,
        customer_address: customerAddress,
        customer_phone: customerPhone,
        customer_state: customerState,
        customer_gstin: customerGstin,
        gold_rate: Math.round(goldRate * 100) / 100,
        subtotal: Math.round(totalPrice * 100) / 100,
        hallmark_total: Math.round(totalHc * 100) / 100,
        tax_total: Math.round((totalTax + totalHcTax) * 100) / 100,
        adj_amount: Math.round(parseFloat(adjAmt || 0) * 100) / 100,
        adj_bill_id: adjBillNo ? parseInt(adjBillNo) : null,
        discount: Math.round(parseFloat(discount || 0) * 100) / 100,
        round_off: Math.round(roundOff * 100) / 100,
        grand_total: Math.round(grandTotal * 100) / 100,
        payment_mode: paymentMode,
        cash_amt: paymentMode === 'BOTH' ? (parseFloat(cashAmt || 0)) : (paymentMode === 'CASH' ? grandTotal : 0),
        bank_amt: paymentMode === 'BOTH' ? (parseFloat(bankAmt || 0)) : (paymentMode === 'E-BANKING' ? grandTotal : 0),
        created_by: userProfile?.id || null,
      }

      if (isEdit) {
        const { error: updErr } = await supabase.from('invoices').update(invoiceData).eq('id', invId)
        if (updErr) throw updErr
      } else {
        const { data: inv, error: invErr } = await supabase.from('invoices').insert(invoiceData).select('id').single()
        if (invErr) throw invErr
        invId = inv.id
      }

      const invoiceItemsData = validLines.map((line, idx) => {
        const origIdx = lineItems.indexOf(line)
        const c = lineTotals[origIdx >= 0 ? origIdx : idx]
        if (line.is_silver) {
          return {
            invoice_id: invId,
            item_id: null,
            weight: parseFloat(line.weight) || 0,
            rate_per_gram: Math.round((parseFloat(line.silver_rate) || 0) * 100) / 100,
            price: Math.round(c.price * 100) / 100,
            tax_amount: Math.round(c.tax * 100) / 100,
            tax_pct: parseFloat(line.tax_pct) || 0,
            labour_rate: 0,
            labour_pct: 0,
            hallmark_charge: 0,
            huid: false,
            huid_code: '',
            description_extra: line.description || 'Quick Silver',
            material_type: line.silver_type,
            sno: idx + 1,
          }
        }
        if (line.is_gold_18k) {
          return {
            invoice_id: invId,
            item_id: null,
            weight: parseFloat(line.weight) || 0,
            rate_per_gram: Math.round(c.ratePerGram * 100) / 100,
            price: Math.round(c.price * 100) / 100,
            tax_amount: Math.round(c.tax * 100) / 100,
            tax_pct: parseFloat(line.tax_pct) || 0,
            labour_rate: Math.round(goldPerGram * 18 / 22 * ((!isNaN(parseFloat(line.labour_pct)) ? parseFloat(line.labour_pct) : DEFAULT_LABOUR_PCT) / 100) * 100) / 100,
            labour_pct: !isNaN(parseFloat(line.labour_pct)) ? parseFloat(line.labour_pct) : DEFAULT_LABOUR_PCT,
            hallmark_charge: 0,
            huid: false,
            huid_code: '',
            description_extra: line.description || 'Gold Jewellery (18K)',
            material_type: 'gold_18k',
            sno: idx + 1,
          }
        }
        return {
          invoice_id: invId,
          item_id: parseInt(line.item_id),
          weight: parseFloat(line.weight) || 0,
          rate_per_gram: Math.round(c.ratePerGram * 100) / 100,
          price: Math.round(c.price * 100) / 100,
          tax_amount: Math.round(c.tax * 100) / 100,
          tax_pct: parseFloat(line.tax_pct) || DEFAULT_TAX_PCT,
          labour_rate: (() => { const _item = masterItems.find(m => m.id === parseInt(line.item_id)); const _is18k = _item?.material_type === 'gold_18k'; const _base = _is18k ? goldPerGram * 18 / 22 : goldPerGram; const _lp = parseFloat(line.labour_pct); return Math.round(_base * ((!isNaN(_lp) ? _lp : DEFAULT_LABOUR_PCT) / 100) * 100) / 100 })(),
          labour_pct: !isNaN(parseFloat(line.labour_pct)) ? parseFloat(line.labour_pct) : DEFAULT_LABOUR_PCT,
          hallmark_charge: c.hc,
          huid: line.huid_enabled,
          huid_code: line.huid_code || '',
          sno: idx + 1,
        }
      })
      const { error: itemsErr } = await supabase.from('invoice_items').insert(invoiceItemsData)
      if (itemsErr) throw itemsErr

      // Delete ONLY the pre-existing rows (by id) — never the just-inserted ones
      if (isEdit && oldItems.length > 0) {
        const { error: delErr } = await supabase.from('invoice_items').delete().in('id', oldItems.map(i => i.id))
        if (delErr) throw delErr
      }

      const { error: procErr } = await supabase.rpc('process_invoice_stock', { p_invoice_id: invId })
      if (procErr) throw procErr

      const { error: matProcErr } = await supabase.rpc('process_material_sale', { p_invoice_id: invId })
      if (matProcErr) throw matProcErr

      // Update inv_sequences (both create and edit — handles manually entered higher numbers).
      // Use the FY embedded in the chosen number, not today's date, so a manual
      // number from another financial year doesn't advance the current FY sequence.
      const seqNum = invNoSeq(finalInvNo)
      const fyFromNumber = fyFromInvNo(finalInvNo)
      if (seqNum !== null && fyFromNumber) {
        const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'sale').eq('fy', fyFromNumber).maybeSingle()
        const curNo = cur ? parseInt(cur.last_no) || 0 : 0
        if (seqNum > curNo) {
          const { error: seqErr } = await supabase.from('inv_sequences').upsert({ type: 'sale', fy: fyFromNumber, last_no: seqNum }, { onConflict: 'type,fy' })
          if (seqErr) console.warn('Sequence update failed (non-critical):', seqErr.message)
        }
      }

      // Persist gold rate to settings
      if (goldRate > 0) {
        await supabase.from('settings').upsert({ key: 'gold_rate', value: JSON.stringify(goldRate) }, { onConflict: 'key' })
      }

      addToast(editMode ? `Invoice ${finalInvNo} updated` : `Invoice ${finalInvNo} created`, 'success')
      logAction(editMode ? 'invoice_updated' : 'invoice_created', 'invoices', invId, { inv_no: finalInvNo, grand_total: grandTotal, customer: selectedCustomer?.name || newCust.name || '' })
      // Post-save refresh + form reset are best-effort. A failure here must NOT
      // roll back the already-committed save (the catch below only handles
      // failures that happen BEFORE commit).
      try {
        const { data: freshLots } = await supabase.rpc('get_stock_lots')
        if (freshLots) setStockLots(freshLots)
        const { data: freshGold } = await supabase.from('material_purchases').select('weight, sold_weight').eq('type', 'gold_18k')
        if (freshGold) setGoldStock(freshGold.reduce((s, p) => s + parseFloat(p.weight) - parseFloat(p.sold_weight), 0))
        const { data: freshSilver } = await supabase.from('material_purchases').select('type, weight, sold_weight').in('type', ['silver_925', 'silver_ornaments'])
        if (freshSilver) {
          const stock = { silver_925: 0, silver_ornaments: 0 }
          freshSilver.forEach(p => { stock[p.type] = (stock[p.type] || 0) + parseFloat(p.weight) - parseFloat(p.sold_weight) })
          setSilverStock(stock)
        }
        await resetForm()
      } catch (e) { console.warn('Post-save refresh failed:', e) }
    } catch (err) {
      if (err?.code === '23505') {
        // Last-resort race: another tab committed the same number between our
        // pre-check and the insert. Nothing was created yet for create mode;
        // for edit mode the stock recovery below re-applies the old items.
        addToast('Invoice number already exists. A new number has been generated.', 'error')
        await generateInvNo()
      } else {
        addToast(err.message || 'Failed to save invoice', 'error')
      }
      console.error('Invoice error:', err)
      if (isEdit && invId) {
        // Full restore: rebuild the original items, header and stock consumption
        // so a failed edit never leaves released stock or a half-saved invoice.
        await supabase.from('invoice_items').delete().eq('invoice_id', invId).catch(() => {})
        if (oldItems.length > 0) {
          await supabase.from('invoice_items').insert(oldItems.map(({ id, ...rest }) => rest)).catch(() => {})
        }
        if (reversed) {
          let stockRestored = true
          await supabase.rpc('process_invoice_stock', { p_invoice_id: invId }).catch(() => { stockRestored = false })
          await supabase.rpc('process_material_sale', { p_invoice_id: invId }).catch(() => { stockRestored = false })
          if (!stockRestored) addToast('Original stock could not be fully restored. Please verify stock.', 'error')
        }
        if (originalHeader) {
          const { error: hdrErr } = await supabase.from('invoices').update(originalHeader).eq('id', invId)
          if (hdrErr) console.warn('Failed to restore invoice header:', hdrErr.message)
        }
        const { data: freshLots } = await supabase.rpc('get_stock_lots')
        if (freshLots) setStockLots(freshLots)
        await loadEditInvoice(invId, customers, masterItems)
      } else if (invId) {
        // Create mode: remove the partial invoice so it never blocks the
        // last-invoice delete or shows up as an empty row.
        await supabase.rpc('delete_invoice', { p_invoice_id: invId }).catch(async () => {
          await supabase.from('invoice_items').delete().eq('invoice_id', invId).catch(() => {})
        })
      }
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  async function resetForm() {
    setDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null)
    setIsNewCustomer(false)
    setNewCust({ name: '', phone: '', address: '', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' })
    setCustSearch('')
    setLineItems([{ item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: taxPct, hallmark_charge: 0, huid_enabled: true, huid_code: '', is_silver: false, silver_rate: '', silver_type: 'silver_925' }])
    setAdjAmt(0)
    setAdjBillNo('')
    setAdjVoucherId(null)
    setDiscount(0)
    setPaymentMode('CASH')
    setCashAmt(0)
    setBankAmt(0)
    setEditMode(false)
    setEditInvoiceId(null)
    editOriginalItems.current = []
    setGoldRate(0)
    setGoldRateStr('')
    setUseCustomGoldRate(false)
    // Re-autofill gold rate for the next invoice (price calculator → settings fallback)
    let savedRate = null
    try { savedRate = localStorage.getItem('pc_goldRate') } catch { /* storage unavailable */ }
    if (savedRate) {
      const parsed = parseFloat(savedRate.replace(/,/g, ''))
      if (!isNaN(parsed) && parsed > 0) {
        const converted = Math.round(parsed / 1.03 * 916 / 999)
        setGoldRate(converted)
        setGoldRateStr(converted.toLocaleString('en-IN'))
      }
    } else {
      const { data: settings } = await supabase.from('settings').select('key, value')
      const goldSetting = (settings || []).find(s => s.key === 'gold_rate')
      if (goldSetting?.value) {
        const g = parseFloat(goldSetting.value)
        if (!isNaN(g) && g > 0) { setGoldRate(g); setGoldRateStr(g.toLocaleString('en-IN')) }
      }
    }
    await generateInvNo()
  }

  if (loading) {
    const title = editMode ? 'Edit Invoice' : 'Billing'
    return <div className="page"><div className="page-header"><h2>{title}</h2></div><div className="loading-center"><div className="spinner" /></div></div>
  }

  return (
    <div className="page">
      <div className="page-header"><h2>{editMode ? 'Edit Invoice' : 'Billing'}</h2></div>

      <form onSubmit={saveInvoice}>
        {/* ─── Header: Date, Inv No, Gold Rate ─── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">Invoice</h3></div>
          <div className="form-row three">
            <div className="form-group">
              <label className="label">Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Invoice No.</label>
              <input className="input" value={invNo} onChange={e => setInvNo(e.target.value)} style={{ fontWeight: 700, color: 'var(--accent)' }} />
            </div>
            <div className="form-group">
              <label className="label">Gold Rate /10g</label>
              <div className="input-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', border: 'none', background: 'none' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'var(--bg-card)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '0.55rem 0.75rem',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                  transition: 'all 0.12s',
                  ...(useCustomGoldRate ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {})
                }}>
                  <input type="checkbox" style={{ accentColor: 'var(--accent)' }} checked={useCustomGoldRate} onChange={e => {
                    const checked = e.target.checked
                    setUseCustomGoldRate(checked)
                    if (!checked) {
                      const savedRate = localStorage.getItem('pc_goldRate')
                      if (savedRate) {
                        const parsed = parseFloat(savedRate.replace(/,/g, ''))
                        if (!isNaN(parsed) && parsed > 0) {
                          const converted = Math.round(parsed / 1.03 * 916 / 999)
                          setGoldRate(converted)
                          setGoldRateStr(converted.toLocaleString('en-IN'))
                        }
                      }
                    }
                  }} />
                  Custom
                </label>
                <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1.5px solid var(--border)', background: 'var(--bg)', flex: 1, ...(!useCustomGoldRate ? { opacity: 0.7 } : {}) }}>
                  <span className="input-addon">₹</span>
                  <input className="input input-group-field" type="text" inputMode="decimal"
                    style={{ border: 'none', background: 'var(--bg-card)', ...(!useCustomGoldRate ? { cursor: 'not-allowed' } : {}) }}
                    value={goldRateStr}
                    disabled={!useCustomGoldRate}
                    onChange={e => {
                      if (!useCustomGoldRate) return
                      const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                      setGoldRateStr(v)
                      setGoldRate(parseFloat(v) || 0)
                    }}
                    onBlur={e => {
                      if (!useCustomGoldRate) return
                      const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')) || 0
                      setGoldRateStr(n.toLocaleString('en-IN'))
                    }}
                    onFocus={e => {
                      if (!useCustomGoldRate) return
                      setGoldRateStr(goldRate ? goldRate.toString() : '')
                    }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Customer ─── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">Customer</h3></div>
          <div ref={custRef} style={{ padding: '0.75rem 1rem', position: 'relative' }}>
            <div className="cust-search-wrapper">
              <Search size={16} className="cust-search-icon" />
              <input className="input cust-search-input" placeholder="Search customer by name, phone, aadhaar..." value={custSearch}
                onChange={e => { setCustSearch(e.target.value); setShowCustDropdown(true); setIsNewCustomer(false); setCustHighlightIdx(-1) }}
                onFocus={() => { if (custSearch) setShowCustDropdown(true) }}
                onKeyDown={handleCustKeyDown} />
            </div>
            {showCustDropdown && custSearch && (
              <div className="cust-dropdown">
                {filteredCustomers.map((c, i) => (
                  <div key={c.id} className={`cust-option ${custHighlightIdx === i ? 'highlight' : ''}`} onMouseDown={() => selectCustomer(c)}
                    onMouseEnter={() => setCustHighlightIdx(i)}>
                    <span className="cust-option-name">{c.name}</span>
                    <span className="cust-option-phone">{c.phone}</span>
                  </div>
                ))}
                <div className="cust-add-new" onMouseDown={startNewCustomer}>+ Add new customer</div>
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="cust-details">
              <span className="cust-details-name">{selectedCustomer.name}</span>
              <span className="cust-details-muted">{selectedCustomer.phone}</span>
              <span className="cust-details-muted">{selectedCustomer.address}</span>
              <span className="cust-details-muted">{selectedCustomer.state}</span>
              {selectedCustomer.aadhaar && <span className="cust-details-muted">Aadhaar: {selectedCustomer.aadhaar}</span>}
              {selectedCustomer.pincode && <span className="cust-details-muted">Pincode: {selectedCustomer.pincode}</span>}
              <button type="button" className="btn-icon btn-sm" onClick={() => { setSelectedCustomer(null); setIsNewCustomer(false) }} title="Change"><X size={16} /></button>
            </div>
          )}

          {isNewCustomer && (
            <div style={{ padding: '0 1rem 0.75rem' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Name *</label>
                  <input className="input" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="label">Phone</label>
                  <input className="input" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group full">
                  <label className="label">Address</label>
                  <input className="input" value={newCust.address} onChange={e => setNewCust({ ...newCust, address: e.target.value })} />
                </div>
              </div>
              <div className="form-row four">
                <div className="form-group">
                  <label className="label">State</label>
                  <input className="input" value={newCust.state} onChange={e => setNewCust({ ...newCust, state: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Aadhaar</label>
                  <input className="input" value={newCust.aadhaar} onChange={e => setNewCust({ ...newCust, aadhaar: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">Pincode</label>
                  <input className="input" value={newCust.pincode} onChange={e => setNewCust({ ...newCust, pincode: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="label">GSTIN</label>
                  <input className="input" value={newCust.gstin} onChange={e => setNewCust({ ...newCust, gstin: e.target.value.toUpperCase() })} placeholder="e.g. 06AABCU9603R1ZX" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Items Bucket ─── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h3 className="card-title">Items</h3>
          </div>
          <div style={{ padding: '0.6rem 1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lineItems.map((line, i) => {
                const c = lineTotals[i]
                return (
                  <div key={i} style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '0.5rem 0.6rem', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span className="text-xs font-bold text-muted">Item #{i + 1}</span>
                      {lineItems.length > 1 && (
                        <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', lineHeight: 0 }}><X size={14} /></button>
                      )}
                    </div>

                    <div className="form-row" style={{ gap: '6px', alignItems: 'stretch', display: 'flex', gridTemplateColumns: 'unset' }}>
                      {(() => {
                        if (line.is_silver) {
                          const w = parseFloat(line.weight) || 0
                          const rate = parseFloat(line.silver_rate) || 0
                          const price = w * rate
                          return [
                            <div key="details" style={{ flex: '1', border: '1px solid #c8c8c8', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem', background: '#f4f4f6' }}>
                              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#888', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Silver</div>
                              <div className="form-group" style={{ marginBottom: '6px' }}>
                                <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Type</label>
                                <select className="input" value={line.silver_type} onChange={e => updateLine(i, 'silver_type', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}>
                                  <option value="silver_925">Silver 925</option>
                                  <option value="silver_ornaments">Silver Ornaments</option>
                                </select>
                              </div>
                              <div className="form-group" style={{ marginBottom: '6px' }}>
                                <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Description</label>
                                <input className="input" type="text" value={line.description}
                                  onChange={e => updateLine(i, 'description', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                              </div>
                              <div className="form-row" style={{ gap: '6px', display: 'flex', gridTemplateColumns: 'unset' }}>
                                <div className="form-group" style={{ flex: '1' }}>
                                  <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Weight (g)</label>
                                  <input className="input" type="number" step="0.001" min="0" value={line.weight}
                                    onChange={e => updateLine(i, 'weight', e.target.value)} placeholder="0.000" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                                </div>
                                <div className="form-group" style={{ flex: '1' }}>
                                  <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Rate /g</label>
                                  <input className="input" type="number" step="0.01" min="0" value={line.silver_rate}
                                    onChange={e => updateLine(i, 'silver_rate', e.target.value)} placeholder="0.00" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                                </div>
                              </div>
                              {line.weight && (() => {
                                const net = silverNet[line.silver_type] || 0
                                const remaining = (silverStock[line.silver_type] || 0) - net
                                return <div style={{ marginTop: '2px' }}>
                                  <span className={remaining >= 0 ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: '9px' }}>{remaining >= 0 ? '✓ ' + remaining.toFixed(3) + 'g avail' : '✗ Only ' + remaining.toFixed(3) + 'g avail'}</span>
                                </div>
                              })()}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600, marginBottom: 0, whiteSpace: 'nowrap' }}>Tax %</label>
                                <input className="input" type="number" step="0.01" min="0" value={line.tax_pct}
                                  onChange={e => updateLine(i, 'tax_pct', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', maxWidth: '80px' }} />
                              </div>
                            </div>,
                            <div key="rate" style={{ flex: '2', border: '1px solid #c8c8c8', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem', background: '#f4f4f6' }}>
                              <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Rate/g</label>
                              <div className="font-mono">
                                {rate > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width: '50%', border: '1px solid #d0d0d0', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: '#eaeaea', fontSize: '0.65rem' }}>Rate</th>
                                        <th style={{ width: '50%', border: '1px solid #d0d0d0', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: '#eaeaea', fontSize: '0.65rem' }}>Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td style={{ border: '1px solid #d0d0d0', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(rate)}/g</td>
                                        <td style={{ border: '1px solid #d0d0d0', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(price)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                ) : <span className="text-muted" style={{ fontSize: '0.7rem' }}>—</span>}
                              </div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px', marginTop: '8px' }}>Line Totals</div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: '25%', border: '1px solid #d0d0d0', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: '#eaeaea', fontSize: '0.65rem' }}></th>
                                    <th style={{ width: '37.5%', border: '1px solid #d0d0d0', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: '#eaeaea', fontSize: '0.65rem' }}>Price</th>
                                    <th style={{ width: '37.5%', border: '1px solid #d0d0d0', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: '#eaeaea', fontSize: '0.65rem' }}>Tax</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: '#888', fontSize: '0.7rem' }}>Silver</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '3px 8px', textAlign: 'center', fontWeight: 700 }}>{fmt(c.price)}</td>
                                    <td style={{ border: '1px solid #d0d0d0', padding: '3px 8px', textAlign: 'center' }}>{fmt(c.tax)}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Total</span>
                                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>{fmt(c.total)}</span>
                              </div>
                            </div>
                          ]
                        }
                        if (line.is_gold_18k) {
                          const gold18kBase = goldPerGram * 18 / 22
                          const w = parseFloat(line.weight) || 0
                          const lp = parseFloat(line.labour_pct); const labourPct = !isNaN(lp) ? lp : DEFAULT_LABOUR_PCT
                          const goldValue = w * gold18kBase
                          const labour = goldValue * labourPct / 100
                          const total = goldValue + labour
                          return [
                            <div key="details" style={{ flex: '1', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem', background: 'var(--gold-bg)' }}>
                              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Gold 18K</div>
                              <div className="form-group" style={{ marginBottom: '6px' }}>
                                <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Description</label>
                                <input className="input" type="text" value={line.description} disabled
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', opacity: 0.7 }} />
                              </div>
                              <div className="form-row" style={{ gap: '6px', display: 'flex', gridTemplateColumns: 'unset' }}>
                                <div className="form-group" style={{ flex: '1' }}>
                                  <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Weight (g)</label>
                                  <input className="input" type="number" step="0.001" min="0" value={line.weight}
                                    onChange={e => updateLine(i, 'weight', e.target.value)} placeholder="0.000" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                                </div>
                                <div className="form-group" style={{ flex: '0.8' }}>
                                  <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Labour %</label>
                                  <input className="input" type="number" step="0.1" min="0" value={line.labour_pct}
                                    onChange={e => updateLine(i, 'labour_pct', e.target.value)} placeholder={DEFAULT_LABOUR_PCT.toString()} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                                </div>
                              </div>
                              {line.weight && (() => {
                                const remaining = goldStock - goldNet
                                return <div style={{ marginTop: '2px' }}>
                                  <span className={remaining >= 0 ? 'badge badge-green' : 'badge badge-red'} style={{ fontSize: '9px' }}>{remaining >= 0 ? '✓ ' + remaining.toFixed(3) + 'g avail' : '✗ Only ' + remaining.toFixed(3) + 'g avail'}</span>
                                </div>
                              })()}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600, marginBottom: 0, whiteSpace: 'nowrap' }}>Tax %</label>
                                <input className="input" type="number" step="0.01" min="0" value={line.tax_pct}
                                  onChange={e => updateLine(i, 'tax_pct', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', maxWidth: '80px' }} />
                              </div>
                            </div>,
                            <div key="rate" style={{ flex: '2', border: '1px solid var(--gold)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem', background: 'var(--gold-bg)' }}>
                              <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Rate/g</label>
                              <div className="font-mono">
                                {goldPerGram > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ width: '50%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Gold</th>
                                        <th style={{ width: '50%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>L {labourPct}%</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(goldValue)}</td>
                                        <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(labour)}</td>
                                      </tr>
                                      <tr>
                                        <td colSpan={2} style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{fmt(total)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                ) : <span className="text-muted" style={{ fontSize: '0.7rem' }}>—</span>}
                              </div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px', marginTop: '8px' }}>Line Totals</div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: '25%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}></th>
                                    <th style={{ width: '37.5%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Price</th>
                                    <th style={{ width: '37.5%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Tax</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Gold 18K</td>
                                    <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700 }}>{fmt(c.price)}</td>
                                    <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center' }}>{fmt(c.tax)}</td>
                                  </tr>
                                </tbody>
                              </table>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Total</span>
                                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>{fmt(c.total)}</span>
                              </div>
                            </div>
                          ]
                        }
                        return [
                          <div key="details" style={{ flex: '1', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem' }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Item Details</div>
                        <div>
                          <ComboBox
                            options={masterItems.filter(m => m.material_type !== 'gold_18k').map(m => ({ value: m.id.toString(), label: `${m.name} (${m.purity})` }))}
                            value={line.item_id?.toString()}
                            onChange={val => updateLine(i, 'item_id', val)}
                            placeholder="Type to search item..."
                          />
                          {line.item_id && line.weight && (() => {
                            const stock = checkStock(line.item_id, line.weight, line.huid_enabled, i)
                            const lots = getFilteredLots(line)
                            return (
                              <div style={{ marginTop: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  {stock ? (
                                    stock.available ? (
                                      <span className="badge badge-green" style={{ fontSize: '9px' }}>✓ In Stock</span>
                                    ) : (
                                      <span className="badge badge-red" style={{ fontSize: '9px' }}>✗ Out of Stock</span>
                                    )
                                  ) : null}
                                  {lots.length > 0 && (
                                    <button type="button" onClick={() => setExpandedLot(expandedLot === i ? -1 : i)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '9px', textDecoration: 'underline', padding: 0 }}>
                                      {expandedLot === i ? 'Hide' : 'Show'} {lots.length} lot{lots.length > 1 ? 's' : ''}
                                    </button>
                                  )}
                                </div>
                                {expandedLot === i && (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px', fontSize: '9px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Wt</th>
                                        <th style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>HUID</th>
                                        <th style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Pcs</th>
                                        <th style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Date</th>
                                        <th style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lots.map(lot => (
                                        <tr key={lot.lot_id}>
                                          <td style={{ border: '1px solid var(--border)', padding: '2px 4px' }}>{Number(lot.weight).toFixed(3)}</td>
                                          <td style={{ border: '1px solid var(--border)', padding: '2px 4px' }}>{lot.huid ? 'Y' : 'N'}</td>
                                          <td style={{ border: '1px solid var(--border)', padding: '2px 4px', textAlign: 'center' }}>{lot.avail_pcs}</td>
                                          <td style={{ border: '1px solid var(--border)', padding: '2px 4px' }}>{lot.ref_date?.slice(0, 10)}</td>
                                          <td style={{ border: '1px solid var(--border)', padding: '2px 4px' }}>{lot.status}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                        <div className="form-row" style={{ gap: '6px', marginTop: '6px' }}>
                          <div className="form-group" style={{ flex: '1' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Weight (g)</label>
                            <input className="input" type="number" step="0.001" min="0" value={line.weight}
                              onChange={e => updateLine(i, 'weight', e.target.value)} placeholder="0.000" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                          </div>
                          <div className="form-group" style={{ flex: '0.8' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Labour %</label>
                            <input className="input" type="number" step="0.1" min="0" value={line.labour_pct}
                              onChange={e => updateLine(i, 'labour_pct', e.target.value)} placeholder="10" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600, marginBottom: 0 }}>HUID</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <input type="radio" name={`huid_${i}`} checked={line.huid_enabled === true}
                                onChange={() => updateLine(i, 'huid_enabled', true)} style={{ margin: 0 }} /> Y
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', fontSize: '0.75rem' }}>
                              <input type="radio" name={`huid_${i}`} checked={line.huid_enabled === false}
                                onChange={() => updateLine(i, 'huid_enabled', false)} style={{ margin: 0 }} /> N
                            </label>
                            {line.huid_enabled && (
                              <input className="input" type="text" value={line.huid_code}
                                onChange={e => updateLine(i, 'huid_code', e.target.value)} placeholder="Code" style={{ flex: '1', minWidth: '50px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600, marginBottom: 0, whiteSpace: 'nowrap' }}>Tax %</label>
                            <input className="input" type="number" step="0.01" min="0" value={line.tax_pct}
                              onChange={e => updateLine(i, 'tax_pct', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', maxWidth: '80px' }} />
                          </div>
                        </div>
                          </div>,
                          <div key="rate" style={{ flex: '2', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Rate/g</label>
                            <div className="font-mono">
                              {goldPerGram > 0 ? (
                                (() => {
                                  const item = masterItems.find(m => m.id === parseInt(line.item_id))
                                  const is18k = item?.material_type === 'gold_18k'
                                  const baseRate = is18k ? goldPerGram * 18 / 22 : goldPerGram
                                  const w = parseFloat(line.weight) || 0
                                  const lp = parseFloat(line.labour_pct); const labourPct = !isNaN(lp) ? lp : DEFAULT_LABOUR_PCT
                                  const goldValue = w * baseRate
                                  const labour = goldValue * labourPct / 100
                                  const total = goldValue + labour
                                  return (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                      <thead>
                                        <tr>
                                          <th style={{ width: '50%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Gold</th>
                                          <th style={{ width: '50%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>L {labourPct}%</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr>
                                          <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(goldValue)}</td>
                                          <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>{fmt(labour)}</td>
                                        </tr>
                                        <tr>
                                          <td colSpan={2} style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{fmt(total)}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  )
                                })()
                              ) : <span className="text-muted" style={{ fontSize: '0.7rem' }}>—</span>}
                            </div>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px', marginTop: '8px' }}>Line Totals</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                              <thead>
                                <tr>
                                  <th style={{ width: '25%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}></th>
                                  <th style={{ width: '37.5%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Price</th>
                                  <th style={{ width: '37.5%', border: '1px solid var(--border)', padding: '2px 6px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', fontSize: '0.65rem' }}>Tax</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Gold</td>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700 }}>{fmt(c.price)}</td>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center' }}>{fmt(c.tax)}</td>
                                </tr>
                                <tr>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Hallmark</td>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center', fontWeight: 700 }}>{fmt(c.hc)}</td>
                                  <td style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'center' }}>{fmt(c.hcTax)}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Total</span>
                              <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>{fmt(c.total)}</span>
                            </div>
                          </div>
                        ]
                      })()}
                    </div>
                    </div>

                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={addLine} style={{ flex: 1 }}>
                <Plus size={14} /> Add Item
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={addGold18kLine} style={{ flex: 1 }}>
                <Plus size={14} /> Add Gold 18K
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={addSilverLine} style={{ flex: 1 }}>
                <Plus size={14} /> Add Silver
              </button>
            </div>
          </div>
        </div>

        {/* ─── Totals ─── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">Totals</h3></div>
          <div style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span className="text-sm">Total Price (Without Tax)</span>
              <span className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalPrice)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span className="text-sm">Total Hallmark Price (Without Tax)</span>
              <span className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalHc)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span className="text-sm">Total Tax</span>
              <span className="font-mono" style={{ textAlign: 'right' }}>{fmt(totalTax + totalHcTax)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '8px' }}>
              <span className="text-sm">Inward Supply (Exchange Adj.)</span>
              <div style={{ width: '300px' }}>
                <ComboBox
                  options={(() => {
                    let vouchers = inwardVouchers
                    if (selectedCustomer) {
                      vouchers = vouchers.filter(v => v.customer_id === selectedCustomer.id || v.customer_name === selectedCustomer.name)
                    }
                    return vouchers.map(v => ({
                      value: String(v.id),
                      label: `${v.inv_no} — ${v.customer_name} — ${fmt(v.grand_total)}`
                    }))
                  })().concat([{ value: '', label: '— None —' }])}
                  value={adjVoucherId ? String(adjVoucherId) : ''}
                  onChange={val => {
                    setAdjVoucherId(val ? parseInt(val) : null)
                    setAdjBillNo(val || '')
                    const v = inwardVouchers.find(v => v.id === parseInt(val))
                    setAdjAmt(v ? parseFloat(v.grand_total) || 0 : 0)
                  }}
                  placeholder="Select voucher..."
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span className="text-sm">Adj. Amount</span>
              <span className="font-mono" style={{ fontWeight: 700, color: adjAmt > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{adjAmt > 0 ? `-${fmt(adjAmt)}` : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '8px' }}>
              <span className="text-sm">Discount</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {discAmt > 0 && <span className="font-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>-{fmt(discAmt)}</span>}
                <input className="input" type="number" step="0.01" min="0" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: '150px', textAlign: 'right' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span className="text-sm">Round Off</span>
              <span className="font-mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(roundOff)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--gold)', marginTop: '4px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Grand Total</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent)' }}>{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ─── Payment ─── */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 className="card-title">Payment</h3></div>
          <div style={{ padding: '0.75rem 1rem' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Payment Mode</label>
                <select className="input" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="CASH">CASH</option>
                  <option value="E-BANKING">E-BANKING</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </div>
              {paymentMode === 'BOTH' && (
                <>
                  <div className="form-group">
                    <label className="label">CASH Amt</label>
                    <input className="input" type="number" step="0.01" value={cashAmt} onChange={e => setCashAmt(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="form-group">
                    <label className="label">E-Banking Amt</label>
                    <input className="input" type="number" step="0.01" value={bankAmt} onChange={e => setBankAmt(parseFloat(e.target.value) || 0)} />
                  </div>
                </>
              )}
              {paymentMode !== 'BOTH' && (
                <div className="form-group" style={{ justifyContent: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{fmt(grandTotal)}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {!allStockAvailable && lineItems.some(l => l.item_id) && (
          <div style={{ color: 'var(--red)', textAlign: 'center', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            Exact stock match not found for one or more items. Check weight &amp; HUID.
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-full" disabled={saving || !allStockAvailable}>
          {saving ? 'Saving...' : <><FileText size={16} /> {editMode ? 'Update Invoice' : 'Create Invoice'}</>}
        </button>
      </form>
    </div>
  )
}
