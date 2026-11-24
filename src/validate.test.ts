import { expect, test } from 'vitest'
import type { MenuGroup, MenuRule } from './menu'
import { breakfastMenu } from './mocks/menu'
import { validate } from './validate'

const { groups, rules } = breakfastMenu
const breakfast = { toast: 1, scrambled: 2, sausage: 1 }

test('TC-01 rejects an egg total that breaks the step', () => {
  expect(validate({ ...breakfast, scrambled: 3 }, groups, rules)).toEqual([
    { groupId: 'eggs', message: 'Eggs total must be 2-6 in steps of 2' },
  ])
})

test('TC-02 applies the croissant override to extras', () => {
  const extras = { hashbrown: 1, mushroom: 1, cheese: 1 }

  expect(validate({ ...breakfast, ...extras }, groups, rules)).toEqual([])
  expect(validate({ ...breakfast, ...extras, toast: 0, croissant: 1 }, groups, rules)).toEqual([
    { ruleId: 'R3', message: 'Extras max is 2 when Croissant is selected' },
  ])
})

test('TC-03 requires a supported egg option with hollandaise', () => {
  expect(validate({ toast: 1, fried: 2, sausage: 1, hollandaise: 1 }, groups, rules)).toEqual([
    { ruleId: 'R1', message: 'Hollandaise requires Scrambled or Omelette' },
  ])
  expect(validate({ ...breakfast, scrambled: 1, fried: 1, hollandaise: 1 }, groups, rules)).toEqual([])
})

test('TC-04 reports both exclusion violations', () => {
  const config = { toast: 1, scrambled: 2, tofu: 1, bacon: 1, chili: 1, hollandaise: 1 }

  expect(validate(config, groups, rules)).toEqual([
    { ruleId: 'R2', message: 'Tofu cannot be combined with Beef Bacon' },
    { ruleId: 'R4', message: 'Chili cannot be combined with Hollandaise' },
  ])
})

test('reports group minimums, maximums, and per-option and distinct limits together', () => {
  const config = { scrambled: 2, sausage: 4, ketchup: 2, hollandaise: 1, chili: 1 }

  expect(validate(config, groups, rules)).toEqual([
    { ruleId: 'R4', message: 'Chili cannot be combined with Hollandaise' },
    { groupId: 'bread', message: 'Bread total must be at least 1' },
    { groupId: 'protein', message: 'Protein total must be at most 3' },
    { groupId: 'sauce', message: 'Ketchup allows at most 1 per item' },
    { groupId: 'sauce', message: 'Sauce allows at most 2 distinct options' },
  ])
})

test('uses an override that raises the maximum on a different menu', () => {
  const drinks: MenuGroup[] = [
    {
      id: 'pitchers',
      name: 'Pitchers',
      limits: { max: 1 },
      options: [{ id: 'lemonade', name: 'Lemonade', pricePoisha: 100, ingredients: {} }],
    },
    {
      id: 'sizes',
      name: 'Sizes',
      limits: { max: 1 },
      options: [{ id: 'party', name: 'Party size', pricePoisha: 0, ingredients: {} }],
    },
  ]
  const drinkRules: MenuRule[] = [
    { id: 'party-max', type: 'overrideLimit', optionId: 'party', groupId: 'pitchers', max: 3 },
  ]

  expect(validate({ lemonade: 3 }, drinks, drinkRules)).toEqual([
    { groupId: 'pitchers', message: 'Pitchers total must be at most 1' },
  ])
  expect(validate({ lemonade: 3, party: 1 }, drinks, drinkRules)).toEqual([])
})
