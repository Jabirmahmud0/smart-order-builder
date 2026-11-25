export type Configuration = Readonly<Record<string, number>>
export type IngredientAmounts = Readonly<Record<string, number>>

export type Selection = {
  options: Configuration
  qty: number
}

type MenuOption = {
  id: string
  name: string
  pricePoisha: number
  ingredients: IngredientAmounts
}

export type MenuGroup = {
  id: string
  name: string
  limits: {
    min?: number
    max?: number
    step?: number
    maxDistinct?: number
    maxPerOption?: number
  }
  options: MenuOption[]
}

export type MenuRule =
  | { id: string; type: 'requires' | 'excludes'; optionId: string; optionIds: string[] }
  | { id: string; type: 'overrideLimit'; optionId: string; groupId: string; max: number }

export type Promotions = {
  extras: { id: string; groupId: string; unitsPerFree: number }
  combo: { id: string; minimums: Readonly<Record<string, number>>; percent: number }
  threshold: { id: string; minimumSubtotalPoisha: number; amountPoisha: number }
  coupon: {
    id: string
    code: string
    percent: number
    capPoisha: number
    timeZone: string
    cutoff: string
  }
  vatPercent: number
}

export type Menu = {
  name: string
  image?: { src: string; alt: string }
  basePricePoisha: number
  groups: MenuGroup[]
  rules: MenuRule[]
  stock: IngredientAmounts
  promotions: Promotions
}
