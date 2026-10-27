# Current Meta workbook migration — 27 October 2026

The owner explicitly requested importing the current workbook and subsequently confirmed all sections and universal account access. This authorizes real customer records in the existing private staging CRM. It does not authorize messages, customer automation, verified payments or production deployment.

## Mapping and reconciliation

The supplied workbook contains eight sections: Norway Form, Norway Form- v2, Norway Form- v3 - nov trip, Norway Form- v4, INTERESTED PAX, WOMENS TRIP, NEXT YEAR and CALL LISt. The four Meta forms have different column positions; the first sheet's header is not its first row. The working lists include shortened layouts, copied Meta rows and name-only notes. Mapping was checked against the actual headers and cell references, not the synthetic fixture mapping.

There are 352 Meta row occurrences, 341 distinct Meta IDs and three distinct dummy/test leads. The 338 genuine IDs resolve to 312 exact-name/full-phone customer groups. Repeat submissions retain every Meta ID and source answer under the same enquiry. An empty email is not treated as a conflicting address; all original email cells remain in source evidence. Phones are submitted contact details, not independently verified contacts or messaging consent.

All eight sections yield 373 source rows: 363 link to enquiries, three test rows are excluded, and seven name-only entries in INTERESTED PAX remain quarantined at source rows 17, 18, 19, 20, 22, 23 and 24. Shorthand names are not guessed against full customer names. All source cells, style references, headers, notes and source locations are retained in private import batches. The original workbook is also archived privately.

Clear, consistent solo/two-person answers populate group/traveller fields. Group-wide visa coverage is not inferred from one person's yes/no answer; solo answers can be represented without that ambiguity. Mixed/conflicting or family/small-group wording remains unqualified. All ranks remain Needs qualification until staff confirm current details and reviewed rules. Old colours and workbook priority comments are preserved without inventing their meaning. Historical call dates, conversions, quotes and payments do not create appointments, bookings or verified deposits.

Original unambiguous ISO submission timestamps supply lead creation dates. Import activities use the migration time and are labelled source history, rather than fabricated call events. A draft Norway enquiry trip has no invented departure, price, itinerary or availability. Existing China trip content is preserved.

## Shared team access

The owner's universal-access instruction is implemented as an explicit `shared` enquiry flag. Every authenticated active staff/manager account can read and work on shared enquiries and their files/reminders. Existing private records retain their ownership boundary. The stored owner remains the accountable coordinator; shared records display Shared team. New manually created enquiries are shared, and a manager can create one without fabricating a staff account. Manager-only settings, reports and financial reversal permission remain restricted.

Enquiries has a workbook-section filter so all eight sections remain accessible without duplicating customers. Saved import batches show section names instead of only hash IDs. Source records linked to an existing enquiry count as imported rows, not newly created enquiries.

## Validation and safeguards

Before changes, remote counts were zero customers/enquiries/import batches, one existing China trip and no active staff accounts. A private D1 export was taken before migration. Original workbook, prepared JSON, operator SQL and backup stay in ignored `.wrangler/current-meta-import`, never frontend assets or Git.

An in-memory SQLite simulation against the pre-import schema/data verifies 312 customers/enquiries, eight batches, 373 import rows, 338 original Meta lead keys, 352 source records and 363 source activities. Replaying the SQL does not change counts. Foreign keys pass. All eight sections are reachable through shared staff scope; no tasks, payments or bookings are generated. The simulation reads data only in memory and logs aggregate counts.

Two additional SQLite-backed tests verify staff shared-read/update behavior, continued private-record isolation and denied financial reversal. Forty-four selected rule/auth/import/release tests, the three form-control browser tests and build pass. Full local Workers-runtime testing remains blocked by Windows Application Control; no policy bypass was used. Live database reconciliation and deployment details are recorded after execution.

## Executed migration

Published source `eb8b9d7` to staging as version `e7ac2f58-c752-4d37-a672-79fa65d5677d`. Archived nine private R2 objects: the original workbook and eight canonical section documents. Read-back of the original workbook matched its source SHA-256. Batch payloads were inserted with bound parameters to stay within [D1's SQL statement limit](https://developers.cloudflare.com/d1/platform/limits/); the remaining 2,025 bounded statements had a maximum size of 6,659 bytes. No production deployment or schema migration was needed.

Remote reconciliation verified exactly 312 customers, 312 shared enquiries, eight source batches, 373 source rows, 338 Meta lead IDs, seven pending identity rows and three excluded tests. All eight sections have linked records. Foreign-key validation returned no violations. Payments, bookings and scheduled tasks remain zero. Existing China trip, staff identities and password credentials were not overwritten. Import audit records identify the system operator and the owner's requested migration, rather than inventing staff call history or per-row customer verification.

All eight stored source batches were fetched privately and their checksums matched. Anonymous enquiries/state/import-batch APIs return HTTP 401 after the real customer data was loaded. Actual signed-in browser acceptance still requires the owner's own session; no password or session cookie was collected. The seven uncertain entries remain available in Settings → Import enquiries → INTERESTED PAX for identity review. Enquiries → More filters → workbook section selects any of the eight source lists.
