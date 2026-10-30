# Optimistic UI audit — 30 October 2026

Scope: every browser mutation entry point in App, CallingWorkspace, TripsWorkspace,
Management, DueReminders, FilesPanel, AccountSecurity, ImportPreview and
MetaIntegration. No live records are changed during automated verification.

| Action                                                                     | Behaviour                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call colour, first call, repeated call and current note                    | Immediate row/tab/order/history update; rollback and original-request retry on failure.                                                                                                                                      |
| Standalone note, follow-up scheduling/rescheduling/completion/cancellation | Immediate update with rollback.                                                                                                                                                                                              |
| Contact, group, Schengen, traveller count and other enquiry details        | Immediate update, including other enquiries for the same customer.                                                                                                                                                           |
| Computed priority                                                          | Now recalculated immediately using the trip's active reviewed rules. Closed enquiries and manual overrides retain their existing priority. Missing rules remain Needs qualification. Server response reconciles stale rules. |
| Manual priority override                                                   | Now immediate, including the required reason and activity history; rollback on failure.                                                                                                                                      |
| Sales stage                                                                | Immediate for permitted transitions; booking confirmation cannot be bypassed.                                                                                                                                                |
| Record payment                                                             | Immediate payment, received totals and green converted colour. Booking confirmation stays separate and is disabled until saving finishes. Failed saves roll back.                                                            |
| Accepted quotation                                                         | Now immediate after the explicit acceptance step, including amounts and terms; rollback on failure. It cannot overwrite an existing accepted quote.                                                                          |
| Edit trip                                                                  | Now previews all valid draft edits, including price and deposit. Existing offered quotations and published content versions remain unchanged.                                                                                |
| Delete enquiry or trip                                                     | Now removes the record immediately after manager confirmation, returning to its list. Failure restores the affected record in order. Financial-history and linked-enquiry guards remain enforced on the server.              |
| Workspace defaults                                                         | Now immediate across settings consumers, with schema validation, cache rollback and retry of the original version/payload/key. Refocus cannot overwrite the pending preview.                                                 |
| Mark reminder seen                                                         | Immediate dismissal; failure restores the notification.                                                                                                                                                                      |
| Create enquiry                                                             | Waits for the server's real record ID and customer matching. Added a visible creating state and a synchronous duplicate-submit lock. Form input remains available on failure.                                                |
| Create trip                                                                | Waits for the real trip ID; editor already shows saving and prevents duplicate submission.                                                                                                                                   |
| Upload receipt                                                             | Shows upload progress and waits for private storage completion before offering download. A receipt never creates a payment.                                                                                                  |
| Reverse payment and confirm booking                                        | Explicit pending state until server confirmation. No booking reference is shown before it exists. Manual payments need no separate verification.                                                                             |
| Publish trip content or reviewed priority rules                            | Pending until server validates the reviewed version and affected records. Draft edits remain separate.                                                                                                                       |
| Import preview, save batch, approve source row and commit                  | Pending until server validation, source preservation, identity/duplicate checks and row revisions complete. Returned batch replaces the cache.                                                                               |
| Background checks, retry job, backup, storage review, recovery release     | Pending until the request is accepted; completion comes from job status. No fabricated successful jobs/backups.                                                                                                              |
| Meta mapping, reconciliation and retry                                     | Pending until source/version/identity validation. No customer sends enabled by this change.                                                                                                                                  |
| Login, logout and password changes                                         | Server-confirmed security state; no optimistic authentication or password success.                                                                                                                                           |

All optimistic CRM writes use the existing TanStack Query cache, shared command
validation, cancellation of in-flight reads, per-record rollback and reconciliation.
Uncertain responses retain the original request key for retry. Saving is displayed
while pending; success is displayed only after acknowledgement. No new dependency
or database migration is required.

Verification includes delayed responses, rejected writes, lost responses,
idempotent retries, stale revisions, shared contact propagation, protected deletes,
financial guards, new-enquiry duplicate submission and responsive layouts.

Completed checks: 51 tests across optimistic projections, calling rules, business
rules and database access; all 24 Playwright control/workflow tests; TypeScript
type-check and Vite production build. Vite retains its existing bundle-size advisory.
