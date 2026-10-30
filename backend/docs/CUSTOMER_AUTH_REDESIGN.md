# Customer authentication redesign

The `/login` page now has a forest green and gold brand panel, local Indian-spice photography, a cream form card, Create Account/Login tabs, and a separate six-digit email verification step. Small screens use one column. Existing mobile sign-in remains available. New interface text is translated into Hindi.

Registration collects name, +91 mobile number and email. Email verification creates the customer and its existing HttpOnly session in one transaction and merges the guest cart. The mobile number remains an unverified profile contact. Login accepts email only. No extra OTP is requested after registration. Owner/admin authentication and existing records are untouched.

No reference attachment was available to inspect; styling follows the supplied written brief and uses `frontend/public/images/spices.jpg` and the local Google SVG. No external images, new dependencies, TypeScript, or authentication stubs were added.

## Duplicate email prevention

- A synchronous React ref blocks repeated submit/resend events before React renders disabled buttons.
- Each email action has a random `Idempotency-Key`. Timeouts and in-progress retries retain that key.
- MongoDB's new `emaildispatches` collection atomically claims the key across API workers. The request fingerprint binds it to the endpoint and validated payload. Completed retries replay an encrypted response without SMTP dispatch, including resend retries after the old challenge has been superseded.
- Pending or failed claims never dispatch again under the same key. Pending duplicates return 409 with a short Retry-After; failed claims preserve the error. Records expire after 24 hours. A server crash during an uncertain dispatch does not automatically retry SMTP.
- The existing transactional per-email cooldown also blocks concurrent actions with different keys or older clients without an idempotency header.
- Verification consumes the challenge once; successful registration directly returns a customer session. Delivery failures now show a clear email-specific error.

The application invokes SMTP once per accepted action. SMTP does not provide an end-to-end exactly-once delivery guarantee; the application deliberately does not automatically redispatch uncertain deliveries.

## Environment

Keep existing secrets, database names, and session settings. The new collection and TTL index are initialized by the existing model startup; no customer-data migration or reseeding is required. MongoDB must support transactions (replica set or Atlas).

Backend variables:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Existing MongoDB replica-set connection and database |
| `ADMIN_MFA_ENCRYPTION_KEY` | Existing 32-byte base64 key; also protects customer OTP hashes and encrypted dispatch responses. Do not rotate it for this change. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Real email delivery; port 587 uses STARTTLS, port 465 uses TLS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web OAuth credentials |
| `GOOGLE_REDIRECT_URI` | Exact authorized callback URI ending `/api/v1/auth/google/callback` |
| `CORS_ORIGINS` | Comma-separated exact frontend origins without trailing slashes; credentials stay enabled |
| `STAFF_APP_ORIGIN` | Existing frontend origin, also used for the customer OAuth return destination; preserve the staff origin configuration |
| `SESSION_CROSS_SITE_COOKIES` | Existing direct cross-site setup needs `true` with HTTPS; same-origin proxy normally uses `false` |

Frontend variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL including `/api/v1`; local example `http://localhost:5000/api/v1` |
| `NEXT_PUBLIC_API_PROXY` | Set `true` to send browser API requests through the existing Next.js rewrite |
| `NEXT_DIST_DIR` | Optional separate output directory for concurrent local verification; defaults remain unchanged |

The existing frontend `.env` points to the hosted API. Override `NEXT_PUBLIC_API_BASE_URL` for local development and restart Next.js. Public Next.js variables are embedded at build time.

For a same-origin proxy deployment, register the **frontend** callback URL in Google Cloud and set `GOOGLE_REDIRECT_URI` to that URL. For direct API requests, use the **backend** callback URL. The flow cookie and callback must share their browser-visible host. Never mix proxy-start requests with a direct backend callback. Allowlisted credentialed CORS supports the idempotency header; preflight coverage verifies this. CORS now exposes `Retry-After` so cross-origin clients can obey OTP cooldowns and retain in-progress action keys.

## Modified files for this task

Existing unrelated working-tree changes were preserved. This task edited:

```text
backend/src/config/models.js
backend/src/app.js
backend/src/controllers/emailOtpController.js
backend/src/models/emailAuthentication.js
backend/src/services/emailOtpService.js
backend/src/services/emailService.js
backend/src/services/googleAuthService.js
backend/test/email-auth.test.js
backend/test/health.test.js
frontend/next.config.js
frontend/src/app/customer-auth.css
frontend/src/components/CustomerOtpLogin.jsx
frontend/src/lib/customer-auth.js
frontend/src/lib/messages.js
frontend/e2e/customer-auth.spec.js
frontend/e2e/email-auth.spec.js
frontend/e2e/google-auth.spec.js
backend/docs/CUSTOMER_AUTH_REDESIGN.md
```

## Verification

All integration/browser checks use temporary databases on the isolated local replica set at port 27018. The existing database on port 27017 was not changed. Real external SMTP delivery and live Google consent require the deployment credentials; tests exercise the real Express/MongoDB/session flow with isolated delivery/provider adapters only in test mode.

- Frontend unit tests: 19 passed.
- Backend suite: 118 passed, none skipped. Email-specific suite was rerun after improving delivery errors: 11 passed.
- Backend JavaScript syntax check: passed.
- Next.js production build: passed.
- Browser verification: 26 passed across email registration/login, repeated submissions, expiry/resend, Hindi localization, responsive layouts, Google OAuth, cart/session persistence, and unchanged staff/owner authentication. See `artifacts/auth-browser-tests.log`.
- Screenshots: `artifacts/customer-registration-{width}.png`, `artifacts/customer-email-verification-{width}.png`.

Reproduce from the respective directories in PowerShell:

```powershell
# backend
$env:NODE_ENV = 'test'
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27018/?replicaSet=sonDemo'
npm test
npm run build

# frontend unit/build checks
npm test
npm run build

# Separate frontend preview; keep this process running for browser checks.
$env:NODE_ENV = 'development'
$env:NEXT_PUBLIC_API_BASE_URL = 'http://localhost:5000/api/v1'
$env:NEXT_PUBLIC_API_PROXY = 'false'
$env:NEXT_DIST_DIR = '.runtime/auth-preview'
node node_modules/next/dist/bin/next dev -p 3001

# In another frontend terminal, against the isolated replica set:
$env:NODE_ENV = 'test'
$env:E2E_BASE_URL = 'http://localhost:3001'
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27018/?replicaSet=sonDemo'
npx playwright test e2e/email-auth.spec.js e2e/google-auth.spec.js e2e/customer-auth.spec.js e2e/staff-auth.spec.js
```

No deployment was performed.
