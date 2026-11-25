import { http, HttpResponse } from 'msw/http'
import { isPaymentMethod, priceOrder, type CheckoutPayment, type OrdersExport } from '../orders'
import { readCart } from './reservations'
import { serverNow } from './serverTime'
import { shopMenu, type ShopState } from './shopState'
import { runShopTransaction } from './shopStore'

function unavailable() {
  return HttpResponse.json({ message: 'Could not access orders. Please retry.' }, { status: 503 })
}

function rejectPayment(message: string) {
  return HttpResponse.json({ message }, { status: 400 })
}

function checkout(shop: ShopState, payment: CheckoutPayment, key: string, now: number) {
  if (Object.hasOwn(shop.successfulPayments, key)) {
    const order = shop.orders.find((candidate) => candidate.id === shop.successfulPayments[key])
    return {
      value: HttpResponse.json({ order, cart: readCart(shop.cart, shopMenu(shop), now) }),
    }
  }

  const active = shop.cart.items.filter((item) => item.expiresAt > now)
  if (active.length === 0) {
    return {
      value: HttpResponse.json({
        message: 'There are no active items to pay for.',
        cart: readCart(shop.cart, shopMenu(shop), now),
      }, { status: 409 }),
    }
  }

  const order = priceOrder({
    id: `ORD-${crypto.randomUUID()}`,
    createdAt: new Date(now).toISOString(),
    ...payment,
    lines: active.map(({ options, qty }) => ({ options, qty })),
  }, shopMenu(shop))

  const sold = new Map(Object.entries(shop.sold))
  for (const item of active) {
    for (const [ingredient, amount] of Object.entries(item.ingredients)) {
      sold.set(ingredient, (sold.get(ingredient) ?? 0) + amount)
    }
  }

  const state: ShopState = {
    cart: { ...shop.cart, items: [] },
    sold: Object.fromEntries(sold),
    orders: [...shop.orders, order],
    successfulPayments: { ...shop.successfulPayments, [key]: order.id },
  }
  return {
    state,
    value: HttpResponse.json({ order, cart: readCart(state.cart, shopMenu(state), now) }),
  }
}

export const orderHandlers = [
  http.get('*/api/orders', () =>
    runShopTransaction((shop) => {
      const payload: OrdersExport = { schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha', orders: shop.orders }
      return { value: HttpResponse.json(payload) }
    }, 'readonly').catch(unavailable),
  ),

  http.post('*/api/checkout', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key')
    if (!key?.trim()) return rejectPayment('An idempotency key is required.')

    const body = await request.json().catch(() => null) as { paymentMethod?: unknown; couponCode?: unknown } | null
    if (!isPaymentMethod(body?.paymentMethod)) return rejectPayment('Choose a payment method.')
    if (body.couponCode != null && typeof body.couponCode !== 'string') {
      return rejectPayment('Send the coupon as text.')
    }

    const payment = { paymentMethod: body.paymentMethod, couponCode: body.couponCode?.trim() || null }
    return runShopTransaction((shop) => checkout(shop, payment, key, serverNow()), 'readwrite').catch(unavailable)
  }),
]
