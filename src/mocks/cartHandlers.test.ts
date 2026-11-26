import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import type { Selection } from '../menu'
import { cartVersionConflictCode, cartVersionHeader } from './cartVersion'
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

function add(key: string, selection: Selection = breakfast, version = 0) {
  return fetch(`${cartUrl}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, [cartVersionHeader]: String(version) },
    body: JSON.stringify(selection),
  })
}

function edit(id: string, selection: Selection, version: number) {
  return fetch(`${cartUrl}/items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', [cartVersionHeader]: String(version) },
    body: JSON.stringify(selection),
  })
}

function remove(id: string, version: number) {
  return fetch(`${cartUrl}/items/${id}`, { method: 'DELETE', headers: { [cartVersionHeader]: String(version) } })
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
  const second: Cart & { itemId: string } = await (await add('tab-b', competingSelection, first.version)).json()
  expect(second.stock.egg).toBe(0)

  const editedSelection = { options: { toast: 1, omelette: 2, sausage: 1 }, qty: 1 }
  const conflict = await edit(first.itemId, editedSelection, second.version)
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toMatchObject({
    code: 'short-stock',
    message: 'Short: 2 egg',
    cart: { items: [{ id: first.itemId, ...breakfast }, { id: second.itemId }] },
  })

  const removed = await remove(second.itemId, second.version)
  expect(removed.status).toBe(200)
  const { version }: Cart = await removed.json()
  const savedResponse = await edit(first.itemId, editedSelection, version)
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
  const rejected = await edit(added.itemId, breakfast, expired.version)
  expect(rejected.status).toBe(409)
  expect(await rejected.json()).toMatchObject({ code: 'expired' })

  const removed = await remove(added.itemId, expired.version)
  expect(await removed.json()).toMatchObject({ items: [], stock: { egg: 10 } })
})

test('stale adds, edits and removals return the current cart without changing it', async () => {
  const initial: Cart & { itemId: string } = await (await add('first')).json()
  const saved: Cart = await (await edit(initial.itemId, { ...breakfast, qty: 2 }, initial.version)).json()
  expect(saved.version).toBe(initial.version + 1)
  const stale = await Promise.all([
    add('stale-add', breakfast, initial.version),
    edit(initial.itemId, breakfast, initial.version),
    remove(initial.itemId, initial.version),
  ])
  for (const response of stale) {
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: cartVersionConflictCode,
      cart: { version: saved.version, items: saved.items, stock: saved.stock },
    })
  }
})

test('a page reload prunes expired reservations and keeps still-valid ones', async () => {
  let now = Date.parse('2026-11-25T04:00:00Z')
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const first: Cart & { itemId: string } = await (await add('expires-first')).json()
  now += 60_000
  const second: Cart & { itemId: string } = await (await add('still-valid', breakfast, first.version)).json()
  now += 240_000

  const before: Cart = await (await fetch(cartUrl)).json()
  expect(before.items.map(({ expired }) => expired)).toEqual([true, false])
  const reloaded: Cart = await (await fetch(`${cartUrl}?cleanup=expired`)).json()
  expect(reloaded).toMatchObject({
    version: second.version + 1,
    items: [{ id: second.itemId, expiresAt: second.items[1].expiresAt }],
    stock: { egg: 8 },
  })
  expect((await (await fetch(cartUrl)).json()).items).toEqual(reloaded.items)
})
