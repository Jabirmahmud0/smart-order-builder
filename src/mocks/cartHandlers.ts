import { http, HttpResponse } from 'msw/http'
import type { Configuration, Selection } from '../menu'
import { runCartTransaction } from './cartStore'
import { breakfastMenu } from './menu'
import { editItem, readCart, removeItem, reserveItem, type CartState } from './reservations'
import { serverNow } from './serverTime'

type CartOperation = (cart: CartState, now: number) => { state?: CartState; value: Response }

async function handleCart(mode: 'readonly' | 'readwrite', operation: CartOperation) {
  try {
    return await runCartTransaction((cart) => operation(cart, serverNow()), mode)
  } catch {
    return HttpResponse.json({
      code: 'cart-unavailable',
      message: 'Could not update or load the cart. Please retry.',
    }, { status: 503 })
  }
}

async function readSelection(request: Request): Promise<Selection | null> {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('options' in body) || !('qty' in body)) return null

  const { options, qty } = body
  if (!options || typeof options !== 'object' || Array.isArray(options) || typeof qty !== 'number') {
    return null
  }
  if (!Object.values(options).every((value) => typeof value === 'number')) return null

  return { options: options as Configuration, qty }
}

function invalidRequest(message: string) {
  return HttpResponse.json({ code: 'invalid-request', message }, { status: 400 })
}

function respondToUpdate(update: ReturnType<typeof reserveItem>, cart: CartState, now: number) {
  if (update.ok) {
    return {
      state: update.state,
      value: HttpResponse.json({ ...readCart(update.state, breakfastMenu, now), itemId: update.itemId }),
    }
  }

  const status = { 'invalid-selection': 400, 'not-found': 404, 'short-stock': 409, expired: 409 }
  const { code, message } = update
  return {
    value: HttpResponse.json(
      { code, message, cart: readCart(cart, breakfastMenu, now) },
      { status: status[code] },
    ),
  }
}

export const cartHandlers = [
  http.get('*/api/cart', () => handleCart('readonly', (cart, now) => ({
    value: HttpResponse.json(readCart(cart, breakfastMenu, now)),
  }))),

  http.post('*/api/cart/items', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey?.trim()) return invalidRequest('An idempotency key is required.')

    const selection = await readSelection(request)
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, now) => {
      const update = reserveItem(cart, breakfastMenu, {
        itemId: crypto.randomUUID(), idempotencyKey, selection,
      }, now)
      return respondToUpdate(update, cart, now)
    })
  }),

  http.patch<{ id: string }>('*/api/cart/items/:id', async ({ request, params }) => {
    const selection = await readSelection(request)
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, now) => {
      const update = editItem(cart, breakfastMenu, params.id, selection, now)
      return respondToUpdate(update, cart, now)
    })
  }),

  http.delete<{ id: string }>('*/api/cart/items/:id', ({ params }) =>
    handleCart('readwrite', (cart, now) => {
      const state = removeItem(cart, params.id)
      return { state, value: HttpResponse.json(readCart(state, breakfastMenu, now)) }
    }),
  ),
]
