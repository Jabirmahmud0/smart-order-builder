// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import App from './App'
import { handlers } from './mocks/handlers'
import { breakfastMenu } from './mocks/menu'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

test('loads the menu and updates validation when quantities change', async () => {
  render(<App />)

  expect(screen.getByRole('heading', { level: 1, name: 'Smart Order Builder' })).toBeTruthy()
  await screen.findByRole('heading', { name: 'Build Your Breakfast' })
  expect(screen.getByText('Bread total must be at least 1')).toBeTruthy()

  const addScrambled = screen.getByRole('button', { name: 'Add Scrambled' })
  fireEvent.click(screen.getByRole('button', { name: 'Add Toast' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Chicken Sausage' }))
  fireEvent.click(addScrambled)
  fireEvent.click(addScrambled)
  fireEvent.click(addScrambled)

  expect(screen.getByText('Eggs total must be 2-6 in steps of 2')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Scrambled' }))

  expect(screen.queryByText('Eggs total must be 2-6 in steps of 2')).toBeNull()
  expect(screen.getByText('Selection meets the menu rules.')).toBeTruthy()
})

test('updates shared availability and lets users remove an option even when it is out of stock', async () => {
  server.use(http.get('*/api/menu', () => HttpResponse.json({
    ...breakfastMenu,
    stock: { ...breakfastMenu.stock, egg: 2 },
  })))
  render(<App />)

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
