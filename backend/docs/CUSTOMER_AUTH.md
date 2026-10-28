# Customer sign-in

Open **http://localhost:3000/login**. Customer registration and returning-customer sign-in use the same full-name/mobile form, with **Continue with Google** below an OR divider. Email, password, age, and gender fields are absent. The original repository's SON MASALA brand component is reused. The supplied attachment contained the written design brief, but no reference screenshot or additional logo asset; the page follows the specified cream palette, centered 440px rounded card, serif headings, simple navigation, and restrained form styling. The Google button uses Google's original four-colour G on white with a light-grey border. Text sizes, contrast and spacing have been increased, including on mobile.

The application remains JavaScript/JSX only, with separate Next.js App Router and Express/Mongoose projects. Node.js 22 or newer is required by the existing owner passkey integration. MongoDB must support transactions. The current environment uses the existing local replica set on port 27018; Atlas has not been configured or verified.

## Identity and registration

`POST /api/v1/auth/send-otp` accepts:

```json
{
  "fullName": "Your full name",
  "phone": "+919876543210",
  "channel": "sms"
}
```

`channel` is `sms` or `whatsapp`. The server accepts a valid Indian 10-digit mobile or its `+91` E.164 representation, normalizes it to E.164, and trims/normalizes full names without restricting them to English letters. Other request fields are rejected. A submitted name is never identity proof.

The response contains a random challenge token, expiry, resend time, normalized phone, channel, and server time. The six-digit code is generated cryptographically and stored only as an HMAC bound to that challenge. The token is hashed in MongoDB. The response appears only after provider acceptance; this is not a guarantee that the handset has received the message. Provider rejection, malformed success, failed/undelivered status, or network failure returns an unavailable error, keeps the initial form visible, and creates no authenticated session.

`POST /api/v1/auth/verify-otp` accepts `challengeToken` and the six-digit `code`. A successful verification transaction consumes the code, finds or creates the customer, merges the permitted guest cart, transfers orders owned by that browser's secret guest cookie, updates `lastLoginAt`, and creates a server session. If any step fails, the transaction rolls back.

New users have their supplied normalized name, normalized phone, `role: CUSTOMER`, `accountStatus: ACTIVE`, timestamps, and real-provider phone verification recorded. Existing users keep their ID and saved name; entering a different name cannot overwrite it. Existing national-format phone records are normalized after successful verification. If multiple existing records represent that number, login fails with an account-review message rather than silently merging identities. Unique indexes prevent duplicate normalized phones, and transactions also handle concurrent verification safely.

Legacy email-only accounts remain stored with their carts and orders. They are not automatically linked by matching a submitted name, email, or delivery phone; linking requires an independently verified account-review process. Legacy customer password/email login is retired: `/auth/register` and `/auth/login` return 410. `/auth/otp/request` and `/auth/otp/verify` remain compatibility aliases for the new **mobile-only** input. Old customer JWT cookies are cleared and cannot authenticate.

## Google sign-in

The white **Continue with Google** button is independent of the name/mobile fields. It starts the server-side authorization-code flow. The browser never receives the client secret, provider access/refresh tokens, or an application session token in the URL.

Create a **Web application** OAuth client in Google Cloud, configure the consent screen for your application, and allow this exact redirect URI for local development:

```text
http://localhost:5000/api/v1/auth/google/callback
```

Set these only in `backend/.env`, then restart Express:

```dotenv
GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<web-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
```

Add permitted test users while the Google consent configuration is in testing. For deployment, replace the redirect URI with your HTTPS API callback and register that exact value in Google Cloud; keep `STAFF_APP_ORIGIN` set to the trusted frontend origin (also used by customer callback redirects), and configure CORS for that same frontend. This flow uses a full-page redirect, so it does not require a frontend Google SDK or a public client-secret variable. If credentials are absent, the Google button reports temporary unavailability and mobile OTP remains usable.

`POST /api/v1/auth/google/start` requires an allowed Origin and accepts only an optional shopping `returnTo`. It requests `openid email profile`, uses S256 PKCE, and creates a ten-minute, single-use flow bound to an HttpOnly SameSite Lax browser cookie. State, nonce and browser secrets are hashed in MongoDB; the PKCE verifier is encrypted with the existing `ADMIN_MFA_ENCRYPTION_KEY`. Do not rotate this key without following the staff guide because it also protects staff MFA.

`GET /api/v1/auth/google/callback` consumes the state atomically and verifies browser binding and expiry before exchanging the code. Google's official `google-auth-library` verifies the ID-token signature, issuer, audience and lifetime; the application also checks the nonce, stable subject and verified email. Callback queries are omitted from Express access logs, and callback responses use no-store/no-referrer. Invalid tokens, cancellation, expired requests and replay return a fixed customer-facing error without a session.

Customers are identified by Google's verified **subject ID**, not a submitted email or phone. New Google customers receive `CUSTOMER` access, a verified email, and the same persistent customer session and transactional guest-bag/order transfer used by OTP. Google does not verify an Indian mobile number, so no phone-verification flag is fabricated. Returning Google customers keep their existing ID, profile, bag and order history. A matching email on a different mobile/legacy account is **not automatically linked**; the customer is directed to mobile OTP for that account. No staff account is created or authenticated by Google.

Provider tokens are used only for this verification and are not retained. Existing valid customer sessions skip both Google and OTP prompts. Logout, suspension and device revocation apply to both methods.

The local G asset preserves Google's original four-colour paths from its [official light button SVG](https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_sl.svg). Implementation references: [Google authorization-code flow](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), and [branding guidelines](https://developers.google.com/identity/branding-guidelines).

Automated checks use an isolated RSA signing key and provider exchange fixture. They still execute the real Google library's signature/issuer/audience/expiry verification; test hooks are unavailable outside explicit test mode. These checks do not claim a live Google account completed consent. Live sign-in must be verified after the real credentials and consent settings are configured.

## OTP limits and resend

- Codes expire after **5 minutes** and allow at most **5 incorrect verification attempts**.
- Resend has a **60-second** cooldown shared by SMS and WhatsApp for the same phone.
- A phone may request at most **6 codes per hour**. MongoDB stores and atomically updates this bucket, including across browser sessions and API processes.
- Public auth writes have an additional **30 requests per IP per 15 minutes** limit per API instance. Multi-instance deployments should configure a shared rate-limit store and trusted proxy hops; the per-mobile MongoDB limit is already shared.
- A new accepted request supersedes earlier challenges. Used or superseded codes cannot log in again. Failed sends still consume cooldown/send-budget capacity.
- `POST /api/v1/auth/resend-otp` accepts the current challenge token and derives phone/name/channel from the saved challenge. It can resend after expiry or exhausted guesses, subject to cooldown/budget. Expired records are retained for up to 24 hours only to support resend, then removed by TTL; expiry is checked in application code throughout.
- Rate-limit responses include messages and, for the durable phone bucket, `Retry-After`. The UI disables resend during cooldown, displays expiry, supports paste/autofill and keyboard focus advancement, and permits changing the number.

The normal per-IP limit is relaxed only by explicit `nodeEnv: test` in isolated automated fixtures; production uses the real limit.

## Persistent sessions and logout

Checkout now requires customer login. Guest shopping and cart edits remain public. Proceed to Checkout redirects to `/login?next=%2Fcheckout`; OTP and Google return to checkout after the existing transactional guest-bag merge. Private favourites are MongoDB records belonging to that same customer ID. Both survive future authenticated visits. Hindi/English preference also survives login; see [localized shopping and API behaviour](LOCALIZED_SHOPPING.md).

Customer cookies contain random opaque 256-bit tokens, never JWTs. Only token hashes are stored in `CustomerSession`. Cookies are persistent, HttpOnly, SameSite Lax, and Secure in production. Tokens are never put in localStorage or sessionStorage.

Customer sessions have a **30-day inactivity limit** and a **90-day absolute lifetime**. Normal authenticated requests renew inactivity/cookie expiry after five minutes of activity since the last write, capped by the original absolute deadline. Every request checks MongoDB session revocation, both deadlines, and account status. Refreshing, page navigation, returning to the website, and restoring valid persistent browser cookies require no new OTP. Submitting the form with a valid existing session also returns that session's customer without sending another code.

`GET /api/v1/auth/me` returns only the current customer or `null`. The frontend checks it together with the cart on load, route changes, and focus. `/account` redirects signed-out customers to `/login`; signed-in customers visiting `/login` proceed to their account or a validated shopping return route.

`POST /api/v1/auth/logout` revokes the current database session and clears its cookie. Replaying a copied old cookie fails. `POST /api/v1/auth/revoke-other-sessions` revokes other devices while keeping the current session. Suspended/deleted customer accounts cannot use an existing session or finish a new login. Auth writes require an explicitly allowed Origin, and customer cookies remain separate from admin/owner cookies.

`GET /api/v1/auth/orders` returns the signed-in customer's latest 50 orders, without another user's records. Demo orders are explicitly identified and excluded in production. Guest orders transfer only when the requesting browser possesses their original guest cookie; matching delivery details never establishes ownership. Account/cart history is restored by customer ID, and the account menu displays the saved name. Checkout's sign-in link returns to `/checkout` and restores the bag and saved name/phone. External, admin, owner, API, and login-loop return destinations are rejected.

## SMS and WhatsApp configuration

Configure these **only in `backend/.env`**, then restart Express:

```dotenv
AUTH_DEV_PREVIEW=false
TWILIO_ACCOUNT_SID=<account SID>
TWILIO_AUTH_TOKEN=<server credential>
TWILIO_SMS_FROM=<approved sender>
# Or select an approved sender through a Messaging Service:
TWILIO_SMS_MESSAGING_SERVICE_SID=<MG...>
TWILIO_WHATSAPP_FROM=whatsapp:<approved sender number>
TWILIO_WHATSAPP_OTP_CONTENT_SID=<HX...>
```

The existing `ADMIN_MFA_ENCRYPTION_KEY` is also required for keyed OTP hashes. Keep its unique 32-byte base64 value in the secret store and retain secure backups, as described in [the staff guide](STAFF_ACCESS.md). No frontend secret is required; `frontend/.env.local` continues to contain the API base URL only.

SMS uses Twilio's Message API with an approved sender or Messaging Service. Configure a route permitted for Indian recipients and any provider-required sender/template registration. `SMS_OTP_TEMPLATE` optionally supplies the exact approved message text and must contain `{{code}}`. The default text is:

```text
Your SON MASALA verification code is {{code}}. It expires in 5 minutes. Do not share this code.
```

WhatsApp OTP uses an approved `whatsapp/authentication` Content Template: the configured `ContentSid`, `ContentVariables: {"1": "<generated OTP>"}`, and approved sender are sent through the supported provider. It does not use free-form message bodies for customer OTPs. Match the template's expiry wording to the server's five-minute expiry. Template approval and sender provisioning happen in your provider account; code cannot grant those approvals. See [Twilio WhatsApp authentication templates](https://www.twilio.com/docs/content/whatsappauthentication), [Message API](https://www.twilio.com/docs/messaging/api/message-resource), and [India SMS sender guidance](https://www.twilio.com/en-us/guidelines/in/sms).

At verification time, none of the Twilio provider settings were present. Automated tests exercised request construction, acceptance, rejection, and network/provider failure through in-memory adapters and mocked provider responses. No real SMS or WhatsApp message was sent, and live delivery is not claimed as verified.

## Isolated local testing

`AUTH_DEV_PREVIEW=true` permits clearly labelled preview codes only when `NODE_ENV` is not production and the database name is an isolated demo/test name. It does not silently replace a failed configured provider. Preview accounts are labelled, are not marked genuinely phone-verified, and preview-issued sessions/challenges cannot authenticate in production. Real OTP values are never returned in production responses or written to logs.

Production must use HTTPS and an appropriate same-site frontend/API deployment, with allowed origins and trusted reverse-proxy configuration. See `backend/.env.example`. Owner and staff login at `/owner/login` and `/admin/login` continues to require the separately provisioned ID, password, and MFA. Customer verification cannot grant any staff permission.

The latest executed checks and screenshots are recorded in [the verification report](../verification/verification.md).
