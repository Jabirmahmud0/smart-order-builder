import type { Configuration, IngredientAmounts, MenuGroup } from './menu'
import { menuGroupId } from './menuDisplay'
import { formatPrice } from './money'
import { formatShortages, maxAdditionalUnits, stockShortages } from './stock'

export function MenuOptions({
  groups, config, qty, stock, usage, remaining, messages, disabled, onChange,
}: {
  groups: MenuGroup[]
  config: Configuration
  qty: number
  stock: IngredientAmounts
  usage: IngredientAmounts
  remaining: IngredientAmounts
  messages: ReadonlyMap<string, string[]>
  disabled: boolean
  onChange: (option: MenuGroup['options'][number], change: -1 | 1) => void
}) {
  return (
    <div className="menu-groups">
      {groups.map((group) => (
        <fieldset id={menuGroupId(group.id)} key={group.id} className="menu-group" disabled={disabled}>
          <legend className="visually-hidden">{group.name}</legend>
          <div className="menu-group-heading">
            <h3>{group.name}</h3>
            <span>{(group.limits.min ?? 0) > 0 ? 'Required' : 'Optional'}</span>
          </div>

          {group.options.map((option) => {
            const quantity = Object.hasOwn(config, option.id) ? config[option.id] : 0
            const additional = maxAdditionalUnits(option.ingredients, stock, usage, qty)
            const nextUnit = Object.fromEntries(
              Object.entries(option.ingredients).map(([ingredient, amount]) => [ingredient, amount * qty]),
            )
            const shortages = additional === 0 ? stockShortages(nextUnit, remaining) : []

            return (
              <div
                key={option.id}
                className="option"
                data-selected={quantity > 0}
                role="group"
                aria-label={option.name}
              >
                <span className="option-marker" aria-hidden="true" />
                <div className="option-info">
                  <span className="option-name">{option.name}</span>
                  <small className={additional === 1 || additional === 2 ? 'stock-low' : undefined}>
                    {additional === null ? 'Unlimited stock' : `${additional} more in stock`}
                  </small>
                  {shortages.length > 0 && <small className="stock-shortage">{formatShortages(shortages)}</small>}
                </div>
                <span className="option-price">
                  {option.pricePoisha === 0 ? 'Included' : `+${formatPrice(option.pricePoisha)}`}
                </span>
                <div className="option-quantity">
                  <button
                    type="button"
                    aria-label={`Remove ${option.name}`}
                    disabled={quantity === 0}
                    onClick={() => onChange(option, -1)}
                  >−</button>
                  <span>{quantity}</span>
                  <button
                    type="button"
                    aria-label={`Add ${option.name}`}
                    disabled={additional === 0}
                    onClick={() => onChange(option, 1)}
                  >+</button>
                </div>
              </div>
            )
          })}

          {messages.has(group.id) && (
            <ul
              className="group-messages"
              data-empty={!group.options.some(({ id }) => Object.hasOwn(config, id) && config[id] > 0)}
              aria-live="polite"
            >
              {messages.get(group.id)?.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
            </ul>
          )}
        </fieldset>
      ))}
    </div>
  )
}
