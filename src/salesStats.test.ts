import { expect, test } from 'vitest'
import { createShop } from './mocks/shopState'
import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponUseCount,
  getOrderCount,
  getOrdersOnDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from './salesStats'

const { orders } = createShop()

test('counts the seed orders and calculates revenue in poisha', () => {
  expect(getOrderCount(orders)).toBe(6)
  expect(getTotalRevenue(orders)).toBe(499_500)
  expect(getAverageOrderValue(orders)).toBe(83_250)
})

test('counts option units across all copies of a line item', () => {
  expect(getBestSellingOption(orders)).toEqual({ optionId: 'fried', units: 10 })
  const changed = [{ ...orders[0], lines: [{ qty: 3, options: { toast: 1, scrambled: 2 } }] }]
  expect(getBestSellingOption(changed)).toEqual({ optionId: 'scrambled', units: 6 })
})

test('breaks ties by option ID', () => {
  const tied = [{ ...orders[0], lines: [{ qty: 1, options: { toast: 2, scrambled: 2 } }] }]
  expect(getBestSellingOption(tied)).toEqual({ optionId: 'scrambled', units: 2 })
})

test('groups payable revenue by payment method', () => {
  expect(getRevenueByPaymentMethod(orders)).toEqual({ card: 214_500, bkash: 157_900, cash: 127_100 })
})

test('counts the three seed orders that received the coupon', () => {
  expect(getCouponUseCount(orders, 'MORNING15')).toBe(3)
  expect(getCouponUseCount(orders, 'UNKNOWN')).toBe(0)
})

test('finds order IDs by the Dhaka calendar date', () => {
  expect(getOrdersOnDate(orders, '2026-11-21')).toEqual({
    count: 2,
    orderIds: ['ORD-1003', 'ORD-1004'],
  })
  const lateUtc = [{ ...orders[0], createdAt: '2026-11-21T18:00:00Z' }]
  expect(getOrdersOnDate(lateUtc, '2026-11-22')).toEqual({ count: 1, orderIds: ['ORD-1001'] })
  expect(getOrdersOnDate(lateUtc, '2026-11-21')).toEqual({ count: 0, orderIds: [] })
  expect(getOrdersOnDate(orders, '2026-02-30')).toBeNull()
})

test('returns empty results when there are no sales', () => {
  expect(getOrderCount([])).toBe(0)
  expect(getTotalRevenue([])).toBe(0)
  expect(getAverageOrderValue([])).toBeNull()
  expect(getBestSellingOption([])).toBeNull()
})
