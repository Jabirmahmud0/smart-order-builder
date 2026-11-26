import type { Menu, Selection } from './menu'
import { parseSelection } from './mocks/selectionRequest'

type EditDraft = { id: string; version: number; expiresAt: number; selection: Selection }

type EditorState = {
  draft: Selection
  draftKey: string
  edit: EditDraft | null
}

const storageKey = 'smart-order-builder:editor'
export const emptySelection: Selection = { options: {}, qty: 1 }

export function loadEditor(menu: Menu): EditorState {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
    if (stored && typeof stored === 'object' && 'draft' in stored && 'draftKey' in stored) {
      const optionIds = new Set(menu.groups.flatMap((group) => group.options.map((option) => option.id)))
      const draft = readSelection(stored.draft, optionIds)
      if (draft && typeof stored.draftKey === 'string' && stored.draftKey) {
        return { draft, draftKey: stored.draftKey, edit: readEdit('edit' in stored ? stored.edit : null, optionIds) }
      }
    }
  } catch {
    // The builder still works if browser storage is unavailable.
  }

  return { draft: emptySelection, draftKey: crypto.randomUUID(), edit: null }
}

function readSelection(value: unknown, optionIds: ReadonlySet<string>) {
  const selection = parseSelection(value)
  if (!selection || !Number.isInteger(selection.qty) || selection.qty < 1 || selection.qty > 3) return null
  return Object.entries(selection.options).every(([id, count]) =>
    optionIds.has(id) && Number.isSafeInteger(count) && count >= 0,
  ) ? selection : null
}

function readEdit(value: unknown, optionIds: ReadonlySet<string>): EditDraft | null {
  if (!value || typeof value !== 'object' || !('id' in value) || !('version' in value)
    || !('expiresAt' in value) || !('selection' in value)) return null

  const { id, version, expiresAt } = value
  const selection = readSelection(value.selection, optionIds)
  if (typeof id !== 'string' || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0
    || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || !selection) return null

  return { id, version, expiresAt, selection }
}

export function storeEditor(editor: EditorState) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(editor))
  } catch {
    // Keep the in-memory draft when storage is unavailable.
  }
}
