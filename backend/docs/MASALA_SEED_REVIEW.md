# Atlas catalogue seed review

`scripts/seedMasalaProducts.js` reads database credentials from `backend/.env` through the existing configuration. It refuses a different Atlas hostname, a database other than `son_masala`, an implicit database, a configuration override that differs from `.env`, or an uninitialized/empty products collection. It retains the working DNS configuration and never calls model initialization or seed-demo scripts.

From `backend/`, run:

```powershell
npm run seed:masala -- --dry-run
```

Dry-run is also the default when no flag is supplied. It reads product/category/variant documents, validates proposed documents, and saves a local review report at `.runtime/masala-seed-dry-run.json`. No database documents, collections, indexes, prices or stock are changed. It checks all 26 required identities, existing alias records, duplicate product SKUs/slugs and variant SKUs, schema validity and local image paths.

After explicit approval of the report, run:

```powershell
npm run seed:masala -- --apply
```

Apply requires the preceding dry-run report. It compares fingerprints of the catalogue snapshot, proposed plan and source files, then repeats the snapshot check inside an Atlas transaction. Changed catalogue data or changed code requires a new dry-run and approval. Existing business prices, MRP, stock, IDs, slugs, SKUs, verification fields, status and featured flags are preserved. Missing records become unpriced drafts with unknown inventory; no sample prices or inventory are invented. Existing commercial photographs are retained. Known Unsplash stock references can be replaced with validated local representative artwork or a neutral placeholder. AI packaging concepts are explicitly marked `imageKind: representative-demo`; missing relevant photos use `imageKind: placeholder`. These notices are translated in the storefront.

The planner fills missing descriptions, Hindi descriptions, raw ingredient identity for individual spices, storage guidance and pack-size metadata. It does not invent blend formulations, botanical verification, origins, shelf lives or certifications. Proposed sizes on new drafts do not create stocked/available packs. Existing available sizes come from stored inventory.

Nine existing alias groups currently require editorial review. This seed does not merge, delete, rename or create extra records for those aliases. Exact SKU and slug uniqueness is reported separately from semantic overlap.

Public pages already load the Express catalogue dynamically, including featured products, category filters and product details. Admin listing includes drafts and retains size image metadata. Authentication remains required for the admin HTTP API. New drafts are not published by this script; publication requires actual product details, pricing and inventory. No project build is needed or run by this workflow.

Run safety tests with `node --test test/masala-seed.test.js`. After approved application, rerun the dry-run to confirm idempotency and review the saved applied report for actual document counts.
