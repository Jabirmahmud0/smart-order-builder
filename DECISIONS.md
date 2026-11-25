# Decisions

## C1 · Pricing and rounding

JavaScript represents 679.50 exactly because one half has a finite binary representation. The risk shows up at the VAT step. Five percent of 1,509.50 BDT is exactly 75.475 BDT, halfway between two poisha values. In JavaScript, `(1509.50 / 20).toFixed(2)` returns `"75.47"` because the division rounds to a binary value just below that midpoint.

For TC-06, the subtotal is `67,950 + 2 × 49,000 = 165,950` poisha. The 15% coupon reaches its 15,000 poisha cap, leaving `165,950 − 15,000 = 150,950` poisha. VAT is `150,950 × 5 ÷ 100 = 7,547.5` poisha. The engine applies half-up rounding with integer poisha and the rate ratio, which gives **7,548 poisha (75.48 BDT)**.

The original C1 explanation and the first pricing implementation are recorded together in commit `ee612c9`.

## C2 · Sales assistant tools

Each function reads the current stored orders. Revenue uses the final payable amount saved at checkout.

| Question | Function and inputs | Output |
| --- | --- | --- |
| How many orders have we had? | `getOrderCount(orders)` | Order count |
| How much revenue did we make? | `getTotalRevenue(orders)` | Total payable in poisha |
| What was the best-selling option? | `getBestSellingOption(orders)` | `{ optionId, units }`, or null for no sales. Ties go to the lowest option ID in alphabetical order. |
| How much revenue came from each payment method? | `getRevenueByPaymentMethod(orders)` | `{ card, bkash, cash }` with each total in poisha |
| What was the average order value? | `getAverageOrderValue(orders)` | Average payable rounded half-up to poisha, or null for no orders |
| How many orders received the coupon? | `getCouponUseCount(orders, couponCode)` | Count of orders where the given code was applied |
| Which orders were placed on a given date? | `getOrdersOnDate(orders, date)`, with date as `YYYY-MM-DD` | `{ count, orderIds }` for the Dhaka calendar date, or null for an invalid date |

## D1 · Stock changes during an edit

Both tabs use the same IndexedDB cart, and each save checks stock and writes the result in one transaction. Save credits Tab A with the ingredients its original item holds. If Tab B gets the extra eggs first, Tab A sees how many eggs are missing. The original item keeps its reservation until expiry, and the unsaved selections stay in the form so the user can adjust them.

## D2 · When prices lock

An item reservation holds ingredients. Until payment, cart totals are recalculated with the mock server’s current time. At 10:59:59 in Dhaka, MORNING15 can still win over the fixed discount, and at 11:00:00 the same cart qualifies only for the fixed discount. Pay recalculates the total on the server and saves that price with the completed order.

## D3 · Expiry during an edit

An edit keeps the item’s original reservation deadline. When that deadline passes, stock becomes available again and the cart item becomes read-only. The edit form keeps the draft visible, tells the user the reservation expired, and disables Save. If Save reaches the server at the deadline, it returns the same expiry message.

## D4 · Checkout identity

The mock API creates the order ID and timestamps it with server time when it accepts Pay. The browser sends an idempotency key for each payment attempt and reuses it on retry. The cart clear, sale, and key are written in the same transaction, so a repeated Pay with the same key returns the original order. A separate Pay request arriving after the cart was cleared finds no active items.

## D5 · Customer questions

For “Who is our best customer?”, the chat says customer information is unavailable because the orders contain no customer records. The browser handles that question directly, before asking Gemini to pick a tool. Gemini can choose from the seven sales tools in C2. If Gemini returns no valid call, the browser explains which sales questions the app can answer.

## D6 · Stored order JSON

An export has `schemaVersion`, `currency`, `moneyUnit`, and an `orders` array. Each order records `id`, `createdAt`, `paymentMethod`, the selected `lines` with their quantities, and a `pricing` object containing per-line prices, discounts, subtotal, VAT, and payable in integer poisha. The `couponCode` field records the submitted code, and `appliedCouponCode` is null whenever the coupon did not win the discount or was ineligible.
