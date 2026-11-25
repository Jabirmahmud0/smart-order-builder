const amountFormat = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrice(poisha: number) {
  return `${amountFormat.format(poisha / 100)} BDT`
}
