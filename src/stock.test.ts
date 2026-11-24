import { expect, test } from 'vitest'
import { breakfastMenu } from './mocks/menu'
import { availableStock, ingredientUsage, maxAdditionalUnits, stockShortages } from './stock'

const { groups, stock } = breakfastMenu
const configB = {
  croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1,
  hashbrown: 1, mushroom: 1, hollandaise: 1,
}
const configC = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

const cart = [
  { id: 'b', ingredients: ingredientUsage(configB, groups, 1) },
  { id: 'c', ingredients: ingredientUsage(configC, groups, 2) },
]

test('TC-08 shares ingredient stock across cart items and blocks new egg selections', () => {
  const remaining = availableStock(stock, cart)

  expect(remaining).toMatchObject({ egg: 0, cheese: 0, croissant: 1 })
  expect(maxAdditionalUnits({ egg: 1 }, remaining, {}, 1)).toBe(0)
  expect(stockShortages(ingredientUsage({ fried: 2 }, groups, 1), remaining)).toEqual([
    { ingredient: 'egg', missing: 2 },
  ])
})

test('TC-09 an edit can reuse its own eggs and reports the extra egg it needs', () => {
  const requested = ingredientUsage({ ...configB, omelette: 3, fried: 1 }, groups, 1)
  const available = availableStock(stock, cart, 'b')

  expect(stockShortages(requested, available)).toEqual([{ ingredient: 'egg', missing: 1 }])
  expect(availableStock(stock, cart).egg).toBe(0)
})

test('TC-10 replacing the allocation with a lower egg count leaves one egg available', () => {
  const requested = ingredientUsage({ ...configB, omelette: 1, fried: 3 }, groups, 1)

  expect(stockShortages(requested, availableStock(stock, cart, 'b'))).toEqual([])
  expect(availableStock(stock, [{ id: 'b', ingredients: requested }, cart[1]]).egg).toBe(1)
})

test('TC-11 increasing the line quantity reports both ingredient shortages', () => {
  const requested = ingredientUsage(configC, groups, 3)

  expect(stockShortages(requested, availableStock(stock, cart, 'c'))).toEqual([
    { ingredient: 'egg', missing: 2 },
    { ingredient: 'cheese', missing: 2 },
  ])
})

test('additional units use the tightest ingredient after accounting for the draft and line quantity', () => {
  const remaining = { egg: 14, cheese: 9 }
  const draftUsage = { egg: 2, cheese: 5 }

  expect(maxAdditionalUnits({ egg: 2, cheese: 1 }, remaining, draftUsage, 2)).toBe(2)
  expect(maxAdditionalUnits({}, remaining, draftUsage, 2)).toBeNull()
})
