import { useEffect, useState } from 'react'
import type { Menu } from './menu'
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
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const config = Object.fromEntries(
    Object.entries(quantities).map(([id, value]) => [id, Number(value)]),
  )
  const violations = validate(config, menu.groups, menu.rules)

  return (
    <>
      <h2>{menu.name}</h2>
      <div className="builder">
        <div className="option-groups">
          {menu.groups.map((group) => (
            <fieldset key={group.id}>
              <legend>{group.name}</legend>

              {group.options.map((option) => (
                <label className="option" key={option.id}>
                  {option.name}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={Object.hasOwn(quantities, option.id) ? quantities[option.id] : '0'}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      setQuantities((current) => ({ ...current, [option.id]: value }))
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        <section className="selection" aria-labelledby="selection-heading">
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
      </div>
    </>
  )
}
