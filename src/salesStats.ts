import type { Order, PaymentMethod } from './orders'

const dhakaDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getOrderCount(orders: readonly Order[]): number {
  return orders.length
}

export function getTotalRevenue(orders: readonly Order[]): number {
  return orders.reduce((total, order) => total + order.pricing.payablePoisha, 0)
}

export function getBestSellingOption(orders: readonly Order[]) {
  const unitsByOption = new Map<string, number>()
  for (const order of orders) {
    for (const line of order.lines) {
      for (const [optionId, qty] of Object.entries(line.options)) {
        if (qty <= 0) continue
        unitsByOption.set(optionId, (unitsByOption.get(optionId) ?? 0) + qty * line.qty)
      }
    }
  }

  let best: { optionId: string; units: number } | null = null
  for (const [optionId, units] of unitsByOption) {
    if (!best || units > best.units || (units === best.units && optionId < best.optionId)) {
      best = { optionId, units }
    }
  }
  return best
}

export function getRevenueByPaymentMethod(orders: readonly Order[]): Record<PaymentMethod, number> {
  const revenue = { card: 0, bkash: 0, cash: 0 }
  for (const order of orders) {
    revenue[order.paymentMethod] += order.pricing.payablePoisha
  }
  return revenue
}

export function getAverageOrderValue(orders: readonly Order[]): number | null {
  return orders.length === 0 ? null : Math.round(getTotalRevenue(orders) / orders.length)
}

export function getCouponUseCount(orders: readonly Order[], couponCode: string): number {
  return orders.filter((order) => order.appliedCouponCode === couponCode).length
}

export function getOrdersOnDate(orders: readonly Order[], date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null

  const orderIds = orders.filter((order) => {
    const { year, month, day } = Object.fromEntries(
      dhakaDate.formatToParts(new Date(order.createdAt)).map(({ type, value }) => [type, value]),
    )
    return `${year}-${month}-${day}` === date
  }).map((order) => order.id)

  return { count: orderIds.length, orderIds }
}
