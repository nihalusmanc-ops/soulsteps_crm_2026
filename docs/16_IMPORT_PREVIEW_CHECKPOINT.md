# Historical import preview checkpoint

Milestone 4 is in progress, not complete. Milestone 3 remains the last completed milestone.

Run `npm run dev`, open http://127.0.0.1:5173/settings as the local manager, and select **Import preview**. Download the synthetic JSON fixture and choose it in the preview input. The app sends the document to the authenticated manager-only API for validation and SHA-256 checksum computation. The request body is not logged or persisted. The preview disappears on navigation/reload.

The synthetic mapping explicitly distinguishes v2's additional journey answer before group from v3. It preserves all raw string cells, their positions, trailing notes and style identifiers. IDs are strings; numeric cells are rejected rather than rounded. Duplicate IDs flag both occurrences, dummy names are excluded, shortened contacts cannot match customers, unknown versions require review, and ambiguous dates stay raw. Converted notes require confirmation evidence and cannot create a booking. Colours and CREATED/Done never become CRM stages.

This is a controlled JSON contract for fictional examples, not an Excel parser or an approved mapping of actual Meta forms. It accepts at most 500 rows and 1 MB. Do not use production customer data in this local demo. The original workbook was not supplied. No workbook authoring, formula evaluation, macro execution, customer messaging, database writes, tasks, payment verification or booking confirmation occur.

## Remaining M4 work

- Private original-file storage, persistent import batches and quarantined rows, with checksum and mapping version history.
- Controlled XLSX preprocessing that retains text IDs, cell types, styles and original coordinates; flag numeric IDs whose original precision cannot be established.
- Manager-reviewed form-ID mappings and row corrections; the synthetic header contract must not be represented as the real export format.
- Database-backed external-ID deduplication and complete validated contact matching. Email alone must not silently merge customers.
- Selected-row transactional commit, concurrency protection, progress and per-row errors, retry/idempotency checks, and source-attributed activities that preserve later staff edits.
- Counts reconciliation and owner review against the original workbook before any live migration.

The preview's candidate/review/skip counts are parsing results only. They are not create/update counts, and no candidate can currently be committed. These remaining engineering tasks do not require live credentials and should precede Meta integration.

## Validation

- Production build includes TypeScript checking.
- Unit tests cover positional mapping, unchanged source evidence, long string IDs, numeric ID rejection, duplicate quarantine and unsupported headers.
- Browser test uploads the synthetic fixture, checks unchanged live enquiries, disabled commit, layouts at 1440/768/390 pixels, runtime errors and direct staff API denial.

The existing main JavaScript chunk size warning remains non-blocking. See milestone 3 handover for local authentication and runtime setup. No schema migrations or new dependencies are introduced by this checkpoint; rollback is the code change alone.
