import type { Configuration, IngredientAmounts, MenuGroup } from './menu'

type Allocation = {
  id: string
  ingredients: IngredientAmounts
}

type Shortage = {
  ingredient: string
  missing: number
}

function amountOf(amounts: Readonly<Record<string, number>>, id: string): number {
  return Object.hasOwn(amounts, id) ? amounts[id] : 0
}

export function ingredientUsage(
  config: Configuration,
  groups: readonly MenuGroup[],
  itemQuantity: number,
): IngredientAmounts {
  const usage = new Map<string, number>()

  for (const group of groups) {
    for (const option of group.options) {
      const quantity = amountOf(config, option.id)
      if (!Number.isSafeInteger(quantity) || quantity <= 0) continue

      for (const [ingredient, amount] of Object.entries(option.ingredients)) {
        if (amount <= 0) continue

        const used = amount * quantity * itemQuantity
        usage.set(ingredient, (usage.get(ingredient) ?? 0) + used)
      }
    }
  }

  return Object.fromEntries(usage)
}

export function availableStock(
  stock: IngredientAmounts,
  allocations: readonly Allocation[],
  editingId?: string,
): IngredientAmounts {
  const remaining = new Map(Object.entries(stock))

  for (const allocation of allocations) {
    if (allocation.id === editingId) continue

    for (const [ingredient, amount] of Object.entries(allocation.ingredients)) {
      remaining.set(ingredient, (remaining.get(ingredient) ?? 0) - amount)
    }
  }

  return Object.fromEntries(remaining)
}

export function stockShortages(
  requested: IngredientAmounts,
  available: IngredientAmounts,
): Shortage[] {
  const shortages: Shortage[] = []

  for (const [ingredient, amount] of Object.entries(requested)) {
    const missing = amount - amountOf(available, ingredient)
    if (missing > 0) shortages.push({ ingredient, missing })
  }

  return shortages
}

export function maxAdditionalUnits(
  ingredients: IngredientAmounts,
  available: IngredientAmounts,
  currentUsage: IngredientAmounts,
  itemQuantity: number,
): number | null {
  let maximum: number | null = null

  for (const [ingredient, amount] of Object.entries(ingredients)) {
    if (amount <= 0) continue

    const remaining = amountOf(available, ingredient) - amountOf(currentUsage, ingredient)
    const units = Math.max(0, Math.floor(remaining / (amount * itemQuantity)))
    maximum = maximum === null ? units : Math.min(maximum, units)
  }

  return maximum
}
