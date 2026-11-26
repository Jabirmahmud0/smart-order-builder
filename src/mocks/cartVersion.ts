import { HttpResponse } from 'msw/http'
import type { Menu } from '../menu'
import { readCart, type CartState } from './reservations'

export const cartVersionHeader = 'X-Cart-Version'
export const cartVersionConflictCode = 'cart-version-conflict'

export function cartVersionConflict(request: Request, cart: CartState, menu: Menu, now: number) {
  if (request.headers.get(cartVersionHeader) === String(cart.version)) return

  return HttpResponse.json({
    code: cartVersionConflictCode,
    message: 'The cart changed in another tab. The latest cart is loaded. Review it before trying again.',
    cart: readCart(cart, menu, now),
  }, { status: 409 })
}
