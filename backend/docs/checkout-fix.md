# Checkout and inventory repair — 31 October 2026

The reproduced code-level cause of the HTTP 409 was a mismatch between variant representations. `hydrateProduct` accepts embedded `Product.variants` when no canonical variants exist. The product page, cart and preview therefore accepted a pack with a valid price and stock. `createPayLaterOrder` then queried only `ProductVariant` by variant ID, product ID, active flag and stock. An embedded variant has no matching document in that collection, so the update returned no match and the transaction raised “Stock changed while you were checking out”. The regression test reproduces this missing canonical record and now completes checkout using the embedded stock instead.

The existing backend `.env` was used for a read-only audit. MongoDB DNS SRV resolution failed both inside and outside the sandbox. Consequently, the particular live product/cart record that triggered the reported request could not be inspected. The source mismatch is reproduced in isolated MongoDB; it is not claimed as a confirmed diagnosis of a specific live record.

## Resulting behavior

- Product, cart, preview and placement use the same variant source. Existing canonical variants take precedence; inactive canonical records never fall back to stale embedded copies. No catalogue migration, stock copying, activation or reseeding is required.
- Published real products and real packs are used in every environment. Demo and sample catalogue records remain stored but are excluded from the storefront. The fake-payment endpoint, checkout branches, restoration flow and cleanup timer were removed. Historical schema values remain readable; existing records were not rewritten.
- Pay Later saves a unique `SON-<UUID>` order, a pending payment record and inventory reservations. Stored statuses are `PENDING` and `PLACED`, displayed as Pending and Placed. There is no online payment initiation, simulated transaction or automatic payment confirmation.
- Order creation, guarded stock deduction, reservation creation and cart clearing commit together. Unique owner/request-key indexing and transaction retries prevent double purchase. Pay Later reservations do not expire automatically.
- The browser persists only the attempt UUID, never delivery details. It recovers a committed order after a lost response or reload. The success view shows the requested message, order ID, products, quantities, totals, address and payment status.
- Genuine conflicts identify product, pack, requested quantity, available quantity and a safe reason code. Cart version and expected-total checks require another review when the bag, prices or delivery charges change.
- Customer and admin cancellation use the reservation's original inventory source. Concurrent or repeated cancellation releases stock once and updates both Order and Payment. Paid/shipped orders cannot use this simple cancellation flow. Missing inventory targets fail cancellation rather than reporting a false restock.
- Admin Orders reads real committed orders and refreshes automatically. Staff permissions still protect reads and updates. Marking an order paid requires an explicit “Payment received and verified” selection. Shipping changes do not imply payment. Cancelled orders cannot be reopened or marked paid.
- Inventory views include canonical and embedded stock. Stale inventory/product forms are rejected rather than overwriting a checkout deduction. Embedded packs cannot be converted while their stock is held. Product editing preserves existing offer prices.
- A separate browser defect was fixed: sharing GET promises across component AbortSignals allowed React Strict Mode's cleanup to abort its replacement product request. Signalled requests now retain independent cancellation. React DevTools, image notices and Fast Refresh are not treated as checkout failures.
- Error logs allowlist codes/reasons and omit delivery details, credentials and raw database errors.

## Verification

All database writes used synthetic fixtures in newly named `son_masala_test_*` databases on a separate local replica set on port 27029. No configured store data was modified. Successful test databases were cleaned up; no store database was dropped or seeded.

| Check | Result |
| --- | --- |
| Checkout, catalogue availability, catalogue validation, wishlist/checkout integration | 31 passed, 0 failed, 0 skipped |
| Frontend unit tests, including independent cancellation and inventory error details | 26 passed |
| Backend JavaScript syntax/build check | Passed |
| Next.js production build, including its normal validation | Passed |
| Chrome browser against real Express and isolated MongoDB | Passed |
| Full backend suite | 126 passed, 23 failed, 0 skipped |

The focused integration checks cover both variant representations, current prices, insufficient stock, missing/incorrect IDs, inactive/archived records, concurrent last-pack orders, repeated and different request keys, persistence, customer privacy, admin visibility/permissions, explicit payment confirmation, cancellation/restocking, stale forms and transaction rollback after a persistence failure.

The browser check covers product selection, cart, review, Pay Later, double-click prevention, success/address/status display, Admin Orders visibility, order details, cancellation/restocking, and recovery after deliberately losing a committed placement response. No browser page errors occurred.

The remaining full-suite failures are existing owner/auth security tests. Their failures also reproduce on an untouched `HEAD` source snapshot, including the customer and Google assertions expecting `/owner` routes that are absent from the existing router. No security assertions were disabled to obtain a passing checkout result. Full output is retained locally in `backend/.runtime/checkout-full-tests.log`; the comparison is in `backend/.runtime/checkout-baseline-tests.log`.

Run the focused checks from `backend` with `MONGODB_TEST_URI` set to an isolated transaction-capable MongoDB:

```powershell
node --test test/commerce.test.js test/catalogue-availability.test.js test/catalog-admin.test.js test/wishlist-checkout.test.js
node scripts/check.js
```

From `frontend`:

```powershell
npm.cmd test
npm.cmd run build
```

For the browser verification, start a separate frontend development server with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5017/api/v1`, `NEXT_PUBLIC_API_PROXY=true`, and an ignored `NEXT_DIST_DIR` such as `.runtime/checkout-next`, on port 3017. With `MONGODB_TEST_URI` set, run `node scripts/verify-pay-later-browser.js` from `backend`. It starts its own fixture API on 5017 and closes it afterwards. The read-only store audit is `node scripts/audit-checkout.js`.

## Files changed

Backend runtime/configuration:

```text
backend/src/app.js
backend/src/config/env.js
backend/src/server.js
backend/src/routes/index.js
backend/src/middleware/session.js
backend/src/middleware/errorHandler.js
backend/src/models/InventoryReservation.js
backend/src/models/Order.js
```

Backend services and controllers:

```text
backend/src/services/paymentService.js
backend/src/services/inventoryService.js              (new)
backend/src/services/orderService.js                  (new)
backend/src/services/cartService.js
backend/src/services/productService.js
backend/src/services/logger.js
backend/src/controllers/authController.js
backend/src/controllers/businessController.js
backend/src/controllers/cartController.js
backend/src/controllers/catalogAdminController.js
backend/src/controllers/checkoutController.js
backend/src/controllers/productController.js
backend/src/controllers/reviewController.js
backend/src/controllers/wishlistController.js
```

Frontend:

```text
frontend/src/components/Checkout.jsx
frontend/src/components/OrderConfirmation.jsx
frontend/src/components/CartContents.jsx
frontend/src/components/Account.jsx
frontend/src/components/ProductCard.jsx
frontend/src/components/ReviewForm.jsx
frontend/src/components/Footer.jsx
frontend/src/components/staff/BusinessModule.jsx
frontend/src/components/staff/BusinessDashboard.jsx
frontend/src/components/staff/ProductManagement.jsx
frontend/src/app/checkout/page.jsx
frontend/src/app/orders/[id]/page.jsx
frontend/src/app/policies/page.jsx
frontend/src/app/contact/page.jsx
frontend/src/lib/api.js
frontend/src/lib/messages.js
```

Tests and diagnostics:

```text
backend/test/commerce.test.js
backend/test/wishlist-checkout.test.js
backend/test/customer-auth.test.js
backend/test/google-auth.test.js
backend/test/helpers/commerceFixtures.js              (new)
backend/scripts/audit-checkout.js                     (new)
backend/scripts/verify-pay-later-browser.js           (new)
frontend/src/lib/api.test.js
backend/docs/checkout-fix.md                          (new)
```

Existing working-tree changes were retained and extended where necessary. The existing `.env` files and pre-existing startup lock were left in place. No commit, push or deployment was performed.
