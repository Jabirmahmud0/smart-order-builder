import type { GoogleGenAI, Interactions } from '@google/genai'
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

const model = 'gemini-3.5-flash-lite'
const unsupported = 'I cannot answer that from the stored order data. I can answer questions about order counts, revenue, best-selling options, payment methods, average order value, coupons, and orders on a specific date.'
export const missingGeminiKey = 'Set VITE_GEMINI_API_KEY in .env.local and restart the app to use Gemini.'
const customerQuestion = /\b(?:best|top|biggest|loyal|highest[- ]spending|favorite|favourite) customers?\b|\b(?:who|which)\b.*\b(?:customer|buyer|person|people)\b|\bcustomer (?:names?|records?|details?|list|info|information)\b|\bwho\s+(?:bought|ordered|spent|paid)\b/i
const templates = [
  '[[RESULT]]',
  'Based on the stored orders, [[RESULT]]',
  'Here’s what the order records show. [[RESULT]]',
]
const tools: Interactions.Function[] = [
  { type: 'function', name: 'getOrderCount', description: 'Count all completed orders.' },
  { type: 'function', name: 'getTotalRevenue', description: 'Total payable revenue across all completed orders.' },
  { type: 'function', name: 'getBestSellingOption', description: 'Find the menu option sold in the highest number of units.' },
  { type: 'function', name: 'getRevenueByPaymentMethod', description: 'Get revenue totals for card, bKash, and cash, including comparisons between methods.' },
  { type: 'function', name: 'getAverageOrderValue', description: 'Calculate the average payable amount per order.' },
  {
    type: 'function',
    name: 'getCouponUseCount',
    description: 'Count completed orders where a coupon actually applied.',
    parameters: {
      type: 'object',
      properties: { couponCode: { type: 'string', description: 'Coupon code. Omit it to use the current menu coupon.' } },
    },
  },
  {
    type: 'function',
    name: 'getOrdersOnDate',
    description: 'List orders or count orders on one calendar date in Dhaka.',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: 'Calendar date as YYYY-MM-DD.' } },
      required: ['date'],
    },
  },
]

const money = new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const taka = (poisha: number) => `${money.format(poisha / 100)} BDT`

function salesAnswer(call: Interactions.FunctionCallStep, orders: readonly Order[], menu: Menu): string {
  const args: Record<string, unknown> = call.arguments
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

function currentDateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${year}-${month}-${day}`
}

async function askGemini(
  ai: GoogleGenAI,
  input: Interactions.Step[],
  timeZone: string,
  signal?: AbortSignal,
  phrasing = false,
) {
  try {
    return await ai.interactions.create({
      model,
      input,
      store: false,
      automatic_continuation: false,
      system_instruction: [
        `Today is ${currentDateInTimeZone(timeZone)} in ${timeZone}.`,
        'Choose exactly one sales tool to answer the question if a tool covers it. Otherwise reply UNSUPPORTED.',
        'When the tool result arrives, return one of these templates with the literal [[RESULT]] marker.',
        ...templates,
      ].join('\n'),
      tools,
      generation_config: { tool_choice: phrasing ? 'none' : 'auto' },
    }, { signal, maxRetries: 0 })
  } catch (error) {
    if (signal?.aborted) throw error
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    if (status === 429) throw new Error('Gemini quota or rate limit reached (429). Try again later.')
    const message = error instanceof Error ? error.message : ''
    const keyRejected = /API_KEY_INVALID|api key.+(?:invalid|not valid|blocked|leaked)/i.test(message)
    if (status === 401 || status === 403 || keyRejected) {
      throw new Error('Gemini rejected the API key or project access. Check VITE_GEMINI_API_KEY and Google AI Studio.')
    }
    if (typeof status === 'number') {
      throw new Error(`Gemini could not answer the request (HTTP ${status}). Try again.`)
    }
    throw new Error('Could not reach Gemini. Check your connection and try again.')
  }
}

export async function answerSalesQuestion(question: string, menu: Menu, apiKey: string, signal?: AbortSignal) {
  if (customerQuestion.test(question)) {
    return 'Customer information is unavailable because the orders contain no customer records.'
  }
  if (!apiKey.trim()) throw new Error(missingGeminiKey)

  const { GoogleGenAI: Client } = await import('@google/genai')
  const ai = new Client({ apiKey: apiKey.trim(), apiVersion: 'v1beta' })
  const timeZone = menu.promotions.coupon.timeZone
  const input: Interactions.UserInputStep = { type: 'user_input', content: [{ type: 'text', text: question }] }
  const draft = await askGemini(ai, [input], timeZone, signal)
  const steps = draft.steps ?? []
  const calls = steps.filter((step) => step.type === 'function_call')
  const [call] = calls
  if (calls.length !== 1 || !call.id || !tools.some((tool) => tool.name === call.name)) return unsupported

  const response = await fetch('/api/orders', { signal, cache: 'no-store' })
    .catch(() => { throw new Error('Could not load the latest sales orders. Try again.') })
  if (!response.ok) throw new Error('Could not load the latest sales orders. Try again.')
  const { orders }: OrdersExport = await response.json()
  const answer = salesAnswer(call, orders, menu)
  const result: Interactions.FunctionResultStep = {
    type: 'function_result',
    name: call.name,
    call_id: call.id,
    result: [{ type: 'text', text: JSON.stringify({ answer }) }],
  }
  // Keep Gemini's full model turn, including any thought signature, for the tool response.
  const phrasing = await askGemini(ai, [input, ...steps, result], timeZone, signal, true)
  const template = phrasing.output_text?.trim()

  return template && templates.includes(template) ? template.replace('[[RESULT]]', () => answer) : answer
}
