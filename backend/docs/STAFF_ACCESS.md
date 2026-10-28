# Owner and staff access

The application uses JavaScript/JSX, Next.js App Router, and a separate Express/Mongoose API. Node.js **22 or later** is required by the passkey server library. Use a transaction-capable MongoDB replica set or Atlas cluster. The current local demo uses `son_masala_demo` on port 27018; Atlas has not been configured or verified.

| Person | Sign-in | Workspace |
| --- | --- | --- |
| Customer | `/login` (SMS or WhatsApp mobile OTP) | `/account`, shopping cart |
| Invited administrator | `/admin/login` | `/admin/dashboard` |
| Single owner | `/owner/login` | `/owner/dashboard`, `/owner/access-management` |

Customer password/email login is retired; `/account` redirects signed-out customers to the unified mobile form. See [customer OTP and persistent-session details](CUSTOMER_AUTH.md). Customer sessions never grant staff access, including legacy customer records with `role: admin`. The old `make:admin` command is disabled. Existing customers must receive a new owner-approved invitation to become staff. There is no public staff signup or owner bootstrap endpoint.

## Create the first owner

Run these steps yourself in a trusted deployment terminal. No owner ID or password is supplied by the repository. Automated tests create random credentials only in temporary databases; they cannot be used in the visible application.

1. Configure `backend/.env` using its example. Keep all credentials out of `frontend/` and source control. Set `ADMIN_MFA_ENCRYPTION_KEY` to a random **32-byte base64** value. Generate it in your protected terminal with:

   ```powershell
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Save this key in your deployment secret store and back it up securely. Changing it without migrating encrypted material invalidates MFA decryption, recovery-code hashes, and CSRF/verification hashes, including customer OTP hashes. Customer JWT authentication has been retired.

2. Set `OWNER_BOOTSTRAP_OS_USER` to the exact username returned by `node -p "require('node:os').userInfo().username"`. Restrict access to this operating-system account, environment configuration, and the database. This trust boundary assumes a deployment operator with protected OS access; it does not verify a government identity.

3. Create a random setup secret with at least 32 characters in your password manager. Store only its SHA-256 hexadecimal digest in `OWNER_BOOTSTRAP_SECRET_SHA256`. The raw secret is entered interactively and must not be committed, placed in a URL, or passed on a command line. For example, this PowerShell sequence prompts without echoing it and outputs only the digest:

   ```powershell
   $setupInput = Read-Host 'Setup secret (at least 32 characters)' -AsSecureString
   $setupPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupInput)
   try {
     $setupText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupPointer)
     $setupBytes = [Text.Encoding]::UTF8.GetBytes($setupText)
     $setupHasher = [Security.Cryptography.SHA256]::Create()
     ([BitConverter]::ToString($setupHasher.ComputeHash($setupBytes))).Replace('-', '').ToLowerInvariant()
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupPointer)
     if ($setupBytes) { [Array]::Clear($setupBytes, 0, $setupBytes.Length) }
     if ($setupHasher) { $setupHasher.Dispose() }
     Remove-Variable setupInput, setupPointer, setupText, setupBytes, setupHasher -ErrorAction SilentlyContinue
   }
   ```

4. From `backend/`, run `npm run owner:bootstrap`. The command refuses redirected stdin/stdout. Supply the setup secret, owner name, deployment-verified email, international-format phone number, and a password you choose (12–128 characters). The password and setup secret are hidden during input. The CLI hashes the password with Argon2id; it never creates or emails a default password.

5. Enroll the displayed setup key or `otpauth://` URI in your authenticator and enter its current code. These enrollment secrets are shown only in this protected terminal. Until verification succeeds, the account remains `PENDING_MFA` and cannot sign in. If enrollment is interrupted, run `npm run owner:bootstrap -- --resume` with the same deployment proof, pending owner ID, and chosen password.

6. Store the ten recovery codes offline when they are shown once. Record your generated `OWN-...` ID. Sign in at `/owner/login` with a **new** authenticator code; the enrollment code cannot be reused. Remove `OWNER_BOOTSTRAP_SECRET_SHA256` from deployment configuration and destroy the setup secret after completion.

The database stores a bootstrap singleton and a unique partial index named `one_active_owner`. Transactions prevent a second owner and permanently close bootstrap after activation. Ordinary staff cannot call these CLI services through REST. The owner cannot revoke, suspend, or replace itself through staff-management endpoints.

## Invite and manage administrators

Open `/owner/admins/new`, enter the person's name, email, E.164 mobile number, operational role, and allowed permissions. The server generates a unique `ADM-...` ID. An invitation expires after 48 hours and can activate access only once. Its URL token is hashed in MongoDB; the browser removes it from the URL fragment immediately on opening.

Recipients must verify an email OTP, choose their own password, enroll an authenticator, and verify a TOTP before activation. The ten backup codes are displayed once. Passwords are never emailed. Failed delivery is recorded; the owner can reinvite an account still awaiting activation to send a fresh invitation and invalidate the old link.

`/owner/access-management` lists active/suspended counts, pending invitations, staff details, permissions, login activity, and access changes. The owner may edit roles/permissions, suspend, reactivate enrolled suspended staff, revoke access, terminate sessions, or open that person's audit history. Role/permission changes, suspension, revocation, and session termination revoke existing sessions immediately. Revoked staff require a new invitation.

Ordinary staff cannot hold any `owner.*` or `staff.*` permission. Input validation rejects them, and middleware filters them out even if a database record is manually inflated. The owner-only API checks apply independently of navigation and page visibility.

| Role | Default operational modules |
| --- | --- |
| `ADMIN` | All operational modules; no staff access management |
| `ORDER_MANAGER` | Dashboard, orders, customers, shipping |
| `INVENTORY_MANAGER` | Dashboard, products, inventory |
| `SALES_MANAGER` | Dashboard, orders, payments, analytics |
| `SUPPORT_MANAGER` | Dashboard, customers, orders, review moderation |

Exact action-level defaults are in `backend/src/config/permissions.js`; the owner can customize each account. Dashboard data is filtered by the corresponding view permissions. Business totals exclude `isDemo: true` and `paymentMode: DEMO` transactions. Demo orders are reported separately. Inventory and fulfillment updates and review moderation retain permission checks and transactional audits. This change does not connect live payments, refunds, or shipment booking.

## Passkeys, sessions, and emergency recovery

After owner sign-in, open `/owner/security`. Use a fresh authenticator code to register a passkey. Registration and sign-in require WebAuthn user verification, RP ID, and origin validation. The server stores the public key and signature counter; the private key remains on the authenticator. Owner sign-in then supports the **Sign in with a passkey** option. The password/TOTP method remains available.

Staff session tokens are random opaque values stored only as hashes in MongoDB. Cookies are HttpOnly, SameSite Strict, and Secure in production; customer, admin, and owner cookies are separate. Sessions expire after four hours for the owner and eight hours for staff, with inactivity limits of 30 and 60 minutes. Authenticated writes require both an allowed Origin and a session-bound CSRF header. Every API request rechecks account status and session version. Five credential/MFA failures lock an account for 15 minutes; route-level limits also apply. MFA challenges expire, cap guesses, and reject TOTP replay. Recovery codes work once alongside the password.

For emergency MFA reset, configure `OWNER_RECOVERY_OS_USER` and **a separate** `OWNER_RECOVERY_SECRET_SHA256` using the protected procedure above. Store the raw recovery secret offline, apart from the deployment configuration. Run `npm run owner:recover` in the trusted interactive terminal. Recovery requires the authorized OS identity, deployment recovery secret, owner ID, current owner password, an unused owner recovery code, and successful enrollment of a new authenticator. It rotates backup codes, removes old passkeys, revokes every existing owner session, and writes an audit event. Remove the recovery hash and destroy that raw deployment secret after use; configure a new distinct proof for a later emergency.

There is no browser-based override or fallback owner account if all identity factors are lost. Restore through your independently controlled deployment/backup and identity-verification process. Do not delete the bootstrap singleton to create a replacement owner.

Audit history is available only at `/owner/audit-logs`. Records include actor, target, action, result, changes, timestamp, session metadata, a keyed IP hash, and truncated user agent. The model rejects updates/deletes and no audit mutation API exists. Restrict the production MongoDB account so the audit collection has only required insert/read privileges; application middleware does not protect records from a database administrator with raw write access.

## Real email, SMS, and WhatsApp delivery

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `backend/.env` for staff verification email and invitations. SMTP requires TLS. Customer mobile delivery uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and approved `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` senders (or an SMS Messaging Service). Customer WhatsApp OTP now requires `TWILIO_WHATSAPP_OTP_CONTENT_SID`, an approved authentication template with the generated OTP in variable `1`. See [provider configuration](CUSTOMER_AUTH.md). Provider errors return an unavailable response and never expose provider credentials.

Official integration references: [Nodemailer SMTP](https://nodemailer.com/smtp), [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource), [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server), [SimpleWebAuthn browser](https://simplewebauthn.dev/docs/packages/browser).

For an isolated **local** demo only, `AUTH_DEV_PREVIEW=true` returns explicitly labelled preview OTPs and owner invitation links when delivery is unconfigured. This requires a non-production environment and a demo/test database name. Preview verification never marks the contact as genuinely verified, and preview-enrolled staff cannot authenticate in production. With real credentials configured, the real provider is used and no preview code is returned. Production never falls back to preview delivery. Do not use production recipients or customer data for automated tests.

At the time of verification, SMTP and Twilio credentials were absent. Real delivery has not been tested. Fill in the environment values and restart the API before using these channels.

## Production configuration

Use HTTPS, set `STAFF_APP_ORIGIN` to the exact frontend origin and `ADMIN_WEBAUTHN_RP_ID` to its host (without a scheme or port), and configure `CORS_ORIGINS`. The API rejects production startup without an HTTPS staff origin, matching RP ID, and encryption key. Deploy frontend and API on the same site, or proxy `/api/v1` to Express, so SameSite Strict cookies can be sent. A different unrelated API site is incompatible with these cookies. If a reverse proxy is used, explicitly configure trusted proxy hops before deployment so rate limiting uses the correct client IP; the local server does not trust arbitrary forwarded headers.

Keep `AUTH_DEV_PREVIEW=false` and `ENABLE_DEMO_CHECKOUT=false` in production, use least-privilege database credentials, and keep secrets in a deployment secret store. Back up the MFA encryption key separately from database snapshots. Never expose server credentials through `NEXT_PUBLIC_*`.
