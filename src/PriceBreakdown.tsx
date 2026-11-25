import type { Promotions } from './menu'
import type { CartPrice } from './pricing'

const amountFormat = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPrice(poisha: number) {
  return `${amountFormat.format(poisha / 100)} BDT`
}

export function PriceBreakdown({ pricing, promotions }: { pricing: CartPrice; promotions: Promotions }) {
  const labels = new Map([
    [promotions.extras.id, 'Extras deal'],
    [promotions.combo.id, 'Combo discount'],
    [promotions.threshold.id, 'Cart discount'],
    [promotions.coupon.id, promotions.coupon.code],
  ])
  const itemDiscounts = new Map<string, number>()
  let beforeDiscounts = 0

  for (const line of pricing.lines) {
    beforeDiscounts += line.unitSubtotalPoisha * line.qty
    for (const discount of line.unitDiscounts) {
      const total = itemDiscounts.get(discount.id) ?? 0
      itemDiscounts.set(discount.id, total + discount.amountPoisha * line.qty)
    }
  }

  return (
    <dl className="price-breakdown">
      {itemDiscounts.size > 0 && (
        <div><dt>Before item discounts</dt><dd>{formatPrice(beforeDiscounts)}</dd></div>
      )}
      {[...itemDiscounts].map(([id, amount]) => (
        <div key={id}>
          <dt>{labels.get(id) ?? id}</dt>
          <dd>−{formatPrice(amount)}</dd>
        </div>
      ))}
      <div><dt>Subtotal</dt><dd>{formatPrice(pricing.subtotalPoisha)}</dd></div>
      {pricing.cartDiscount && (
        <div>
          <dt>{labels.get(pricing.cartDiscount.id) ?? pricing.cartDiscount.id}</dt>
          <dd>−{formatPrice(pricing.cartDiscount.amountPoisha)}</dd>
        </div>
      )}
      <div><dt>VAT</dt><dd>{formatPrice(pricing.vatPoisha)}</dd></div>
      <div className="payable"><dt>Payable</dt><dd>{formatPrice(pricing.payablePoisha)}</dd></div>
    </dl>
  )
}
