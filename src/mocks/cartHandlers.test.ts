import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Selection } from '../menu'
import { handlers } from './handlers'
import type { readCart } from './reservations'

const server = setupServer(...handlers)
const cartUrl = 'http://localhost/api/cart'
const breakfast = { options: { toast: 1, scrambled: 2, sausage: 1 }, qty: 1 }
type Cart = ReturnType<typeof readCart>

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function add(key: string, selection: Selection = breakfast) {
  return fetch(`${cartUrl}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(selection),
  })
}

function edit(id: string, selection: Selection) {
  return fetch(`${cartUrl}/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(selection),
  })
}

test('TC-13 concurrent requests for the same add create exactly one reservation', async () => {
  const responses = await Promise.all([add('same-add'), add('same-add'), add('same-add')])
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200])

  const results: Array<Cart & { itemId: string }> = await Promise.all(
    responses.map((response) => response.json()),
  )
  expect(new Set(results.map((result) => result.itemId)).size).toBe(1)

  const cart: Cart = await (await fetch(cartUrl)).json()
  expect(cart.items).toHaveLength(1)
  expect(cart.items[0].id).toBe(results[0].itemId)
  expect(cart.stock).toMatchObject({ egg: 8, toast: 19, sausage: 3 })
})

test('TC-14 an aborted write rolls back the whole reservation and the same key can be retried', async () => {
  expect((await fetch(cartUrl)).status).toBe(200)
  const originalPut = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, ...args) {
    const request = originalPut.apply(this, args)
    this.transaction.abort()
    return request
  })

  const failed = await add('retry-add')
  expect(failed.status).toBe(503)
  const unchanged: Cart = await (await fetch(cartUrl)).json()
  expect(unchanged.items).toEqual([])
  expect(unchanged.stock).toMatchObject({ egg: 10, toast: 20, sausage: 4 })

  const retried = await add('retry-add')
  expect(retried.status).toBe(200)
  const saved: Cart = await retried.json()
  expect(saved.items).toHaveLength(1)
  expect(saved.stock).toMatchObject({ egg: 8, toast: 19, sausage: 3 })
})

test('an edit checks the latest stock and can be retried after the conflicting item is removed', async () => {
  const first: Cart & { itemId: string } = await (await add('tab-a')).json()
  const competingSelection = { options: { toast: 1, omelette: 4, sausage: 1 }, qty: 1 }
  const second: Cart & { itemId: string } = await (await add('tab-b', competingSelection)).json()
  expect(second.stock.egg).toBe(0)

  const editedSelection = { options: { toast: 1, omelette: 2, sausage: 1 }, qty: 1 }
  const conflict = await edit(first.itemId, editedSelection)
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toMatchObject({
    code: 'short-stock',
    message: 'Short: 2 egg',
    cart: { items: [{ id: first.itemId, ...breakfast }, { id: second.itemId }] },
  })

  const removed = await fetch(`${cartUrl}/items/${second.itemId}`, { method: 'DELETE' })
  expect(removed.status).toBe(200)
  const savedResponse = await edit(first.itemId, editedSelection)
  expect(savedResponse.status).toBe(200)
  const saved: Cart = await savedResponse.json()
  expect(saved.items).toMatchObject([
    { id: first.itemId, expiresAt: first.items[0].expiresAt, ...editedSelection },
  ])
  expect(saved.stock.egg).toBe(6)
})

test('TC-15 the API releases stock at the server deadline and expired items can be removed', async () => {
  let browserNow = Date.parse('2026-11-25T04:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => browserNow)
  const added: Cart & { itemId: string } = await (await add('expiring-add')).json()
  expect(Date.parse(added.serverTime) - browserNow).toBe(90_000)
  expect(added.items[0].expiresAt - Date.parse(added.serverTime)).toBe(300_000)

  browserNow += 299_999
  const beforeExpiry: Cart = await (await fetch(cartUrl)).json()
  expect(beforeExpiry.items[0].expired).toBe(false)
  expect(beforeExpiry.stock.egg).toBe(8)

  browserNow += 1
  const expired: Cart = await (await fetch(cartUrl)).json()
  expect(expired.items[0].expired).toBe(true)
  expect(expired.stock.egg).toBe(10)
  const rejected = await edit(added.itemId, breakfast)
  expect(rejected.status).toBe(409)
  expect(await rejected.json()).toMatchObject({ code: 'expired' })

  const removed = await fetch(`${cartUrl}/items/${added.itemId}`, { method: 'DELETE' })
  expect(await removed.json()).toMatchObject({ items: [], stock: { egg: 10 } })
})
