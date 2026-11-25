# Assessment answers

Run `npm run answers` to print Q1–Q8. The report uses the stock, validation, pricing, and sales functions from the app and the original assessment fixtures. Times are in Asia/Dhaka and amounts are in BDT.

## Q1 · Maximum quantity of C

**2 items.** Cheese is the limiting ingredient. One C uses 2 cheese, and there are 4 in stock. Every other ingredient used by C has enough stock for at least 5 items.

## Q2 · Cheapest valid configuration

**Toast ×1, Fried ×2, and Tofu ×1 at 360.00 per unit before VAT.** The base is 250.00, Fried adds 60.00, and Tofu adds 50.00. The test searches the menu’s bounded option quantities, checks the rules and stock, and compares unit prices after item promotions.

## Q3 · A ×3 at 10:30 and 11:30

MORNING15 is entered in both runs.

| Time | Subtotal | Chosen discount | Discounted subtotal | VAT | Payable |
| --- | ---: | --- | ---: | ---: | ---: |
| 10:30 | 1,140.00 | MORNING15 (C2), 150.00 | 990.00 | 49.50 | 1,040 |
| 11:30 | 1,140.00 | None | 1,140.00 | 57.00 | 1,197 |

1. A costs 250.00 + (2 × 35.00) + 60.00 = 380.00. Three copies cost 1,140.00, below C1’s 1,200.00 threshold.
2. At **10:30**, 15% of 1,140.00 is 171.00, so C2 takes off the 150.00 cap. VAT is 5% of 990.00, or 49.50. Half-up rounding takes 1,039.50 to **1,040**.
3. At **11:30**, MORNING15 has expired. VAT is 5% of 1,140.00, or 57.00. The total is already a whole **1,197**.

## Q4 · Payable after TC-10 at 11:30

**1,600.** Edited B costs 643.50 and C ×2 costs 980.00, giving a subtotal of 1,623.50. C1 takes off 100.00. VAT on 1,523.50 is 76.18 after rounding to poisha. The total of 1,599.68 rounds to 1,600.

## Q5 · Seed order totals

| Order | Payable |
| --- | ---: |
| ORD-1001 | 339 |
| ORD-1002 | 713 |
| ORD-1003 | 1,271 |
| ORD-1004 | 578 |
| ORD-1005 | 866 |
| ORD-1006 | 1,228 |
| **Total revenue** | **4,995** |

## Q6 · Best-selling option

**Fried, 10 units.** ORD-1002 contributes 2, ORD-1003 contributes 4, and ORD-1006 contributes 4 across its two lines. The calculation multiplies each option quantity by its line quantity.

## Q7 · Highest revenue by payment method

**Card, 2,145.00.** bKash brought in 1,579.00 and cash brought in 1,271.00.

## Q8 · MORNING15 use

**3 orders** received MORNING15. The report finds orders with the code entered and counts only orders whose stored `appliedCouponCode` is MORNING15.

| Order | Dhaka time | Subtotal | Coupon calculation | Applied |
| --- | --- | ---: | --- | --- |
| ORD-1001 | 09:15 | 380.00 | 380.00 × 15% = 57.00. No C1 at this subtotal. | 57.00 |
| ORD-1003 | 10:05 | 1,360.00 | 1,360.00 × 15% = 204.00, capped at 150.00. C2 beats C1 at 100.00. | 150.00 |
| ORD-1005 | 08:50 | 970.00 | 970.00 × 15% = 145.50. No C1 at this subtotal. | 145.50 |
| ORD-1006 | 13:10 | 1,169.50 | MORNING15 expired at 11:00. The subtotal is below the C1 threshold of 1,200.00. | None |
