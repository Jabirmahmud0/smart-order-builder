import { http, HttpResponse } from 'msw/http'
import type { Menu } from '../menu'
import { cartVersionConflict } from './cartVersion'
import { editItem, pruneExpiredReservations, readCart, removeItem, reserveItem, type CartState } from './reservations'
import { parseSelection } from './selectionRequest'
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
  http.get('*/api/cart', ({ request }) => {
    const prune = new URL(request.url).searchParams.get('cleanup') === 'expired'
    return handleCart(prune ? 'readwrite' : 'readonly', (cart, menu, now) => {
      const state = prune ? pruneExpiredReservations(cart, now) : cart
      return { state, value: HttpResponse.json(readCart(state, menu, now)) }
    })
  }),

  http.post('*/api/cart/items', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey?.trim()) return invalidRequest('An idempotency key is required.')

    const selection = parseSelection(await request.json().catch(() => null))
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, menu, now) => {
      if (!Object.hasOwn(cart.successfulAdds, idempotencyKey)) {
        const conflict = cartVersionConflict(request, cart, menu, now)
        if (conflict) return { value: conflict }
      }

      const update = reserveItem(cart, menu, {
        itemId: crypto.randomUUID(), idempotencyKey, selection,
      }, now)
      return respondToUpdate(update, cart, menu, now)
    })
  }),

  http.patch<{ id: string }>('*/api/cart/items/:id', async ({ request, params }) => {
    const selection = parseSelection(await request.json().catch(() => null))
    if (!selection) return invalidRequest('Send option quantities and an item quantity.')

    return handleCart('readwrite', (cart, menu, now) => {
      const conflict = cartVersionConflict(request, cart, menu, now)
      if (conflict) return { value: conflict }
      const update = editItem(cart, menu, params.id, selection, now)
      return respondToUpdate(update, cart, menu, now)
    })
  }),

  http.delete<{ id: string }>('*/api/cart/items/:id', ({ request, params }) =>
    handleCart('readwrite', (cart, menu, now) => {
      const conflict = cartVersionConflict(request, cart, menu, now)
      if (conflict) return { value: conflict }
      const state = removeItem(cart, params.id)
      return { state, value: HttpResponse.json(readCart(state, menu, now)) }
    }),
  ),
]
