import { http, HttpResponse } from 'msw/http'
import type { Configuration, Menu, Selection } from '../menu'
import { editItem, readCart, removeItem, reserveItem, type CartState } from './reservations'
import { serverNow } from './serverTime'
import { shopMenu } from './shopState'
import { runShopTransaction } from './shopStore'

type CartOperation = (cart: CartState, menu: Menu, now: number) => { state?: CartState; value: Response }

async function handleCart(mode: 'readonly' | 'readwrite', operation: CartOperation) {
  try {
    return await runShopTransaction((shop) => {
      const result = operation(shop.cart, shopMenu(shop), serverNow())
      const state = result.state && result.state !== shop.cart ? { ...shop, cart: result.state } : undefined
      return { state, value: result.value }
    }, mode)
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

function respondToUpdate(update: ReturnType<typeof reserveItem>, cart: CartState, menu: Menu, now: number) {
  if (update.ok) {
    return {
      state: update.state,
      value: HttpResponse.json({ ...readCart(update.state, menu, now), itemId: update.itemId }),
    }
  }

  const status = { 'invalid-selection': 400, 'not-found': 404, 'short-stock': 409, expired: 409 }
  const { code, message } = update
  return {
    value: HttpResponse.json(
      { code, message, cart: readCart(cart, menu, now) },
      { status: status[code] },
    ),
  }
}

export const cartHandlers = [
  http.get('*/api/cart', () => handleCart('readonly', (cart, menu, now) => ({
    value: HttpResponse.json(readCart(cart, menu, now)),
  }))),

  http.post('*/api/cart/items', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey?.trim()) return invalidRequest('An idempotency key is required.')

    const selection = await readSelection(request)
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, menu, now) => {
      const update = reserveItem(cart, menu, {
        itemId: crypto.randomUUID(), idempotencyKey, selection,
      }, now)
      return respondToUpdate(update, cart, menu, now)
    })
  }),

  http.patch<{ id: string }>('*/api/cart/items/:id', async ({ request, params }) => {
    const selection = await readSelection(request)
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, menu, now) => {
      const update = editItem(cart, menu, params.id, selection, now)
      return respondToUpdate(update, cart, menu, now)
    })
  }),

  http.delete<{ id: string }>('*/api/cart/items/:id', ({ params }) =>
    handleCart('readwrite', (cart, menu, now) => {
      const state = removeItem(cart, params.id)
      return { state, value: HttpResponse.json(readCart(state, menu, now)) }
    }),
  ),
]
