# Milestone 4 — historical import

The local synthetic import workflow is implemented. Actual workbook migration and approval of its form mappings remain pending owner review; the original file is not bundled. No production records, deployment, purchases, subscriptions or customer messages were involved.

## Run and review

From the repository folder, run `npm ci`, then `npm run dev`. The dev script applies local migrations and seeds missing fictional fixtures without replacing existing records. Open http://127.0.0.1:5173/settings, choose the manager identity, and select **Import preview**. Keep the terminal running.

1. Download the fictional JSON fixture and choose it in the file input. Preview is temporary and has no database writes.
2. Select **Save private review batch**. Exact input text is checksummed, stored privately in R2 and retained in D1 for restoration. The same bytes reopen the same batch. Saved batches survive reload.
3. Open a row, choose its trip and active staff owner, record a review reason and acknowledge the original notes/dates. Shortened or missing phones cannot be verified. Leave phone verification unchecked unless independently verified; the new customer then has no operational phone or WhatsApp shortcut.
4. Approve the row, select it, acknowledge the selected records and commit. Requests accept at most 25 rows, processed individually with persisted progress and errors. Refresh or retry interrupted requests safely.
5. Check the reconciled counts and resulting enquiry/activity. Dummy and blank rows are skipped. Unknown versions, duplicate IDs, incomplete shapes and missing identity stay quarantined and need a corrected source batch. A contact conflict returns the row to review. Technical failures remain ready with an error for retry.

The working local database contains a saved fictional batch with three quarantined rows and one excluded dummy. It has not committed these rows into enquiries. Browser commit tests use isolated storage.

## Controlled XLSX preprocessing

XLSX is handled locally by `scripts/preprocess-import.ts`; it is not uploaded to a third-party service or parsed in the browser. The CRM accepts its JSON output. This is a one-time controlled migration tool, not ongoing spreadsheet synchronisation.

Copy `samples/import-mapping.template.json` to a private working location. Its indexes and IDs are fictional examples and `reviewed` is deliberately false. Review the actual sheet, exact form IDs and per-version column positions; set the version and mapping accordingly. Indexes are zero-based; `headerRow` is one-based. Include the v2 journey column. Change `reviewed` only after that review.

```
npm run import:preprocess -- "private/source.xlsx" "private/reviewed-mapping.json" "private/preview.json"
```

The output path must not already exist. Upload `preview.json` into the manager preview. Keep the original workbook and reviewed mapping privately; neither belongs in Git. The output retains original cell coordinates, raw text/cell types, cached values, formula text, style IDs, full styles XML, source headers, source workbook checksum and mapping checksum. Normalised row numbers index the prepared document; `sourceCells.reference` retains the actual worksheet coordinates. Original colours have no CRM meaning.

The tool refuses macros/DTD/entity declarations, bounds ZIP expansion, and does not follow external links or execute formulas. Formula rows and numeric source-ID cells become unknown and cannot commit. Numeric IDs may already have lost precision in Excel; recover from a trusted source rather than converting them to plausible text. Unknown form IDs stay reviewable as raw rows. Workbook bounds: 4 MB compressed, 16 MB expanded, 1,000 ZIP entries, 500 data rows and 100 columns. CRM JSON bound: 1 MB, 500 rows. Split larger migrations into reviewed batches.

## Data and concurrency defaults

- Since M5, canonical external source key `lead:<lead ID>` is shared by historical and Meta intake; existing `historical:` keys remain recognised. An existing key skips the new row and links to the preserved enquiry. Changed legacy notes remain in the new batch; they do not silently overwrite or append to staff history. Update count is explicitly zero.
- Different external IDs create separate enquiries. Full E.164-shaped phones match only when the importing manager attests independent verification and the existing customer is marked verified. Name and available email evidence must agree. Multiple/conflicting verified matches stay in review. Partial numbers and email alone never merge customers.
- Every committed row is an atomic D1 batch: guarded row claim, optional customer, enquiry, source evidence, source-attributed activity, audit and final outcome. Revision checks and a unique external key prevent duplicate rows under concurrent retries. Contact/assignment changes invalidate the claim. No partial customer/enquiry survives a transaction failure.
- All imported enquiries start NEW, buying interest unassessed, and trip fit **Needs qualification**. Group/visa source answers remain evidence for staff assessment. Source CREATED/Done and historical colours do not establish sales progress. Converted notes do not establish money or booking.
- Operational creation time is receipt/commit time. Original timestamps are retained uninterpreted in source evidence and timeline attribution. No historic actor, date/year, callback, deposit, quotation, booking or customer consent is invented. No tasks or outbound jobs are generated.
- Preview, list, options, save, review, commit and source download require an authenticated manager. Same-origin mutation protection applies. Source downloads verify SHA-256 and use attachment disposition. Customer data is not logged.

## Storage and recovery

Migration `0009_sad_xavin.sql` adds `import_batches` and `import_rows` using Drizzle. No applied migration was edited. Apply it locally with `npm run db:migrate:local` if running components separately.

Backups now include 24 tables, including exact import source text and review state. Source download can be restored from D1 without relying on a surviving R2 import copy. The restore check verifies import source checksums through the restored manager API. Older M3 snapshots with neither import table restore those tables empty. Never delete the working database or roll back committed enquiries to undo an import; preserve the audit and use a reviewed corrective migration. Code rollback to M3 may leave these additive tables intact, but older code will not include them in newly generated backups.

## Checks and remaining owner inputs

Type-check/build, 54 unit/integration tests and 16 browser tests cover mapping/evidence, numeric IDs/formulas/macros, D1 rollback/concurrent retries, duplicate source IDs, staff history preservation, verified customer matching and conflicting contact quarantine. Browser checks cover manager preview/reload/review/commit, source download, direct staff denial and responsive layouts. All existing workflow checks also pass after the UI selector correction. A restore drill passed all 24 table counts and one import source checksum with checks held and outbound messaging disabled. The existing >500 kB client chunk warning remains non-blocking.

Still required for real migration: privately reviewed original workbook, exact v2/v3 form-ID mappings and answer meanings, owner resolution of historical colours/dummy criteria/ambiguous notes, source/contact verification, selected-row/count reconciliation and cutover approval. Retention/deletion policy for historical evidence remains an owner decision. These are not approvals to deploy or import real data. Meta intake is M5 and still requires the actual assets, connector details and credentials.

Parser implementation references: [fflate ZIP filtering](https://github.com/101arrowz/fflate/blob/master/README.md) and [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser).
