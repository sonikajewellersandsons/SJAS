import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import ComboBox from '../components/ComboBox'
import { Search, Plus, X, FileText } from 'lucide-react'

const DEFAULT_TAX_PCT = 3
const DEFAULT_LABOUR_PCT = 10
const HALLMARK_TAX_PCT = 18

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    { item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: DEFAULT_TAX_PCT.toString(), hallmark_charge: 0, huid_enabled: true, huid_code: '' }
  ])
  const [expandedLot, setExpandedLot] = useState(-1)

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
      const [custRes, itemsRes, settingsRes, stockRes, inwardRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('item_master').select('id, name, hallmark_charge, purity').eq('active', true).order('name'),
        supabase.from('settings').select('key, value'),
        supabase.rpc('get_stock_lots'),
        supabase.from('inward_supply_vouchers').select('id, inv_no, customer_id, customer_name, grand_total, date')
          .not('grand_total', 'eq', 0).order('created_at', { ascending: false }).limit(200),
      ])
      if (custRes.data) setCustomers(custRes.data)
      if (itemsRes.data) setMasterItems(itemsRes.data)
      if (stockRes.data) setStockLots(stockRes.data)
      if (inwardRes.data) setInwardVouchers(inwardRes.data)
      if (pendingEditId) {
        setEditInvoiceId(pendingEditId)
        setEditMode(true)
        await loadEditInvoice(pendingEditId, custRes.data || [], itemsRes.data || [])
      } else {
        await generateInvNo()
      }
    } catch (err) {
      addToast('Failed to load data', 'error')
    }
    setLoading(false)
  }

  async function loadEditInvoice(invId, custList, miList) {
    const { data: inv, error: invErr } = await supabase.from('invoices').select('*, invoice_items(*, item_master!inner(name, hsn_code))').eq('id', invId).single()
    if (invErr || !inv) { addToast('Failed to load invoice', 'error'); setEditMode(false); return }

    const invGoldRate = parseFloat(inv.gold_rate) || 0
    if (invGoldRate) { setGoldRate(invGoldRate); setGoldRateStr(invGoldRate.toLocaleString('en-IN')) }
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
      const mi = (miList || []).find(m => m.id === item.item_id)
      // Use stored labour_rate if available, else fallback to reverse calc
      const storedLabour = parseFloat(item.labour_rate)
      const computedLabour = storedLabour > 0 ? storedLabour : (invGoldRate > 0 ? Math.max(0, parseFloat(item.rate_per_gram) - invGoldRate / 10) : 0)
      return {
        item_id: item.item_id.toString(),
        description: mi?.name || item.item_master?.name || '',
        weight: item.weight.toString(),
        labour_pct: item.labour_pct != null ? item.labour_pct.toString() : (storedLabour > 0 ? Math.round(computedLabour / (invGoldRate / 10) * 100) : DEFAULT_LABOUR_PCT).toString(),
        tax_pct: item.tax_pct != null && item.tax_pct !== undefined ? item.tax_pct.toString() : DEFAULT_TAX_PCT.toString(),
        hallmark_charge: parseFloat(item.hallmark_charge) || 0,
        huid_enabled: item.huid,
        huid_code: item.huid_code || '',
      }
    }))

  }

  async function getFy() {
    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth() + 1
    return m >= 4 ? `${y}-${(y + 1).toString().slice(-2)}` : `${y - 1}-${y.toString().slice(-2)}`
  }

  async function generateInvNo() {
    const fy = await getFy()
    const { data: existing } = await supabase.from('invoices').select('inv_no').ilike('inv_no', `SJS/${fy}/%`).order('inv_no')
    const used = (existing || []).map(inv => parseInt(inv.inv_no.split('/').pop())).filter(n => !isNaN(n)).sort((a, b) => a - b)
    let next = 1
    for (const n of used) {
      if (n === next) next++
      else break
    }
    const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'sale').eq('fy', fy).maybeSingle()
    const seqNext = cur ? (parseInt(cur.last_no) || 0) + 1 : null
    const suggest = seqNext !== null ? Math.min(next, seqNext) : next
    setInvNo(`SJS/${fy}/${String(suggest).padStart(3, '0')}`)
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
    c.phone.includes(custSearch) ||
    c.aadhaar?.includes(custSearch)
  )

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

  function checkStock(itemId, weight, huidEnabled, excludeIndex) {
    if (!itemId || !weight) return null
    const w = parseFloat(weight)
    if (!w) return null
    const item = masterItems.find(m => m.id === parseInt(itemId))
    if (!item) return null
    // Skip stock check for original items in edit mode
    if (editMode && excludeIndex >= 0 && excludeIndex < editOriginalItems.current.length) {
      const orig = editOriginalItems.current[excludeIndex]
      if (orig && orig.item_id === parseInt(itemId) && parseFloat(orig.weight) === w && orig.huid === !!huidEnabled) {
        return { available: true }
      }
    }
    const match = stockLots.find(l =>
      l.item_name === item.name && Number(l.weight) === w && l.huid === !!huidEnabled && l.avail_pcs > 0
    )
    if (!match) return { available: false }
    const alreadyClaimed = lineItems.filter((ln, i) => {
      if (i >= excludeIndex) return false
      // Skip original items in edit mode — they already consumed stock on first save
      if (editMode && i < editOriginalItems.current.length) {
        const orig = editOriginalItems.current[i]
        if (orig && orig.item_id === parseInt(ln.item_id) && parseFloat(orig.weight) === parseFloat(ln.weight) && orig.huid === (ln.huid_enabled === true)) {
          return false
        }
      }
      return ln.item_id && parseFloat(ln.weight) === w &&
        masterItems.find(m => m.id === parseInt(ln.item_id))?.name === item.name &&
        (ln.huid_enabled === true) === !!huidEnabled
    }).length
    return (match.avail_pcs - alreadyClaimed) > 0
      ? { available: true, lot: match }
      : { available: false }
  }

  function addLine() {
    setLineItems([...lineItems, { item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: taxPct, hallmark_charge: 0, huid_enabled: true, huid_code: '' }])
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
        }
      }
      if (field === 'huid_enabled' && value === false) {
        newLine.huid_code = ''
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
    if (!line.item_id) return []
    const item = masterItems.find(m => m.id === parseInt(line.item_id))
    if (!item) return []
    let lots = stockLots.filter(l => l.item_name === item.name && l.avail_pcs > 0)
    const w = parseFloat(line.weight)
    if (w) lots = lots.filter(l => Number(l.weight) === w)
    return lots
  }

  // Calculations — discount applied BEFORE tax per GST
  function calcLinePrice(line) {
    const w = parseFloat(line.weight) || 0
    const labourPct = parseFloat(line.labour_pct) || DEFAULT_LABOUR_PCT
    const lab = goldPerGram * labourPct / 100
    const ratePerGram = goldPerGram + lab
    const price = w * ratePerGram
    const hc = parseFloat(line.hallmark_charge) || 0
    return { ratePerGram, price, hc }
  }

  const linePrices = lineItems.map(calcLinePrice)
  const totalPrice = linePrices.reduce((s, l) => s + l.price, 0)
  const totalHc = linePrices.reduce((s, l) => s + l.hc, 0)
  const discAmt = parseFloat(discount || 0)
  const discountProp = totalPrice > 0 ? discAmt / totalPrice : 0

  // Final calc per line with discount applied before tax
  function calcLine(line, priceData) {
    const discountedPrice = priceData.price * (1 - discountProp)
    const tax = discountedPrice * (parseFloat(line.tax_pct) || 0) / 100
    const hcTax = priceData.hc * HALLMARK_TAX_PCT / 100
    return { ...priceData, discountedPrice, tax, hcTax, total: discountedPrice + tax + priceData.hc + hcTax }
  }

  const lineTotals = lineItems.map((l, i) => calcLine(l, linePrices[i]))
  const totalTax = lineTotals.reduce((s, l) => s + l.tax, 0)
  const totalHcTax = lineTotals.reduce((s, l) => s + l.hcTax, 0)
  const beforeAdj = totalPrice - discAmt + totalTax + totalHc + totalHcTax
  const afterAdj = beforeAdj - parseFloat(adjAmt || 0)
  const roundOff = Math.round(afterAdj) - afterAdj
  const grandTotal = afterAdj + roundOff
  const stockResults = lineItems.map((l, i) => checkStock(l.item_id, l.weight, l.huid_enabled, i))
  const allStockAvailable = lineItems.every((l, i) => !l.item_id || stockResults[i]?.available)

  const savingRef = useRef(false)

  async function saveInvoice(e) {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true

    if (!selectedCustomer && !isNewCustomer) { addToast('Select or add a customer', 'error'); savingRef.current = false; return }
    if (!goldRate || goldRate <= 0) { addToast('Enter gold rate', 'error'); savingRef.current = false; return }
    const validLines = lineItems.filter(l => l.item_id)
    if (validLines.length === 0) { addToast('Add at least one item', 'error'); savingRef.current = false; return }
    for (const l of validLines) {
      const origIdx = lineItems.indexOf(l)
      if (!parseFloat(l.weight)) { addToast(`Item #${origIdx+1}: enter a valid weight`, 'error'); savingRef.current = false; return }
      if (l.labour_pct === '' || isNaN(parseFloat(l.labour_pct))) { addToast(`Item #${origIdx+1}: enter labour %`, 'error'); savingRef.current = false; return }
    }
    if (paymentMode === 'BOTH' && Math.abs(parseFloat(cashAmt || 0) + parseFloat(bankAmt || 0) - grandTotal) > 0.01) {
      addToast('Cash + Bank amount must equal Grand Total', 'error'); savingRef.current = false; return
    }

    setSaving(true)
    let reversed = false
    try {
      let invId, finalInvNo

      if ((editMode || editModeRef.current) && editInvoiceId) {
        invId = editInvoiceId
        finalInvNo = invNo
        const { error: revErr } = await supabase.rpc('reverse_invoice_stock', { p_invoice_id: invId })
        if (revErr) throw revErr
        reversed = true
        const { data: freshLots } = await supabase.rpc('get_stock_lots')
        if (freshLots) setStockLots(freshLots)
      } else {
        finalInvNo = invNo
      }

      let customerId = selectedCustomer?.id

      if (isNewCustomer) {
        if (!newCust.name.trim()) { addToast('Customer name is required', 'error'); setSaving(false); savingRef.current = false; return }
        if (newCust.phone.trim()) {
          const cleanedPhone = newCust.phone.trim().replace(/^\+91\s*/, '').replace(/\D/g, '')
          const { data: existing } = await supabase.from('customers').select('id').eq('phone', cleanedPhone).maybeSingle()
          if (existing) {
            customerId = existing.id
            setSelectedCustomer(existing)
            setIsNewCustomer(false)
          }
        }
        if (!customerId) {
          const { data: newCustData, error: custErr } = await supabase.from('customers').insert({
            name: newCust.name.trim(),
            phone: newCust.phone.trim(),
            address: newCust.address.trim(),
            state: newCust.state,
            aadhaar: newCust.aadhaar.trim(),
            pan: newCust.pan.trim(),
            pincode: newCust.pincode.trim(),
            gstin: newCust.gstin.trim(),
          }).select('id').single()
          if (custErr) throw custErr
          customerId = newCustData.id
        }
      }

      const invoiceData = {
        inv_no: finalInvNo,
        date,
        customer_id: customerId,
        customer_name: selectedCustomer ? selectedCustomer.name : newCust.name.trim(),
        customer_address: selectedCustomer ? (selectedCustomer.address || '') : newCust.address.trim(),
        customer_phone: selectedCustomer ? (selectedCustomer.phone || '') : newCust.phone.trim(),
        customer_state: selectedCustomer ? (selectedCustomer.state || 'Haryana') : newCust.state,
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

      if (editMode && invId) {
        const { error: updErr } = await supabase.from('invoices').update(invoiceData).eq('id', invId)
        if (updErr) throw updErr
        const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', invId)
        if (delErr) throw delErr
      } else {
        const { data: inv, error: invErr } = await supabase.from('invoices').insert(invoiceData).select('id').single()
        if (invErr) throw invErr
        invId = inv.id
      }

      const invoiceItemsData = validLines.map((line, idx) => {
        const origIdx = lineItems.indexOf(line)
        const c = lineTotals[origIdx >= 0 ? origIdx : idx]
        return {
          invoice_id: invId,
          item_id: parseInt(line.item_id),
          weight: parseFloat(line.weight) || 0,
          rate_per_gram: Math.round(c.ratePerGram * 100) / 100,
          price: Math.round(c.price * 100) / 100,
          tax_amount: Math.round(c.tax * 100) / 100,
          tax_pct: parseFloat(line.tax_pct) || DEFAULT_TAX_PCT,
          labour_rate: Math.round(goldPerGram * (parseFloat(line.labour_pct) || DEFAULT_LABOUR_PCT) / 100 * 100) / 100,
          labour_pct: parseFloat(line.labour_pct) || DEFAULT_LABOUR_PCT,
          hallmark_charge: c.hc,
          huid: line.huid_enabled,
          huid_code: line.huid_code || '',
          sno: idx + 1,
        }
      })
      const { error: itemsErr } = await supabase.from('invoice_items').insert(invoiceItemsData)
      if (itemsErr) throw itemsErr

      const { error: procErr } = await supabase.rpc('process_invoice_stock', { p_invoice_id: invId })
      if (procErr) {
        if (!editMode) {
          await supabase.from('invoice_items').delete().eq('invoice_id', invId)
          await supabase.from('invoices').delete().eq('id', invId)
        }
        throw procErr
      }

      // Update inv_sequences (both create and edit — handles manually entered higher numbers)
      const seqMatch = finalInvNo.match(/\/(\d+)$/)
      if (seqMatch) {
        const seqNum = parseInt(seqMatch[1])
        const fy = await getFy()
        const { data: cur } = await supabase.from('inv_sequences').select('last_no').eq('type', 'sale').eq('fy', fy).maybeSingle()
        const curNo = cur ? parseInt(cur.last_no) || 0 : 0
        if (seqNum > curNo) {
          const { error: seqErr } = await supabase.from('inv_sequences').upsert({ type: 'sale', fy, last_no: seqNum }, { onConflict: 'type,fy' })
          if (seqErr) console.warn('Sequence update failed (non-critical):', seqErr.message)
        }
      }

      // Persist gold rate to settings
      if (goldRate > 0) {
        await supabase.from('settings').upsert({ key: 'gold_rate', value: JSON.stringify(goldRate) }, { onConflict: 'key' })
      }

      addToast(editMode ? `Invoice ${finalInvNo} updated` : `Invoice ${finalInvNo} created`, 'success')
      const { data: freshLots } = await supabase.rpc('get_stock_lots')
      if (freshLots) setStockLots(freshLots)
      resetForm()
    } catch (err) {
      addToast(err.message || 'Failed to save invoice', 'error')
      console.error('Invoice error:', err)
      // #1/#16: restore stock and reload form on edit failure
      if (reversed && editModeRef.current && editInvoiceId) {
        await supabase.rpc('process_invoice_stock', { p_invoice_id: editInvoiceId }).catch(() => {})
        const { data: restored } = await supabase.from('invoices').select('*, invoice_items(*)').eq('id', editInvoiceId).single()
        if (restored) {
          const restoredCust = customers.find(c => c.id === restored.customer_id)
          if (restoredCust) setSelectedCustomer(restoredCust)
          setDate(restored.date)
          setInvNo(restored.inv_no)
          setAdjAmt(parseFloat(restored.adj_amount) || 0)
          setDiscount(parseFloat(restored.discount) || 0)
          setPaymentMode(restored.payment_mode)
          setCashAmt(parseFloat(restored.cash_amt) || 0)
          setBankAmt(parseFloat(restored.bank_amt) || 0)
          if (restored.gold_rate) { setGoldRate(parseFloat(restored.gold_rate)); setGoldRateStr(parseFloat(restored.gold_rate).toLocaleString('en-IN')) }
          const restoredGoldRate = parseFloat(restored.gold_rate) || 0
          setLineItems((restored.invoice_items || []).map(item => {
            const mi = masterItems.find(m => m.id === item.item_id)
            const storedLabourPct = parseFloat(item.labour_pct)
            const labourPct = storedLabourPct > 0 ? storedLabourPct : (restoredGoldRate > 0 ? Math.round((parseFloat(item.rate_per_gram) - restoredGoldRate / 10) / (restoredGoldRate / 10) * 100) : DEFAULT_LABOUR_PCT)
            return {
              item_id: item.item_id.toString(),
              description: mi?.name || '',
              weight: item.weight.toString(),
              labour_pct: labourPct,
              tax_pct: item.tax_pct !== null && item.tax_pct !== undefined ? parseFloat(item.tax_pct) : DEFAULT_TAX_PCT,
              hallmark_charge: parseFloat(item.hallmark_charge) || 0,
              huid_enabled: item.huid,
              huid_code: item.huid_code || '',
            }
          }))
        }
      }
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  function resetForm() {
    setDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null)
    setIsNewCustomer(false)
    setNewCust({ name: '', phone: '', address: '', state: 'Haryana', aadhaar: '', pan: '', pincode: '', gstin: '' })
    setCustSearch('')
    setLineItems([{ item_id: '', description: '', weight: '', labour_pct: DEFAULT_LABOUR_PCT.toString(), tax_pct: taxPct, hallmark_charge: 0, huid_enabled: true, huid_code: '' }])
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
    generateInvNo()
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
              <div className="input-group">
                <span className="input-addon">₹</span>
                <input className="input input-group-field" type="text" inputMode="decimal" value={goldRateStr} onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setGoldRateStr(v); setGoldRate(parseFloat(v) || 0) }} onBlur={e => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')) || 0; setGoldRateStr(n.toLocaleString('en-IN')) }} onFocus={e => { setGoldRateStr(goldRate ? goldRate.toString() : '') }} />
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

                    <div className="form-row" style={{ gap: '6px', alignItems: 'stretch' }}>
                      <div style={{ flex: '1.6', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem' }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Item Details</div>
                        <div>
                          <ComboBox
                            options={masterItems.map(m => ({ value: m.id.toString(), label: `${m.name} (${m.purity})` }))}
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
                          <div className="form-group" style={{ flex: '1.2' }}>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Rate/g</label>
                            <div className="font-mono" style={{ fontSize: '0.8rem', padding: '0.3rem 0', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              {c.ratePerGram > 0 ? (
                                <><span style={{ fontWeight: 700 }}>{fmt(c.ratePerGram)}</span><span className="text-muted" style={{ fontSize: '0.7rem' }}>(G {fmt(goldPerGram)} + L {(c.ratePerGram - goldPerGram).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ {line.labour_pct || DEFAULT_LABOUR_PCT}%)</span></>
                              ) : <span className="text-muted" style={{ fontSize: '0.7rem' }}>—</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ flex: '1', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.4rem 0.5rem' }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Identification</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          <div>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>HUID</label>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                          </div>
                          <div>
                            <label className="label" style={{ fontSize: '0.6rem', fontWeight: 600 }}>Tax %</label>
                            <input className="input" type="number" step="0.01" min="0" value={line.tax_pct}
                               onChange={e => updateLine(i, 'tax_pct', e.target.value)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '4px' }}>Line Totals</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <tbody>
                          <tr>
                            <td style={{ border: '1px solid var(--border)', padding: '3px 8px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Price</td>
                            <td className="font-mono" style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>{fmt(c.price)}{discAmt > 0 ? <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>({fmt(c.discountedPrice)})</span> : ''}</td>
                            <td style={{ border: '1px solid var(--border)', padding: '3px 8px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Tax</td>
                            <td className="font-mono" style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'right', fontSize: '0.85rem' }}>{fmt(c.tax)}</td>
                          </tr>
                          <tr>
                            <td style={{ border: '1px solid var(--border)', padding: '3px 8px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>Hallmark</td>
                            <td className="font-mono" style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'right', fontSize: '0.85rem' }}>{fmt(c.hc)}</td>
                            <td style={{ border: '1px solid var(--border)', padding: '3px 8px', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>H.Tax</td>
                            <td className="font-mono" style={{ border: '1px solid var(--border)', padding: '3px 8px', textAlign: 'right', fontSize: '0.85rem' }}>{fmt(c.hcTax)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '4px', fontSize: '0.9rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', marginRight: '8px' }}>Total</span>
                        <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1rem' }}>{fmt(c.total)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={addLine} style={{ marginTop: '0.75rem', width: '100%' }}>
              <Plus size={14} /> Add Item
            </button>
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
              <input className="input" type="number" step="0.01" min="0" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: '150px', textAlign: 'right' }} />
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
