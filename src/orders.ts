import type { Menu, Selection } from './menu'
import { priceCart, type CartPrice } from './pricing'

export const paymentMethods = ['card', 'bkash', 'cash'] as const
export type PaymentMethod = typeof paymentMethods[number]

export type CheckoutPayment = {
  paymentMethod: PaymentMethod
  couponCode: string | null
}

type OrderInput = CheckoutPayment & {
  id: string
  createdAt: string
  lines: readonly Selection[]
}

export type Order = OrderInput & {
  appliedCouponCode: string | null
  pricing: CartPrice
}

export type OrdersExport = {
  schemaVersion: 1
  currency: 'BDT'
  moneyUnit: 'poisha'
  orders: readonly Order[]
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return paymentMethods.some((method) => method === value)
}

export function priceOrder(order: OrderInput, menu: Menu): Order {
  const pricing = priceCart(order, menu, menu.promotions, order.createdAt)

  return {
    ...order,
    appliedCouponCode: pricing.cartDiscount?.id === menu.promotions.coupon.id ? menu.promotions.coupon.code : null,
    pricing,
  }
}
