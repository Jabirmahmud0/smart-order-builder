import { setupServer } from 'msw/node'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { Menu } from '../menu'
import { handlers } from './handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
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
