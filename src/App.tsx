import { useEffect, useRef, useState } from 'react'
import { CartPanel } from './CartPanel'
import type { IngredientAmounts, Menu, MenuGroup, Selection } from './menu'
import type { CartSnapshot } from './mocks/reservations'
import { PricePreview } from './PricePreview'
import { availableStock, formatShortages, ingredientUsage, maxAdditionalUnits, stockShortages } from './stock'
import { useCart } from './useCart'
import { validate } from './validate'
import './App.css'

export default function App() {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [menuError, setMenuError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadMenu() {
      try {
        const response = await fetch('/api/menu', { signal: controller.signal })
        if (!response.ok) throw new Error('Menu request failed')

        const data: Menu = await response.json()
        if (!controller.signal.aborted) setMenu(data)
      } catch {
        if (!controller.signal.aborted) setMenuError(true)
      }
    }

    void loadMenu()
    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>Smart Order Builder</h1>
      {!menu && !menuError && <p role="status">Loading menu…</p>}
      {menuError && <p role="alert">Could not load the menu.</p>}
      {menu && <MenuBuilder menu={menu} />}
    </main>
  )
}

const emptySelection: Selection = { options: {}, qty: 1 }

function stockForDraft(
  cart: CartSnapshot | undefined,
  fallback: IngredientAmounts,
  serverTime: number,
  editingId: string | undefined,
): IngredientAmounts {
  if (!cart) return fallback
  const stock = new Map(Object.entries(cart.stock))

  for (const item of cart.items) {
    if (item.expired || (item.id !== editingId && item.expiresAt > serverTime)) continue
    for (const [ingredient, amount] of Object.entries(item.ingredients)) {
      stock.set(ingredient, (stock.get(ingredient) ?? 0) + amount)
    }
  }

  return Object.fromEntries(stock)
}

function MenuBuilder({ menu }: { menu: Menu }) {
  const [draft, setDraft] = useState(emptySelection)
  const [edit, setEdit] = useState<{ id: string; selection: Selection } | null>(null)
  const [saveError, setSaveError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [removeError, setRemoveError] = useState('')
  const addKey = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const { cart, serverTime, busy, loadError, refresh, mutate } = useCart()

  const selection = edit?.selection ?? draft
  const { options: config, qty: itemQuantity } = selection
  const original = cart?.items.find((item) => item.id === edit?.id)
  let editUnavailable = ''
  if (edit && !original) editUnavailable = 'This cart item is no longer in the cart.'
  if (original && (original.expired || original.expiresAt <= serverTime)) {
    editUnavailable = 'This reservation expired.'
  }

  const stock = stockForDraft(cart, menu.stock, serverTime, edit?.id)
  const usage = ingredientUsage(config, menu.groups, itemQuantity)
  const remaining = availableStock(stock, [{ id: 'draft', ingredients: usage }])
  const draftShortages = stockShortages(usage, stock)
  const violations = validate(config, menu.groups, menu.rules)
  const controlsDisabled = busy || Boolean(editUnavailable)
  const saveDisabled = controlsDisabled || !cart || violations.length > 0 || draftShortages.length > 0

  function updateSelection(update: (current: Selection) => Selection) {
    setSaveError(null)
    if (edit) {
      setEdit((current) => current && { ...current, selection: update(current.selection) })
    } else {
      addKey.current = null
      setDraft(update)
    }
  }

  function changeQuantity(option: MenuGroup['options'][number], change: -1 | 1) {
    updateSelection((current) => {
      const { options, qty } = current
      const quantity = Object.hasOwn(options, option.id) ? options[option.id] : 0
      if (change > 0) {
        const currentUsage = ingredientUsage(options, menu.groups, qty)
        if (maxAdditionalUnits(option.ingredients, stock, currentUsage, qty) === 0) return current
      }

      return { options: { ...options, [option.id]: Math.max(0, quantity + change) }, qty }
    })
  }

  async function save() {
    if (saveDisabled) return
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (!edit) {
      addKey.current ??= crypto.randomUUID()
      headers.set('Idempotency-Key', addKey.current)
    }
    const result = await mutate(edit ? `/items/${edit.id}` : '/items', {
      method: edit ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(selection),
    })
    if (!result) return
    if (!result.ok) {
      setSaveError(result.error)
      return
    }

    setSaveError(null)
    if (edit) setEdit(null)
    else {
      addKey.current = null
      setDraft(emptySelection)
    }
  }

  function startEdit(item: CartSnapshot['items'][number]) {
    setSaveError(null)
    setEdit({ id: item.id, selection: { options: item.options, qty: item.qty } })
    heading.current?.focus()
  }

  async function remove(id: string) {
    const result = await mutate(`/items/${id}`, { method: 'DELETE' })
    if (result) setRemoveError(result.ok ? '' : result.error.message)
  }

  return (
    <>
      <h2 tabIndex={-1} ref={heading}>{edit ? `Editing ${menu.name}` : menu.name}</h2>
      <div className="builder">
        <div className="option-groups">
          <label className="item-quantity">
            Item quantity
            <select
              value={itemQuantity}
              disabled={controlsDisabled}
              onChange={(event) => {
                const qty = Number(event.currentTarget.value)
                updateSelection((current) => ({ ...current, qty }))
              }}
            >
              {[1, 2, 3].map((qty) => <option key={qty} value={qty}>{qty}</option>)}
            </select>
          </label>
          {menu.groups.map((group) => (
            <fieldset key={group.id} disabled={controlsDisabled}>
              <legend>{group.name}</legend>

              {group.options.map((option) => {
                const quantity = Object.hasOwn(config, option.id) ? config[option.id] : 0
                const additional = maxAdditionalUnits(
                  option.ingredients, stock, usage, itemQuantity,
                )
                const nextUnit = Object.fromEntries(
                  Object.entries(option.ingredients).map(([ingredient, amount]) => [ingredient, amount * itemQuantity]),
                )
                const shortages = additional === 0 ? stockShortages(nextUnit, remaining) : []

                return (
                  <div className="option" key={option.id} role="group" aria-label={option.name}>
                    <div>
                      {option.name}
                      <small>
                        {additional === null ? 'Unlimited stock' : `${additional} more in stock`}
                      </small>
                      {shortages.length > 0 && <small>{formatShortages(shortages)}</small>}
                    </div>
                    <div className="option-quantity">
                      <button
                        type="button"
                        aria-label={`Remove ${option.name}`}
                        disabled={quantity === 0}
                        onClick={() => changeQuantity(option, -1)}
                      >
                        −
                      </button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Add ${option.name}`}
                        disabled={additional === 0}
                        onClick={() => changeQuantity(option, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </fieldset>
          ))}
        </div>

        <div className="builder-summary">
          <section className="summary-panel" aria-labelledby="selection-heading">
            <h3 id="selection-heading">Selection checks</h3>
            <div aria-live="polite">
              {violations.length === 0 && draftShortages.length === 0 && (
                <p>Selection meets the menu rules.</p>
              )}
              {violations.length > 0 && (
                <ul>
                  {violations.map(({ message }, index) => <li key={`${message}-${index}`}>{message}</li>)}
                </ul>
              )}
              {draftShortages.length > 0 && <p>{formatShortages(draftShortages)}</p>}
            </div>
            {editUnavailable && <p role="alert">{editUnavailable}</p>}
            {saveError && saveError.message !== editUnavailable && <p role="alert">{saveError.message}</p>}
            <div className="cart-actions">
              <button type="button" disabled={saveDisabled} onClick={save}>
                {edit ? 'Save changes' : 'Add to Cart'}
              </button>
              {saveError?.retryable && (
                <button type="button" disabled={saveDisabled} onClick={save}>Retry save</button>
              )}
              {edit && (
                <button type="button" disabled={busy} onClick={() => {
                  setSaveError(null)
                  setEdit(null)
                }}>Cancel edit</button>
              )}
            </div>
          </section>
          <PricePreview options={config} qty={itemQuantity} promotions={menu.promotions} />
          <CartPanel
            cart={cart}
            menu={menu}
            serverTime={serverTime}
            busy={busy}
            loadError={loadError}
            removeError={removeError}
            onRefresh={refresh}
            onEdit={startEdit}
            onRemove={remove}
          />
        </div>
      </div>
    </>
  )
}
