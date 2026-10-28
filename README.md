# SON MASALA — storefront, owner console, and staff access

The existing JavaScript/JSX Next.js App Router frontend and Express/Mongoose backend remain separate. The homepage is now focused on shopping, with full-width backgrounds and hero imagery, fluid content padding, a sticky header, featured products, a catalogue, conditional offers, customer feedback, and the footer. Story and recipe content remains available on its existing routes and the new About page.

## Project structure

```text
SON/
├── frontend/                 Next.js, React, JSX, assets, and browser/unit tests
├── backend/                  Express, Mongoose, API, tests, scripts, and docs
│   ├── docs/                 Authentication and shopping guides
│   ├── verification/         Verification report and screenshots
│   │   └── recovered-artifacts/ Additional preserved screenshots
│   └── .runtime/             Local demo MongoDB data and logs (ignored by Git)
├── .gitignore
└── README.md
```

The frontend uses JavaScript/JSX only. The backend is JavaScript (ES modules). MongoDB is accessed through Mongoose; both npm lockfiles are retained for reproducible installs.

Demo setup stores its local database in `backend/.runtime/mongo-demo/`. This directory is ignored by Git and must not be replaced or deleted when it contains data.

Customer, staff, and owner authentication are separate. The owner provisions staff through verified invitations and controls permissions, account status, and sessions. See [owner setup, MFA, passkeys, delivery configuration, and recovery](backend/docs/STAFF_ACCESS.md). No default owner or administrator credentials exist.

Customer login uses a minimal cream page with a unified **full name + Indian mobile** form, SMS/WhatsApp selection, six-digit verification, and **Continue with Google** using the original multicolour G. It has no email/password form. Both methods issue the same persistent customer sessions and remain separate from staff access. See [customer authentication, Google OAuth credentials, session policies, and provider setup](backend/docs/CUSTOMER_AUTH.md).

The navbar now offers **हिंदी | EN** with persistent language selection and a bundled Devanagari font. Guests browse and manage their persistent bag freely; checkout sends them through OTP/Google login and returns to the selected bag. Favourites are private MongoDB records restored with the customer account. See [languages, favourites APIs and checkout continuity](backend/docs/root-guides/LOCALIZED_SHOPPING.md).

## Local addresses

- Frontend: http://localhost:3000
- Shop: http://localhost:3000/shop
- Cart: http://localhost:3000/cart (also available as a drawer from the header)
- Demo checkout: http://localhost:3000/checkout
- Account: http://localhost:3000/account
- Customer OTP login: http://localhost:3000/login
- Staff login and dashboard: http://localhost:3000/admin/login and http://localhost:3000/admin/dashboard
- Owner login and dashboard: http://localhost:3000/owner/login and http://localhost:3000/owner/dashboard
- Owner staff management: http://localhost:3000/owner/access-management
- Invite staff: http://localhost:3000/owner/admins/new
- Owner security and audits: http://localhost:3000/owner/security and http://localhost:3000/owner/audit-logs
- Review moderation: http://localhost:3000/admin/reviews
- API: http://localhost:5000/api/v1
- Health: http://localhost:5000/api/v1/health
- Database readiness: http://localhost:5000/api/v1/ready

The old development server on port 3001 was stopped so two Next.js processes do not share the same development cache. Both frontend development and production scripts now use port 3000. CORS explicitly allows configured origins, with localhost ports 3000 and 3001 included during development.

## Run the project

Use Node.js **22 or later**. On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```text
cd backend
npm install
npm run demo:setup
npm run seed:demo
npm run dev
```

In a second terminal:

```text
cd frontend
npm install
npm run dev
```

`demo:setup` starts an isolated, loopback-only MongoDB replica set called `sonDemo` on port 27018. Data and logs are stored in the ignored `backend/.runtime/mongo-demo/` folder. It updates `backend/.env` to use `mongodb://127.0.0.1:27018/son_masala_demo?replicaSet=sonDemo` and explicitly enables demo checkout. Re-running it reuses that replica set. Set `MONGOD_BINARY` if the mongod executable is installed elsewhere.

The existing MongoDB server at the user-supplied `mongodb://localhost:27017/` address and its data were preserved. It is a standalone instance, which cannot run the required multi-document transactions. The demo replica set is separate; it does not turn the existing database into a replica set or change the MongoDB Windows service.

**Existing Atlas database:** the backend uses the existing Atlas `Main` cluster and `MONGODB_URI`, with `MONGODB_DB_NAME=son_masala`; the URI is never logged. DNS is configured before Mongoose connects, and startup creates any missing model collections and indexes without seeding products or customers. The API exposes liveness at `/api/v1/health` and database readiness at `/api/v1/ready`. Keep demo setup separate from a live store. MongoDB transaction behaviour follows the [Mongoose transaction documentation](https://mongoosejs.com/docs/transactions.html).

The development catalogue now includes 20 household spices with generated artwork and 100 g, 250 g, and 500 g options in the original database. Existing commercial prices and stock are preserved; added sample prices are labelled. See [household catalogue setup, backups, and size galleries](backend/docs/SAMPLE_CATALOGUE.md).

Run `npm run db:check` from `backend/` to verify the API's configured database with a read-only ping. It exits with a failure status when the connection fails and does not print credentials, list application records, or initialize models. If it reports a TLS handshake failure before authentication, check the cluster project's **Network Access → IP Access List** in Atlas and add the application's current public IP. Wait for the entry to become active, then rerun the check. Also check cluster availability and firewall/VPN access to port 27017 if the IP is already allowed. See [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). The running API retries automatically; `/api/v1/health` alone does not confirm a working database connection.

## Configuration

Copy the environment examples for a fresh checkout. Existing local environment files are retained and ignored by Git.

Frontend `frontend/.env.local`:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
```

Backend `backend/.env`:

```text
PORT=5000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
MONGODB_URI=mongodb://127.0.0.1:27018/son_masala_demo?replicaSet=sonDemo
ADMIN_MFA_ENCRYPTION_KEY=<a-unique-random-32-byte-base64-key>
STAFF_APP_ORIGIN=http://localhost:3000
ADMIN_WEBAUTHN_RP_ID=localhost
AUTH_DEV_PREVIEW=true
ENABLE_DEMO_CHECKOUT=true
DELIVERY_CHARGE_PAISE=4900
FREE_DELIVERY_THRESHOLD_PAISE=49900
```

`AUTH_DEV_PREVIEW=true` is only for the isolated local demo. Production never returns preview codes; SMTP/Twilio settings must be supplied for real delivery. Full provider and secure bootstrap settings are in `backend/.env.example` and [the access guide](backend/docs/STAFF_ACCESS.md). Never put backend credentials in `NEXT_PUBLIC_*` variables. Restart the relevant server after environment changes.

Required backend settings include `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `MONGODB_URI`, `ADMIN_MFA_ENCRYPTION_KEY`, `STAFF_APP_ORIGIN`, and `ADMIN_WEBAUTHN_RP_ID`. Configure Google OAuth, SMTP, and Twilio variables only when enabling those providers. The complete variable list and comments are maintained in `backend/.env.example`; keep credentials in the backend environment or deployment secret store.

MongoDB integration tests require `MONGODB_TEST_URI` to point to an isolated test replica set. They are skipped when that variable is absent and never fall back to the configured `MONGODB_URI`.

## Demo catalogue

Demo products are genuine MongoDB records, labelled `isDemo: true`, with canonical variant records in `productVariants`. No frontend component hardcodes the catalogue or prices.

| Product          | Hindi name      | Demo pack | Demo price |
| ---------------- | --------------- | --------- | ---------- |
| Haldi Powder     | हल्दी पाउडर     | 100 g     | ₹99        |
| Dhaniya Powder   | धनिया पाउडर     | 100 g     | ₹89        |
| Lal Mirch Powder | लाल मिर्च पाउडर | 100 g     | ₹119       |

The seed creates sample stock of 50 per variant on first creation. Re-running it does not reset stock, overwrite existing prices, or modify products marked as real. All initial MRPs equal their demo prices; no fictional discount is advertised. Offers appear only when a variant has a configured offer price.

The original three drafts in the previous local database were not changed. The new sample prices live only in the isolated demo database. Demo records are hidden by the production API, even if the demo flag is accidentally enabled. Demo seed execution is blocked for production and for database names outside the demo/test naming restriction.

## Product catalogue drafts

The backend catalogue contains 110 draft entries across whole spices, seeds and herbs, ground spices, blended masalas, and specialty spices. They have no prices, stock, sellable variants, available pack sizes, shelf-life claims, or origin claims. Blend compositions remain empty until verified manufacturing specifications are entered. Public catalogue APIs only return published products with valid prices.

Run from `backend/` to preview which products would be inserted into the database already configured by `MONGODB_URI`:

```text
npm run seed:products
```

The default is read-only and displays every proposed product/category and its insert-or-skip action. Only after approving that preview, explicitly run:

```text
npm run seed:products -- --apply
```

The approved run inserts missing products and categories only; it never updates existing products, prices, stock, or verified details. Use the staff product catalogue at `/admin/modules/products` for product/category management and CSV import/export.

The existing typographic brand mark and editorial spice photograph are retained. Three labelled illustrative demo-pack SVG assets were added; they are not presented as supplied final packaging. Replace them with approved packaging files when available. The original spice photograph is from [Unsplash](https://images.unsplash.com/photo-1596040033229-a9821ebd058d).

## Cart and accounts

- Guest carts are stored in MongoDB and identified by a random persistent HttpOnly cookie. The server stores a hash of that guest identifier.
- Customer sign-in and registration use one mobile OTP flow with SMS or approved-template WhatsApp delivery. Names support Unicode and never prove identity or overwrite an existing saved name during login. Phones normalize to E.164 and are unique.
- Customer sessions are stored server-side, with hashed opaque tokens in persistent HttpOnly cookies, production Secure flags, a 30-day inactivity limit, and a 90-day maximum lifetime. Session renewal and server-side logout/device revocation replace the previous customer JWT/password flow.
- Codes expire after five minutes, allow five incorrect guesses, and have a shared 60-second resend cooldown and six-per-hour mobile limit, plus per-IP rate limiting. Local previews are explicitly labelled and cannot authenticate in production. No email or password is required for customers.
- Guest and customer bags merge in a transaction during sign-in, capped by current stock. The guest bag is cleared only after the merge succeeds.
- Cart writes use optimistic version checks to handle concurrent updates. Prices and quantities are checked again on the backend for checkout.
- Favourites are stored in MongoDB against the authenticated customer ID. Hearts appear after login; `/wishlist` supports saved-product management and later restoration. Delivery details, session tokens, favourites, and payment information are not stored in localStorage; only the non-sensitive language preference is stored there.
- The drawer traps keyboard focus, closes on Escape, and returns focus to its opener. The dedicated cart supports quantity controls, removal, subtotal, discount, delivery preview, and grand total.
- All calculations use integer paise. The default demo delivery charge is ₹49, waived from ₹499; these are explicit demo settings.

## Demo orders and payment

Checkout progresses through shopping bag, delivery details, order review, demo payment, and confirmation. Delivery details are validated on both the browser and server.

Guest checkout is retired. Proceed to Checkout and Buy Now preserve the bag and send guests to `/login?next=%2Fcheckout`; successful customer OTP/Google authentication returns to checkout. The API requires a valid customer session and allowed Origin for preview, order creation and payment simulation. Existing customers proceed directly while their secure session remains valid.

Payment simulation is restricted by all three server-side conditions:

1. `NODE_ENV` is not `production`.
2. `ENABLE_DEMO_CHECKOUT=true`.
3. The current database name is an isolated `_demo` or `_test_` database.

Demo checkout accepts only products marked as demo. It collects no card numbers, CVVs, OTPs, banking PINs, or UPI PINs. Every payment page explicitly states that no real money will be charged.

Order creation uses an idempotency key and a MongoDB transaction to reserve stock, create the test order, and create its payment record. Payment statuses are `PENDING`, `PAID_DEMO`, `FAILED`, and `CANCELLED`; payment mode is `DEMO`. The three simulation controls save their actual result, and order access is restricted to the owning guest/customer.

Success consumes reserved stock and removes purchased quantities from the bag while retaining later additions. Failure/cancellation releases stock and keeps the bag. Reservations expire after 10 minutes; a periodic cleanup and checkout/order reads release expired reservations transactionally. Reservation records are retained with their final status rather than deleted by TTL, avoiding lost stock.

There is no shipment booking, invoice issuance, or payment-notification call in the demo flow. `paymentService.js` keeps payment lifecycle and stock changes on the backend; a future real provider can be added without replacing the delivery/review steps. Razorpay and Shiprocket are not connected.

## Reviews and moderation

The public review endpoint exposes only approved reviews for visible products. Review submission requires a signed-in customer, validates all fields, prevents duplicate reviews for the same user/product, and always starts unapproved. Approval and verified-purchase fields cannot be supplied by the customer.

Demo orders never qualify for a verified purchase badge. Only a future real paid purchase can qualify. There are no seeded testimonials in the demo storefront: the public empty state is **“Be the first to review SON MASALA.”**

The carousel refreshes reviews every 30 seconds and rotates approved reviews every 4.5 seconds. It supports arrows, indicators, touch swipes, hover/focus pausing, a pause control, and reduced-motion preferences.

To moderate reviews, complete the protected owner bootstrap, then either use the owner account or invite a staff administrator with `reviews.view` and `reviews.moderate`. Sign in through the appropriate owner/admin login and open `/admin/reviews`. Approval changes require CSRF verification and are audited. The old direct customer-to-admin promotion command is disabled; a legacy `users.role: admin` does not grant internal access.

## Owner and administration

The owner bootstrap is an interactive, protected CLI process requiring the configured deployment OS user, a setup secret, a chosen Argon2id-hashed password, and completed TOTP enrollment. A singleton plus a MongoDB unique partial index permits only one active owner. Run it only after following [the setup guide](backend/docs/STAFF_ACCESS.md); there is no public bootstrap API. Emergency MFA recovery requires deployment proof, owner password, an unused recovery code, and a new verified authenticator.

Staff use unique server-generated IDs, owner-approved 48-hour invitations, email verification, their own passwords, mandatory MFA, and separate opaque sessions in HttpOnly cookies. Owner passkeys require WebAuthn user verification. Permissions filter business dashboards and are checked before every protected API response. Only the owner may invite staff, edit access, suspend/reactivate/revoke accounts, terminate sessions, or read full audit history. Permission and status changes invalidate existing sessions immediately.

The dashboard reads actual MongoDB records for orders, payments/refunds, products, customers, inventory, product/category sales, and units sold. Data is limited to allowed modules and demo transactions are excluded from actual sales totals. Inventory and fulfillment updates and review moderation have transactional audit records. Live payment/refund processing and shipping-provider actions remain unconnected.

## REST endpoints

- `GET /products`, `GET /products/:slug`, `GET /categories`
- `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`
- `GET /wishlist`, `PUT /wishlist/:slug`, `DELETE /wishlist/:slug` (private customer session; writes require an allowed Origin)
- `POST /checkout/preview`
- `POST /demo-payments` with `action: "create"` or `action: "simulate"`
- `GET /orders/:id`
- `GET /reviews`, `POST /reviews`
- `GET /admin/reviews`, `PATCH /admin/reviews/:id`
- `GET /auth/me`, `POST /auth/logout`, `GET /auth/orders`, `POST /auth/revoke-other-sessions`
- `POST /auth/send-otp`, `POST /auth/verify-otp`, `POST /auth/resend-otp`
- `POST /auth/google/start`, `GET /auth/google/callback` (backend-only Google credentials; see the customer guide)
- `/auth/otp/request` and `/auth/otp/verify` remain mobile-only aliases; legacy customer `/auth/register` and `/auth/login` return 410.
- `POST /admin/auth/login`, `POST /admin/auth/mfa/verify`, `POST /admin/auth/logout`, `GET /admin/auth/me`
- The same four authentication endpoints under `/owner/auth`
- `GET /owner/admins`, `POST /owner/admins/invite`
- `PATCH /owner/admins/:id/permissions`, `PATCH /owner/admins/:id/status`, `POST /owner/admins/:id/revoke-sessions`
- `GET /owner/audit-logs`, `GET /owner/security`, `POST /owner/security/revoke-other-sessions`
- `GET /admin/dashboard`, `GET /owner/dashboard`, permission-filtered `/admin/{orders,products,customers,inventory,payments,analytics,shipping}`
- `PATCH /admin/inventory/:id`, `PATCH /admin/orders/:id`
- Invitation verification/enrollment/activation and WebAuthn options/verification routes are in `backend/src/routes/staff.js`.
- Existing health/readiness and newsletter endpoints are preserved.

All paths above are prefixed with `/api/v1`.

Collections: `products`, `productVariants`, `categories`, `carts`, `users`, `orders`, `payments`, `reviews`, `inventoryReservations`, and the retained `subscribers` collection. Unique indexes cover slugs, SKUs, category slugs, cart owners, emails, order request keys, payment order IDs, reservation pairs, and user/product review pairs. Legacy embedded product variants remain readable for compatibility with existing real records.

Separate staff models: `AdminAccount`, `AdminInvitation`, `AdminSession`, `AdminRole`, `AdminPermission`, `AdminAuditLog`, `AdminChallenge`, `AdminBootstrap`, and `AdminPasskey`. MFA keys are encrypted with AES-256-GCM, and OTPs, session tokens, invitation tokens, and recovery codes are stored only as hashes. Audit records have no mutation APIs and the model rejects edits/deletes.

Customer authentication adds separate `CustomerSession`, `CustomerOtp`, `CustomerAuthThrottle`, and `GoogleLoginAttempt` collections. The `Wishlist` collection uses the customer ID as its document key and saves product references with atomic duplicate prevention. A unique optional Google subject identifies Google customers; OAuth browser/state/nonce values are hashed and PKCE verifiers are encrypted. Legacy customer records, password hashes, carts, and orders are retained, but old customer JWT cookies no longer authenticate. Email-only records are not automatically linked by a submitted name, delivery phone, or Google email match. See the customer guide for handling legacy phone normalization and conflicting records.

## Verification

```text
# backend
npm test
npm run build

# frontend (both servers must be running for browser tests)
npm test
npm run test:e2e
npm run build
```

Backend tests cover MongoDB connectivity, health/CORS, demo seed safety, cart persistence/stock limits, integer-paise totals, checkout validation, idempotent order creation and settlement, all payment outcomes, expired reservations, account-cart merging, review moderation, production guards, and concurrent attempts to buy the final pack.

Security tests also cover owner uniqueness/bootstrap proof, mandatory MFA and replay prevention, invitation activation, role/permission isolation, CSRF, customer and legacy-role denial, session revocation, suspensions, owner recovery, audit persistence/immutability, phone-only OTP accounts, production preview denial, secure cookies, and rate limits. Google checks cover state/browser binding, PKCE, nonce, token signature/issuer/audience/expiry, verified email, replay and safe account identity. The browser suite verifies customer OTP and isolated Google sign-in, staff/owner separation, invitation enrollment, and actual WebAuthn registration/sign-in using a virtual authenticator, including rejection of an assertion without user verification. Live Google consent still requires configured credentials and a real account check. Results are in [backend/verification/verification.md](backend/verification/verification.md).

Browser tests use real Express and Mongoose against fresh isolated test databases for every test. They cover full-width layouts at 320, 390, 768, 1024, 1440, and 1920 pixels, prices, the cart drawer/counter/quantity/removal/persistence, all three payment paths and order reloads, account registration/sign-in, wishlist, moderation and carousel controls, catalogue errors, and normal-flow browser console errors. Test-only reviews and orders are never inserted into the visible demo store. Each fixture drops only its own uniquely named test database afterward.

`MONGODB_TEST_URI` can explicitly select a transaction-capable test server. Otherwise tests use the configured local replica set with unique `son_masala_test_*` database names. Playwright uses installed Chrome. Images and confirmation screenshots are in `backend/verification/`.

Frontend production: `npm run build`, then `npm start` on port 3000. Backend production: `npm start`; its build performs JavaScript syntax checks. Development and production Next.js caches are separate. Build guards reject a duplicate `frontend/app`, application TypeScript, or `tsconfig.json` so the intended `frontend/src/app` routes cannot be shadowed.

## Deployment

Deploy the frontend and backend as separate Node.js services. Build and start the frontend with `npm run build` and `npm start` from `frontend/`; build and start the API with `npm run build` and `npm start` from `backend/`. Configure `NEXT_PUBLIC_API_BASE_URL` to the public API base URL and set backend `CORS_ORIGINS`, `STAFF_APP_ORIGIN`, and `GOOGLE_REDIRECT_URI` to the production HTTPS origins. Use a transaction-capable MongoDB Atlas deployment, restrict database network access, and store backend credentials in the host's secret manager. Set `NODE_ENV=production`, keep `ENABLE_DEMO_CHECKOUT=false` and `AUTH_DEV_PREVIEW=false`, configure the MFA encryption key and provider credentials, then complete the protected owner bootstrap on the deployment host. Verify `/api/v1/health` and `/api/v1/ready` after rollout. Real payment and shipping integrations are not included in this demo.

## Main files changed

- Frontend pages: `src/app/page.jsx`, `layout.jsx` (retained), `globals.css`, cart, checkout, account, orders, about, admin reviews, and policies.
- Frontend components: header/footer, product cards/grid/detail, homepage catalogue, cart provider/drawer/contents, checkout, order confirmation, account, review form/moderation/slider, and saved products.
- Shared frontend code: `src/lib/api.js`, `catalog.js`, `hooks/useProducts.js`, Playwright configuration/tests, package scripts, and illustrative SVG packaging.
- Backend: product/category/variant/user/cart/order/payment/review/reservation models, auth/cart/checkout/review controllers, product/cart/payment services, session/role/demo guards, validators, routes, model initialization, configuration, and reservation cleanup.
- Scripts/tests: isolated replica-set setup, idempotent demo seed, protected owner bootstrap/recovery, real database/browser fixtures, security/transaction/money tests, environment examples, access guide, README, and verification report.
- Login update: `CustomerOtpLogin.jsx`, `customer-auth.css`, `customer-auth.js`, original `public/images/google-g.svg`, Google auth controller/service/attempt model, Google identity index, server routes/configuration/logging, `google-auth-library`, and isolated Google security/browser fixtures. Google-only accounts display their email as the account contact when no mobile is saved.
- Localized shopping: locale provider/text/attribute boundaries, Hindi/English dictionaries and toggle, self-hosted Devanagari font, localized public/staff pages, MongoDB wishlist model/controller/APIs, account-backed store state, authenticated checkout redirects/guards, and language/private-shopping regression tests. See [backend/docs/LOCALIZED_SHOPPING.md](backend/docs/LOCALIZED_SHOPPING.md).

The shared readable typography, local Inter/Devanagari fonts, icon sizing, touch targets and responsive staff tables are documented in [backend/docs/root-guides/UI_READABILITY.md](backend/docs/root-guides/UI_READABILITY.md).

Wholesale, distributor operations, live payments/shipping, product administration, and marketing delivery remain required project scope for subsequent work. Sample contact details remain explicitly labelled as requested earlier.
#   S O N  
 #   S O N  
 