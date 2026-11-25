// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Configuration } from './menu'
import { breakfastMenu } from './mocks/menu'
import { PricePreview as QuotePreview } from './PricePreview'
import { priceCart } from './pricing'
import { usePricePreview } from './usePricePreview'

const { promotions } = breakfastMenu
const firstOptions = { toast: 1, scrambled: 2, sausage: 1 }
const latestOptions = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

function PricePreview({ options, qty }: { options: Configuration; qty: number }) {
  return <QuotePreview quote={usePricePreview(options, qty)} promotions={promotions} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function deferredResponse() {
  let complete!: (response: Response) => void
  const promise = new Promise<Response>((resolve) => { complete = resolve })
  return { promise, complete }
}

function priceResponse(options: Configuration) {
  const cart = { lines: [{ options, qty: 1 }] }
  const serverTime = '2026-11-25T05:00:00Z'
  return Response.json({ pricing: priceCart(cart, breakfastMenu, promotions, serverTime), serverTime })
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

test('TC-12 debounces changes and ignores a response that arrives after a newer quote', async () => {
  const first = deferredResponse()
  const latest = deferredResponse()
  const fetchPrice = vi.fn<typeof fetch>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(latest.promise)
  vi.stubGlobal('fetch', fetchPrice)

  const { rerender } = render(<PricePreview options={{}} qty={1} />)
  await advance(299)
  rerender(<PricePreview options={firstOptions} qty={1} />)
  await advance(299)
  expect(fetchPrice).not.toHaveBeenCalled()
  await advance(1)
  expect(fetchPrice).toHaveBeenCalledTimes(1)

  rerender(<PricePreview options={latestOptions} qty={1} />)
  expect(fetchPrice.mock.calls[0][1]?.signal?.aborted).toBe(true)
  await advance(300)
  expect(fetchPrice).toHaveBeenCalledTimes(2)

  await act(async () => { latest.complete(priceResponse(latestOptions)) })
  expect(screen.getByText('Payable').nextElementSibling?.textContent).toBe('515.00 BDT')
  expect(screen.getByText('Extras deal')).toBeTruthy()
  expect(screen.getByText('−25.00 BDT')).toBeTruthy()

  // The fake fetch still delivers the earlier response after its signal is aborted.
  await act(async () => { first.complete(priceResponse(firstOptions)) })
  expect(screen.getByText('Payable').nextElementSibling?.textContent).toBe('515.00 BDT')

  rerender(<PricePreview options={firstOptions} qty={1} />)
  expect(screen.queryByText('Payable')).toBeNull()
})

test('Retry requests the same configuration after a temporary failure', async () => {
  const fetchPrice = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(priceResponse(firstOptions))
  vi.stubGlobal('fetch', fetchPrice)

  render(<PricePreview options={firstOptions} qty={1} />)
  await advance(300)
  expect(screen.getByRole('alert').textContent).toBe('Could not load the price.')

  fireEvent.click(screen.getByRole('button', { name: 'Retry price' }))
  await advance(300)

  expect(fetchPrice).toHaveBeenCalledTimes(2)
  expect(fetchPrice.mock.calls[1][1]?.body).toBe(fetchPrice.mock.calls[0][1]?.body)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Payable').nextElementSibling?.textContent).toBe('399.00 BDT')
})
