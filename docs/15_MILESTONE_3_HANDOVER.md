# Milestone 3 — follow-up reliability and management

Implemented locally on 24 October 2026. No deployment, service purchase, customer message or historical import was performed. Cloudflare Access and production resource configuration remain pending as documented in M2.

## Start and review

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173 and leave the process running. Existing local D1 edits are preserved. The command applies migrations and inserts missing fictional fixtures, starts Vite/Workers, and invokes the actual local scheduled handler initially after five seconds and then every minute. Computer sleep/server shutdown pauses local execution; the persisted outbox reconciles due tasks when execution resumes. Production configuration declares a five-minute Cron; it has not been deployed.

Manager navigation now includes Settings. Review Health & retries, Workspace settings and Audit history. Staff can see their due-task reminders in Today; marking a reminder seen does not complete the task. Trips offers rule preview/publication and reviewed manual-use content publication. Default Norway rules remain draft in the working database until a manager explicitly reviews them.

## Durable follow-ups

- Enquiry command batches persist task changes and their outbox rows atomically. Scheduled checks have stable IDs derived from task IDs. Rescheduling creates a new task and cancels the old task/check without overwriting history.
- Cron backfills any missing outbox entries, cancels checks that no longer match actionable tasks, recovers expired five-minute leases and dispatches a bounded set of six eligible jobs per sweep. Queue consumers process one message per invocation.
- Before creating a reminder, an atomic database batch rechecks task status/due time, current enquiry stage/owner, active staff and pause/recovery state. Completing/cancelling/holding/confirming an enquiry suppresses obsolete reminders. Note/rank edits do not invalidate an unchanged appointment.
- One notification per job is enforced by a unique database constraint. Repeated queue deliveries cannot create another task, payment, booking or reminder. Reminders remain tied to the existing task.
- Queue handoff and processing failures retain attempts, error text and next retry time. Exponential backoff is bounded at one hour; the proposed default budget is five attempts. Exhausted jobs stay failed and require a manager retry, which is audited. Three native Queue retries plus a dead-letter queue cover failures where the consumer cannot persist its own status. The D1 outbox remains the recovery source of truth.
- Manager health shows job states, current retry cycles, attempt history, last completed sweep, persistent failures and retry controls. Background processing never sends WhatsApp, email or SMS.

Local/test/restore queues and Worker names are separate. `wrangler.test.jsonc` and `.wrangler/e2e-*` isolate browser tests from the working database. The first-run backfill uses the sweep's captured timestamp, so an already-overdue task is eligible in that same sweep rather than accidentally waiting for the next tick.

## Manager settings and reporting

Versioned manager-only settings include Dubai business hours/days, follow-up suggestion, in-app reminder lead time, retry budget, pause state and stage labels/colours. Defaults are proposed: 09:00–18:00 Monday–Friday, 24-hour follow-up suggestion, zero-minute reminder lead time and five retries. Changing hours never reschedules an accepted callback. Appointments still require a staff-accepted time.

Stage codes remain stable; labels/colours affect presentation, not past activity. Colours must pass readable contrast against white. Unknown/mixed group/visa information remains Needs qualification. Customer outbound automation is fixed false and cannot be enabled through settings.

Overview retains date-labelled cohort conversion, cash and confirmation metrics, and now includes trip counts and current open enquiries older than seven days. Operational audit history records setting changes, publications, retries and backup requests. It is manager-only; financial/activity history remains append-only.

## Reviewed trip rules and content

Rules support known group/visa fields, enabled flags, output ranks and explanations. Overlapping enabled conditions and duplicate rule IDs are rejected. The preview shows all 20 group/visa examples and each affected enquiry, including preserved overrides and closed/confirmed/held records.

Publication requires explicit review of a server-stored 15-minute preview. The trip revision and complete enquiry ID/revision snapshot are checked atomically; any intervening enquiry/trip edit requires a new preview. Publication stores an immutable reviewed rule version, recomputes only eligible enquiries in that trip and adds activity/audit records. Manual overrides and historical closed/confirmed ranking remain intact. Other trips are unaffected. New qualification edits use that trip's active rules.

Family/friends with all visas remain disabled in the draft defaults. The actual P3/P6 decision is still outstanding; testing alternative policies in isolated test storage is not business approval for production.

Managers can create fixed/bespoke draft trips and publish a reviewed content version for manual CRM use. Name, destination and description are required. Missing dates, prices, deposit terms or itinerary are explicitly shown; they do not prevent manual CRM work. Automated price/itinerary delivery stays disabled. Publishing never alters existing accepted quotation snapshots. Published content/rule versions are immutable at the database level.

## Private backups and receipt reconciliation

Daily backup jobs and manager-requested snapshots capture all 22 operational/configuration tables in one consistent D1 read batch. The backup job catalogue itself is excluded; it is operational archive bookkeeping. Snapshots include SHA-256 checksums, table counts and private copies of every referenced receipt.

Receipt copying is checkpointed in groups of eight per queue invocation. Successful progress resets the consecutive failure budget, persists its cursor/manifest and queues the continuation. If that handoff fails, the outbox resumes it. A partial backup is not downloadable as a completed snapshot. The database manifest has a 16 MB bound; larger datasets require a partitioned export implementation rather than silently producing an incomplete backup.

Backups and receipt copies stay in private R2 prefixes. Manager-only downloads are authorised by the API; there are no public storage links. Receipt reconciliation reports missing references and unlinked receipt objects, with a 15-minute in-flight upload grace period. Scans are bounded at 5,000 objects and clearly flag truncation. No receipt or backup is automatically deleted. Retention/cleanup policy still needs owner approval before live release.

### Restore drill

With the local source running and checks enabled:

```powershell
npm run backup:restore-check
```

An alternate isolated local source can be selected with `-- --source http://127.0.0.1:8794`. The helper accepts only loopback HTTP sources. Destination port 8793 must be free.

The helper requests a private backup, verifies its hash, creates a new `.wrangler/restore-drill-*` database/storage directory, applies migrations, restores whitelisted tables using safely quoted values and compares every table count. It copies the archived receipts into isolated local R2, verifies their hashes again through authorised download routes, and checks that restored jobs remain held. It never restores over the working CRM database.

Pending/queued/processing/failed jobs are restored held; settings have jobsPaused=true, recoveryHold=true and outboundEnabled=false. A manager must review tasks, financial records and receipt availability before explicitly releasing the hold for in-app checks. There is no customer-send capability to reactivate.

The drill passed against a synthetic dataset containing 17 enquiries, three bookings, two receipt files, published content and two reviewed rule versions. All 22 table counts and both receipt hashes matched. A machine-readable report is retained under the ignored restore-drill directory.

## Validation

- Type-check and production build pass.
- 41 Vitest tests pass, including real Miniflare D1/R2 tests for atomic outbox insertion, same-sweep backfill, duplicate delivery, queue handoff recovery, cancellation/reschedule guards, retry exhaustion, expired leases, recovery holds, early reminder windows, checkpointed backups and storage diagnostics.
- 14 Playwright/Worker tests pass: existing staff/payment flows, real local Queue processing, manager/owner permissions, stale settings and rule previews, idempotent publication, trip isolation, preserved overrides/closed records, immutable quotations and manager UI actions.
- Seven screens checked at 1440/768/390 px with no document overflow or browser runtime errors. Desktop/mobile screenshots and dialog keyboard checks are included.
- Private backup restore drill passes. npm audit reports zero vulnerabilities.
- Build retains a non-blocking main-JS size warning, approximately 542 kB before gzip. Route splitting remains a performance follow-up.

## Remaining decisions and next milestone

Production Access/identities, real D1/R2/Queue bindings and operational monitoring are not provisioned. Native Queue dead letters remain a platform-operations concern; the CRM exposes durable D1 failure/retry history. Live restore, retention/cleanup policy, budget/resource limits and deployment checks remain release gates. Users/invited identities still use the operator-managed M2 workflow. No real Norway content or commercial terms have been invented.

Next is M4: synthetic historical import mapping/preview, preservation of original notes/styles/source IDs, ambiguity quarantine and idempotent commit. Real workbook review and Meta credentials only block their respective integration steps. WhatsApp remains manual; no Phase 1 inbox or message synchronisation was added.

Official references checked: [Queues local development](https://developers.cloudflare.com/queues/configuration/local-development/), [Queue retries](https://developers.cloudflare.com/queues/configuration/batching-retries/), [Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
