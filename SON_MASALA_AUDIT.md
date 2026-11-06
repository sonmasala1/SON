# SON MASALA UI, responsiveness, reviews and performance

Work performed locally on 3 November 2026. Times below are IST. No commit, push or deployment was performed. Environment files, credentials, Brevo and Google OAuth settings were not changed. No existing review was edited, approved, unpublished or deleted by this work. Browser write requests in the new layout tests are intercepted and never reach a store database.

## Verified review findings

The read-only query used the MongoDB URI/database configured by `backend/src/config/env.js`, with model initialization, auto-creation and auto-indexing disabled. The local configuration selects a remote Atlas database named `son_masala`, with `NODE_ENV=development` and development authentication preview disabled. Direct DNS failed in this execution environment; a process-local HTTPS DNS lookup allowed the read-only inspection. No DNS or connection settings were saved to `.env`.

| Field | Verified value |
| --- | --- |
| Review ID | `6ae5f56b110e5f59f55245b9` |
| Public display name | Anjali |
| Product | Garam Masala, `/product/garam-masala`, published, not a demo product |
| Rating | 1/5 |
| Created | 31 October 2026, 7:34:27 p.m. |
| Current moderation state | `approved: false` |
| Verified purchase | `false`; no matching non-demo PAID order was found for this account/product |
| Linked account | Name Bhawani; email verified, verification source BREVO; phone not verified |
| Last review update | 2 November 2026, 11:08:09 a.m. |

The public display name is independently editable and does not have to match the account name. These fields do not establish the person's real-world identity or prove that the review is fraudulent.

Existing `adminauditlogs` show this review was approved on 2 November at 11:07:10 a.m., then unpublished at 11:08:09 a.m. The logged Windows/Edge user agent belongs to those moderation actions; it is **not** evidence of the original review's submission browser. There were no surviving customer-session records for the linked user when inspected.

**Submission origin was not recorded on this review.** Its raw MongoDB document has no creation request ID, environment, origin, IP, user agent or channel. Available top-level `.runtime` log/text files contain neither its ID nor its display name nor the creation timestamp. Current seed scripts contain no matching review creation. None of this establishes which code or script ran historically. It cannot be attributed to local development, the live website, a test, or a direct authenticated API call using the available evidence.

**Whether production shares this database remains unverified.** The local remote database was inspected; production's effective MongoDB environment and server logs were not available. A remote database name, public product content, or frontend API URL alone cannot prove that two runtimes use the same database.

## Review form and API

The form was already present in `frontend/src/components/ReviewForm.jsx`, included by `ProductDetail.jsx` on `/product/[slug]` only when the product is published. It is not shown on listing cards or the nine catalogue-visible draft products. The database contained 18 published and nine draft products when inspected. This was a discoverability issue, rather than a missing submission API.

- `POST /api/v1/reviews` creates a review, through `backend/src/controllers/reviewController.js`.
- `GET /api/v1/reviews` exposes approved reviews for eligible published products only.
- `GET /api/v1/admin/reviews` and `PATCH /api/v1/admin/reviews/:id` retain the existing staff moderation workflow and permissions.
- The current submission route requires a valid customer session and an allowed Origin. Guests and unauthenticated API clients cannot submit through this route. An authenticated API client can imitate an allowed Origin; that header does not prove a browser visit. Historical deployed code was not inspected.

Changes add a visible review entry link near the top of published product details, a return destination after login, an explicit email/mobile verification requirement on both client and server, accessible status/error messages, responsive fields, and protection against repeated submits. Reviews always start unpublished. Verified purchase still comes exclusively from a non-demo PAID order containing the product; browser input cannot set either flag.

The existing unique product/user database index was verified. An explicit duplicate check now also returns a clear conflict before insertion. Submission attempts are limited to five per account per 15 minutes and 20 per IP per hour. These limiters use process memory, matching the existing rate-limit dependency; deployments with multiple API instances should use a shared limiter store if coordinated limits are required.

Only future reviews receive optional immutable submission metadata: server environment, API channel, request ID, accepted Origin and session verification source. This does not backfill historical reviews or claim to distinguish a browser from an authenticated script.

## Confirmed layout causes and fixes

| Cause | Change |
| --- | --- |
| Production CSS put base rules after readability/responsive overrides, undoing fixes that passed in development | Use one ordered `styles.css` import entry; compiled production CSS now places the 44px rules after the old 30px/38px rules |
| Variant buttons, login tabs and copy buttons fell below a 44px touch target | Set minimum touch dimensions while retaining existing colors and typography |
| Mobile hero stamp and absolutely positioned caption could occupy the same space | Reflow stamp, caption and caption footer into separate rows on small screens |
| Confirmation retained three very narrow status columns on phones | Use an adaptive grid; stack confirmation sections and reflow product totals on small screens |
| Review form used two equal columns without robust field containment | Responsive fieldset, zero minimum content widths, full-width fields and a single mobile column |
| Dense toolbars, moderation actions and long content needed additional shrink/wrap rules | Reflow toolbars/actions; permit long names/addresses to wrap; retain existing responsive staff table semantics |
| Product pack editing retained six minimum-width fields plus an action in tablet workspace widths | Reflow pack controls into three columns at tablet widths and two on phones; add labels to reflowed product table cells |
| Fixed scroll offsets did not track a growing header/search panel | Observe actual header height for anchor offsets and menu height; close menus/search on Escape and route changes |
| Notched screens and reduced viewport height needed explicit treatment | Add viewport-fit=cover, safe-area padding and dynamic viewport limits for drawers/menus; keep zoom enabled |
| Local browser requests targeted `localhost:5000` directly | Use the existing Next rewrite machinery automatically in development, forwarding through port 3000 to the IPv4 local backend; production routing remains controlled by existing production configuration |
| Analytics tables contained literal whitespace text between `thead` and `tbody` | Remove invalid table text children; an all-console browser check verified that React DOM-nesting warnings disappeared |

The local proxy also prevents a phone opening the development site from interpreting the API's `localhost` as the phone itself. No environment file change was needed. Desktop theme tokens and existing components remain in use. The fixes do not mask document overflow with a global `overflow-x: hidden` rule.

## Expanded shopping and performance work

- Search is a compact, rounded floating panel with opening/closing transitions, input focus, outside-click/Escape dismissal and reduced-motion support. It does not move page content.
- Listing cards have compact image ratios/gaps and flexible price/action alignment. Quantity controls are an inline `[−] quantity [+]` with 44px buttons. Coming Soon products retain existing stock/price/status guards.
- Published product details have an explicit **Write a Review** button, product-scoped Customer Reviews and a compact accessible 1–5-star radio group. The homepage retains its approved-review section.
- Public catalogue requests share in-flight work with independent subscriber cancellation. Products use a bounded 10-second memory cache; categories use 60 seconds. Explicit retries bypass it. Cart, identity, staff, order and checkout data are never put in that cache. Review APIs remain uncached and filter approval on each query.
- Internal route changes reuse recent cart state for up to 10 seconds; focus/authentication changes revalidate. Pending cart operations preview counts/quantities immediately, retain confirmed totals/version, and block checkout until the server acknowledges. Failure removes the preview and forces a fresh cart read. Existing write serialization, locks, authentication epochs and order request keys are preserved.
- Newsletter component, contact section, newsletter-only CSS/copy/API helper, controller, route and subscriber model registration are removed. The retired endpoint returns 404. Existing subscriber records/collection were not deleted. Brevo OTP code/configuration is unchanged.
- Next image optimization uses Sharp, responsive source sets, WebP, lazy loading and priority for detail/hero images. Contact-sheet crop resolution scales to preserve each pack panel. Original images are not rewritten.

| Read-only measurement | Observed result |
| --- | --- |
| Old 12-product catalogue | 14 queries: product find/count plus 12 variant finds; 2,224ms and 986ms |
| Batched catalogue | Three queries: product find/count plus one variant find; 142ms and 154ms |
| Equivalence | Identical product/variant IDs, prices and stock across all four samples |
| Existing Chaat Masala PNG | 2,445,254 bytes |
| Responsive 640px WebP | 43,258 bytes, about 98.2% smaller; original unchanged |
| Development Pixel 7 lab | LCP 1,772ms, CLS 0, no page errors; five initial API calls without duplicated catalogue requests |
| Render health | First request timed out after 60,006ms; next responses were 200 in 3,028ms and 722ms |

The variant query reuses existing product-ID indexes; no new index was added for this optimization. The read-only comparison is reproducible with `backend/scripts/profile-catalogue.js`, with results under `backend/.runtime/catalogue-performance.json`.

Lab numbers are not field Core Web Vitals or guarantees for real mobile networks. Field INP was not measured. The intercepted slow-response/stock-conflict test verifies immediate quantity feedback, blocked pending checkout, single submission and rollback without store writes.

Render documents that free services can sleep after 15 minutes without inbound traffic ([Render documentation](https://render.com/docs/free)). The measured cold/warm difference is consistent with startup delay, but the actual plan and server logs were unavailable, so a free-tier cold start is **not proven**. No paid hosting change, deployment or keep-alive schedule was made.

The npm audit reports 17 dependency findings: 15 moderate, one high and one critical, including the existing Next 13/PostCSS stack. Its proposed framework fix is Next 16.4.4, a major migration. No force upgrade was applied. These known advisories remain and need a separately validated framework/dependency upgrade; this is not a clean security audit. The report is `frontend/test-results/dependency-audit.json`.

## Chunk loading, hydration and favicon

The existing process on port 3000 was identified as this workspace's Next development server. The dev launcher already refuses a second listener instead of moving to another port. Next configuration already separates `.next-dev` and `.next`; successful production builds were run while development remained available. Those safeguards were retained.

The original `app/layout` timeout, React hydration failure and server-HTML replacement **were not reproduced as an application failure in the initial stable checks**. Root providers initialize their client state consistently with server output, and locale initialization already comes from the server cookie. No blanket hydration suppression, forced client rendering or increased chunk timeout was introduced. The original incident's exact cause cannot be established from the supplied console messages and available logs.

During development testing, changing shared files/restarting Next and replacing a page during pending RSC work produced interrupted navigations, cancelled assets and WebKit access-control/EOF reports. A settled WebKit page successfully read the local API. Layout audits now open independent settled documents so a previous development page's pending reload cannot navigate a subsequent test page. This observation is not proof of the cause of the user's historical timeout.

`/favicon.ico` was genuinely missing. It is now a real ICO rasterized from the existing green/gold sun SVG; metadata includes both branded formats. The favicon endpoint returns 200. The generator is retained for reproducibility.

## Validation and limits

| Check | Result |
| --- | --- |
| Chrome public/guest layouts | 400 checks: 20 routes × English/Hindi × 320, 360, 375, 390, 414, 430, 768, 1024, 1280 and 1440px; zero detected layout failures, page/hydration errors or failed chunk requests; 3,240 chunk responses all 200 |
| Additional Chrome routes | 16 checks covering all three recipe-detail routes and invitation entry at 320/1440px in both languages; clean |
| Edge public/guest layouts | 120 checks at 320/768/1440px in both languages; clean; 972 chunk responses all 200 |
| WebKit public/guest layouts | 120 checks at 320/768/1440px; zero layout failures and zero failed chunk requests. One early `Unexpected EOF` on an owner redirect was retained in the report; a separate four-check repeat of that route at 768/1440px was clean |
| Protected-state layouts in Chrome and WebKit | Cart/drawer, checkout and preview, account, wishlist, order confirmation, dashboard, inventory, orders, review moderation empty state and review form checked in both languages at all ten widths. Each browser had one interrupted/transient run; the affected width passed in a fresh-document repeat |
| Enlarged Hindi text | 150% text at 320px, plus expanded mobile menu/search, passed in the protected-state checks |
| Catalogue forms | Chrome passed table, category form, product form and existing pack-edit controls at all ten widths in both languages after fixing the 1024px clipping |
| Final production startup | `next start -p 3000` started successfully. After the CSS-order correction, Chrome protected-state tests at 320/1440px and WebKit catalogue/pack-edit tests at all ten widths in both languages passed |
| Production assets | Branded favicon 200; final hashed layout chunk 200, 3,397 bytes, observed 4ms fetch locally |
| Development assets | Layout chunk 200, 1,756,565 bytes, observed 47ms fetch locally before final CSS consolidation |
| Device emulation after restoring development | iPhone 13 WebKit navigation, Pixel 7 Chrome product detail and iPad (generation 5) WebKit product detail completed without console/page errors or horizontal overflow; header icon targets were 44×44px |

The broad public-layout matrices use cached read-only responses captured from the existing APIs, rather than seeding catalogue or review data. They validate layout with actual public data and guard redirects, not real authenticated transactions. Early failed/interrupted traces are retained and are not counted as clean final runs. The production-start checks are local checks of the compiled build, not a deployment or certification of the currently hosted site.

A final device-console pass caught duplicate sibling React keys after the review entry was moved; product and review components now use distinct key prefixes, and the repeated Pixel/iPad checks were clean. The browser audit also records React warnings, and the protected-state test records all error-level console messages. Development was restored on port 3000 after production-start verification.

Frontend lint, final production build and 30 unit tests pass; backend lint/build pass; backend tests report 68 passing, eight skipped and zero failures. The new backend security tests intercept model operations and do not connect to MongoDB. The eight existing database integration tests require an isolated `MONGODB_TEST_URI`, which was not supplied. Live store data was not substituted as a test database.

The new protected-state browser tests use intercepted, in-memory responses for customer identity, cart/order display, staff identity, inventory and checkout preview; they use an existing public product for image/catalogue rendering. They exercise layout and client behavior without authenticating a real customer or staff member, delivering OTPs, creating orders, changing inventory, making payments, or persisting reviews. Their review acknowledgment is an intercepted response, not a published or stored review.

Physical Android Chrome, Samsung Internet, iPhone/iPad Safari, real virtual keyboards and OS text settings require real devices. Playwright WebKit is engine coverage, not branded Safari certification ([Playwright browser support](https://playwright.dev/docs/browsers)). An online payment gateway is not configured in the current checkout, which uses Pay Later; no charge or real order placement was attempted. End-to-end real OTP/OAuth/staff login and transaction persistence remain unverified by this non-mutating run.

The local API is running again on port 5000 with the unchanged environment and a connected MongoDB database. The new review guard, rate limits and submission metadata are loaded locally. Production has not been deployed or restarted by this work.

## Changed files

- Layout: `frontend/src/app/styles.css`, `frontend/src/app/responsive.css`, `frontend/src/app/layout.jsx`, `frontend/src/components/Header.jsx`, `frontend/src/components/staff/ProductManagement.jsx`.
- Reviews: `frontend/src/components/ReviewForm.jsx`, `frontend/src/components/ProductDetail.jsx`, `frontend/src/lib/messages.js`, `backend/src/controllers/reviewController.js`, `backend/src/models/Review.js`, `backend/src/routes/index.js`, `backend/src/middleware/reviewSubmission.js`.
- Local API routing: `frontend/next.config.js`, `frontend/src/lib/api.js`, `frontend/src/lib/api.test.js`.
- Branding: `frontend/public/favicon.ico`, `frontend/scripts/build-favicon.js`.
- Investigation/tests: `backend/scripts/inspect-review-origin.js`, `backend/test/review-security.test.js`, `frontend/scripts/audit-responsive.js`, `frontend/e2e/responsive-states.spec.js`, `frontend/e2e/responsive-catalog.spec.js`, `frontend/playwright.config.js`.
- Pre-existing backend lint blockers: removed a duplicate `customerAuthKey` declaration from `backend/src/app.js`, removed unused imports in `backend/scripts/reset-admin-access.js`, `backend/scripts/syncStaffEnvironment.js`, `backend/test/environment-staff.test.js`, and documented the intentionally empty stale-lock catch in `backend/src/server.js`. These do not change credentials or authentication behavior.
- This report: `SON_MASALA_AUDIT.md`.

Detailed browser JSON, screenshots and failure traces are local ignored artifacts under `frontend/test-results/`; they are not source changes. Early interrupted/failed runs are retained separately from final validation.
