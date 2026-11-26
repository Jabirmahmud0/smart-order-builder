import { afterEach, expect, test, vi } from 'vitest'
import { breakfastMenu } from './mocks/menu'
import { createShop } from './mocks/shopState'
import { answerSalesQuestion, missingGeminiKey } from './geminiSales'

afterEach(() => vi.unstubAllGlobals())

const question = 'How many orders?'

test('reports a missing key before requesting Gemini', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(answerSalesQuestion(question, breakfastMenu, '')).rejects.toThrow(missingGeminiKey)
  expect(fetch).not.toHaveBeenCalled()
})

test.each([
  [400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 'Gemini rejected the API key'],
  [429, {}, 'Gemini quota or rate limit reached (429)'],
] as const)('shows a clear message for Gemini HTTP %i', async (status, body, message) => {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }))
  vi.stubGlobal('fetch', fetch)
  await expect(answerSalesQuestion(question, breakfastMenu, 'mock-key')).rejects.toThrow(message)
})

test('shows a clear message when the network request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))
  await expect(answerSalesQuestion(question, breakfastMenu, 'mock-key')).rejects.toThrow('Could not reach Gemini')
})

test('uses a local fallback when Gemini offers text without a sales tool', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'completed', steps: [{
    type: 'model_output', content: [{ type: 'text', text: 'The answer is 99.' }],
  }] }))
  vi.stubGlobal('fetch', fetch)
  await expect(answerSalesQuestion('What is the weather?', breakfastMenu, 'mock-key'))
    .resolves.toMatch(/^I cannot answer that from the stored order data\./)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each([
  'Who is our best customer?',
  'Who spent the most?',
  'Which customer ordered the most?',
])('refuses customer identity question %s without calling Gemini', async (prompt) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(answerSalesQuestion(prompt, breakfastMenu, 'mock-key'))
    .resolves.toBe('Customer information is unavailable because the orders contain no customer records.')
  expect(fetch).not.toHaveBeenCalled()
})

test('looks up a date locally, includes today in Dhaka in the prompt, and inserts its result into a template', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ status: 'completed', steps: [{
      type: 'function_call', id: 'date-call', name: 'getOrdersOnDate', arguments: { date: '2026-11-21' },
    }] }))
    .mockResolvedValueOnce(Response.json({ orders: createShop().orders }))
    .mockResolvedValueOnce(Response.json({ status: 'completed', steps: [{
      type: 'model_output', content: [{ type: 'text', text: 'Here’s what the order records show. [[RESULT]]' }],
    }] }))
  vi.stubGlobal('fetch', fetch)

  await expect(answerSalesQuestion('Which orders were placed on 2026-11-21?', breakfastMenu, 'mock-key'))
    .resolves.toBe('Here’s what the order records show. 2 orders on 2026-11-21 in Dhaka. Order IDs are ORD-1003, ORD-1004.')
  const [firstRequest, firstInit] = fetch.mock.calls[0]
  const firstBody = (firstRequest instanceof Request
    ? await firstRequest.json()
    : JSON.parse(String(firstInit?.body))) as { system_instruction?: string }
  expect(firstBody.system_instruction).toMatch(/Today is \d{4}-\d{2}-\d{2} in Asia\/Dhaka\./)
})
