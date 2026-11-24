import { expect, test } from 'vitest'
import { breakfastMenu } from './mocks/menu'
import { priceCart } from './pricing'

const { promotions } = breakfastMenu
const beforeCutoff = '2026-11-25T04:59:59Z'
const atCutoff = '2026-11-25T05:00:00Z'

const configA = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }
const configB = {
  croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1,
  hashbrown: 1, mushroom: 1, hollandaise: 1,
}
const configC = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

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
