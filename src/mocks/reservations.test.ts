import { expect, test } from 'vitest'
import { breakfastMenu } from './menu'
import { editItem, emptyCart, readCart, removeItem, reserveItem } from './reservations'

const now = Date.parse('2026-11-25T05:00:00Z')
const breakfast = { options: { toast: 1, scrambled: 2, sausage: 1 }, qty: 1 }
const firstRequest = { itemId: 'first', idempotencyKey: 'add-first', selection: breakfast }
const nextRequest = { itemId: 'next', idempotencyKey: 'add-next', selection: breakfast }

function savedCart(result: ReturnType<typeof reserveItem>) {
  if (!result.ok) throw new Error(result.message)
  return result.state
}

test('TC-13 three adds with the same key reserve ingredients only once', () => {
  const cart = savedCart(reserveItem(emptyCart, breakfastMenu, firstRequest, now))
  const duplicate = { ...firstRequest, itemId: 'duplicate' }
  const second = reserveItem(cart, breakfastMenu, duplicate, now + 1_000)
  const third = reserveItem(savedCart(second), breakfastMenu, duplicate, now + 2_000)

  expect(second).toEqual({ ok: true, state: cart, itemId: 'first' })
  expect(third).toEqual(second)
  const snapshot = readCart(savedCart(third), breakfastMenu, now)
  expect(snapshot.items).toHaveLength(1)
  expect(snapshot.stock).toMatchObject({ egg: 8, toast: 19, sausage: 3 })
})

test('a rejected add leaves all other ingredients available and the request can be retried', () => {
  const menu = { ...breakfastMenu, stock: { ...breakfastMenu.stock, egg: 2 } }
  const cart = savedCart(reserveItem(emptyCart, menu, firstRequest, now))

  expect(reserveItem(cart, menu, nextRequest, now)).toEqual({
    ok: false,
    code: 'short-stock',
    message: 'Short: 2 egg',
  })
  expect(readCart(cart, menu, now).stock).toMatchObject({ egg: 0, toast: 19, sausage: 3 })

  const afterRemoval = removeItem(cart, 'first')
  const retried = savedCart(reserveItem(afterRemoval, menu, nextRequest, now))
  expect(retried.items.map((item) => item.id)).toEqual(['next'])
  expect(readCart(retried, menu, now).stock).toMatchObject({ egg: 0, toast: 19, sausage: 3 })
})

test('an edit can use its own allocation and keeps its original deadline', () => {
  const menu = { ...breakfastMenu, stock: { ...breakfastMenu.stock, egg: 6 } }
  const original = { options: { toast: 1, omelette: 2, sausage: 1 }, qty: 1 }
  const first = savedCart(reserveItem(emptyCart, menu, { ...firstRequest, selection: original }, now))
  const cart = savedCart(reserveItem(first, menu, nextRequest, now))
  const editTime = now + 60_000

  expect(editItem(cart, menu, 'first', { ...original, qty: 2 }, editTime)).toEqual({
    ok: false,
    code: 'short-stock',
    message: 'Short: 4 egg',
  })
  expect(cart.items[0]).toMatchObject({ qty: 1, ingredients: { egg: 4 } })
  expect(readCart(cart, menu, editTime).stock.egg).toBe(0)

  const edited = savedCart(editItem(cart, menu, 'first', breakfast, editTime))
  expect(readCart(edited, menu, editTime).stock.egg).toBe(2)
  expect(edited.items[0].expiresAt).toBe(now + 300_000)
})

test('TC-15 releases stock exactly at expiry and rejects edits to the expired item', () => {
  const cart = savedCart(reserveItem(emptyCart, breakfastMenu, firstRequest, now))

  const beforeExpiry = readCart(cart, breakfastMenu, now + 299_999)
  expect(beforeExpiry.items[0].expired).toBe(false)
  expect(beforeExpiry.stock.egg).toBe(8)

  const expiry = now + 300_000
  const expired = readCart(cart, breakfastMenu, expiry)
  expect(expired.serverTime).toBe('2026-11-25T05:05:00.000Z')
  expect(expired.items[0].expired).toBe(true)
  expect(expired.stock).toEqual(breakfastMenu.stock)
  expect(editItem(cart, breakfastMenu, 'first', breakfast, expiry)).toEqual({
    ok: false,
    code: 'expired',
    message: 'This reservation expired.',
  })

  const removed = removeItem(cart, 'first')
  expect(readCart(removed, breakfastMenu, expiry)).toMatchObject({
    items: [],
    stock: breakfastMenu.stock,
  })
  expect(savedCart(reserveItem(removed, breakfastMenu, firstRequest, expiry)).items).toEqual([])
})

test('the server rejects unsupported item quantities and checks menu rules', () => {
  const invalidQuantity = { ...firstRequest, selection: { ...breakfast, qty: 4 } }
  const invalidOptions = {
    ...firstRequest,
    selection: { ...breakfast, options: { ...breakfast.options, scrambled: 3 } },
  }

  expect(reserveItem(emptyCart, breakfastMenu, invalidQuantity, now)).toMatchObject({
    ok: false,
    code: 'invalid-selection',
  })
  expect(reserveItem(emptyCart, breakfastMenu, invalidOptions, now)).toEqual({
    ok: false,
    code: 'invalid-selection',
    message: 'Eggs total must be 2-6 in steps of 2',
  })
})
