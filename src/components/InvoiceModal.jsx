import { Printer, X } from 'lucide-react'

function fmt(n) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function num(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoiceModal({ show, invoice, lineItems, loading, onClose, onPrint, printLabel }) {
  if (!show || !invoice || lineItems.length === 0) return null

  const goodsTax = lineItems.reduce((s, i) => s + Number(i.tax_amount), 0)
  const hallmarkTax = Number(invoice.tax_total) - goodsTax
  const totalHc = lineItems.reduce((s, i) => s + Number(i.hallmark_charge), 0)
  const isIntraState = (invoice.customer_state || '').toLowerCase() === 'haryana'

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Tax Invoice</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ padding: '0 1rem 1rem', fontSize: '0.8rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>SONIKA JEWELLERS & SONS</div>
            <div className="text-xs text-muted">GST Invoice</div>
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>Inv No</span>
            <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{invoice.inv_no}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>Date</span>
            <span>{invoice.date}</span>
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>Name</span>
            <span style={{ fontWeight: 600, textAlign: 'right' }}>{invoice.customer_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>Address</span>
            <span className="text-xs" style={{ textAlign: 'right', maxWidth: '320px' }}>{invoice.customer_address || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>Ph. No</span>
            <span className="font-mono">{invoice.customer_phone || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontWeight: 700 }}>State</span>
            <span>{invoice.customer_state || '—'}</span>
          </div>

          <div className="divider" />

          {loading ? (
            <div className="loading-center" style={{ padding: '1rem 0' }}><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper" style={{ marginBottom: '0.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>Sno.</th>
                    <th>Description Of Goods</th>
                    <th style={{ width: 85 }}>HSN/SAC</th>
                    <th style={{ width: 55 }}>Weight</th>
                    <th style={{ width: 120 }}>Rate (₹/gm)</th>
                    <th style={{ width: 85 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const goldRate = parseFloat(invoice.gold_rate) || 0
                    const goldPerGm = goldRate / 10
                    return lineItems.map(item => {
                      const rate = parseFloat(item.rate_per_gram) || 0
                      const labour = goldPerGm > 0 ? Math.max(0, rate - goldPerGm) : 0
                      return (
                        <tr key={item.id}>
                          <td className="text-xs text-secondary">{item.sno}</td>
                          <td style={{ fontWeight: 600, fontSize: '0.75rem' }}>{item.item_master?.name || `Item #${item.item_id}`}</td>
                          <td className="font-mono text-xs">{item.item_master?.hsn_code || '—'}</td>
                          <td className="font-mono text-xs">{Number(item.weight).toFixed(3)}</td>
                          <td className="font-mono text-xs" style={{ lineHeight: 1.4 }}>
                            <div>₹{num(rate)}</div>
                            {goldPerGm > 0 && (
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                (₹{num(goldPerGm)} + ₹{num(labour)})
                              </div>
                            )}
                          </td>
                          <td className="font-mono text-xs">{fmt(item.price)}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}

          <div className="divider" />

          <div style={{ fontWeight: 700, marginBottom: '4px' }}>Tax On Goods</div>
          {isIntraState ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                <span className="text-xs">CGST (1.5%)</span>
                <span className="font-mono text-xs">{fmt(goodsTax / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                <span className="text-xs">SGST (1.5%)</span>
                <span className="font-mono text-xs">{fmt(goodsTax / 2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                <span className="text-xs">IGST (3%)</span>
                <span className="font-mono text-xs">₹0.00</span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
              <span className="text-xs">IGST (3%)</span>
              <span className="font-mono text-xs">{fmt(goodsTax)}</span>
            </div>
          )}

          {hallmarkTax > 0 && (
            <>
              <div style={{ fontWeight: 700, marginTop: '6px', marginBottom: '4px' }}>Tax on Hallmark</div>
              {isIntraState ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                    <span className="text-xs">CGST (9%)</span>
                    <span className="font-mono text-xs">{fmt(hallmarkTax / 2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                    <span className="text-xs">SGST (9%)</span>
                    <span className="font-mono text-xs">{fmt(hallmarkTax / 2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                    <span className="text-xs">IGST (18%)</span>
                    <span className="font-mono text-xs">₹0.00</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
                  <span className="text-xs">IGST (18%)</span>
                  <span className="font-mono text-xs">{fmt(hallmarkTax)}</span>
                </div>
              )}
            </>
          )}

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span className="font-bold">Sub Total</span>
            <span className="font-mono">{fmt(invoice.subtotal)}</span>
          </div>
          {parseFloat(invoice.adj_amount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span className="font-bold">Adjusted Amount</span>
              <span className="font-mono" style={{ color: 'var(--red)' }}>-{fmt(invoice.adj_amount)}</span>
            </div>
          )}
          {parseFloat(invoice.discount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span className="font-bold">Discount</span>
              <span className="font-mono" style={{ color: 'var(--red)' }}>-{fmt(invoice.discount)}</span>
            </div>
          )}
          {parseFloat(invoice.round_off) !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span className="font-bold">Round Off</span>
              <span className="font-mono" style={{ color: parseFloat(invoice.round_off) < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(invoice.round_off)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '2px solid var(--gold)', marginTop: '4px' }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Grand Total</span>
            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent)' }}>{fmt(invoice.grand_total)}</span>
          </div>

          <div className="divider" />

          <div style={{ fontWeight: 700, marginBottom: '4px' }}>Mode Of Payment</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
            <span className="text-xs">Cash</span>
            <span className="font-mono text-xs">{fmt(invoice.cash_amt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', paddingLeft: '12px' }}>
            <span className="text-xs">E-Banking</span>
            <span className="font-mono text-xs">{fmt(invoice.bank_amt)}</span>
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.75rem' }}>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
            {onPrint && (
              <button className="btn btn-primary" onClick={onPrint}><Printer size={16} /> {printLabel || 'Print'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
