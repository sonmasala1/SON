# SON MASALA authentication and stability review

Reviewed 29 October 2026. Changes are local; no deployment or production database migration was performed. Existing catalogue changes in `productService.js`, `ProductCard.jsx`, `package.json`, and the variant-reference reconciliation script were present before this work and were preserved.

## Confirmed causes and implemented changes

| Finding | Resolution / evidence |
| --- | --- |
| Render rejects localhost with 403 and no CORS headers | The `cors` origin callback in `backend/src/app.js` rejects it before routing, authentication, or CSRF. The configured allowlist contains only Vercel. Set the Render allowlist below. Vercel-origin health, readiness, products, cart, and session requests returned 200; its Google preflight returned 204. All six localhost probes returned 403. |
| Fixed staff MFA bypass | Removed acceptance of a fixed code and `ADMIN_MFA_CODE` from `staffAuthService.js`. TOTP verification, step replay protection, recovery codes, lockout, and password hashing remain required. Removed the prefilled code and credential hints from `StaffLogin.jsx`. |
| Development staff password bypasses | Removed hardcoded and environment-password fallback comparisons. Every environment must verify the account's Argon2 password hash. |
| Google silently attached a subject to a matching email | Matching-email collisions now return `account_link_required`. Existing subject-based login remains supported. No automatic linking or duplicate account creation. |
| Email flow always required name; mobile was absent | Email is the default login method. Returning customers enter only email. New customers select account creation and enter name, +91 mobile, and email. An email-only new customer can supply the missing profile after proving email ownership. |
| Unverified contacts could be conflated with verified identities | Email registration stores mobile in `pendingPhone`; it never sets verified `phone`. Matching unverified legacy emails or non-customer roles require an account review. Existing verified customer profiles are preserved. |
| Concurrent guesses could overrun the OTP attempt budget | Attempts are reserved atomically before checking the keyed hash. Single-use consumption and account/session/cart operations remain transactional. Five attempts, five-minute expiry, one-minute resend cooldown, persistent email throttles, and IP rate limiting are enforced. |
| Session responses could be cached | `/auth/me` now runs after the no-store middleware; cart, wishlist, checkout, and order responses also receive no-store. |
| Direct Render cookies depend on browser third-party-cookie policy | Added an optional same-origin Next.js API rewrite. Recommended deployment uses it with Secure/HttpOnly cookies, customer SameSite=Lax and staff SameSite=Strict. Origin and staff CSRF checks remain enabled. |
| Render could fail port detection during a database outage | HTTP binds to `0.0.0.0:PORT` before asynchronous database initialization. Liveness stays available; readiness and database-dependent routes return legitimate 503 responses until initialization completes. |
| Model initialization and readiness disagreed | Readiness now recognizes completed initialization on the current MongoDB database object, including independently initialized integration fixtures. |
| Test setup assigned production-owned images to synthetic product IDs | Demo fixtures now use neutral UI placeholders, preserving the production image ownership checks. No production images or product records were changed. |
| `npm test` sent a real email | Restricted Node test discovery to `test/*.test.js`. The separate SMTP diagnostic is no longer included in routine tests. The first run authenticated successfully and sent one test email to the configured sender's inbox. It does not prove inbox placement or the complete live login flow. |
| Duplicate cart/session fetches | Cart already returns the customer. The frontend now requests `/auth/me` only if cart loading fails. |

Email delivery continues to use Nodemailer with TLS required and STARTTLS on port 587, the existing SMTP settings, cryptographic six-digit codes, and keyed hashes only in MongoDB. Delivery failures return 503 and mark challenges failed. Email test transport injection is accepted only in `nodeEnv=test`, with no production OTP preview. Existing mobile OTP and English/Hindi shopping remain supported.

## Read-only Atlas and live API verification

The configured Atlas database `son_masala` responded to ping. It contains 27 products, 46 canonical variants, and the expected products/categories/productVariants collections. Audit results: 17 published products; 12 demo/sample products; zero duplicate slug groups; zero missing Hindi names; zero unknown categories; zero missing variant references; zero orphan variants; zero nonpositive canonical prices. Sample/demo data is not evidence of verified sellable inventory.

The staff collection contains one ACTIVE OWNER and one ACTIVE ADMIN, both with MFA enabled. Missing accounts therefore do not explain this database's reported login 401. Actual production password correctness, enrollment, authenticator clock, account lockout, and the deployed revision were not validated by attempting production login. Legitimate incorrect credentials continue to return 401.

Run the repeatable read-only audit from `backend/`:

```powershell
npm run db:check
node scripts/audit-store.mjs
```

`frontend/public/images/demo-products/` is absent in this checkout. The existing product-specific image manifest under `backend/src/data/productImageManifest.json` refers to local `/images/products/` assets. No unrelated images, fabricated prices, stock, or manufacturing claims were introduced. Replacing real product media requires the matching approved assets and a reviewed migration.

## Validation

Final results are recorded below after the verification run. Isolated integration tests use temporary `son_masala_test_*` databases on a local replica set and delete only their own temporary database. Browser fixtures generate their own staff credentials and intercept email/Google delivery locally. No fake production customers or orders were created. The live GET /cart diagnostic may create an empty anonymous cart through the existing API implementation; no production cart cleanup or other migration was attempted.

- Backend integration/unit suite: 115 passed, 0 failed, 0 skipped.
- Frontend unit suite: 19 passed, 0 failed.
- Backend syntax build and ESLint: passed.
- Frontend production build with the API proxy enabled: passed (30 generated pages).
- Frontend ESLint: passed.
- Actual HTTP proxy to Render health: 200/success=true.
- Startup with unreachable MongoDB: HTTP bound successfully; health=200, readiness=503, products=503, as required.
- Browser validation: 52 distinct cases passed across runs. The initial complete run had 46 passes and 5 fixture failures; all 5 passed after correcting old Hindi form assertions and the isolated passkey RP ID. A final targeted run passed 9/9 cases, including one additional Hindi email verification case and the changed email UI at mobile/tablet/desktop widths. The whole suite was not rerun after these targeted fixes.
- Explicit CORS preflight checks for cart, auth/me, products, and Google start passed for both approved origins; untrusted origins remain rejected.
- Actual Gmail SMTP authentication and server acceptance: passed during the initial diagnostic; complete live OTP inbox delivery and live Google consent remain deployment acceptance checks.

Reproduce the isolated backend checks:

```powershell
# From backend/. Does not modify .env or point tests at Atlas.
node scripts/setup-demo-db.js
$env:NODE_ENV='test'
$env:SESSION_CROSS_SITE_COOKIES='false'
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=sonDemo'
npm test
npm run lint
npm run build
```

The setup helper needs a locally installed `mongod`. Without `MONGODB_TEST_URI`, database tests explicitly skip; a skipped run must not be reported as full verification.

Browser checks use a separate frontend production build on port 3100, with `NEXT_PUBLIC_API_PROXY=true` at build time. Start it using `npx next start -p 3100`; then from another terminal in `frontend/`:

```powershell
$env:NODE_ENV='test'
$env:E2E_BASE_URL='http://localhost:3100'
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/?replicaSet=sonDemo'
npx playwright test --workers=2
```

## Exact deployment settings

Recommended production configuration uses Vercel as the browser-facing API origin. Apply frontend, backend, and Google redirect changes as a coordinated release. Public API base/proxy settings are build-time variables; rebuild Vercel after changing them.

Render: root `backend`, build `npm ci && npm run build`, start `npm start`, health path `/api/v1/health`, Node 22 or later. Render supplies `PORT`; do not hardcode a public port.

```dotenv
NODE_ENV=production
MONGODB_DB_NAME=son_masala
CORS_ORIGINS=http://localhost:3000,https://son-dusky.vercel.app
ENABLE_DEMO_CHECKOUT=false
AUTH_DEV_PREVIEW=false
SESSION_CROSS_SITE_COOKIES=false
STAFF_APP_ORIGIN=https://son-dusky.vercel.app
ADMIN_WEBAUTHN_RP_ID=son-dusky.vercel.app
GOOGLE_REDIRECT_URI=https://son-dusky.vercel.app/api/v1/auth/google/callback
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

Keep the valid private `MONGODB_URI`, `ADMIN_MFA_ENCRYPTION_KEY`, `SMTP_USER`, `SMTP_PASSWORD` (Gmail app password), `SMTP_FROM`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in Render's secret environment. Preserve the existing 32-byte base64 encryption key; replacing it invalidates encrypted MFA/OAuth material and OTP hashes. No customer JWT secret is needed by the opaque, hashed session implementation. Remove obsolete `ADMIN_MFA_CODE`; it has no effect after this change. The real payment provider remains unconfigured; production demo checkout stays disabled.

Vercel: root `frontend`, build `npm run build`, install `npm ci`, Production scope:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://son-5wk9.onrender.com/api/v1
NEXT_PUBLIC_API_PROXY=true
```

Register **`https://son-dusky.vercel.app/api/v1/auth/google/callback`** as an exact authorized redirect in the production Google Cloud Web OAuth client. Keep the current Render callback registered during the coordinated transition if needed. Google secrets stay exclusively in Render. With the same-origin proxy enabled, the OAuth browser-binding cookie belongs to Vercel, so the callback must return through Vercel too. Using the old Render callback with Vercel-set cookies will fail state validation and must not be worked around by removing that check.

Use a separate development OAuth client with `http://localhost:5000/api/v1/auth/google/callback`, `STAFF_APP_ORIGIN=http://localhost:3000`, `ADMIN_WEBAUTHN_RP_ID=localhost`, `NODE_ENV=development`, and a local frontend API base of `http://localhost:5000/api/v1`, `NEXT_PUBLIC_API_PROXY=false`. If proxying development requests instead, register `http://localhost:3000/api/v1/auth/google/callback` and set the backend callback to match. Testing against production Render uses the production identity configuration and production records; do not use synthetic identities there.

Direct cross-site clients can explicitly set `SESSION_CROSS_SITE_COOKIES=true` for SameSite=None cookies, always Secure in production, but this remains subject to browser third-party-cookie blocking. The recommended proxy configuration avoids that dependency and preserves stronger same-site defaults.

## Owner procedure and release acceptance

An owner already exists in the audited database. Do not create another or reset credentials to resolve a legitimate 401. Use the correct realm, stored staff ID/password, and a fresh authenticator code. Owner-controlled invitations remain required for new staff. If an independently provisioned database has no owner, follow `backend/docs/STAFF_ACCESS.md`: configure protected OS identity and a setup-secret SHA-256 digest, run interactive `npm run owner:bootstrap`, enroll MFA, save recovery codes offline, and remove the bootstrap secret hash after completion. No default credentials or MFA bypass exist.

Before deploying, take an approved backup and review existing indexes/duplicate customer identities in staging. Application startup already initializes model collections/indexes and staff permissions; this patch does not perform an offline production migration. No production migration was run here.

After approval, deploy the reviewed commit to Render and Vercel with the coordinated Google/environment changes. Check `/api/v1/ready`, public product/category/search responses, localhost/Vercel preflight headers, and rejection of an untrusted origin. Confirm session responses carry no-store. With an authorized real test identity, verify Gmail inbox delivery, resend cooldown, Google consent/state/return-to-checkout, refresh/logout persistence, guest bag transfer, wishlist privacy, order history, and owner/admin MFA. Check browser cookie storage with third-party cookies blocked. Do not create fake production orders or enable demo payment.

No Vercel/Render account access or deployment approval was supplied. Hosted settings, live Google client redirect registrations, deployed revision, and post-release behavior remain external acceptance items. Existing production errors are not claimed fixed until the reviewed code and configuration are deployed and rechecked.

## Git review and push

Review both these changes and the catalogue edits that were already present. Do not commit `.env`, `.runtime`, screenshots, or test credentials.

```powershell
git status --short
git diff --check
git diff
git add .gitignore backend frontend
git diff --cached --stat
git diff --cached
git commit -m "Fix customer email login and remove staff authentication bypasses"
git push origin HEAD
```

Run the push only after approving deployment: a connected Git branch may automatically trigger hosting releases. No commit, push, or deploy was performed here.

## Files changed

The implementation touches backend application/environment/database/model initialization; email OTP controller/models/service/delivery; customer, guest, Google, and staff cookie/session code; staff password/MFA verification; route cache headers and startup; test discovery and isolated browser/demo fixtures; read-only audit script and regression tests; frontend login/MFA forms, shared API/proxy configuration, cart session loading, translations, styles, browser tests, environment examples, and this report. An exact file list follows.

- `.gitignore`
- `README.md`
- `backend/.env.example`
- `backend/docs/IMPLEMENTATION_REPORT.md`
- `backend/package.json`
- `backend/scripts/audit-store.mjs`
- `backend/scripts/browser-fixture.js`
- `backend/scripts/reconcile-product-variant-references.js`
- `backend/scripts/seed-demo.js`
- `backend/src/app.js`
- `backend/src/config/db.js`
- `backend/src/config/env.js`
- `backend/src/config/models.js`
- `backend/src/controllers/emailOtpController.js`
- `backend/src/middleware/session.js`
- `backend/src/middleware/staffAccess.js`
- `backend/src/models/User.js`
- `backend/src/models/emailAuthentication.js`
- `backend/src/routes/index.js`
- `backend/src/server.js`
- `backend/src/services/customerSessionService.js`
- `backend/src/services/emailOtpService.js`
- `backend/src/services/emailService.js`
- `backend/src/services/googleAuthService.js`
- `backend/src/services/productService.js`
- `backend/src/services/staffAuthService.js`
- `backend/test/email-auth.test.js`
- `backend/test/google-auth.test.js`
- `backend/test/health.test.js`
- `backend/test/staff-security.test.js`
- `frontend/.env.example`
- `frontend/e2e/customer-auth.spec.js`
- `frontend/e2e/email-auth.spec.js`
- `frontend/e2e/fixtures.js`
- `frontend/e2e/google-auth.spec.js`
- `frontend/e2e/localized-shopping.spec.js`
- `frontend/e2e/readability.spec.js`
- `frontend/next.config.js`
- `frontend/src/app/customer-auth.css`
- `frontend/src/components/CustomerOtpLogin.jsx`
- `frontend/src/components/ProductCard.jsx`
- `frontend/src/components/StoreProvider.jsx`
- `frontend/src/components/staff/StaffLogin.jsx`
- `frontend/src/lib/api.js`
- `frontend/src/lib/api.test.js`
- `frontend/src/lib/customer-auth.js`
- `frontend/src/lib/i18n.js`
- `frontend/src/lib/messages.js`
