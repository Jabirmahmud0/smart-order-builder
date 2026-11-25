import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Order, OrdersExport } from '../orders'
import { handlers } from './handlers'
import type { CartSnapshot } from './reservations'

const server = setupServer(...handlers)
const api = 'http://localhost/api'
const breakfast = { options: { toast: 1, scrambled: 2, sausage: 1 }, qty: 1 }

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function post(path: string, key: string, body: object) {
  return fetch(api + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  })
}

async function orders(): Promise<OrdersExport> {
  const response = await fetch(api + '/orders')
  expect(response.status).toBe(200)
  return response.json()
}

test('initializes the six seed orders with prices at their original timestamps', async () => {
  const exported = await orders()

  expect(exported).toMatchObject({ schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha' })
  expect(exported.orders.map((order) => order.pricing.payablePoisha)).toEqual([
    33_900, 71_300, 127_100, 57_800, 86_600, 122_800,
  ])
  expect(exported.orders[0]).toMatchObject({
    id: 'ORD-1001', couponCode: 'MORNING15', appliedCouponCode: 'MORNING15',
  })
  expect(exported.orders[5]).toMatchObject({
    id: 'ORD-1006', couponCode: 'MORNING15', appliedCouponCode: null,
  })
})

test('TC-16 concurrent Pay requests create one order and sold stock stays deducted', async () => {
  let browserTime = Date.parse('2026-11-25T04:29:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => browserTime)
  expect((await post('/cart/items', 'add', breakfast)).status).toBe(200)

  const payment = { paymentMethod: 'card', couponCode: 'MORNING15' }
  const responses = await Promise.all([
    post('/checkout', 'pay', payment),
    post('/checkout', 'pay', payment),
  ])
  expect(responses.map((response) => response.status)).toEqual([200, 200])
  const results: Array<{ order: Order; cart: CartSnapshot }> = await Promise.all(
    responses.map((response) => response.json()),
  )
  expect(results[0].order.id).toBe(results[1].order.id)
  expect(results[0].order).toMatchObject({
    createdAt: '2026-11-25T04:30:30.000Z',
    paymentMethod: 'card',
    appliedCouponCode: 'MORNING15',
    pricing: { payablePoisha: 33_900 },
  })
  expect(results[0].cart).toMatchObject({ items: [], stock: { egg: 8, toast: 19, sausage: 3 } })
  expect((await post('/checkout', 'pay-again', payment)).status).toBe(409)

  browserTime += 300_000
  const cart: CartSnapshot = await (await fetch(api + '/cart')).json()
  expect(cart).toMatchObject({ items: [], stock: { egg: 8, toast: 19, sausage: 3 } })
  const exported = await orders()
  expect(exported.orders).toHaveLength(7)
  expect(exported.orders[6]).toEqual(results[0].order)
})

test('rolls back the order and stock change if the checkout transaction aborts', async () => {
  expect((await post('/cart/items', 'add', breakfast)).status).toBe(200)
  const put = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
    const request = put.apply(this, args)
    this.transaction.abort()
    return request
  })

  const payment = { paymentMethod: 'cash' }
  expect((await post('/checkout', 'pay', payment)).status).toBe(503)
  expect((await orders()).orders).toHaveLength(6)
  const cart: CartSnapshot = await (await fetch(api + '/cart')).json()
  expect(cart.items).toHaveLength(1)
  expect(cart.stock.egg).toBe(8)

  expect((await post('/checkout', 'pay', payment)).status).toBe(200)
  expect((await orders()).orders).toHaveLength(7)
})

test('checkout includes only active items and clears expired rows', async () => {
  let browserTime = Date.parse('2026-11-25T04:29:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => browserTime)
  expect((await post('/cart/items', 'first', breakfast)).status).toBe(200)
  browserTime += 240_000
  const active = { ...breakfast, qty: 2 }
  expect((await post('/cart/items', 'second', active)).status).toBe(200)
  browserTime += 60_000

  const response = await post('/checkout', 'pay', { paymentMethod: 'bkash' })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    order: { lines: [active] },
    cart: { items: [], stock: { egg: 6, toast: 18, sausage: 2 } },
  })
})

test('preserves reservations and add keys when upgrading the previously stored cart', async () => {
  const expiresAt = Date.now() + 300_000
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('smart-order-builder', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cart').put({
        items: [{ ...breakfast, id: 'old-item', expiresAt, ingredients: { egg: 2, toast: 1, sausage: 1 } }],
        successfulAdds: { 'old-key': 'old-item' },
      }, 'current')
    }
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
    request.onerror = () => reject(request.error)
  })

  expect((await orders()).orders).toHaveLength(6)
  const replay = await post('/cart/items', 'old-key', breakfast)
  expect(replay.status).toBe(200)
  expect(await replay.json()).toMatchObject({
    itemId: 'old-item',
    items: [{ id: 'old-item', expiresAt }],
    stock: { egg: 8 },
  })
})
