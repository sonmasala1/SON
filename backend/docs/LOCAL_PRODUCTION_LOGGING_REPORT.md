# Local/production routing, authentication and logging report

30 October 2026. Work is local. No deployment, default account creation, credential reset, product-price update, stock update, or production data deletion was performed. Earlier unrelated working-tree changes were retained.

## Confirmed root causes and resolutions

| Finding | Resolution |
| --- | --- |
| `frontend/.env` sent development traffic to Render | Removed the hosted URL from that file. `frontend/.env.local` now selects `http://localhost:5000/api/v1`. A shared configuration validator rejects remote APIs in development and requires an explicit HTTPS API URL for production builds. There is no silent hosted fallback. |
| The local backend inherited `NODE_ENV=production`, a Vercel-only CORS allowlist, and a Render Google callback | Added ignored local overrides: development cookies, localhost origins, localhost WebAuthn RP/origin, and the local Google callback. Render/process-provided production settings take precedence and do not load these overrides. Existing database and authentication secrets were retained. |
| This machine's default DNS resolver refuses Atlas SRV queries | Verified `ECONNREFUSED` with the system resolver and successful three-record responses with both tested alternatives. Added optional validated `MONGODB_DNS_SERVERS`; the local override uses the verified alternatives. Production no longer has a hardcoded global DNS override. The existing Atlas database subsequently passed the read-only audit and local API readiness. |
| Morgan ran after CORS and printed some raw query strings | Replaced it with JSON request logging before CORS/body parsing. Requests, OPTIONS, CORS failures, exceptions, and aborted responses are recorded once with a UUID, route template, method, status, duration, level and operation. Query strings and dynamic parameter values are omitted. |
| Frontend/backend errors lacked a shared support reference | The API client sends `X-Request-ID`; Express validates or replaces it, returns it on every response, and exposes it through CORS. API errors retain the reference. Customer/staff forms display a support reference. Google failures carry a safe request ID through their return redirect. |
| Staff CSV export bypassed the configured browser proxy | CSV export now uses the same API URL resolver and sends a request ID. |
| Catalogue price sorting compared embedded rupees with canonical paise | Normalize the sorting expression to paise, matching the customer-facing hydrated values. Unpriced records sort last. Sample/inactive variants do not determine production prices. |
| Approved-draft browsing bypassed the production sample exclusion | Applied the sample exclusion to both browsing branches. Approved unpriced products remain browseable without becoming purchasable. |
| An inactive canonical variant could fall back to stale embedded price/stock | Canonical records remain authoritative even when none is currently active. Such products expose no purchasable variant. No stock or price was invented. |
| Concurrent mobile-code guesses could exceed the attempt budget | Mobile verification now reserves attempts atomically, like email verification, and remains single-use with five-minute expiry. |

The prior premium forest-green/cream split design, local spice imagery, Create Account/Login tabs, email OTP screens, mobile OTP alternative and Google buttons were retained. Supporting text and icon targets were increased to satisfy the existing readability checks. No reference attachment was available beyond the written design brief.

The earlier duplicate-email fix remains in place: synchronous frontend locks, durable MongoDB idempotency, per-email transactional cooldown, IP rate limiting, encrypted replay responses, and single-use OTP consumption. Successful registration creates the existing customer session directly. Regression tests verify one dispatch for concurrent requests/retries and one frontend request for rapid submissions; they verify no second OTP is requested to log in. The current checkout did not reproduce a two-email dispatch after those earlier fixes. SMTP itself cannot guarantee exactly-once inbox delivery, so uncertain dispatches are never automatically repeated under the same key.

## Logging behavior

Logs are newline-delimited JSON on stdout, visible in the PowerShell process running `npm run dev` and, after an approved deployment, the Render service's runtime log stream. Levels are `INFO`, `WARN`, and `ERROR`, with lowercase `severity` metadata. No new logging dependency or account is required.

| Coverage | Records |
| --- | --- |
| All API requests, preflights, failures, aborts | One `api.request` or `api.aborted` summary; operation identifies products, carts, checkout, orders, customer/staff auth, OTP and Google endpoints |
| Registration/login | `customer.authentication.succeeded` after transaction commit; `authAction` distinguishes registration from returning login |
| Logout | Request summary with `customer.logout` or staff auth/logout operation and actual status |
| Customer sessions | `customer.session.rejected` with an allowlisted reason; protected-request failures also retain their actual status |
| OTP request, verification, resend | Request operation/status; `otp.dispatch.succeeded`/`failed` identifies actual SMTP, SMS, WhatsApp or isolated test transport; idempotent replays/pending claims have separate events |
| Google | Start/callback operation; callback failures carry an allowlisted reason even though the HTTP response redirects |
| Admin/owner/MFA | Realm-specific operation/status; failures distinguish credential/account rejection, invalid/replayed MFA and CSRF. Existing private MongoDB audit records remain enabled. |
| MongoDB | Connection/reconnection/disconnection and deduplicated error events; safe classifications identify DNS, TLS, authentication, network or index/configuration failures |
| CORS/CSRF | `cors_origin_rejected`, `csrf_origin_rejected`, or `csrf_token_rejected` on the request summary |
| Unhandled server failures | Sanitized `server.exception` event and nonzero process exit; startup/bind errors also use structured events |

Logging uses allowlisted fields and reason codes. It never serializes request bodies, cookies, headers, authorization URLs, identity fields, OTPs, passwords, tokens, provider responses, raw error messages or raw stacks. Successful authentication events occur outside retriable database transactions. Each response records its summary once; repeated database connection errors are deduplicated. Every API request is intentionally retained, including health checks.

Operational diagnosis uses request IDs and safe reason codes. Expected invalid credentials still return 401; security was not weakened to make failures appear successful. Cart mutations now enforce the same allowed-origin CSRF check as other customer mutations. Argon2 passwords, MFA, passkeys, permissions, secure production cookies and session ownership remain enforced.

## Actual verification

| Check | Result |
| --- | --- |
| Backend unit/integration suite on isolated replica set | 123 passed; zero failed/skipped |
| Frontend unit tests | 23 passed |
| Backend syntax check and ESLint | Passed |
| Frontend ESLint | Passed |
| Production build with explicit Render URL and same-origin proxy | Passed |
| Full browser suite | 54 passed, zero failed; includes English/Hindi layouts through 1920px, OTP, Google, cart/checkout, prices, images, staff/MFA and passkeys; see `artifacts/stability-browser-tests.log` |
| Local browser at `localhost:3000/login` | Actual cart/session request reached `localhost:5000`, returned 200, and matched the terminal log ID `07e73dc9-93bf-449a-81dc-a927524b2b1a`; no Render request was observed |
| Local health, readiness, product GETs | 200 with matching `X-Request-ID` values in responses and live terminal logs |
| Local email OTP OPTIONS preflight | 204, credentialed localhost CORS and correlation headers |
| Live Render health/readiness/product GETs | 200 for the existing Vercel origin. The currently deployed service does not yet return the new request-ID header. |
| SMTP authentication/TLS verification | Passed using existing settings; no email was sent by this diagnostic |
| Real local Google start | Reached `accounts.google.com` sign-in; no redirect mismatch/access-blocked error was observed. No external Google account was signed in. |
| Read-only existing database audit | 27 products, 46 canonical variants, 17 published; no duplicate slugs, orphan variants, missing variant references, unknown categories or nonpositive canonical prices |
| Live catalogue asset check against checkout | All 70 local asset references from 27 browseable products exist; no missing/external assets |
| Staff account audit | One active admin and one active owner, both with MFA enabled. Missing staff accounts are not the cause of this database's reported 401. No real credentials or MFA factors were changed. |

Privacy tests submit sensitive sentinel values in bodies/headers/queries/errors and assert that logs omit them. They verify one request summary per response, safe dynamic routes, request-ID validation, exposed CORS headers, INFO/WARN/ERROR classification, and credential/OTP/session privacy during real Express/MongoDB authentication tests. Google, customer session, cart, checkout, staff MFA, passkey and permission tests use temporary isolated databases and test-only transport/provider adapters.

The existing Atlas catalogue was audited read-only. Normal local startup initializes the existing schema/indexes; the real browser session check used the normal anonymous cart endpoint. No real account was created and no real OTP email was sent during acceptance checks.

## Environment changes and startup

Local files are ignored by Git. They contain routing/origin settings only; existing backend secrets/database settings remain in `backend/.env`.

`frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_PROXY=false
```

`backend/.env.local`:

```dotenv
NODE_ENV=development
PORT=5000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
STAFF_APP_ORIGIN=http://localhost:3000
ADMIN_WEBAUTHN_RP_ID=localhost
SESSION_CROSS_SITE_COOKIES=false
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
AUTH_DEV_PREVIEW=false
ENABLE_DEMO_CHECKOUT=false
MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8
```

Run the existing `npm run dev` in each project's directory. The local backend was restarted on port 5000 with these overrides, and the existing frontend on port 3000 was verified. Avoid launching duplicate processes on those ports. A shell-level `NODE_ENV=production` intentionally bypasses backend local overrides; remove that shell override when running development.

Vercel project settings, Production and the intended Preview environment:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://son-5wk9.onrender.com/api/v1
NEXT_PUBLIC_API_PROXY=true
```

Set project root to `frontend`, use the existing Next.js build, and build after environment changes. Public variables are embedded into the bundle. A local production build requires explicitly setting the same production URL in the shell; `.env.local` intentionally contains localhost and must not be used as a production target.

Render service environment, for the recommended same-origin proxy setup:

```dotenv
NODE_ENV=production
CORS_ORIGINS=https://son-dusky.vercel.app
STAFF_APP_ORIGIN=https://son-dusky.vercel.app
ADMIN_WEBAUTHN_RP_ID=son-dusky.vercel.app
SESSION_CROSS_SITE_COOKIES=false
GOOGLE_REDIRECT_URI=https://son-dusky.vercel.app/api/v1/auth/google/callback
AUTH_DEV_PREVIEW=false
ENABLE_DEMO_CHECKOUT=false
```

Keep the existing `MONGODB_URI`, `MONGODB_DB_NAME`, `ADMIN_MFA_ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Use the existing key; do not rotate it for this change. Leave Render's DNS override unset unless its resolver actually fails. Render project root is `backend`; use the existing dependency installation/build scripts and `npm start`. The server binds to `0.0.0.0:PORT` and maintains database readiness separately from liveness.

Register both exact Google callback URIs in the Google Web OAuth client:

- Local direct API: `http://localhost:5000/api/v1/auth/google/callback`.
- Production through the Vercel proxy: `https://son-dusky.vercel.app/api/v1/auth/google/callback`.

If retaining direct production browser requests instead of the proxy, use the Render callback and `SESSION_CROSS_SITE_COOKIES=true`; browser third-party-cookie policies can still interfere. The proxy keeps session cookies and OAuth callback on the same browser-visible host. Never mix proxy-start cookies with a direct backend callback.

## Remaining deployment acceptance checks

No Vercel/Render settings or code were published. Dashboard log access is not available in this workspace, so the new production JSON log stream cannot be confirmed until an approved deployment. Live API responses still lack the new request-ID header. Render captures application stdout in its runtime Logs view; after deployment, use Live tail and search for a request ID from a real frontend Network response.

Real Google consent/callback completion and OTP inbox placement remain account-controlled acceptance checks. SMTP authentication and real Google start passed; full authentication behavior passed against isolated provider/delivery fixtures. Real staff credential correctness, authenticator clock/enrollment and account lockout cannot be established without an authorized sign-in using those factors. There is no password reset, MFA bypass or default admin workaround.

No supplied evidence establishes a different correct price, stock count or product photograph. Existing values/assets were preserved; the fixed selection/sorting rules use that data. Production checkout/payment behavior outside the existing implemented system was not invented.

## Files modified in this follow-up

```text
README.md
frontend/.env                         (ignored local file)
frontend/.env.local                   (ignored local file)
frontend/.env.example
frontend/config/api-base.js
frontend/next.config.js
frontend/src/lib/api.js
frontend/src/lib/api.test.js
frontend/src/lib/api-config.test.js
frontend/src/lib/messages.js
frontend/src/app/customer-auth.css
frontend/src/components/CustomerOtpLogin.jsx
frontend/src/components/staff/StaffLogin.jsx
frontend/src/components/staff/ProductManagement.jsx
frontend/e2e/catalog.spec.js
backend/.env.local                    (ignored local file)
backend/.env.example
backend/src/app.js
backend/src/config/env.js
backend/src/config/db.js
backend/src/server.js
backend/src/services/logger.js
backend/src/services/authDelivery.js
backend/src/services/emailService.js
backend/src/services/emailOtpService.js
backend/src/services/customerOtpService.js
backend/src/services/customerSessionService.js
backend/src/services/googleAuthService.js
backend/src/services/staffAuthService.js
backend/src/services/productService.js
backend/src/controllers/customerOtpController.js
backend/src/controllers/emailOtpController.js
backend/src/controllers/googleAuthController.js
backend/src/middleware/errorHandler.js
backend/src/middleware/staffAccess.js
backend/src/routes/index.js
backend/test/logging.test.js
backend/test/catalogue-availability.test.js
backend/test/email-auth.test.js
backend/test/staff-security.test.js
backend/test/products.test.js
backend/test/google-auth.test.js
backend/docs/LOCAL_PRODUCTION_LOGGING_REPORT.md
```

Artifacts: `artifacts/stability-backend-tests.log`, `artifacts/stability-browser-tests.log`, `artifacts/stability-frontend-build.log`, and `artifacts/stability-local-login.png`. Test helpers clean up only their own temporary databases on the isolated port-27018 replica set.

References: [Render runtime logs](https://render.com/docs/logging), [Vercel environment settings](https://vercel.com/docs/environment-variables), [Next.js 13 environment loading and build-time public variables](https://nextjs.org/docs/13/app/building-your-application/configuring/environment-variables).
