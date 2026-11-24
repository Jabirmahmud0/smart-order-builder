import { useEffect, useState } from 'react'
import type { Configuration, Promotions } from './menu'
import type { CartPrice, PricingCart } from './pricing'

type PreviewResult = {
  options: Configuration
  qty: number
  pricing: CartPrice | null
}

const amountFormat = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPrice(poisha: number) {
  return `${amountFormat.format(poisha / 100)} BDT`
}

export function PricePreview({
  options,
  qty,
  promotions,
}: {
  options: Configuration
  qty: number
  promotions: Promotions
}) {
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPrice() {
      try {
        const cart: PricingCart = { lines: [{ options, qty }] }
        const response = await fetch('/api/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cart),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Price request failed')

        const { pricing }: { pricing: CartPrice } = await response.json()
        if (!controller.signal.aborted) setResult({ options, qty, pricing })
      } catch {
        if (!controller.signal.aborted) setResult({ options, qty, pricing: null })
      }
    }

    const timer = window.setTimeout(() => void loadPrice(), 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [options, qty, attempt])

  const current = result?.options === options && result.qty === qty ? result : null

  return (
    <section className="summary-panel" aria-labelledby="preview-heading">
      <h3 id="preview-heading">Price preview</h3>
      {!current && <p role="status">Calculating price…</p>}
      {current && !current.pricing && (
        <>
          <p role="alert">Could not load the price.</p>
          <button type="button" onClick={() => {
            setResult(null)
            setAttempt((previous) => previous + 1)
          }}>
            Retry
          </button>
        </>
      )}
      {current?.pricing && <PriceBreakdown pricing={current.pricing} promotions={promotions} />}
    </section>
  )
}

function PriceBreakdown({ pricing, promotions }: { pricing: CartPrice; promotions: Promotions }) {
  const [line] = pricing.lines
  const labels: Record<string, string> = {
    [promotions.extras.id]: 'Extras deal',
    [promotions.combo.id]: 'Combo discount',
    [promotions.threshold.id]: 'Cart discount',
    [promotions.coupon.id]: promotions.coupon.code,
  }

  return (
    <dl className="price-breakdown">
      {line.unitDiscounts.length > 0 && (
        <div><dt>Before item discounts</dt><dd>{formatPrice(line.unitSubtotalPoisha * line.qty)}</dd></div>
      )}
      {line.unitDiscounts.map((discount) => (
        <div key={discount.id}>
          <dt>{labels[discount.id] ?? discount.id}</dt>
          <dd>−{formatPrice(discount.amountPoisha * line.qty)}</dd>
        </div>
      ))}
      <div><dt>Subtotal</dt><dd>{formatPrice(pricing.subtotalPoisha)}</dd></div>
      {pricing.cartDiscount && (
        <div>
          <dt>{labels[pricing.cartDiscount.id] ?? pricing.cartDiscount.id}</dt>
          <dd>−{formatPrice(pricing.cartDiscount.amountPoisha)}</dd>
        </div>
      )}
      <div><dt>VAT</dt><dd>{formatPrice(pricing.vatPoisha)}</dd></div>
      <div className="payable"><dt>Payable</dt><dd>{formatPrice(pricing.payablePoisha)}</dd></div>
    </dl>
  )
}
