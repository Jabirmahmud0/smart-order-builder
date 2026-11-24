// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import App from './App'

afterEach(cleanup)

test('shows the Smart Order Builder heading', () => {
  render(<App />)

  expect(screen.getByRole('heading', { level: 1, name: 'Smart Order Builder' })).toBeTruthy()
})
