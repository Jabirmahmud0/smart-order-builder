import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'
import { priceCart, type PricingCart } from '../pricing'
import { cartHandlers } from './cartHandlers'
import { breakfastMenu } from './menu'
import { orderHandlers } from './orderHandlers'
import { parseSelection } from './selectionRequest'
import { serverNow } from './serverTime'

function parsePricingCart(body: unknown): PricingCart | null {
  if (!body || typeof body !== 'object' || !('lines' in body) || !Array.isArray(body.lines)) return null

  const couponCode = 'couponCode' in body ? body.couponCode : undefined
  if (couponCode != null && typeof couponCode !== 'string') return null

  const lines = []
  for (const rawLine of body.lines) {
    const line = parseSelection(rawLine)
    if (!line || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > 3) return null
    if (!Object.values(line.options).every((count) => Number.isSafeInteger(count) && count >= 0)) return null
    lines.push(line)
  }

  return { lines, couponCode }
}

export const handlers = [
  ...cartHandlers,
  ...orderHandlers,
  http.get('*/api/menu', () => HttpResponse.json(breakfastMenu)),
  http.post('*/api/price', async ({ request }) => {
    const cart = parsePricingCart(await request.json().catch(() => null))
    if (!cart) {
      return HttpResponse.json({ message: 'Send cart lines with valid option quantities.' }, { status: 400 })
    }
    await delay(200 + Math.floor(Math.random() * 1_301))

    if (Math.random() < 0.15) return new HttpResponse(null, { status: 503 })

    const serverTime = new Date(serverNow()).toISOString()
    const pricing = priceCart(cart, breakfastMenu, breakfastMenu.promotions, serverTime)
    return HttpResponse.json({ pricing, serverTime })
  }),
]
