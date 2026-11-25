import { useEffect, useRef, useState } from 'react'
import { CartPanel } from './CartPanel'
import { CheckoutPanel } from './CheckoutPanel'
import type { IngredientAmounts, Menu, MenuGroup, Selection } from './menu'
import { groupForViolation, menuGroupId } from './menuDisplay'
import { MenuOptions } from './MenuOptions'
import type { CartSnapshot } from './mocks/reservations'
import { formatPrice } from './money'
import { PricePreview } from './PricePreview'
import { SalesAssistant } from './SalesAssistant'
import { availableStock, formatShortages, ingredientUsage, maxAdditionalUnits, stockShortages } from './stock'
import { useCart } from './useCart'
import { usePricePreview } from './usePricePreview'
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
    <>
      <header className="app-header">
        <div className="app-frame">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <h1>Smart Order Builder</h1>
          {menu && <SalesAssistant menu={menu} />}
        </div>
      </header>
      <main className="app-frame main-content">
        {!menu && !menuError && <p role="status">Loading menu…</p>}
        {menuError && <p role="alert">Could not load the menu.</p>}
        {menu && <MenuBuilder menu={menu} />}
      </main>
    </>
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
  const orderPanel = useRef<HTMLDialogElement>(null)
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 759px)').matches ?? false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState(menu.groups[0]?.id)
  const { cart, serverTime, busy, loadError, refresh, mutate, pay } = useCart()

  const selection = edit?.selection ?? draft
  const { options: config, qty: itemQuantity } = selection
  const quote = usePricePreview(config, itemQuantity)
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
  const shortageMessage = draftShortages.length > 0 ? formatShortages(draftShortages) : ''
  const violations = validate(config, menu.groups, menu.rules)
  const messages = new Map<string, string[]>()
  const otherMessages: string[] = []
  for (const violation of violations) {
    const group = groupForViolation(menu, violation)
    if (group === undefined) otherMessages.push(violation.message)
    else messages.set(group, [...(messages.get(group) ?? []), violation.message])
  }
  const groupsToCheck = menu.groups.filter((group) => messages.has(group.id))
  const controlsDisabled = busy || Boolean(editUnavailable)
  const saveDisabled = controlsDisabled || !cart || violations.length > 0 || draftShortages.length > 0
  const saveLabel = edit ? 'Save changes' : 'Add to Cart'
  const cartCount = cart?.items.reduce((count, item) => count + item.qty, 0) ?? 0

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 759px)')
    if (!media) return
    function resize({ matches }: MediaQueryListEvent) {
      if (!matches && orderPanel.current?.open) orderPanel.current.close()
      setCompact(matches)
    }
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      const current = entries.find((entry) => entry.isIntersecting)
      if (current) setActiveGroup(current.target.id.slice('menu-group-'.length))
    }, { rootMargin: '-26% 0px -65% 0px' })
    for (const group of menu.groups) {
      const section = document.getElementById(menuGroupId(group.id))
      if (section) observer.observe(section)
    }
    return () => observer.disconnect()
  }, [menu.groups])

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
      if (compact && !orderPanel.current?.open) openOrder()
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
    if (compact && orderPanel.current?.open) orderPanel.current.close()
    heading.current?.focus()
  }

  async function remove(id: string) {
    const result = await mutate(`/items/${id}`, { method: 'DELETE' })
    if (result) setRemoveError(result.ok ? '' : result.error.message)
  }

  function openOrder() {
    const panel = orderPanel.current
    if (panel && !panel.open) {
      panel.showModal()
      setOrderOpen(true)
    }
  }

  function visitGroup(id: string) {
    setActiveGroup(id)
    if (compact && orderPanel.current?.open) orderPanel.current.close()
  }

  const selectionPanel = (
    <section key="selection" className="summary-panel current-selection" aria-labelledby="selection-heading">
      <h3 id="selection-heading">Current selection</h3>
      <div className="selection-status" aria-live="polite">
        {violations.length === 0 && draftShortages.length === 0 && (
          <p className="ready-badge"><span aria-hidden="true">✓</span> Selection meets the menu rules.</p>
        )}
        {groupsToCheck.length > 0 && (
          <>
            <p>Review {groupsToCheck.length} {groupsToCheck.length === 1 ? 'category' : 'categories'}</p>
            <div className="issue-links">
              {groupsToCheck.map((group) => (
                <a key={group.id} href={`#${encodeURIComponent(menuGroupId(group.id))}`} onClick={() => visitGroup(group.id)}>
                  {group.name}
                </a>
              ))}
            </div>
          </>
        )}
        {otherMessages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
        {shortageMessage && <p className="stock-shortage">{shortageMessage}</p>}
      </div>
      <PricePreview quote={quote} promotions={menu.promotions} />
      {editUnavailable && <p role="alert">{editUnavailable}</p>}
      {saveError && saveError.message !== editUnavailable && <p role="alert">{saveError.message}</p>}
      <div className="cart-actions">
        <button className="button-primary wide" type="button" disabled={saveDisabled} onClick={save}>{saveLabel}</button>
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
  )
  const cartPanel = (
    <CartPanel
      key="cart" cart={cart} menu={menu} serverTime={serverTime} busy={busy}
      loadError={loadError} removeError={removeError} onRefresh={refresh} onEdit={startEdit} onRemove={remove}
    />
  )
  const checkoutPanel = (
    <CheckoutPanel key="checkout" cart={cart} menu={menu} serverTime={serverTime} busy={busy} onPay={pay} />
  )

  return (
    <div className="builder">
      <nav className="categories" aria-label="Menu categories">
        <h2>Categories</h2>
        <ul>
          {menu.groups.map((group) => {
            const complete = (group.limits.min ?? 0) > 0 && !messages.has(group.id)
            return (
              <li key={group.id}>
                <a
                  href={`#${encodeURIComponent(menuGroupId(group.id))}`}
                  aria-current={activeGroup === group.id ? 'location' : undefined}
                  onClick={() => visitGroup(group.id)}
                >
                  <span>{group.name}</span>
                  {complete && <span className="category-check" aria-label="Complete">✓</span>}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="editor">
        <header className="product-header">
          <div>
            <h2 tabIndex={-1} ref={heading}>{edit ? 'Edit cart item' : 'Build an order'}</h2>
            <h3>{menu.name}</h3>
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
          </div>
          {menu.image && <img src={menu.image.src} alt={menu.image.alt} width="640" height="320" />}
        </header>
        <MenuOptions
          groups={menu.groups} config={config} qty={itemQuantity} stock={stock} usage={usage}
          remaining={remaining} messages={messages} disabled={controlsDisabled} onChange={changeQuantity}
        />
      </div>
      <dialog
        id="order-panel"
        ref={orderPanel}
        className="order-panel"
        open={compact ? undefined : true}
        role={compact ? 'dialog' : 'complementary'}
        aria-labelledby="order-title"
        onClose={() => setOrderOpen(false)}
      >
        <div className="panel-heading order-heading">
          <h2 id="order-title">Your order</h2>
          {compact && (
            <button className="close-button" type="button" aria-label="Close order" onClick={() => orderPanel.current?.close()}>×</button>
          )}
        </div>
        {compact ? [cartPanel, checkoutPanel, selectionPanel] : [selectionPanel, cartPanel, checkoutPanel]}
      </dialog>
      {compact && (
        <div className="mobile-order-bar">
          {shortageMessage && (
            <p id="mobile-stock-shortage" className="stock-shortage mobile-stock-shortage" role="status">
              {shortageMessage}
            </p>
          )}
          <div>
            <small>Draft total</small>
            <strong>{quote.pricing ? formatPrice(quote.pricing.payablePoisha) : '—'}</strong>
          </div>
          <button
            type="button" aria-haspopup="dialog" aria-controls="order-panel"
            aria-expanded={orderOpen} onClick={openOrder}
          >View cart{cartCount > 0 ? ` (${cartCount})` : ''}</button>
          <button
            className="button-primary" type="button" disabled={saveDisabled} onClick={save}
            aria-describedby={shortageMessage ? 'mobile-stock-shortage' : undefined}
          >{saveLabel}</button>
        </div>
      )}
    </div>
  )
}
