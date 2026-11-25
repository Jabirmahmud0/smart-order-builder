import { useEffect, useState } from 'react'
import type { Configuration, Promotions } from './menu'
import { PriceBreakdown } from './PriceBreakdown'
import type { CartPrice, PricingCart } from './pricing'

type PreviewResult = {
  options: Configuration
  qty: number
  pricing: CartPrice | null
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
