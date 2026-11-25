import type { Configuration, IngredientAmounts, Menu } from '../menu'
import { isPaymentMethod, priceOrder, type Order } from '../orders'
import { availableStock } from '../stock'
import { breakfastMenu } from './menu'
import seed from './orders.seed.json'
import { emptyCart, type CartState } from './reservations'

export type ShopState = {
  cart: CartState
  sold: IngredientAmounts
  orders: readonly Order[]
  successfulPayments: Readonly<Record<string, string>>
}

export function createShop(cart: CartState = emptyCart): ShopState {
  const orders = seed.orders.map((order) => {
    if (!isPaymentMethod(order.paymentMethod)) throw new Error('Invalid seed payment method.')
    const lines = order.lines.map(({ qty, options }) => ({ qty, options: options as Configuration }))
    return priceOrder({ ...order, lines, paymentMethod: order.paymentMethod }, breakfastMenu)
  })

  return { cart, sold: {}, orders, successfulPayments: {} }
}

export function shopMenu(shop: ShopState): Menu {
  const stock = availableStock(breakfastMenu.stock, [{ id: 'sold', ingredients: shop.sold }])
  return { ...breakfastMenu, stock }
}
