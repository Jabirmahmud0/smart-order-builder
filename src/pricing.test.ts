import { expect, test } from 'vitest'
import { configA, configB, configC } from './assessmentFixtures'
import { breakfastMenu } from './mocks/menu'
import { priceCart } from './pricing'

const { promotions } = breakfastMenu
const beforeCutoff = '2026-11-25T04:59:59Z'
const atCutoff = '2026-11-25T05:00:00Z'

const cart = {
  lines: [{ options: configB, qty: 1 }, { options: configC, qty: 2 }],
  couponCode: 'MORNING15',
}

test('TC-05 prices A, B, and C in integer poisha', () => {
  const lines = [configA, configB, configC].map((options) => ({ options, qty: 1 }))
  const pricing = priceCart({ lines }, breakfastMenu, promotions, beforeCutoff)

  expect(pricing.lines.map((line) => line.unitPricePoisha)).toEqual([38_000, 67_950, 49_000])
  expect(pricing.lines[1].unitDiscounts).toEqual([{ id: 'P1', amountPoisha: 7_550 }])
  expect(pricing.lines[2].unitDiscounts).toEqual([{ id: 'P2', amountPoisha: 2_500 }])
})

test('TC-06 applies the capped coupon at 10:59:59 in Dhaka', () => {
  expect(priceCart(cart, breakfastMenu, promotions, beforeCutoff)).toMatchObject({
    subtotalPoisha: 165_950,
    cartDiscount: { id: 'C2', amountPoisha: 15_000 },
    discountedSubtotalPoisha: 150_950,
    vatPoisha: 7_548,
    payablePoisha: 158_500,
  })
})

test('TC-07 applies the fixed discount at 11:00:00 in Dhaka', () => {
  expect(priceCart(cart, breakfastMenu, promotions, atCutoff)).toMatchObject({
    subtotalPoisha: 165_950,
    cartDiscount: { id: 'C1', amountPoisha: 10_000 },
    discountedSubtotalPoisha: 155_950,
    vatPoisha: 7_798,
    payablePoisha: 163_700,
  })
})

test('TC-10 reprices B after the egg selection changes', () => {
  const options = { ...configB, omelette: 1, fried: 3 }
  const pricing = priceCart({ lines: [{ options, qty: 1 }] }, breakfastMenu, promotions, atCutoff)

  expect(pricing.lines[0].unitPricePoisha).toBe(64_350)
})

test('the fixed discount wins a tie with the coupon', () => {
  const promos = { ...promotions, coupon: { ...promotions.coupon, capPoisha: 10_000 } }

  expect(priceCart(cart, breakfastMenu, promos, beforeCutoff).cartDiscount).toEqual({
    id: 'C1',
    amountPoisha: 10_000,
  })
})

test('the two cheapest extra units are free before the combo discount for each copy', () => {
  const menu = {
    ...breakfastMenu,
    groups: breakfastMenu.groups.map((group) => group.id === 'extras'
      ? { ...group, limits: { ...group.limits, max: 6 } }
      : group),
  }
  const options = { ...configB, croissant: 0, toast: 1, hashbrown: 2, mushroom: 2, beans: 2 }
  const pricing = priceCart({ lines: [{ options, qty: 2 }] }, menu, promotions, beforeCutoff)

  expect(pricing.lines[0]).toEqual({
    qty: 2,
    unitSubtotalPoisha: 81_500,
    unitDiscounts: [
      { id: 'P2', amountPoisha: 5_000 },
      { id: 'P1', amountPoisha: 7_650 },
    ],
    unitPricePoisha: 68_850,
    lineTotalPoisha: 137_700,
  })
})

test('handles disabled item promotions and case-insensitive coupon codes', () => {
  const promos = {
    ...promotions,
    extras: { ...promotions.extras, unitsPerFree: 0 },
    combo: { ...promotions.combo, minimums: {} },
  }
  const pricing = priceCart(
    { lines: [{ options: configC, qty: 1 }], couponCode: ' morning15 ' },
    breakfastMenu,
    promos,
    beforeCutoff,
  )

  expect(pricing.lines[0]).toMatchObject({
    unitSubtotalPoisha: 51_500,
    unitDiscounts: [],
    unitPricePoisha: 51_500,
  })
  expect(pricing.cartDiscount).toEqual({ id: 'C2', amountPoisha: 7_725 })
})
