# Milestone 2 — persistence and secure access

> This is the M2 checkpoint record. M3 is now implemented; follow [the current setup and handover](15_MILESTONE_3_HANDOVER.md) for background jobs, manager settings, reviewed rules and backup/restore.

Implemented locally on 24 October 2026. The interface now uses the Hono API, local D1 and private local R2. All current records/terms remain fictional. No deployment or live integration has been activated.

## Start

From `Soulsteps_Codex_Starter_Pack`:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173 and leave the command running. It applies local migrations, seeds missing fictional records without overwriting edits, starts the Worker on 8787 and Vite on 5173. It builds initial assets when needed. Both ports must be free.

For the built interface in Workers only:

```powershell
npm run db:migrate:local
npm run db:seed:local
npm run build
npm run dev:worker
```

Open http://127.0.0.1:8787. Data is stored in ignored `.wrangler/state/`, shared by both launch paths. Do not delete it to resolve a connection issue. M1 browser storage (`soulsteps-demo-v1`) is retained but is no longer the data source; it is not silently imported.

## Implemented

- All six screens use the API adapter. Explicit existing-customer selection creates repeat enquiries with independent histories and a detail selector.
- D1/Drizzle schema/migrations cover users, customers, trips, enquiries, sources, tasks, activities, quotations, payments, bookings, files, idempotency and audit. Ownership, due times, payment status and activity are indexed.
- Calls, linked-task completion, follow-ups, notes, stage/qualification changes and financial actions persist with the authenticated actor. Original notes stay separate.
- Accepted quotation snapshots remain immutable; recording, bank verification and booking confirmation are separate. Partial/missing deposit and overpayment guards remain. One booking per enquiry, outstanding balances and manager-only reversals with reason/actor/time.
- Conditional atomic D1 batches check enquiry revision. Child records, audit and request receipts only change if the parent update wins. Stale edits return 409; repeated keys return the committed result; keys reused for another action return 409.
- Private PDF/PNG/JPEG receipts up to 5 MB, signature/extension validation, optional payment association and authorised downloads. Upload never verifies funds. Attachment downloads have no-store, nosniff and sandbox headers.
- Database triggers protect append-only activities/audit and issued quotes, and prevent payment deletion/amount replacement.
- Every staff API request checks active identity, ownership and role. Mutations require a trusted Origin and custom request header. Frontend role controls do not grant permissions.

## Identity and live setup

`wrangler.local.jsonc` enables the labelled local fixtures only for loopback requests with APP_ENV=local. The original 12 records belong to Demo staff; an additional other-owner fixture exercises access isolation.

`wrangler.jsonc` compiles `__LOCAL_DEV__` as false and disables workers.dev. Changing APP_ENV or forging a local role cookie cannot enable the fixture in that build. Missing Access configuration fails closed.

Production validation checks RS256 signature using the configured Access JWKS endpoint, issuer, audience, expiry and mandatory claims. It requires an active D1 user matching normalised email AND explicitly invited Access subject. Role/active state is read on every API request. No public sign-up.

Live login still needs actual Access team domain/audience, protected application/domain, exact PUBLIC_APP_URL, invited identities and subjects, and separate staging/production D1/private R2 bindings. The production database ID remains a placeholder. No cloud resources have been created.

`.dev.vars.example` lists server variable names only. Never commit `.dev.vars`, JWTs or credentials. A local-only invitation helper exists:

```powershell
npm run users:invite:local -- --email invitee@example.invalid --subject verified-access-subject --name "Fictional staff" --role staff
```

It creates a local invitation record, not an Access application or invitation email. Real environment provisioning remains an operator action after configuration.

## Architecture

- `src/shared/domain.ts`: typed rules, Zod commands and server-supplied actor.
- `src/shared/api.ts`: request, identity and file contracts.
- `src/server/auth.ts`: Access, invitations, local guard, roles and origin checks.
- `src/server/repository.ts`: scoped reads, Drizzle trip queries and atomic D1 writes.
- `src/server/files.ts`: private R2 receipt lifecycle.
- `src/web/data/api.ts`: typed adapter used by the UI.
- `src/shared/seed.ts` / `scripts/seed.ts`: fictional local-only seed, separate from migrations.

Routes include me/state, paginated enquiries, enquiry detail/create/commands, trip edits, customers, bookings, manager reports, enquiry files and authorised downloads. Mutations require Origin, X-Soulsteps-Request: 1 and an Idempotency-Key where relevant. Health contains no customer data. Public Meta/WhatsApp endpoints remain later work.

## Verification

```powershell
npm run typecheck
npm run test
npm run test:e2e
npm audit
```

- Type-check and build pass; e2e builds before testing.
- 27 unit tests pass: domain safeguards and cryptographic Access signature/issuer/audience/expiry/mandatory-claim checks, including forged tokens.
- 10 real Worker/D1/R2 and browser tests pass: ownership/IDOR and manager restrictions, CSRF, simultaneous edits, idempotent payment/booking/create/upload, staff verification/confirmation, receipts staying unverified, attachment persistence, repeat customers, identity switching and daily flows.
- All six screens checked at 1440/768/390 px with no document overflow or runtime errors; keyboard dismissal and screenshots included.
- Production-config Worker tested with APP_ENV forced to local and forged local cookie/email header: staff access correctly fails closed.
- npm audit reports zero vulnerabilities. Miniflare undici is overridden to patched 7.30.1; the existing Drizzle esbuild override remains verified.
- Non-blocking warning: main JS is approximately 512 kB before gzip; route splitting remains a performance follow-up.

Tests use clean isolated `.wrangler/e2e-*` storage, installed Edge and port 8791. They do not reset the working database or normal browser context. Records persist through reload and a separate browser context.

## Remaining work and release

Live Access onboarding awaits configuration/identities. The authentication code and local permission tests are implemented; live login is not claimed. Next is M3: Cron/Queues/outbox for in-app tasks, retries/failure visibility, manager configuration/reviewed rule publication and backup/restore verification. M4 adds import preview/commit; M5 adds signed Meta intake. WhatsApp remains manual, with no inbox or simulated sync.

Multi-departure/price variants, fuller qualification fields, SQL-backed filters/report aggregation and malware scanning remain follow-on work. The current state endpoint loads only the authorised small team dataset. R2 and D1 cannot share a transaction: metadata failure cleans up the object, but process interruption between upload and metadata commit can leave an inaccessible orphan for M3 reconciliation.

Unresolved business inputs remain in docs/13: Norway P3/P6/visa policy, real itinerary/dates/prices/deposit terms, zero-deposit/overpayment/refund policy, identity/team scope, working hours, retention and migration sources. Unknown/mixed profiles keep Needs qualification.

No deployment, purchase, customer message, production import or live data transfer occurred. Local migration/seed helpers never use --remote. Keep fictional seeds out of production. Before release, back up the target D1, apply reviewed migrations in staging, verify private R2/identities and run staff/manager flows. Roll back only to schema-compatible code; code rollback does not undo migrations. Restore drill and retention policy remain release requirements.

Official references: [Access validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
