import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'
import { priceCart, type PricingCart } from '../pricing'
import { cartHandlers } from './cartHandlers'
import { breakfastMenu } from './menu'
import { orderHandlers } from './orderHandlers'
import { serverNow } from './serverTime'

export const handlers = [
  ...cartHandlers,
  ...orderHandlers,
  http.get('*/api/menu', () => HttpResponse.json(breakfastMenu)),
  http.post('*/api/price', async ({ request }) => {
    const cart = await request.json() as PricingCart
    await delay(200 + Math.floor(Math.random() * 1_301))

    if (Math.random() < 0.15) return new HttpResponse(null, { status: 503 })

    const serverTime = new Date(serverNow()).toISOString()
    const pricing = priceCart(cart, breakfastMenu, breakfastMenu.promotions, serverTime)
    return HttpResponse.json({ pricing, serverTime })
  }),
]
