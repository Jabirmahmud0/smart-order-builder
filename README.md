# Smart Order Builder

Configure a breakfast, reserve its ingredients, and check out. The sales assistant answers questions from the same order records used by the JSON export.

## Setup

Use Node.js 22.13 or later on the 22.x line, or Node.js 24 or later. The project was tested with Node.js 22.23.5.

```sh
npm ci
npm run dev
```

For the assistant, copy `.env.example` to `.env.local`, set `VITE_GEMINI_API_KEY` to your Google AI Studio key, and restart Vite. The browser uses the key with Gemini 3.5 Flash-Lite. The rest of the app and the automated tests run without a key.

| Command | Purpose |
| --- | --- |
| `npm test` | Run the complete Vitest and React Testing Library suite |
| `npm run answers` | Print and verify the eight assessment answers |
| `npm run lint` | Check the source with Oxlint |
| `npm run build` | Type-check and build the app |

## Architecture

- **Menu and rules.** MSW serves the menu, stock, and promotions from the assessment fixture. [The validator](src/validate.ts) checks group limits and cross-group rules against the data and returns all violations.
- **Stock and reservations.** [The stock engine](src/stock.ts) calculates ingredient use across item quantities and finds every shortage. The mock [reservation handlers](src/mocks/cartHandlers.ts) use IndexedDB transactions to reserve ingredients, replace allocations atomically on edit, and deduplicate retried adds. Countdown estimates use the server timestamp and the browser’s monotonic clock.
- **Pricing and checkout.** [The pricing engine](src/pricing.ts) works in integer poisha. It applies item promotions before the cart discount and VAT, then rounds the payable to whole taka. The builder debounces mock price requests and discards stale responses. Checkout reprices active items at server time, records the order, converts reserved stock to sold stock, and clears the cart in one transaction.
- **Orders and assistant.** IndexedDB stores the priced seed orders and new checkouts together. [The statistics functions](src/salesStats.ts) read those orders, and the [Gemini client](src/geminiSales.ts) uses function calling to select a calculation. The client fetches current orders for each supported question and sends only the calculated answer to Gemini for phrasing.

## Trade-offs and remaining work

- Mock data is shared by tabs on the same browser origin. It stays in that browser’s IndexedDB.
- Expired reservations release their stock and remain visible for removal. Tabs refresh their snapshots on focus and periodically while the app is open.
- Vite includes client environment variables in the application it serves. Build the public demo from a clean checkout without `.env.local` or `VITE_GEMINI_API_KEY` set.
- Part G’s refresh cleanup, stale-tab version check, and draft persistence remain. The live demo is pending.

See [DECISIONS.md](DECISIONS.md) for the decisions and checkpoints, and [ANSWERS.md](ANSWERS.md) for the computed results.

## Hours spent

Provisional estimate of **8 hours**, pending the final time log.
