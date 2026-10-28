# Languages, favourites and checkout

The existing Next.js JavaScript/JSX frontend and Express/Mongoose backend remain separate. No commerce features or staff authentication were replaced.

## Language preference

The navbar's compact globe pill shows **En** or **हिंदी** and switches between Hindi and English when clicked. Its orange globe, thin rounded border, purple outline shopping cart and circular profile icon follow the supplied navbar reference. English is the default. The preference is stored in the non-sensitive `son_locale` cookie for one year and `son-masala-locale` localStorage entry. The root server layout reads the cookie, sets the HTML language and gives the provider the same initial language, avoiding an English first render for a returning Hindi visitor. The browser setting survives refresh, OTP/Google login and logout, and synchronizes between tabs. It does not contain account/session data.

`LocaleProvider.jsx`, `LocalizedText.jsx` and the dictionaries in `src/lib/messages.js` and `staff-messages.js` implement the JavaScript localization system. Explicit React text/attribute boundaries translate visible copy, buttons, input labels/placeholders, accessible names, validation and error messages. They do not mutate DOM text, routes, form/API values, customer identifiers or enum values. English source phrases are message keys. Dynamic OTP timers, counts, quantities, pack weights and price notices have parameterized patterns in `i18n.js`. Browser field validation is localized as well.

Cart-add notifications retain the product's names until rendering, so switching language also updates a notification that is already visible or whose add request started in the previous language. Switching language does not add/remove cart items or restart notification expiry.

Public storefront, products, cart, delivery/review/payment/confirmation, customer login/account/wishlist, About, contact, policies, recipes and administration copy use the same language preference. Customer/admin/owner authentication remains independent. Names, user-written reviews, addresses, email/contact strings, SKU/order IDs, security keys and original product/branding images remain as supplied rather than being translated as UI copy.

The variable **Noto Sans Devanagari** font is bundled at `public/fonts/NotoSansDevanagari.ttf`; its OFL licence is alongside it. Hindi rendering does not depend on a runtime font service. Source: [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/notosansdevanagari). The implementation uses [Next.js dictionaries and locale-aware rendering](https://nextjs.org/docs/app/guides/internationalization) with React context. Existing client/server boundaries are preserved.

New UI copy should be added to the shared dictionaries and rendered with `<Text>` (or `useLocale().t`). `<LocalizedAttrs>` handles a single element's `aria-label`, `alt`, `title`, `placeholder` and language; it preserves handlers, refs, form values and keys. `scripts/localize-source.js` is a JSX migration helper with a dry-run default. It is not a production runtime translator.

Products support `hindiName` and the additional `hindiDescription`. English descriptions/names remain unchanged. The three existing demo descriptions are translated in the catalogue. For future products, provide the Hindi fields. Missing Hindi content displays a Hindi availability fallback; it never invents a description or presents an untranslated English description as Hindi. Product names remain localized through the bag and order snapshot. Original packaging/brand artwork is retained.

## Guest and customer flow

Guests can browse, search, select packs, add/remove cart products and change quantities. Their existing persistent HttpOnly guest cookie identifies their MongoDB bag, including after refresh. Add to Cart never requires login. Favourite controls are hidden for guests; directly opening `/wishlist` offers a sign-in link.

**Proceed to Checkout** sends a guest to `/login?next=%2Fcheckout`. Buy Now adds the selected pack first, then follows the same login rule. Direct guest access to `/checkout` also redirects. The existing mobile OTP (SMS/WhatsApp) and Google login both return to the validated shopping destination. An active customer session skips login.

Existing transactional cart merge uses one line per product/variant, combines quantities with the saved customer bag up to current stock/quantity limits, and clears the guest bag only after commit. If the customer bag was empty and stock/prices are unchanged, selected quantities and totals remain identical across login. Existing customer items, price changes and stock limits can legitimately change the combined total. The server always recalculates current prices, delivery and availability before checkout; client-supplied prices are never authoritative.

Checkout continues through delivery, review, demo payment and confirmation. Pending demo payment can be restored after refresh. All three demo outcomes remain available. Existing production/demo guards and payment idempotency/stock reservation logic remain in force. No live payment or shipment is introduced.

## Private MongoDB favourites

The `Wishlist` collection has one document whose `_id` is the authenticated customer's ID and whose `productIds` array contains product references. Atomic `$addToSet` prevents duplicate/concurrent additions; `$pull` removes favourites. APIs derive the owner exclusively from the verified customer session. They never accept a submitted customer ID. Responses include only currently published products allowed in the current environment.

| API (under `/api/v1`) | Behaviour |
| --- | --- |
| `GET /wishlist` | Current customer's slugs and hydrated products; no-store |
| `PUT /wishlist/:slug` | Add a published product idempotently; empty JSON body |
| `DELETE /wishlist/:slug` | Remove a saved product idempotently; empty JSON body |
| `POST /checkout/preview` | Authenticated customer, allowed Origin, current prices/stock |
| `POST /demo-payments` | Authenticated customer, allowed Origin, existing demo guards and ownership checks |

Wishlist writes require an allowed Origin. Unknown body fields are rejected. Another customer's query/body ID cannot expose or mutate a wishlist. Logout clears client favourites immediately; revoked/expired/suspended customer sessions cannot use these APIs. Staff/owner cookies alone never authorize a customer wishlist or checkout, and customer cookies never authorize staff data.

`StoreProvider` restores account favourites with the bag and session, after login and on navigation/focus. New favourites are stored only in MongoDB. Legacy browser-only favourites cannot establish an account owner: the old local data is left untouched, is not used for the new interface, and is not silently imported into a customer account. Server records restore on later logins and in a fresh browser after authenticating the same customer. Customers may toggle hearts on cards/details or remove products from `/wishlist`.

## Verification and provider setup

See [the verification report](../verification/verification.md) for executed test results and Hindi screenshots. Automated tests use unique temporary MongoDB replica-set databases which are dropped afterward; the visible demo database is preserved. OTP delivery and Google use explicit isolated fixtures. Live provider credentials/consent are still required as described in [customer authentication](CUSTOMER_AUTH.md).
