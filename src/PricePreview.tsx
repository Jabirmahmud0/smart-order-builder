import type { Promotions } from './menu'
import { PriceBreakdown } from './PriceBreakdown'
import type { usePricePreview } from './usePricePreview'

export function PricePreview({
  quote, promotions,
}: {
  quote: ReturnType<typeof usePricePreview>
  promotions: Promotions
}) {
  return (
    <section className="draft-price" aria-labelledby="preview-heading">
      <h4 id="preview-heading">Price preview</h4>
      {quote.loading && <p role="status">Calculating price…</p>}
      {!quote.loading && !quote.pricing && (
        <div>
          <p role="alert">Could not load the price.</p>
          <button type="button" onClick={quote.retry}>Retry price</button>
        </div>
      )}
      {quote.pricing && <PriceBreakdown pricing={quote.pricing} promotions={promotions} />}
    </section>
  )
}
