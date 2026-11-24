import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import type { Menu } from '../menu'
import type { CartPrice } from '../pricing'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => vi.restoreAllMocks())
afterAll(() => server.close())

test('GET /api/menu returns menu options, rules, shared stock, and promotions', async () => {
  const response = await fetch('http://localhost/api/menu')
  expect(response.status).toBe(200)

  const menu: Menu = await response.json()
  expect(menu.basePricePoisha).toBe(25_000)
  expect(menu.groups.map((group) => group.id)).toEqual(['bread', 'eggs', 'protein', 'extras', 'sauce'])
  expect(menu.groups.flatMap((group) => group.options)).toContainEqual({
    id: 'omelette',
    name: 'Omelette',
    pricePoisha: 7_000,
    ingredients: { egg: 2 },
  })
  expect(menu.rules).toContainEqual({
    id: 'R3',
    type: 'overrideLimit',
    optionId: 'croissant',
    groupId: 'extras',
    max: 2,
  })
  expect(menu.stock.egg).toBe(10)
  expect(menu.promotions.coupon).toMatchObject({
    code: 'MORNING15',
    capPoisha: 15_000,
    timeZone: 'Asia/Dhaka',
    cutoff: '11:00',
  })
})

function requestPrice() {
  return fetch('http://localhost/api/price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: [{ options: { toast: 1, scrambled: 2, sausage: 1 }, qty: 1 }] }),
  })
}

test('POST /api/price returns the pricing breakdown and the mock server time', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const startedAt = Date.now()
  const response = await requestPrice()

  expect(response.status).toBe(200)
  const { pricing, serverTime }: { pricing: CartPrice; serverTime: string } = await response.json()
  expect(pricing).toMatchObject({
    subtotalPoisha: 38_000,
    vatPoisha: 1_900,
    payablePoisha: 39_900,
  })
  expect(Date.parse(serverTime)).toBeGreaterThanOrEqual(startedAt + 90_000)
  expect(Date.parse(serverTime)).toBeLessThanOrEqual(Date.now() + 90_000)
})

test('POST /api/price can return a temporary failure', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)

  expect((await requestPrice()).status).toBe(503)
})
