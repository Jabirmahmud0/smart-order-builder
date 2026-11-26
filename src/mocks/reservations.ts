import type { IngredientAmounts, Menu, Selection } from '../menu'
import { availableStock, formatShortages, ingredientUsage, stockShortages } from '../stock'
import { validate } from '../validate'

const reservationDurationMs = 5 * 60_000

type CartItem = Selection & {
  id: string
  ingredients: IngredientAmounts
  expiresAt: number
}

export type CartState = {
  version: number
  items: readonly CartItem[]
  successfulAdds: Readonly<Record<string, string>>
}

export const emptyCart: CartState = { version: 0, items: [], successfulAdds: {} }

type Rejection = {
  ok: false
  code: 'invalid-selection' | 'short-stock' | 'not-found' | 'expired'
  message: string
}

type CartUpdate = Rejection | { ok: true; state: CartState; itemId: string }

function stockForCart(cart: CartState, stock: IngredientAmounts, now: number, editingId?: string) {
  const active = cart.items.filter((item) => item.expiresAt > now)
  return availableStock(stock, active, editingId)
}

function prepareReservation(
  selection: Selection,
  menu: Menu,
  available: IngredientAmounts,
): Rejection | { ok: true; ingredients: IngredientAmounts } {
  if (!Number.isInteger(selection.qty) || selection.qty < 1 || selection.qty > 3) {
    return { ok: false, code: 'invalid-selection', message: 'Choose an item quantity from 1 to 3.' }
  }

  const optionIds = new Set(menu.groups.flatMap((group) => group.options.map((option) => option.id)))
  const unknown = Object.keys(selection.options).find((id) => !optionIds.has(id))
  if (unknown !== undefined) {
    return { ok: false, code: 'invalid-selection', message: `Unknown option: ${unknown}` }
  }

  const violations = validate(selection.options, menu.groups, menu.rules)
  if (violations.length > 0) {
    const message = violations.map((violation) => violation.message).join('. ')
    return { ok: false, code: 'invalid-selection', message }
  }

  const ingredients = ingredientUsage(selection.options, menu.groups, selection.qty)
  const shortages = stockShortages(ingredients, available)
  if (shortages.length > 0) {
    return { ok: false, code: 'short-stock', message: formatShortages(shortages) }
  }

  return { ok: true, ingredients }
}

export function reserveItem(
  cart: CartState,
  menu: Menu,
  request: { itemId: string; idempotencyKey: string; selection: Selection },
  now: number,
): CartUpdate {
  const { idempotencyKey, itemId, selection } = request
  if (Object.hasOwn(cart.successfulAdds, idempotencyKey)) {
    return { ok: true, state: cart, itemId: cart.successfulAdds[idempotencyKey] }
  }

  const prepared = prepareReservation(selection, menu, stockForCart(cart, menu.stock, now))
  if (!prepared.ok) return prepared

  const item: CartItem = {
    id: itemId,
    options: { ...selection.options },
    qty: selection.qty,
    ingredients: prepared.ingredients,
    expiresAt: now + reservationDurationMs,
  }
  const state: CartState = {
    version: cart.version + 1,
    items: [...cart.items, item],
    successfulAdds: { ...cart.successfulAdds, [idempotencyKey]: itemId },
  }
  return { ok: true, state, itemId }
}

export function editItem(
  cart: CartState,
  menu: Menu,
  itemId: string,
  selection: Selection,
  now: number,
): CartUpdate {
  const item = cart.items.find((candidate) => candidate.id === itemId)
  if (!item) {
    return { ok: false, code: 'not-found', message: 'This cart item is no longer in the cart.' }
  }
  if (item.expiresAt <= now) {
    return { ok: false, code: 'expired', message: 'This reservation expired.' }
  }

  const prepared = prepareReservation(selection, menu, stockForCart(cart, menu.stock, now, itemId))
  if (!prepared.ok) return prepared

  const replacement: CartItem = {
    ...item,
    options: { ...selection.options },
    qty: selection.qty,
    ingredients: prepared.ingredients,
  }
  const items = cart.items.map((candidate) => candidate.id === itemId ? replacement : candidate)
  return { ok: true, state: { ...cart, version: cart.version + 1, items }, itemId }
}

export function removeItem(cart: CartState, itemId: string): CartState {
  return filterCartItems(cart, (item) => item.id !== itemId)
}

export function pruneExpiredReservations(cart: CartState, now: number): CartState {
  return filterCartItems(cart, (item) => item.expiresAt > now)
}

function filterCartItems(cart: CartState, keep: (item: CartItem) => boolean): CartState {
  const items = cart.items.filter(keep)
  return items.length === cart.items.length ? cart : { ...cart, version: cart.version + 1, items }
}

export function readCart(cart: CartState, menu: Menu, now: number) {
  return {
    version: cart.version,
    items: cart.items.map((item) => ({ ...item, expired: item.expiresAt <= now })),
    stock: stockForCart(cart, menu.stock, now),
    serverTime: new Date(now).toISOString(),
  }
}

export type CartSnapshot = ReturnType<typeof readCart>
