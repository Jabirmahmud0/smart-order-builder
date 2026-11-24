import type { Configuration, MenuGroup, MenuRule } from './menu'

type Violation =
  | { groupId: string; message: string }
  | { ruleId: string; message: string }

type LimitOverride = Extract<MenuRule, { type: 'overrideLimit' }>

export function validate(
  config: Configuration,
  groups: readonly MenuGroup[],
  rules: readonly MenuRule[],
): Violation[] {
  const violations: Violation[] = []
  const quantities = new Map(Object.entries(config))
  const optionNames = new Map(
    groups.flatMap((group) => group.options.map((option) => [option.id, option.name] as const)),
  )
  const overrides = new Map<string, LimitOverride>()

  const quantityOf = (id: string) => quantities.get(id) ?? 0
  const isSelected = (id: string) => {
    const quantity = quantityOf(id)
    return Number.isSafeInteger(quantity) && quantity > 0
  }
  const nameOf = (id: string) => optionNames.get(id) ?? id

  for (const rule of rules) {
    if (!isSelected(rule.optionId)) continue

    if (rule.type === 'overrideLimit') {
      const current = overrides.get(rule.groupId)
      if (!current || rule.max < current.max) {
        overrides.set(rule.groupId, rule)
      }
      continue
    }

    const selected = rule.optionIds.filter(isSelected)
    if (rule.type === 'requires' && selected.length === 0) {
      violations.push({
        ruleId: rule.id,
        message: `${nameOf(rule.optionId)} requires ${rule.optionIds.map(nameOf).join(' or ')}`,
      })
    }
    if (rule.type === 'excludes' && selected.length > 0) {
      violations.push({
        ruleId: rule.id,
        message: `${nameOf(rule.optionId)} cannot be combined with ${selected.map(nameOf).join(' or ')}`,
      })
    }
  }

  for (const group of groups) {
    const { min, step, maxDistinct, maxPerOption } = group.limits
    const override = overrides.get(group.id)
    const max = override?.max ?? group.limits.max
    let total = 0
    let distinct = 0

    for (const option of group.options) {
      const quantity = quantityOf(option.id)
      if (!Number.isSafeInteger(quantity) || quantity < 0) {
        violations.push({
          groupId: group.id,
          message: `${option.name} needs a whole number quantity of zero or more`,
        })
        continue
      }
      if (quantity === 0) continue

      total += quantity
      distinct += 1
      if (maxPerOption !== undefined && quantity > maxPerOption) {
        violations.push({
          groupId: group.id,
          message: `${option.name} allows at most ${maxPerOption} per item`,
        })
      }
    }

    if (min !== undefined && total < min) {
      violations.push({ groupId: group.id, message: `${group.name} total must be at least ${min}` })
    }
    if (max !== undefined && total > max) {
      violations.push(
        override
          ? {
              ruleId: override.id,
              message: `${group.name} max is ${max} when ${nameOf(override.optionId)} is selected`,
            }
          : { groupId: group.id, message: `${group.name} total must be at most ${max}` },
      )
    }
    if (step !== undefined && total % step !== 0) {
      const requirement = min !== undefined && max !== undefined && min % step === 0
        ? `${min}-${max} in steps of ${step}`
        : `a multiple of ${step}`
      violations.push({ groupId: group.id, message: `${group.name} total must be ${requirement}` })
    }
    if (maxDistinct !== undefined && distinct > maxDistinct) {
      violations.push({
        groupId: group.id,
        message: `${group.name} allows at most ${maxDistinct} distinct options`,
      })
    }
  }

  return violations
}
