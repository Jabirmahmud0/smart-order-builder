import { useCallback, useEffect, useRef, useState } from 'react'
import type { CartSnapshot } from './mocks/reservations'
import type { CheckoutPayment, Order } from './orders'

type CartError = {
  message: string
  retryable: boolean
}

type MutationResult<Value> = { ok: true; value: Value } | { ok: false; error: CartError }
type CheckoutResult = { order: Order; cart: CartSnapshot }

export function useCart() {
  const [received, setReceived] = useState<{ cart: CartSnapshot; at: number } | null>(null)
  const [tick, setTick] = useState(() => performance.now())
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)
  const reading = useRef<AbortController | null>(null)

  const acceptCart = useCallback((cart: CartSnapshot) => {
    const at = performance.now()
    setReceived({ cart, at })
    setTick(at)
    setLoadError(false)
  }, [])

  const refresh = useCallback(async () => {
    if (writing.current || reading.current) return
    const controller = new AbortController()
    reading.current = controller
    try {
      const response = await fetch('/api/cart', { signal: controller.signal })
      if (!response.ok) throw new Error('Cart request failed')
      const cart: CartSnapshot = await response.json()
      if (!controller.signal.aborted) acceptCart(cart)
    } catch {
      if (!controller.signal.aborted) setLoadError(true)
    } finally {
      if (reading.current === controller) reading.current = null
    }
  }, [acceptCart])

  useEffect(() => {
    const initialRead = window.setTimeout(refresh, 0)
    const poll = window.setInterval(refresh, 5_000)
    const clock = window.setInterval(() => setTick(performance.now()), 250)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(initialRead)
      window.clearInterval(poll)
      window.clearInterval(clock)
      window.removeEventListener('focus', refresh)
      reading.current?.abort()
      reading.current = null
    }
  }, [refresh])

  async function requestMutation<Value>(
    url: string,
    request: RequestInit,
    cartFrom: (value: Value) => CartSnapshot,
  ): Promise<MutationResult<Value> | null> {
    if (writing.current) return null
    writing.current = true
    reading.current?.abort()
    reading.current = null
    setBusy(true)

    try {
      const response = await fetch(url, request)
      if (response.ok) {
        const value: Value = await response.json()
        acceptCart(cartFrom(value))
        return { ok: true, value }
      }

      const error: { message?: string; cart?: CartSnapshot } = await response.json().catch(() => ({}))
      if (error.cart) acceptCart(error.cart)
      return {
        ok: false,
        error: { message: error.message ?? 'Could not update the cart.', retryable: response.status >= 500 },
      }
    } catch {
      return { ok: false, error: { message: 'Could not reach the cart. Please retry.', retryable: true } }
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  function mutate(path: string, request: RequestInit) {
    return requestMutation<CartSnapshot>(`/api/cart${path}`, request, (cart) => cart)
  }

  function pay(payment: CheckoutPayment, key: string) {
    return requestMutation<CheckoutResult>('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payment),
    }, (result) => result.cart)
  }

  const serverTime = received
    ? Date.parse(received.cart.serverTime) + Math.max(0, tick - received.at)
    : 0

  return { cart: received?.cart, serverTime, busy, loadError, refresh, mutate, pay }
}
