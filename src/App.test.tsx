// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { handlers } from './mocks/handlers'
import { breakfastMenu } from './mocks/menu'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function selectBreakfast() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Toast' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Chicken Sausage' }))
  const scrambled = screen.getByRole('button', { name: 'Add Scrambled' })
  fireEvent.click(scrambled)
  fireEvent.click(scrambled)
}

test('loads the menu and updates validation when quantities change', async () => {
  render(<App />)

  expect(screen.getByRole('heading', { level: 1, name: 'Smart Order Builder' })).toBeTruthy()
  await screen.findByRole('heading', { name: 'Build Your Breakfast' })
  await screen.findByText('Your cart is empty.')
  expect(screen.getByText('Bread total must be at least 1')).toBeTruthy()

  const addToCart = screen.getByRole<HTMLButtonElement>('button', { name: 'Add to Cart' })
  selectBreakfast()
  fireEvent.click(screen.getByRole('button', { name: 'Add Scrambled' }))

  expect(screen.getByText('Eggs total must be 2-6 in steps of 2')).toBeTruthy()
  expect(addToCart.disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Remove Scrambled' }))

  expect(screen.queryByText('Eggs total must be 2-6 in steps of 2')).toBeNull()
  expect(screen.getByText('Selection meets the menu rules.')).toBeTruthy()
  expect(addToCart.disabled).toBe(false)
})

test('updates shared availability and lets users remove an option even when it is out of stock', async () => {
  server.use(http.get('*/api/cart', () => HttpResponse.json({
    items: [],
    stock: { ...breakfastMenu.stock, egg: 2 },
    serverTime: new Date(Date.now() + 90_000).toISOString(),
  })))
  render(<App />)

  await screen.findByText('Your cart is empty.')
  const omelette = within(await screen.findByRole('group', { name: 'Omelette' }))
  const fried = within(screen.getByRole('group', { name: 'Fried' }))
  const addFried = fried.getByRole<HTMLButtonElement>('button', { name: 'Add Fried' })
  const addOmelette = omelette.getByRole<HTMLButtonElement>('button', { name: 'Add Omelette' })
  const removeOmelette = omelette.getByRole<HTMLButtonElement>('button', { name: 'Remove Omelette' })

  expect(omelette.getByText('1 more in stock')).toBeTruthy()
  expect(fried.getByText('2 more in stock')).toBeTruthy()

  fireEvent.click(addOmelette)

  expect(addOmelette.disabled).toBe(true)
  expect(addFried.disabled).toBe(true)
  expect(removeOmelette.disabled).toBe(false)
  expect(fried.getByText('0 more in stock')).toBeTruthy()
  expect(fried.getByText('Short: 1 egg')).toBeTruthy()
  expect(within(screen.getByRole('group', { name: 'Ketchup' })).getByText('Unlimited stock')).toBeTruthy()

  fireEvent.click(removeOmelette)

  expect(addFried.disabled).toBe(false)
  expect(fried.getByText('2 more in stock')).toBeTruthy()
})

test('shows an error when the menu request fails', async () => {
  server.use(http.get('*/api/menu', () => new HttpResponse(null, { status: 503 })))

  render(<App />)

  expect((await screen.findByRole('alert')).textContent).toBe('Could not load the menu.')
})

test('adds one item after rapid clicks and retries with the same selection and key', async () => {
  const keys: Array<string | null> = []
  server.use(
    http.post('*/api/cart/items', ({ request }) => { keys.push(request.headers.get('Idempotency-Key')) }),
    http.post('*/api/cart/items', () => new HttpResponse(null, { status: 503 }), { once: true }),
  )

  render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  const add = screen.getByRole('button', { name: 'Add to Cart' })
  fireEvent.click(add)
  fireEvent.click(add)
  fireEvent.click(add)

  const retry = await screen.findByRole('button', { name: 'Retry save' })
  expect(keys).toHaveLength(1)
  expect(within(screen.getByRole('group', { name: 'Scrambled' })).getByText('2')).toBeTruthy()
  fireEvent.click(retry)

  const cart = within(screen.getByRole('region', { name: 'Cart' }))
  await cart.findByText('1 × Build Your Breakfast')
  expect(keys).toEqual([keys[0], keys[0]])
  expect(keys[0]).toBeTruthy()
  expect(cart.getAllByRole('listitem')).toHaveLength(1)
  expect(within(screen.getByRole('group', { name: 'Fried' })).getByText('8 more in stock')).toBeTruthy()
})

test('edits an item quantity with the original stock credited and removes the reservation', async () => {
  render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

  const cart = within(screen.getByRole('region', { name: 'Cart' }))
  fireEvent.click(await cart.findByRole('button', { name: 'Edit' }))
  expect(within(screen.getByRole('group', { name: 'Fried' })).getByText('8 more in stock')).toBeTruthy()

  fireEvent.change(screen.getByRole('combobox', { name: 'Item quantity' }), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

  await cart.findByText('2 × Build Your Breakfast')
  expect(cart.getAllByRole('listitem')).toHaveLength(1)
  expect(within(screen.getByRole('group', { name: 'Fried' })).getByText('6 more in stock')).toBeTruthy()
  fireEvent.click(cart.getByRole('button', { name: 'Remove' }))
  await cart.findByText('Your cart is empty.')
  expect(within(screen.getByRole('group', { name: 'Fried' })).getByText('10 more in stock')).toBeTruthy()
})

test('uses the server countdown and keeps an expired edit draft visible with Save disabled', async () => {
  let elapsed = 0
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)

  render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

  const cart = within(screen.getByRole('region', { name: 'Cart' }))
  await cart.findByText('Reserved for 5:00')
  fireEvent.click(cart.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Item quantity' }), { target: { value: '2' } })

  elapsed = 300_000

  await cart.findByText('Reservation expired')
  expect(screen.getByText('This reservation expired.')).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(true)
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Item quantity' }).value).toBe('2')
  expect(cart.getByRole<HTMLButtonElement>('button', { name: 'Edit' }).disabled).toBe(true)
  expect(cart.getByRole<HTMLButtonElement>('button', { name: 'Remove' }).disabled).toBe(false)
})
