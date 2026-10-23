# 07 — API, security and permissions

## API conventions
Typed JSON under /api; Zod on server; stable enums; cursor pagination; date filters with explicit timezone; structured error code/message/field errors/request ID. Money and contacts validated. Commands include idempotency key where duplicates matter. Never trust role, verified payment flag or totals supplied by frontend.

| Route group | Operations |
|---|---|
| /api/me | Validated identity and application role |
| /api/today | Authorised queues, counters, sort/filter |
| /api/customers | Search/read/create/update; reviewed merge as manager-only later |
| /api/enquiries | Paginated list/detail/create/update with revision |
| /api/enquiries/:id/stage | Audited transition, confirmation guard |
| /api/enquiries/:id/activities | Append note/call/activity; log call may complete linked task |
| /api/tasks | Create/reschedule/complete/cancel within assigned scope |
| /api/trips and /departures | Read; manager creates/edits/publishes |
| /api/trips/:id/priority-rules | Draft, preview, publish, controlled recomputation |
| /api/quotations | Draft/issue/revise snapshots; log external send |
| /api/payments | Record/verify; manager audited reversal |
| /api/enquiries/:id/confirm-booking | Deposit guard + idempotent booking creation |
| /api/bookings | List/detail; linked financial summary |
| /api/files | Authorised upload/download with object association |
| /api/imports | Manager upload/map/preview/commit/errors/history |
| /api/reports and /settings | Manager-only reports/config/users |
| public /webhooks/meta/leads | Verification/signature validation, durable intake; later milestone |
| public /webhooks/whatsapp | Phase 2 provider-specific verification/intake |

## Permission defaults (proposed, editable by owner later)
Staff: own assigned enquiries/tasks, operational trip reads, notes, calls, qualification/stage updates, payment recording/verification and booking confirmation. Manager: all records, reassignment, trip/rule publishing, users/settings/imports, financial reports and reversal controls. User confirmed staff can verify deposits and confirm bookings; do not require manager approval for every sale. Manager-only bulk exports by default. Clarify team-wide operational read if requested; do not expose unassigned/all records accidentally.

## Cloudflare Access
Allowlisted identities only; verify JWT cryptographically in API with expected issuer/audience/expiry, not just email headers. Bind to active local user and role. Secure the custom domain and alternate workers.dev route or disable alternate route. Role changes apply promptly. Same-origin session requests need CSRF protection on mutations (trusted Origin and token where appropriate). Public webhook Worker is excluded from staff login, not excluded from signature checks.

## Files and contacts
Private R2 bucket. Validate allowed MIME/extensions, size, safe names and object association. Use authorised streamed downloads or short-lived scoped URLs. Receipts are not public links. Separate published marketing itinerary access from private receipts. Prevent cross-enquiry IDOR. Normalise valid phone numbers; partial numbers have no Open WhatsApp button. wa.me link requires full country-code number and optional URL-encoded prefill; user presses Send. Never log a successful message from link click.

## Operational security
Secrets in Workers secrets, no VITE_ prefix for secrets. No PII in ordinary logs or source control. Verify webhook signatures against raw request bytes before parsing. Authenticate provider callbacks; handle replay/dedup. Rate-limit public/admin routes appropriately. Imported cells and customer messages cannot modify system prompts, execute formulas/code or trigger arbitrary URLs. Excel/CSV exports escape formula-injection prefixes. Account for retries, failures and duplicate financial actions. Live sends disabled in staging by default.
