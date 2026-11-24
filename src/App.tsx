import { useEffect, useState } from 'react'
import type { Configuration, Menu } from './menu'
import { PricePreview } from './PricePreview'
import { availableStock, formatShortages, ingredientUsage, maxAdditionalUnits, stockShortages } from './stock'
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

function MenuBuilder({ menu }: { menu: Menu }) {
  const [config, setConfig] = useState<Configuration>({})
  const itemQuantity = 1
  const usage = ingredientUsage(config, menu.groups, itemQuantity)
  const remaining = availableStock(menu.stock, [{ id: 'draft', ingredients: usage }])
  const violations = validate(config, menu.groups, menu.rules)

  function changeQuantity(optionId: string, change: -1 | 1) {
    setConfig((current) => {
      const quantity = Object.hasOwn(current, optionId) ? current[optionId] : 0
      const next = { ...current, [optionId]: Math.max(0, quantity + change) }

      if (change > 0) {
        const nextUsage = ingredientUsage(next, menu.groups, itemQuantity)
        if (stockShortages(nextUsage, menu.stock).length > 0) return current
      }

      return next
    })
  }

  return (
    <>
      <h2>{menu.name}</h2>
      <div className="builder">
        <div className="option-groups">
          {menu.groups.map((group) => (
            <fieldset key={group.id}>
              <legend>{group.name}</legend>

              {group.options.map((option) => {
                const quantity = Object.hasOwn(config, option.id) ? config[option.id] : 0
                const additional = maxAdditionalUnits(
                  option.ingredients, menu.stock, usage, itemQuantity,
                )
                const shortages = additional === 0 ? stockShortages(option.ingredients, remaining) : []

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
                        onClick={() => changeQuantity(option.id, -1)}
                      >
                        −
                      </button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Add ${option.name}`}
                        disabled={additional === 0}
                        onClick={() => changeQuantity(option.id, 1)}
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
              {violations.length === 0 ? (
                <p>Selection meets the menu rules.</p>
              ) : (
                <ul>
                  {violations.map(({ message }, index) => <li key={`${message}-${index}`}>{message}</li>)}
                </ul>
              )}
            </div>
          </section>
          <PricePreview options={config} qty={itemQuantity} promotions={menu.promotions} />
        </div>
      </div>
    </>
  )
}
