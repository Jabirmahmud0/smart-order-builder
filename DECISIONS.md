# Decisions

## C1 · Pricing and rounding

JavaScript can represent 679.50 exactly because the fractional part is one half. The rate 0.05 has a repeating binary expansion, so JavaScript stores an approximation. TC-06 lands right on a half-poisha boundary, where a tiny error can change the result that rounds up. The pricing engine uses integer poisha for money and applies rates as integer ratios.

The cart subtotal is 165,950 poisha and the coupon takes off 15,000 poisha, leaving 150,950 poisha. Multiplying by 5 and dividing by 100 gives 7,547.5 poisha in VAT. Half-up rounding gives 7,548 poisha, or 75.48 BDT.

## D1 · Stock changes during an edit

Both tabs use the same IndexedDB cart, and each save checks stock and writes the result in one transaction. Save credits Tab A with the ingredients its original item holds. If Tab B gets the extra eggs first, Tab A sees how many eggs are missing. The original item keeps its reservation until expiry, and the unsaved selections stay in the form so the user can adjust them.

## D2 · When prices lock

An item reservation holds ingredients. Until payment, cart totals are recalculated with the mock server’s current time. At 10:59:59 in Dhaka, MORNING15 can still win over the fixed discount, and at 11:00:00 the same cart qualifies only for the fixed discount. Pay recalculates the total on the server and saves that price with the completed order.

## D3 · Expiry during an edit

An edit keeps the item’s original reservation deadline. When that deadline passes, stock becomes available again and the cart item becomes read-only. The edit form keeps the draft visible, tells the user the reservation expired, and disables Save. If Save reaches the server at the deadline, it returns the same expiry message.
