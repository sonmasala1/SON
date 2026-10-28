# SON MASALA UI readability

Typography and control sizing are shared by the storefront, customer authentication, admin and owner panels. The cream, green, gold and purple branding and existing page structure are retained. Express and MongoDB application code are unchanged.

`frontend/src/app/readability.css` defines the responsive type, icon and control tokens and component rules. The existing global, authentication and localization styles reference these tokens instead of 6–13px text sizes. `layout.jsx` loads the shared rules after those component styles. Tailwind's `text-xs`, `text-sm` and `text-base` map to the same readable scale.

| Token           | Mobile  | Desktop |
| --------------- | ------- | ------- |
| Hero            | 34–42px | 52–64px |
| Section heading | 28–34px | 36–44px |
| Product name    | 18–20px | 20–24px |
| Price           | 20–24px | 22–28px |
| Body / labels   | 16px    | 17–18px |
| Buttons         | 16px    | 17–18px |
| Supporting text | 14–15px | 15–16px |

Inter and Noto Sans Devanagari are served locally from `frontend/public/fonts/`, with `font-display: swap` and their SIL Open Font License files beside them. Inter comes from the [Google Fonts Inter source](https://github.com/google/fonts/tree/main/ofl/inter); Devanagari uses the existing [Noto Sans Devanagari asset](https://github.com/google/fonts/tree/main/ofl/notosansdevanagari). UI text uses these fonts; English display headings and the original wordmark retain their brand serif styling.

The shared SVG `Icon` defaults to 24px with a 1.9 stroke. Navbar controls use 26–28px icons, cart icons 28px, hearts 27px, footer icons 24px and staff navigation icons 24px. Icon controls and carousel dots have at least 44×44px targets. Regular buttons and inputs use a 52px minimum height; login action buttons use 54px. Controls can grow for wrapped labels.

Product actions stack on narrower cards. Checkout steps wrap instead of scrolling sideways. Dense staff tables become labelled records below 1100px; `StaffTableCell.jsx` localizes their labels while explicit table roles, column headers and native content remain available to assistive technology. All table changes are presentation only. Account names, IDs, permissions, form values, API calls and handlers are preserved.

Run `npm test`, `npm run test:e2e` and `npm run build` in `frontend/`. The browser suite needs the existing frontend development server and a transaction-capable local MongoDB test server. Its isolated Express/Mongoose fixtures exercise real persistence without changing the visible store.

`../../../frontend/e2e/readability.spec.js` checks English and Hindi at 375, 768, 1440 and 1920px: visible text is at least 14px, icon targets are at least 44px, inputs are at least 48px, controls do not clip, and page sections stay inside the viewport. It covers public pages, guest cart, OTP, checkout review/payment/confirmation, wishlist/account, both staff logins and dashboards, inventory, owner access/history/security and analytics. It waits for finite transitions before measuring. Existing tests cover Google, session persistence, stock/amount continuity and carousel interaction. Screenshots are saved as `../../verification/readability-*.png`.
