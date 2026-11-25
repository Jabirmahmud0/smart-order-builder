import { useEffect, useState } from 'react'
import type { Configuration } from './menu'
import type { CartPrice, PricingCart } from './pricing'

type PreviewResult = {
  options: Configuration
  qty: number
  pricing: CartPrice | null
}

export function usePricePreview(options: Configuration, qty: number) {
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

  function retry() {
    setResult(null)
    setAttempt((previous) => previous + 1)
  }

  return { pricing: current?.pricing ?? null, loading: current === null, retry }
}
