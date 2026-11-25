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
  const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: {
    role: 'model', parts: [{ text: 'The answer is 99.' }],
  } }] }))
  vi.stubGlobal('fetch', fetch)
  await expect(answerSalesQuestion('What is the weather?', breakfastMenu, 'mock-key'))
    .resolves.toMatch(/^I can answer questions about order counts/)
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('looks up a date locally and inserts its result into an approved response template', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ candidates: [{ content: {
      role: 'model', parts: [{ functionCall: { name: 'getOrdersOnDate', args: { date: '2026-11-21' } } }],
    } }] }))
    .mockResolvedValueOnce(Response.json({ orders: createShop().orders }))
    .mockResolvedValueOnce(Response.json({ candidates: [{ content: {
      role: 'model', parts: [{ text: 'Here’s what the order records show. [[RESULT]]' }],
    } }] }))
  vi.stubGlobal('fetch', fetch)

  await expect(answerSalesQuestion('Which orders were placed on 2026-11-21?', breakfastMenu, 'mock-key'))
    .resolves.toBe('Here’s what the order records show. 2 orders on 2026-11-21 in Dhaka. Order IDs are ORD-1003, ORD-1004.')
})
