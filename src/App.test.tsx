// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { configB, configC } from './assessmentFixtures'
import { cartVersionHeader } from './mocks/cartVersion'
import { handlers } from './mocks/handlers'
import { breakfastMenu } from './mocks/menu'
import type { OrdersExport } from './orders'

const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperties(HTMLDialogElement.prototype, {
      show: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
      showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true } },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = false
          this.dispatchEvent(new Event('close'))
        },
      },
    })
  }
})
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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
    version: 0,
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

test('TC-11 shows both shortages beside the mobile Save button', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true, addEventListener: () => {}, removeEventListener: () => {},
  }))

  for (const [key, options, qty, version] of [['B', configB, 1, 0], ['C', configC, 2, 1]] as const) {
    const response = await fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, [cartVersionHeader]: String(version) },
      body: JSON.stringify({ options, qty }),
    })
    expect(response.ok).toBe(true)
  }

  const { container } = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'View cart (3)' }))
  const orderSheet = screen.getByRole<HTMLDialogElement>('dialog', { name: 'Your order' })
  const item = within(orderSheet).getByText('2 × Build Your Breakfast').closest('li')!
  fireEvent.click(within(item).getByRole('button', { name: 'Edit' }))
  expect(orderSheet.open).toBe(false)

  const quantity = screen.getByRole('combobox', { name: 'Item quantity' })
  const bar = within(container.querySelector('.mobile-order-bar')!)
  const save = bar.getByRole<HTMLButtonElement>('button', { name: 'Save changes' })
  fireEvent.change(quantity, { target: { value: '3' } })
  const shortage = bar.getByRole('status')
  expect(shortage.textContent).toBe('Short: 2 egg, 2 cheese')
  expect(save.disabled).toBe(true)
  expect(save.getAttribute('aria-describedby')).toBe(shortage.id)

  fireEvent.change(quantity, { target: { value: '2' } })
  expect(bar.queryByRole('status')).toBeNull()
  expect(save.disabled).toBe(false)
})

test('keeps the edited selection when another tab changes the cart, even after a background refresh', async () => {
  render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
  await screen.findByText('1 × Build Your Breakfast')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const quantity = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Item quantity' })
  fireEvent.change(quantity, { target: { value: '2' } })

  const { items, version } = await (await fetch('/api/cart')).json()
  const original = items[0]
  const changed = await fetch(`/api/cart/items/${original.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', [cartVersionHeader]: String(version) },
    body: JSON.stringify({ options: original.options, qty: 3 }),
  })
  expect(changed.ok).toBe(true)
  window.dispatchEvent(new Event('focus'))
  await screen.findByText('3 × Build Your Breakfast')

  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText(/The cart changed in another tab/)
  expect(quantity.value).toBe('2')
  expect(screen.getByText('3 × Build Your Breakfast')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('2 × Build Your Breakfast')
})

test('restores unfinished new and edited selections after reloading the builder', async () => {
  const first = render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  fireEvent.change(screen.getByRole('combobox', { name: 'Item quantity' }), { target: { value: '2' } })
  first.unmount()

  const second = render(<App />)
  await screen.findByText('Your cart is empty.')
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Item quantity' }).value).toBe('2')
  const add = screen.getByRole<HTMLButtonElement>('button', { name: 'Add to Cart' })
  expect(add.disabled).toBe(false)
  fireEvent.click(add)
  await screen.findByText('2 × Build Your Breakfast')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Item quantity' }), { target: { value: '3' } })
  second.unmount()

  render(<App />)
  await screen.findByText('2 × Build Your Breakfast')
  expect(screen.getByRole('heading', { name: 'Edit cart item' })).toBeTruthy()
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Item quantity' }).value).toBe('3')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' }).disabled).toBe(false)
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

test('pays once using server-time totals and downloads the persisted order after remount', async () => {
  let browserTime = Date.parse('2026-11-25T04:58:29Z')
  let elapsed = 0
  vi.spyOn(Date, 'now').mockImplementation(() => browserTime)
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  let paymentRequests = 0
  server.use(http.post('*/api/checkout', () => { paymentRequests += 1 }))

  const { unmount } = render(<App />)
  await screen.findByText('Your cart is empty.')
  selectBreakfast()
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))

  const checkout = within(screen.getByRole('region', { name: 'Checkout' }))
  fireEvent.change(await checkout.findByRole('textbox', { name: 'Coupon code' }), {
    target: { value: 'MORNING15' },
  })
  expect(checkout.getByText('Payable').nextElementSibling?.textContent).toBe('339.00 BDT')

  browserTime += 1_000
  elapsed += 1_000
  await checkout.findByText('Coupon did not apply.')
  expect(checkout.getByText('Payable').nextElementSibling?.textContent).toBe('399.00 BDT')

  fireEvent.change(checkout.getByRole('combobox', { name: 'Payment method' }), { target: { value: 'bkash' } })
  const pay = checkout.getByRole('button', { name: 'Pay' })
  fireEvent.click(pay)
  fireEvent.click(pay)
  const receipt = await checkout.findByText(/^Order ORD-.* paid\.$/)
  const orderId = receipt.textContent?.split(' ')[1]
  expect(paymentRequests).toBe(1)
  expect(checkout.getByText('Payable').nextElementSibling?.textContent).toBe('399.00 BDT')
  expect(screen.getByText('Your cart is empty.')).toBeTruthy()
  expect(within(screen.getByRole('group', { name: 'Fried' })).getByText('8 more in stock')).toBeTruthy()
  unmount()

  const createObjectURL = vi.fn<(file: Blob) => string>().mockReturnValue('blob:http://localhost/orders')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL
    static revokeObjectURL = revokeObjectURL
  })
  let downloadedName = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedName = this.download
  })

  render(<App />)
  await screen.findByText('Your cart is empty.')
  fireEvent.click(screen.getByRole('button', { name: 'Download orders.json' }))
  await waitFor(() => expect(downloadedName).toBe('orders.json'))
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/orders'))
  const file = createObjectURL.mock.calls[0][0]
  const exported: OrdersExport = JSON.parse(await file.text())
  expect(exported).toMatchObject({ schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha' })
  expect(exported.orders).toHaveLength(7)
  expect(exported.orders[6]).toMatchObject({
    id: orderId,
    paymentMethod: 'bkash',
    couponCode: 'MORNING15',
    appliedCouponCode: null,
    pricing: { payablePoisha: 39_900 },
  })
})

test('TC-18 to TC-20 the sales assistant uses current orders and answers customer questions locally', async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'mock-gemini-key')
  const requests: unknown[] = []
  server.use(http.post('https://generativelanguage.googleapis.com/v1beta/interactions', async ({ request }) => {
    const body = await request.json() as {
      model: string
      store: boolean
      input: Array<{ type: string; content?: Array<{ text: string }> }>
    }
    requests.push(body)
    expect(body.model).toBe('gemini-3.5-flash-lite')
    expect(body.store).toBe(false)
    if (body.input.some((step) => step.type === 'function_result')) {
      expect(body.input).toContainEqual({ type: 'thought', signature: 'sample-signature' })
      expect(JSON.stringify(body)).not.toContain('ORD-1001')
      expect(JSON.stringify(body)).not.toContain('payablePoisha')
      return HttpResponse.json({ status: 'completed', steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: 'There are 99 orders from an invented customer.' }],
      }] })
    }
    const prompt = body.input[0].content?.[0].text ?? ''
    const name = prompt.includes('best-selling') ? 'getBestSellingOption' : 'getOrderCount'
    return HttpResponse.json({ status: 'completed', steps: [
      { type: 'thought', signature: 'sample-signature' },
      { type: 'function_call', id: 'sales-call', name, arguments: {} },
    ] })
  }))

  render(<App />)
  await screen.findByText('Your cart is empty.')
  fireEvent.click(screen.getByRole('button', { name: 'Sales assistant' }))
  const sales = within(screen.getByRole('region', { name: 'Sales assistant' }))
  function ask(question: string) {
    fireEvent.change(sales.getByRole('textbox', { name: 'Sales question' }), { target: { value: question } })
    fireEvent.click(sales.getByRole('button', { name: 'Ask' }))
  }

  ask('How many orders?')
  await sales.findByText('There are 6 orders.')
  ask('What is the best-selling option?')
  await sales.findByText('Fried is the best-selling option with 10 units.')
  fireEvent.click(sales.getByRole('button', { name: 'Close sales assistant' }))

  selectBreakfast()
  const scrambled = screen.getByRole('button', { name: 'Add Scrambled' })
  for (let count = 0; count < 4; count += 1) fireEvent.click(scrambled)
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Pay' }))
  await screen.findByText(/^Order ORD-.* paid\.$/)

  fireEvent.click(screen.getByRole('button', { name: 'Sales assistant' }))
  expect(sales.getByText('There are 6 orders.')).toBeTruthy()
  ask('How many orders?')
  await sales.findByText('There are 7 orders.')
  ask('What is the best-selling option?')
  await sales.findByText('Scrambled is the best-selling option with 14 units.')
  ask('Who is our best customer?')
  await sales.findByText('Customer information is unavailable because the orders contain no customer records.')

  expect(requests).toHaveLength(8)
  expect(sales.queryByText(/invented customer/)).toBeNull()
})

test('does not leave an orphaned question bubble when the sales assistant request fails', async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', '')

  render(<App />)
  await screen.findByText('Your cart is empty.')
  fireEvent.click(screen.getByRole('button', { name: 'Sales assistant' }))
  const sales = within(screen.getByRole('region', { name: 'Sales assistant' }))
  const input = sales.getByRole<HTMLInputElement>('textbox', { name: 'Sales question' })

  fireEvent.change(input, { target: { value: 'How many orders?' } })
  fireEvent.click(sales.getByRole('button', { name: 'Ask' }))

  await sales.findByRole('alert')
  expect(input.value).toBe('How many orders?')
  expect(within(sales.getByRole('log', { name: 'Sales conversation' })).queryByText('How many orders?')).toBeNull()
})
