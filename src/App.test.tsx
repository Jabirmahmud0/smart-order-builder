// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import App from './App'
import { handlers } from './mocks/handlers'

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

  const scrambled = screen.getByRole('spinbutton', { name: 'Scrambled' })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Toast' }), { target: { value: '1' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Chicken Sausage' }), {
    target: { value: '1' },
  })
  fireEvent.change(scrambled, { target: { value: '3' } })

  expect(screen.getByText('Eggs total must be 2-6 in steps of 2')).toBeTruthy()

  fireEvent.change(scrambled, { target: { value: '2' } })

  expect(screen.queryByText('Eggs total must be 2-6 in steps of 2')).toBeNull()
  expect(screen.getByText('Selection meets the menu rules.')).toBeTruthy()
})

test('shows an error when the menu request fails', async () => {
  server.use(http.get('*/api/menu', () => new HttpResponse(null, { status: 503 })))

  render(<App />)

  expect((await screen.findByRole('alert')).textContent).toBe('Could not load the menu.')
})
