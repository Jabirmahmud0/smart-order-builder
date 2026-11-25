import type { Menu } from './menu'
import type { Order, OrdersExport } from './orders'
import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponUseCount,
  getOrderCount,
  getOrdersOnDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from './salesStats'

const model = 'gemini-3.8-flash'
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
const unsupported = 'I can answer questions about order counts, revenue, best-selling options, payment methods, average order value, coupons, and orders on a specific date.'
export const missingGeminiKey = 'Set VITE_GEMINI_API_KEY in .env.local and restart the app to use Gemini.'
const templates = [
  '[[RESULT]]',
  'Based on the stored orders, [[RESULT]]',
  'Here’s what the order records show. [[RESULT]]',
]
const tools = [
  { name: 'getOrderCount', description: 'Count all completed orders.' },
  { name: 'getTotalRevenue', description: 'Total payable revenue across all completed orders.' },
  { name: 'getBestSellingOption', description: 'Find the menu option sold in the highest number of units.' },
  { name: 'getRevenueByPaymentMethod', description: 'Get revenue totals for card, bKash, and cash, including comparisons between methods.' },
  { name: 'getAverageOrderValue', description: 'Calculate the average payable amount per order.' },
  {
    name: 'getCouponUseCount',
    description: 'Count completed orders where a coupon actually applied.',
    parametersJsonSchema: {
      type: 'object',
      properties: { couponCode: { type: 'string', description: 'Coupon code. Omit it to use the current menu coupon.' } },
    },
  },
  {
    name: 'getOrdersOnDate',
    description: 'List orders or count orders on one calendar date in Dhaka.',
    parametersJsonSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Calendar date as YYYY-MM-DD.' } },
      required: ['date'],
    },
  },
]

type GeminiCall = {
  id?: string
  name: string
  args?: Record<string, unknown>
}

type GeminiContent = {
  role: string
  parts: Array<{
    text?: string
    thought?: boolean
    functionCall?: GeminiCall
    functionResponse?: { name: string; id?: string; response: { answer: string } }
  }>
}

const money = new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const taka = (poisha: number) => `${money.format(poisha / 100)} BDT`

function salesAnswer(call: GeminiCall, orders: readonly Order[], menu: Menu): string {
  const args = call.args
  switch (call.name) {
    case 'getOrderCount': {
      const count = getOrderCount(orders)
      return count === 1 ? 'There is 1 order.' : `There are ${count} orders.`
    }
    case 'getTotalRevenue':
      return `Total revenue is ${taka(getTotalRevenue(orders))}.`
    case 'getBestSellingOption': {
      const best = getBestSellingOption(orders)
      if (!best) return 'The order records have no option sales yet.'
      const option = menu.groups.flatMap((group) => group.options).find(({ id }) => id === best.optionId)
      return `${option?.name ?? best.optionId} is the best-selling option with ${best.units} units.`
    }
    case 'getRevenueByPaymentMethod': {
      const { card, bkash, cash } = getRevenueByPaymentMethod(orders)
      return `Card brought in ${taka(card)}, bKash ${taka(bkash)}, and cash ${taka(cash)}.`
    }
    case 'getAverageOrderValue': {
      const average = getAverageOrderValue(orders)
      return average === null ? 'There are no orders to average yet.' : `Average order value is ${taka(average)}.`
    }
    case 'getCouponUseCount': {
      if (args?.couponCode !== undefined && typeof args.couponCode !== 'string') return unsupported
      const code = args?.couponCode?.trim() || menu.promotions.coupon.code
      if (!/^[a-z0-9_-]{1,40}$/i.test(code)) return unsupported
      const count = getCouponUseCount(orders, code)
      return `${count} ${count === 1 ? 'order' : 'orders'} received ${code}.`
    }
    case 'getOrdersOnDate': {
      const date = args?.date
      const result = typeof date === 'string' ? getOrdersOnDate(orders, date) : null
      if (!result) return 'Please specify a valid date in YYYY-MM-DD format.'
      if (result.count === 0) return `There were no orders on ${date} in Dhaka.`
      return `${result.count} ${result.count === 1 ? 'order' : 'orders'} on ${date} in Dhaka. Order IDs are ${result.orderIds.join(', ')}.`
    }
    default:
      return unsupported
  }
}

async function askGemini(contents: GeminiContent[], apiKey: string, signal?: AbortSignal, phrasing = false) {
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: [
          'Choose exactly one sales tool to answer the question if a tool covers it. Otherwise reply UNSUPPORTED.',
          'When the tool result arrives, return one of these templates with the literal [[RESULT]] marker.',
          ...templates,
        ].join('\n') }] },
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: phrasing ? 'NONE' : 'AUTO' } },
      }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Could not reach Gemini. Check your connection and try again.')
  }

  if (response.status === 429) throw new Error('Gemini quota or rate limit reached (429). Try again later.')
  const data: {
    candidates?: Array<{ content?: GeminiContent }>
    error?: { message?: string; details?: Array<{ reason?: string }> }
  } = await response.json().catch(() => ({}))
  if (!response.ok) {
    const keyRejected = data.error?.details?.some(({ reason }) => reason === 'API_KEY_INVALID')
      || /api key.+(?:invalid|not valid|blocked|leaked)/i.test(data.error?.message ?? '')
    if (response.status === 401 || response.status === 403 || keyRejected) {
      throw new Error('Gemini rejected the API key or project access. Check VITE_GEMINI_API_KEY and Google AI Studio.')
    }
    throw new Error(`Gemini could not answer the request (HTTP ${response.status}). Try again.`)
  }

  return data.candidates?.[0]?.content
}

export async function answerSalesQuestion(question: string, menu: Menu, apiKey: string, signal?: AbortSignal) {
  if (/\b(?:best|top|biggest|highest[- ]spending) customers?\b|\bwhich customer\b|\bcustomer (?:names?|records?|details)\b/i.test(question)) {
    return 'Customer information is unavailable because the orders contain no customer records.'
  }
  if (!apiKey.trim()) throw new Error(missingGeminiKey)

  const input = { role: 'user', parts: [{ text: question }] }
  const draft = await askGemini([input], apiKey, signal)
  if (!draft) return unsupported
  const calls = (draft.parts ?? []).flatMap((part) => part.functionCall ? [part.functionCall] : [])
  const [call] = calls
  if (calls.length !== 1 || !tools.some((tool) => tool.name === call.name)) return unsupported

  const response = await fetch('/api/orders', { signal, cache: 'no-store' })
    .catch(() => { throw new Error('Could not load the latest sales orders. Try again.') })
  if (!response.ok) throw new Error('Could not load the latest sales orders. Try again.')
  const { orders }: OrdersExport = await response.json()
  const answer = salesAnswer(call, orders, menu)
  const result: GeminiContent = {
    role: 'user',
    parts: [{ functionResponse: { name: call.name, id: call.id, response: { answer } } }],
  }
  // Keep Gemini's full model turn, including any thought signature, for the tool response.
  const phrasing = await askGemini([input, draft, result], apiKey, signal, true)
  const template = phrasing?.parts?.filter((part) => !part.thought).map((part) => part.text).join('').trim()

  return template && templates.includes(template) ? template.replace('[[RESULT]]', () => answer) : answer
}
