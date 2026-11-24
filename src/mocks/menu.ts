import type { Menu } from '../menu'

export const breakfastMenu: Menu = {
  name: 'Build Your Breakfast',
  basePricePoisha: 25_000,
  groups: [
    {
      id: 'bread',
      name: 'Bread',
      limits: { min: 1, max: 1 },
      options: [
        { id: 'toast', name: 'Toast', pricePoisha: 0, ingredients: { toast: 1 } },
        { id: 'paratha', name: 'Paratha', pricePoisha: 2_000, ingredients: { paratha: 1 } },
        { id: 'croissant', name: 'Croissant', pricePoisha: 6_000, ingredients: { croissant: 1 } },
      ],
    },
    {
      id: 'eggs',
      name: 'Eggs',
      limits: { min: 2, max: 6, step: 2 },
      options: [
        { id: 'fried', name: 'Fried', pricePoisha: 3_000, ingredients: { egg: 1 } },
        { id: 'scrambled', name: 'Scrambled', pricePoisha: 3_500, ingredients: { egg: 1 } },
        { id: 'omelette', name: 'Omelette', pricePoisha: 7_000, ingredients: { egg: 2 } },
      ],
    },
    {
      id: 'protein',
      name: 'Protein',
      limits: { min: 1, max: 3 },
      options: [
        { id: 'sausage', name: 'Chicken Sausage', pricePoisha: 6_000, ingredients: { sausage: 1 } },
        { id: 'bacon', name: 'Beef Bacon', pricePoisha: 9_000, ingredients: { bacon: 1 } },
        { id: 'tofu', name: 'Tofu', pricePoisha: 5_000, ingredients: { tofu: 1 } },
      ],
    },
    {
      id: 'extras',
      name: 'Extras',
      limits: { min: 0, max: 4 },
      options: [
        { id: 'hashbrown', name: 'Hash Brown', pricePoisha: 4_000, ingredients: { hashbrown: 1 } },
        { id: 'mushroom', name: 'Mushroom', pricePoisha: 3_000, ingredients: { mushroom: 1 } },
        { id: 'beans', name: 'Baked Beans', pricePoisha: 2_500, ingredients: { beans: 1 } },
        { id: 'cheese', name: 'Cheese', pricePoisha: 3_500, ingredients: { cheese: 1 } },
      ],
    },
    {
      id: 'sauce',
      name: 'Sauce',
      limits: { min: 0, maxDistinct: 2, maxPerOption: 1 },
      options: [
        { id: 'ketchup', name: 'Ketchup', pricePoisha: 0, ingredients: {} },
        {
          id: 'hollandaise',
          name: 'Hollandaise',
          pricePoisha: 2_500,
          ingredients: { hollandaise: 1 },
        },
        { id: 'chili', name: 'Chili', pricePoisha: 1_000, ingredients: {} },
      ],
    },
  ],
  rules: [
    { id: 'R1', type: 'requires', optionId: 'hollandaise', optionIds: ['scrambled', 'omelette'] },
    { id: 'R2', type: 'excludes', optionId: 'tofu', optionIds: ['sausage', 'bacon'] },
    { id: 'R3', type: 'overrideLimit', optionId: 'croissant', groupId: 'extras', max: 2 },
    { id: 'R4', type: 'excludes', optionId: 'chili', optionIds: ['hollandaise'] },
  ],
  stock: {
    egg: 10,
    sausage: 4,
    bacon: 3,
    tofu: 5,
    croissant: 2,
    paratha: 10,
    toast: 20,
    hashbrown: 6,
    mushroom: 6,
    beans: 8,
    cheese: 4,
    hollandaise: 5,
  },
}
