import { expect, test } from 'vitest'
import { configA, configB, configC } from './assessmentFixtures'
import type { Configuration, Menu, MenuGroup } from './menu'
import { breakfastMenu } from './mocks/menu'
import { createShop } from './mocks/shopState'
import { priceCart } from './pricing'
import { getBestSellingOption, getCouponUseCount, getRevenueByPaymentMethod, getTotalRevenue } from './salesStats'
import { ingredientUsage, stockShortages } from './stock'
import { validate } from './validate'

const morning = '2026-11-25T10:30:00+06:00'
const midday = '2026-11-25T11:30:00+06:00'
const money = (poisha: number) => (poisha / 100).toFixed(2)

function groupChoices(group: MenuGroup, menu: Menu) {
  const { limits, options } = group
  const baseMax = limits.max ?? (limits.maxDistinct ?? options.length) * (limits.maxPerOption ?? Infinity)
  const max = menu.rules.reduce(
    (bound, rule) => rule.type === 'overrideLimit' && rule.groupId === group.id
      ? Math.max(bound, rule.max)
      : bound,
    baseMax,
  )
  if (!Number.isFinite(max)) throw new Error(`The ${group.id} fixture needs a finite quantity limit.`)

  const choices: Array<{ options: Configuration; lowerPrice: number }> = []
  function visit(index: number, remaining: number, config: Configuration, price: number) {
    if (index === options.length) {
      if (validate(config, [{ ...group, limits: { ...limits, max } }], []).length === 0) {
        const lowerPrice = group.id === menu.promotions.extras.groupId ? 0 : price
        choices.push({ options: config, lowerPrice })
      }
      return
    }
    const option = options[index]
    const cap = Math.min(remaining, limits.maxPerOption ?? remaining)
    for (let qty = 0; qty <= cap; qty += 1) {
      visit(
        index + 1,
        remaining - qty,
        qty === 0 ? config : { ...config, [option.id]: qty },
        price + qty * option.pricePoisha,
      )
    }
  }

  visit(0, max, {}, 0)
  return choices.sort((a, b) => a.lowerPrice - b.lowerPrice)
}

function cheapestUnit(menu: Menu) {
  const choices = menu.groups.map((group) => groupChoices(group, menu))
  const minimumRemaining = [0]
  for (let index = choices.length - 1; index >= 0; index -= 1) {
    minimumRemaining.unshift(choices[index][0].lowerPrice + minimumRemaining[0])
  }

  let best: { options: Configuration; unitPricePoisha: number } | undefined
  function visit(index: number, config: Configuration, subtotal: number) {
    const minimum = subtotal + minimumRemaining[index]
    // Extras cost at least zero, and the combo is the largest possible percentage off a unit.
    const lowerPrice = minimum - Math.round(minimum * menu.promotions.combo.percent / 100)
    if (best && lowerPrice >= best.unitPricePoisha) return

    if (index === choices.length) {
      if (validate(config, menu.groups, menu.rules).length > 0) return
      if (stockShortages(ingredientUsage(config, menu.groups, 1), menu.stock).length > 0) return
      const { lines } = priceCart({ lines: [{ options: config, qty: 1 }] }, menu, menu.promotions, midday)
      if (!best || lines[0].unitPricePoisha < best.unitPricePoisha) {
        best = { options: config, unitPricePoisha: lines[0].unitPricePoisha }
      }
      return
    }
    for (const choice of choices[index]) {
      visit(index + 1, { ...config, ...choice.options }, subtotal + choice.lowerPrice)
    }
  }

  visit(0, {}, menu.basePricePoisha)
  if (!best) throw new Error('No valid configuration exists in the assessment fixture.')
  return best
}

test('computes and prints the eight answers using the assessment fixtures', () => {
  const menu = breakfastMenu
  const { groups, promotions, stock } = menu
  const unitCapacity = Object.entries(ingredientUsage(configC, groups, 1))
    .map(([ingredient, amount]) => ({ ingredient, units: Math.floor(stock[ingredient] / amount) }))
    .sort((a, b) => a.units - b.units)
  const [limit] = unitCapacity
  const cheapest = cheapestUnit(menu)

  const cartA = { lines: [{ options: configA, qty: 3 }], couponCode: promotions.coupon.code }
  const q3 = [morning, midday].map((time) => {
    const price = priceCart(cartA, menu, promotions, time)
    return {
      time: time.slice(11, 16),
      subtotalBDT: money(price.subtotalPoisha),
      discount: price.cartDiscount?.id ?? 'None',
      discountBDT: money(price.cartDiscount?.amountPoisha ?? 0),
      discountedSubtotalBDT: money(price.discountedSubtotalPoisha),
      vatBDT: money(price.vatPoisha),
      beforeWholeRoundingBDT: money(price.discountedSubtotalPoisha + price.vatPoisha),
      payableBDT: money(price.payablePoisha),
    }
  })
  const editedCart = {
    lines: [
      { options: { ...configB, omelette: 1, fried: 3 }, qty: 1 },
      { options: configC, qty: 2 },
    ],
    couponCode: promotions.coupon.code,
  }
  const editedPrice = priceCart(editedCart, menu, promotions, midday)

  const { orders } = createShop()
  const revenue = getTotalRevenue(orders)
  const bestSeller = getBestSellingOption(orders)
  const revenueByMethod = getRevenueByPaymentMethod(orders)
  const couponOrders = getCouponUseCount(orders, promotions.coupon.code)
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: promotions.coupon.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const couponTrace = orders.filter((order) => order.couponCode === promotions.coupon.code).map((order) => {
    const time = localTime.format(new Date(order.createdAt))
    const rawDiscount = Math.round(order.pricing.subtotalPoisha * promotions.coupon.percent / 100)
    return {
      order: order.id,
      time,
      subtotalBDT: money(order.pricing.subtotalPoisha),
      beforeCapBDT: money(rawDiscount),
      eligibleCouponBDT: money(time < promotions.coupon.cutoff ? Math.min(rawDiscount, promotions.coupon.capPoisha) : 0),
      chosen: order.pricing.cartDiscount?.id ?? 'None',
      appliedCoupon: order.appliedCouponCode,
    }
  })

  console.log('Q1', limit)
  console.log('Q2', { options: cheapest.options, unitPriceBDT: money(cheapest.unitPricePoisha) })
  console.log('Q3')
  console.table(q3)
  console.log('Q4', {
    subtotalBDT: money(editedPrice.subtotalPoisha),
    discountBDT: money(editedPrice.cartDiscount?.amountPoisha ?? 0),
    vatBDT: money(editedPrice.vatPoisha),
    payableBDT: money(editedPrice.payablePoisha),
  })
  console.log('Q5', orders.map((order) => [order.id, money(order.pricing.payablePoisha)]), { totalBDT: money(revenue) })
  console.log('Q6', bestSeller)
  console.log('Q7', Object.fromEntries(Object.entries(revenueByMethod).map(([method, poisha]) => [method, money(poisha)])))
  console.log('Q8', { applied: couponOrders })
  console.table(couponTrace)

  expect(limit).toEqual({ ingredient: 'cheese', units: 2 })
  expect(cheapest).toEqual({ options: { toast: 1, fried: 2, tofu: 1 }, unitPricePoisha: 36_000 })
  expect(q3.map((result) => result.payableBDT)).toEqual(['1040.00', '1197.00'])
  expect(editedPrice.payablePoisha).toBe(160_000)
  expect(revenue).toBe(499_500)
  expect(bestSeller).toEqual({ optionId: 'fried', units: 10 })
  expect(revenueByMethod.card).toBe(Math.max(...Object.values(revenueByMethod)))
  expect(couponOrders).toBe(3)
})
