import type { Menu } from './menu'
import type { validate } from './validate'

export function menuGroupId(id: string) {
  return `menu-group-${id}`
}

export function groupForViolation(menu: Menu, violation: ReturnType<typeof validate>[number]) {
  if ('groupId' in violation) return violation.groupId
  const rule = menu.rules.find(({ id }) => id === violation.ruleId)
  if (rule?.type === 'overrideLimit') return rule.groupId
  return menu.groups.find(({ options }) => options.some(({ id }) => id === rule?.optionId))?.id
}
