import type { Menu } from './menu'
import type { CartSnapshot } from './mocks/reservations'

function countdown(expiresAt: number, serverTime: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt - serverTime) / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function CartPanel({
  cart, menu, serverTime, busy, loadError, removeError, onRefresh, onEdit, onRemove,
}: {
  cart?: CartSnapshot
  menu: Menu
  serverTime: number
  busy: boolean
  loadError: boolean
  removeError: string
  onRefresh: () => void
  onEdit: (item: CartSnapshot['items'][number]) => void
  onRemove: (id: string) => void
}) {
  const optionNames = new Map(
    menu.groups.flatMap((group) => group.options.map((option) => [option.id, option.name] as const)),
  )

  return (
    <section className="summary-panel" aria-labelledby="cart-heading">
      <h3 id="cart-heading">Cart</h3>
      {loadError && (
        <>
          <p role="alert">Could not load the cart.</p>
          <button type="button" onClick={onRefresh}>Retry cart</button>
        </>
      )}
      {removeError && <p role="alert">{removeError}</p>}
      {!cart && !loadError && <p role="status">Loading cart…</p>}
      {cart?.items.length === 0 && <p>Your cart is empty.</p>}
      {cart && cart.items.length > 0 && (
        <ul className="cart-items">
          {cart.items.map((item) => {
            const expired = item.expired || item.expiresAt <= serverTime
            const details = Object.entries(item.options)
              .filter(([, qty]) => qty > 0)
              .map(([id, qty]) => `${qty} × ${optionNames.get(id) ?? id}`)
              .join(', ')

            return (
              <li key={item.id}>
                <strong>{item.qty} × {menu.name}</strong>
                <p className="cart-item-details">{details}</p>
                <p className="reservation-badge" data-state={expired ? 'expired' : item.expiresAt - serverTime < 60_000 ? 'ending' : 'active'}>
                  <span className="clock-icon" aria-hidden="true" />
                  {expired ? 'Reservation expired' : `Reserved for ${countdown(item.expiresAt, serverTime)}`}
                </p>
                <div className="cart-actions">
                  <button type="button" disabled={busy || expired} onClick={() => onEdit(item)}>
                    Edit
                  </button>
                  <button className="button-danger" type="button" disabled={busy} onClick={() => onRemove(item.id)}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
