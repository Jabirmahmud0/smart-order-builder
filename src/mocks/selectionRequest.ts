import type { Configuration, Selection } from '../menu'

export function parseSelection(body: unknown): Selection | null {
  if (!body || typeof body !== 'object' || !('options' in body) || !('qty' in body)) return null

  const { options, qty } = body
  if (!options || typeof options !== 'object' || Array.isArray(options) || typeof qty !== 'number') {
    return null
  }
  if (!Object.values(options).every((value) => typeof value === 'number')) return null

  return { options: options as Configuration, qty }
}
