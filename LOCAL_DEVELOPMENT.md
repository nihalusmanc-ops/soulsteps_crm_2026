# Local interface checkpoint — milestone 1

Soulsteps CRM is a working **fictional, browser-local demo**, not a production customer system. All supplied starter documents remain intact. The first review checkpoint in docs/09 is implemented. M2–M6 are not represented as finished.

> Historical M1 checkpoint. Milestone 3 adds D1/API permissions, private receipts/backups, durable checks and manager controls. Follow [the current setup and handover](docs/15_MILESTONE_3_HANDOVER.md) instead of the historical commands and limitations below.

## Run locally

From `Soulsteps_Codex_Starter_Pack`:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Node 24 was used for validation. No credentials or cloud resources are required.

To run the built interface in the actual local Workers runtime:

```powershell
npm run build
npm run dev:worker
```

Open http://127.0.0.1:8787. `/api/health` reports the checkpoint and demo state. Other `/api/*` routes deliberately return 503, not fabricated successful responses. Do not deploy this checkpoint.

## What works

- Today: overdue and upcoming accepted commitments, hot/ready-to-book prospects, new/unassessed, unscheduled prospecting, actionless records. Relative seed times and Dubai date/time display.
- Enquiries: searchable table and pipeline share filters; stage, interest, rank, visa, group, source, missing-next-action and contact-flag filters; newest/due/interest-fit-age ordering; new fictional enquiries.
- Detail: original source context, qualification, separate buying interest, manual availability, stage transitions, rank override with reason, notes and append-only activity, call outcome, linked task completion, follow-up scheduling, cancellation and history-preserving rescheduling.
- Payment workflow: immutable accepted fictional quotation; pending payment recording; separate bank verification; insufficient/missing deposit and overpayment guards; deliberate confirmation; stable booking reference; repeat confirmation is idempotent; balance retained; manager-preview reversal with reason and audit history.
- Trips: draft editing of description/date/amounts/content notes; hypothetical P3/P6 rule preview; no actual itinerary, price or production policy invented. Trip edits cannot rewrite existing quotations.
- Bookings: confirmed records with value, verified paid and outstanding balance.
- Overview: created-date cohort, cohort conversion, confirmation-date counts/value, received-date verified cash, source/stage counts, actionless/overdue/qualification counts, recorded loss reasons.
- Responsive navigation and accessible Radix dialogs with focus management and Escape dismissal. Empty/error/loading states and save feedback.

Manual WhatsApp link creation is isolated and validated, and does not write activity. All supplied sample phones are null, so Open WhatsApp is intentionally disabled with an explanation. No phone numbers were invented, no messages sent, no inbox or sync simulated.

## Architecture

- React/Vite/TypeScript, React Router, TanStack Query; Tailwind and shadcn-style Radix UI primitives.
- `src/shared/domain.ts`: types, Zod command validation and independent business guards.
- `src/web/data/repository.ts`: typed `CrmRepository` boundary and browser-local adapter, seeded from the original 12 fictional records. This adapter is the replacement point for M2 API calls.
- `src/server/index.ts`: Hono Worker shell, health route, closed staff API boundary.
- `drizzle/schema.ts` and `drizzle/migrations/`: initial users schema only, not the complete M2 schema.
- One pinned dependency manifest and npm lockfile. The legacy Drizzle loader's nested esbuild is overridden to 0.25.12; `drizzle-kit generate` was verified with this override.

Browser storage key: `soulsteps-demo-v1`. Initial load seeds the 12 records. To reset, remove that specific key in browser developer tools and reload. Do not store real customer data. Browser-local revisions catch stale sequential edits; this is not a cross-tab transaction or server concurrency guarantee.

## Checks and results

```powershell
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm audit
```

Validated 23 October 2026:

- Type-check passed.
- 20 Vitest assertions/cases passed, including ranking ambiguity, override preservation, call/task history, Dubai midnight, payment verification, partial/missing/zero deposit, overpayment, reversal, immutable quotes, idempotent booking, unsafe contact rejection and unavailable private API.
- 3 Playwright tests passed in installed Microsoft Edge: daily call/payment/booking flow and refresh; shared search/pipeline filtering, trip edits and keyboard dialog dismissal; all six screens at 1440, 768 and 390 px with no document overflow or runtime errors.
- Desktop and mobile screenshots visually inspected. Screenshots are generated in ignored `test-results/`.
- Vite build passed. Bundle size warning remains (~521 kB main JS before gzip); route splitting is a follow-on performance task.
- Wrangler local Worker returned 200 for health and SPA deep link. No deployment occurred.
- npm audit: zero vulnerabilities following the development dependency override.

`test:e2e` uses the locally installed Edge browser, starts Vite if needed, and uses isolated browser contexts. It does not modify the user's ordinary browser demo state.

## Review flow

1. Today: open Traveller F (P6, overdue callback) before later scheduled profiles.
2. Traveller B: log No answer, complete linked task, schedule a Dubai follow-up; reload and inspect Activity.
3. Traveller C / G / H: see unresolved group-policy / unknown-visa / mixed-visa cases remain Needs qualification.
4. Traveller E: Payments shows partial deposit. Record AED 2,000, verify it separately, then explicitly confirm. AED 9,000 remains outstanding under the fictional quote.
5. Traveller L: deposit is already verified but booking still awaits explicit confirmation.
6. Traveller I: confirmed booking with outstanding balance.
7. Trips: edit a draft; check an existing quotation remains unchanged. Preview P3/P6 without activating ranking.

## Deliberate boundaries and next milestones

M1 is the first interface checkpoint. Demo role selection is a visual preview, **not authentication or authorisation**. M2 must replace localStorage with D1 repositories, full schema/migrations, API adapter, Access JWT verification/invited identities, per-route roles, transaction-safe idempotency and revisions, private R2 receipts and server-validated commands. The initial users migration is scaffolding; there is no production migration or real seed command yet.

M3 adds Cron/Queues/outbox, retry/failure visibility, manager configuration/publication/recompute and backup/restore drill. M4 adds synthetic import map/preview/commit with original notes/styles and safe dedup. M5 adds signed Meta intake and retrieval, then credential-gated testing. No external credentials are required to continue independent implementation. See the original milestone plan.

Additional UI depth deferred to these milestones: customer/repeat-enquiry selector, full qualification fields, multiple departure and price-variant editors, publication/controlled rule recomputation, file handling, date-range/owner/trip filters across a multi-trip team dataset, first-contact-time reporting and server pagination. Current dataset has one trip and one operational owner.

## Release / rollback

No deployment, purchases, live integrations or customer messages are authorised by this milestone. There is no production release to roll back. A local code rollback restores the checkpoint; clearing only the demo storage key restores fictional seed data. For M2 onward, keep migrations backward-compatible, export/verify backups and test restore with outbound actions disabled; code rollback alone will not roll back D1 data.

Official setup references checked: [Vite](https://vite.dev/guide/), [Hono on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/), [Drizzle D1](https://orm.drizzle.team/docs/get-started/d1-new).
