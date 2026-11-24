import type { Menu, Promotions, Selection } from './menu'

export type PricingCart = {
  lines: readonly Selection[]
  couponCode?: string | null
}

type Discount = {
  id: string
  amountPoisha: number
}

function roundHalfUp(numerator: number, divisor: number): number {
  return Math.floor((numerator + divisor / 2) / divisor)
}

function priceLine(line: Selection, menu: Menu, promos: Promotions) {
  const selections = menu.groups.flatMap((group) =>
    group.options.flatMap((option) => {
      const qty = Object.hasOwn(line.options, option.id) ? line.options[option.id] : 0
      return qty > 0 ? [{ groupId: group.id, pricePoisha: option.pricePoisha, qty }] : []
    }),
  )
  const unitSubtotalPoisha = selections.reduce(
    (total, option) => total + option.pricePoisha * option.qty,
    menu.basePricePoisha,
  )

  const extras = selections
    .filter((option) => option.groupId === promos.extras.groupId)
    .sort((a, b) => a.pricePoisha - b.pricePoisha)
  const extraUnits = extras.reduce((total, option) => total + option.qty, 0)
  let freeUnits = Math.floor(extraUnits / promos.extras.unitsPerFree)
  let extrasDiscountPoisha = 0

  for (const extra of extras) {
    if (freeUnits === 0) break
    const freeOfThisOption = Math.min(freeUnits, extra.qty)
    extrasDiscountPoisha += freeOfThisOption * extra.pricePoisha
    freeUnits -= freeOfThisOption
  }

  const afterExtrasPoisha = unitSubtotalPoisha - extrasDiscountPoisha
  const qualifiesForCombo = Object.entries(promos.combo.minimums).every(([groupId, minimum]) =>
    selections.reduce((total, option) => total + (option.groupId === groupId ? option.qty : 0), 0) >= minimum,
  )
  const comboDiscountPoisha = qualifiesForCombo
    ? roundHalfUp(afterExtrasPoisha * promos.combo.percent, 100)
    : 0
  const unitDiscounts: Discount[] = []
  if (extrasDiscountPoisha > 0) {
    unitDiscounts.push({ id: promos.extras.id, amountPoisha: extrasDiscountPoisha })
  }
  if (comboDiscountPoisha > 0) {
    unitDiscounts.push({ id: promos.combo.id, amountPoisha: comboDiscountPoisha })
  }

  const unitPricePoisha = afterExtrasPoisha - comboDiscountPoisha
  return {
    qty: line.qty,
    unitSubtotalPoisha,
    unitDiscounts,
    unitPricePoisha,
    lineTotalPoisha: unitPricePoisha * line.qty,
  }
}

function chooseCartDiscount(
  subtotalPoisha: number,
  couponCode: string | null | undefined,
  promos: Promotions,
  serverTime: string,
): Discount | null {
  const { threshold, coupon } = promos
  const thresholdAmount = subtotalPoisha >= threshold.minimumSubtotalPoisha
    ? threshold.amountPoisha
    : 0
  let couponAmount = 0

  if (couponCode === coupon.code) {
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: coupon.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(serverTime))

    if (localTime < coupon.cutoff) {
      couponAmount = Math.min(roundHalfUp(subtotalPoisha * coupon.percent, 100), coupon.capPoisha)
    }
  }

  if (couponAmount > thresholdAmount) return { id: coupon.id, amountPoisha: couponAmount }
  if (thresholdAmount > 0) return { id: threshold.id, amountPoisha: thresholdAmount }
  return null
}

export function priceCart(cart: PricingCart, menu: Menu, promos: Promotions, serverTime: string) {
  const lines = cart.lines.map((line) => priceLine(line, menu, promos))
  const subtotalPoisha = lines.reduce((total, line) => total + line.lineTotalPoisha, 0)
  const cartDiscount = chooseCartDiscount(subtotalPoisha, cart.couponCode, promos, serverTime)
  const discountedSubtotalPoisha = subtotalPoisha - (cartDiscount?.amountPoisha ?? 0)
  const vatPoisha = roundHalfUp(discountedSubtotalPoisha * promos.vatPercent, 100)
  const payablePoisha = roundHalfUp(discountedSubtotalPoisha + vatPoisha, 100) * 100

  return { lines, subtotalPoisha, cartDiscount, discountedSubtotalPoisha, vatPoisha, payablePoisha }
}

export type CartPrice = ReturnType<typeof priceCart>
