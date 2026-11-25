import { useRef, useState } from 'react'
import type { Menu } from './menu'
import type { CartSnapshot } from './mocks/reservations'
import { isPaymentMethod, paymentMethods, type Order, type OrdersExport, type PaymentMethod } from './orders'
import { PriceBreakdown } from './PriceBreakdown'
import { priceCart } from './pricing'
import type { useCart } from './useCart'

const paymentLabels: Record<PaymentMethod, string> = { card: 'Card', bkash: 'bKash', cash: 'Cash' }

export function CheckoutPanel({
  cart, menu, serverTime, busy, onPay,
}: {
  cart?: CartSnapshot
  menu: Menu
  serverTime: number
  busy: boolean
  onPay: ReturnType<typeof useCart>['pay']
}) {
  const [coupon, setCoupon] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [receipt, setReceipt] = useState<Order | null>(null)
  const [downloadError, setDownloadError] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const paymentKey = useRef<string | null>(null)

  const active = cart?.items.filter((item) => !item.expired && item.expiresAt > serverTime) ?? []
  const couponCode = coupon.trim() || null
  const pricing = active.length > 0
    ? priceCart({ lines: active, couponCode }, menu, menu.promotions, new Date(serverTime).toISOString())
    : null

  async function pay() {
    if (active.length === 0 && paymentKey.current === null) return
    paymentKey.current ??= crypto.randomUUID()
    const result = await onPay({ paymentMethod, couponCode }, paymentKey.current)
    if (!result) return
    if (!result.ok) {
      if (!result.error.retryable) paymentKey.current = null
      setError(result.error)
      return
    }

    paymentKey.current = null
    setError(null)
    setCoupon('')
    setReceipt(result.value.order)
  }

  async function downloadOrders() {
    setDownloadError(false)
    setDownloading(true)
    try {
      const response = await fetch('/api/orders')
      if (!response.ok) throw new Error('Orders request failed')
      const orders: OrdersExport = await response.json()
      const file = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = 'orders.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section className="summary-panel" aria-labelledby="checkout-heading">
      <h3 id="checkout-heading">Checkout</h3>
      {pricing && (
        <div className="checkout-fields">
          <label>
            Coupon code
            <input
              value={coupon}
              disabled={busy}
              onChange={(event) => {
                paymentKey.current = null
                setError(null)
                setCoupon(event.currentTarget.value)
              }}
            />
          </label>
          <PriceBreakdown pricing={pricing} promotions={menu.promotions} />
          {couponCode && pricing.cartDiscount?.id !== menu.promotions.coupon.id && (
            <small>Coupon did not apply.</small>
          )}
          <label>
            Payment method
            <select
              value={paymentMethod}
              disabled={busy}
              onChange={(event) => {
                const method = event.currentTarget.value
                if (isPaymentMethod(method)) {
                  paymentKey.current = null
                  setError(null)
                  setPaymentMethod(method)
                }
              }}
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{paymentLabels[method]}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {error && <p role="alert">{error.message}</p>}
      {receipt && <p role="status">Order {receipt.id} paid.</p>}
      {receipt && !pricing && <PriceBreakdown pricing={receipt.pricing} promotions={menu.promotions} />}
      <div className="cart-actions checkout-actions">
        {(pricing || error?.retryable) && (
          <button type="button" disabled={busy} onClick={pay}>
            {error?.retryable ? 'Retry payment' : 'Pay'}
          </button>
        )}
        <button type="button" disabled={busy || downloading} onClick={downloadOrders}>Download orders.json</button>
      </div>
      {downloadError && <p role="alert">Could not download the orders. Please retry.</p>}
    </section>
  )
}
