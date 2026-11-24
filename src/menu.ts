type MenuOption = {
  id: string
  name: string
  pricePoisha: number
  ingredients: Record<string, number>
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

export type Menu = {
  name: string
  basePricePoisha: number
  groups: MenuGroup[]
  rules: MenuRule[]
  stock: Record<string, number>
}
