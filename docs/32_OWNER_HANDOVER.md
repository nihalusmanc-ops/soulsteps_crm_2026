# Owner review — 29 October 2026

## Current hosted workspace

https://soulsteps-crm-staging.nihalusmanc.workers.dev

The existing hosted environment uses real saved enquiries and password authentication. Its infrastructure is still named staging; this update does not create a separate production environment or connect a custom domain. Meta retrieval and outbound automation remain disabled.

## Changes for handover

- Managers can delete an enquiry from its profile and an unused trip from Trips. Both require confirmation. Deletion removes the record from active lists and reports while retaining its data and audit history. Pending enquiry tasks/jobs are cancelled atomically. Customers and their other enquiries are retained.
- Enquiries with any payment or booking are protected. Trips with active enquiry references are protected. These checks are enforced in the API, not just the interface. Concurrent/stale writes use revision guards, transactional effects and idempotent retries. Migration 0013 prevents assigning enquiries to deleted trips even in a creation/deletion race.
- New enquiry offers a server-backed, debounced customer search by name, phone or email. It preserves access boundaries, returns at most 20 matches, and includes retained customers whose last enquiry was deleted. Selecting a customer creates a new enquiry against the same customer ID. New customer phone and email can be entered immediately.
- “Booking timeframe” is now **Expected booking decision**: when the customer intends to decide/book, separate from departure. It is optional and currently informational; it does not schedule a follow-up automatically.
- “Manual availability” is now **Availability check**: staff confirmation of supplier capacity/dates, not a reservation or booking confirmation.
- Removed demo/fictional wording from live enquiry creation, quotations, payment verification, booking confirmation, trip editing and reports. Corrected source reporting to use actual enquiry sources. Removed the example import download from the live import interface; import preparation requirements are stated honestly.
- Developer-only local fixtures remain explicitly labelled and gated to local development. Stored historical source data is preserved. The live database had no demo-owned or demo-ID enquiries; no real trips or enquiries were removed as part of cleanup.

## Review with the owner

1. Sign in as manager, then check the same shared enquiry as staff.
2. Search for an existing customer in New enquiry and confirm the right contact details before creating another enquiry.
3. Open a lead from any part of its row. Edit preferences, add a note, log a call and schedule a follow-up.
4. Confirm the stage, buying interest and trip-fit labels match the team's process. Review unresolved colour/qualification cases rather than assuming their meaning.
5. Review trip content and pricing. Missing prices, itinerary content and dates remain unset until supplied.
6. Explain the financial flow: accepted quotation → record payment → verify bank funds → explicitly confirm booking. Receipt attachment alone does not verify a payment.
7. Explain manager-only deletion and protected financial records. Audit-retained deletion has no self-service restore screen yet; an operator must restore from retained data/backup if needed.
8. Each account should choose its own password through Settings → Security before wider staff use. There is no public signup or automated email password recovery yet; account recovery is operator assisted.

## Validation and operations

56 focused tests cover domain rules, authentication/password rules, imports, release policy and real SQLite repository operations, including permissions, reuse of customer identity after deletion, stale revisions, idempotent deletion, follow-up cancellation, payment protection and trip guards. Browser controls check row navigation, notes, mobile layout, customer selection, deletion confirmation/cancellation and staff visibility. TypeScript and Vite build pass; Vite retains its existing bundle-size warning.

Local workerd integration tests remain unavailable under Windows application control. Browser API workflows use controlled test fixtures, and repository writes run against an in-process SQLite database with all migrations. These are not a complete production security or load audit.

A private pre-change D1 export is stored under ignored `.wrangler/`. Remote migration 0013 and the foreign-key integrity check succeeded. The two most recent scheduled backup runs were successful. Existing live customer records were not edited/deleted to test the new controls.

Rollback: redeploy the prior application version if needed. Migration 0013 is additive and compatible with the prior version; retain its guards. Do not restore the whole database over subsequent staff edits without reviewing the backup and newer writes. Full production deployment, custom domain, automated recovery, Meta activation and outbound automation are separate remaining work.
