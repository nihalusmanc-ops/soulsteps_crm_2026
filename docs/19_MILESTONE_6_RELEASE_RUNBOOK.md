# Milestone 6 — release preparation and remaining live gates

Local engineering preparation is complete. Staging and production are **not deployed or approved**. No resources, subscriptions, actual alerts, customer records or messages were created in an external account. Live M6 acceptance requires the owner reviews and account-level verification below.

## Local review and validation

Run `npm ci`, then `npm run dev`. Open http://127.0.0.1:5173/settings as manager and choose **Release readiness**. It shows actual database/task/job counts, backup freshness, background heartbeat, active staff, demo identity presence, trip configuration and lookup indexes. Cloud spend/alert state and external approval remain explicitly unverified. Refresh intervals are 30 seconds; this is an operational snapshot, not an approval authority or billing meter.

Local checks passed:

- Type-check and production frontend build; 68 unit/integration tests and 19 browser tests, including existing financial/staff/import/Meta flows.
- New browser checks cover manager-only readiness, static CSP/frame protection, API no-store/security headers and layouts at 1440/768/390 pixels. The compiled app remains functional under its CSP.
- Query-plan tests confirm indexed customer-enquiry and enquiry-task lookups. Additive migration `0011_far_joystick.sql` adds those indexes without editing applied migrations.
- Both staging and production templates pass structural isolation checks and Wrangler dry-run bundling. Compiled nonlocal bundles reject demo cookies, forged role/email headers and a runtime APP_ENV=local override.
- A completely isolated restore passes all 26 table counts, two synthetic attachment hashes, import source checksum and preserved Meta payload checks; processing restores held with outbound messaging disabled. No working CRM data is replaced.
- npm audit reports zero vulnerabilities. The existing >500 KB main client chunk warning remains non-blocking; route splitting and representative load testing remain performance follow-ups.

Commands:

```
npm test
npm run test:e2e
npm run release:templates
npm run release:bundle
npm run release:verify-auth
npm run release:restore
```

`release:bundle` hard-codes `wrangler deploy --dry-run` for both configs. It never publishes. `release:restore` uses new isolated storage and ports 8794/8793, refuses occupied ports, attaches two explicitly synthetic PNG storage fixtures without verifying money, saves fictional import/Meta evidence, then exercises the existing restore helper. It stops only its own child processes; normal ports 5173/8787 remain running. The ordinary restore helper also remains available for a local source via `npm run backup:restore-check`.

## Separate environments

| Environment | Configuration | Identity/data |
|---|---|---|
| Local | `wrangler.local.jsonc` | Loopback-only compiled local fixtures; fictional data |
| Isolated tests | `wrangler.test.jsonc` | Fresh temporary D1/R2 and distinct test queues |
| Staging | `wrangler.staging.jsonc` | Compiled nonlocal; real invited Access identities; approved synthetic data only |
| Production | `wrangler.jsonc` | Compiled nonlocal; real invited staff; owner-approved content/data only |

Staging/production declare separate Worker, D1, private R2, Queue and dead-letter names. Placeholder D1 IDs are deliberately unprovisioned; `.invalid` origins/custom domains and empty Access values cannot pass a release check. Bindings are fully declared per configuration, avoiding implicit environment inheritance. Neither template seeds demo data. Never run the local seed against an external account or copy the local database into production.

Production disables workers.dev and version preview URLs and declares its exact custom domain. Staging now uses the exact Access-configured `soulsteps-crm-staging.nihalusmanc.workers.dev` origin while GoDaddy access is unavailable, with no additional custom-domain routes and version previews disabled. Both route `/api/*` and `/webhooks/*` through the Worker and keep live Meta disabled. The temporary-origin release-policy exception is staging-only and still requires evidence of actual Access protection and invited identity verification; configuration is not proof of a live login. When moving staging to a custom domain, replace origin and route together and disable workers.dev. Use separate Access applications/audiences and environment-specific secrets. The Access team may be shared, but identity invitations, data and audiences must remain correctly scoped. Do not reuse a database, bucket, queue or dead-letter queue across environments.

No real secret is supplied. `.env.example` lists server bindings. Keep Meta secrets/tokens and Cloudflare API credentials in environment-specific secret storage, never `VITE_` variables, Git, ordinary logs or evidence artifacts. PUBLIC_APP_URL, team hostname and Access audience are non-secret configuration. Production invitations must bind the actual Access subject plus exact email to an active staff/manager record through an owner-reviewed operator action. The existing invitation script is local-only; it does not provision production users or send email.

## Evidence checker

Copy `release/evidence.example.json` into the ignored `private/` directory. It contains only pending entries, no approvals. For the release candidate, record the exact `git rev-parse HEAD`, environment, actual reviewer, UTC approval time and evidence references. Evidence is limited to 30 days and must match a clean committed source tree. Do not commit real identities, workbook content, JWTs, tokens or customer information in this record.

```
npm run release:check -- --environment staging --evidence private/staging-release.json
npm run release:check -- --environment production --evidence private/production-release.json
```

Missing config/approval returns exit code 1 with `eligibleForHumanReview:false`. That is the expected outcome for the supplied templates, not a failing CRM test. Structural-only `release:templates` may pass while an actual release remains blocked. A successful evidence check means the candidate can be reviewed by an authorised human; it neither verifies external resources itself nor deploys anything. It is not a substitute for platform access controls or a signed business approval. An operator can run Wrangler directly, so restrict deployment credentials and branch permissions accordingly.

Required evidence:

- Access and invitations: real staging staff/manager round trip; uninvited/inactive identities rejected; staff scope and direct manager-route denial; role revocation takes effect.
- Storage/domains: private R2 with no public bucket/custom-domain access, protected custom staff hostname, disabled alternate/preview URLs, exact signed webhook exception only. Confirm secrets differ and no fixture-auth path is available.
- Staff workflow: assigned enquiries, call/follow-up/history, quote snapshot, partial/unverified deposits, explicit verification/confirmation and reversals using approved synthetic staging scenarios. Real funds are not needed to demonstrate test flows.
- Restore: completed private snapshot plus authorised downloads and a restoration into a separate recovery environment, checksum/count reconciliation and held processing. Local reports establish local behaviour; account-level staging recovery still requires verification.
- Monitoring/budget: actual account metrics/notifications, approved spending threshold, recipients, plan support, operational response owner and a delivered platform test alert when authorised.
- Retention/recovery: approved private-data retention/access/deletion policy and incident owner. No automatic evidence deletion is implemented or approved.
- Rollback: recorded previous known-good Worker version, schema compatibility, immutable financial/source audit protection and a reviewed data recovery decision path.
- Staging synthetic-data confirmation; production instead requires approved actual content/terms and ranking policy, including explicit Needs qualification for unresolved cases.
- Production migration/cutover reconciliation and Meta test-lead acceptance. Either may be explicitly deferred by the owner with evidence of a manual-only release scope; the code does not assume that choice. Enabling live Meta requires approved acceptance and cannot pass on a deferral.

No production content, actual prices/deposits, P3/P6 interpretation, consent, availability, provider connectivity or owner approval has been invented.

## Platform monitoring and budget setup

The templates propose 1,000 ms maximum CPU per invocation, five-minute Cron and 10% custom-log sampling. Confirm the selected plan supports those settings and that representative workloads fit before release. These are proposed engineering defaults, not an approved subscription or a total spending cap. Automatic invocation logs are disabled and query strings redacted to avoid logging webhook verify tokens. Traces remain disabled. Ordinary application errors use request IDs and sanitised messages.

The owner/operator should configure and verify:

| Signal | Proposed investigation threshold / response |
|---|---|
| Worker errors/CPU/latency | Baseline during staging; investigate errors or CPU exhaustion; retain sanitised request IDs |
| Background heartbeat | More than 15 minutes since successful sweep: inspect Cron, bindings, queue and pause/hold state |
| Private backup | More than 26 hours since completion: inspect failed job/R2 and verify recovery before risky changes |
| Queue/dead letters | Any failed job/dead-letter growth: investigate; do not blindly replay money or intake |
| Meta intake | Failed/blocked/review records and provider token failures: inspect mapping/credentials and deduped reconciliation |
| D1 | Rows read/written, storage, latency and query plans; compare before/after index changes |
| R2 | Storage, request volume, missing/unlinked objects and backup growth; no automatic deletion |
| Account billable usage | Owner-selected budget and warning/critical thresholds with approved recipients and incident response |

Cloudflare budget alerts notify when account-wide usage-based spend crosses a threshold; **they do not pause or cap usage**. Plan/account eligibility and actual dashboard delivery must be checked. No alert recipient or notification was configured here. CRM counts in Release readiness are not Cloudflare usage/cost measurements. The state API currently hydrates all records in the permitted scope; validate representative team/data scale and watch D1 reads before large migration. Indexes improve lookups but also add indexed writes.

## Staging, migration and release sequence

All external changes below require the owner's concrete approved release scope and credentials. They were not executed in this milestone.

1. Provision distinct account resources, configure placeholders/domains/Access/secret storage, and review the exact config diff. Confirm no unintended paid plan or service change. Preserve the current connector and phone app.
2. Apply reviewed migrations to the chosen staging database, bind invited test staff/manager identities, and release the exact validated candidate to staging. Populate only explicitly fictional staging data via an owner-reviewed method; never enable the compile-time local bypass to do so.
3. Execute the authenticated workflow and permission matrix above, private file checks, real account restore exercise and monitoring/alert verification. Verify a test lead using dedicated authorised Meta assets if in scope; keep customer messaging off. Save evidence for the exact committed candidate.
4. Owner reviews Norway ranking preview and actual trip content, prices, deposits and quotation/availability conditions. Preserve unresolved cases as Needs qualification and keep old quote terms immutable. Record permitted manual-only deferrals explicitly if chosen.
5. For historical migration, freeze legacy edits at an agreed time, save the exact private source/checksum, identify schema/form IDs and confirm the authoritative writer. Preview v2/v3 separately; reconcile create/skip/review/error counts and excluded dummy rows. Resolve source IDs/contact conflicts/ambiguous history without inventing dates or payments. Save a pre-cutover backup and verify recovery.
6. Commit only selected reviewed rows; reconcile each selected source ID with its outcome and preserve quarantine. Verify repeated import is safe, balances/verified deposits/bookings were not fabricated, original notes/styles survived and newer staff edits remain. Never “roll back” by deleting activity or financial history.
7. For Meta cutover, verify the existing lead-to-Excel connector and correct assets. Select one authoritative intake path at the agreed boundary or explicitly retain a temporary connector with shared-ID deduplication. Test retries, replay and bounded form reconciliation. Do not enable greetings or any WhatsApp automation.
8. Re-run the full candidate checks and environment evidence checker. Obtain final owner approval of the concrete config, data/content scope, cutover counts and rollback plan. Deployment credentials and branch protections must enforce who can execute the approved release.
9. Only then deploy the reviewed candidate to production, perform unauthenticated/authorised/staff/manager smoke checks, verify private storage and domains, observe jobs/intake/usage, and record deployed version/time. A local green build is not this production acceptance.

The validation workflow in `.github/workflows/validate.yml` runs local checks on push/PR/manual invocation with read-only repository permissions, SHA-pinned actions and no deployment secrets/step. Browser CI uses Chromium; local checks use Edge. Synthetic-only reports/screenshots are retained seven days; private source/buckets/secrets are excluded. The workflow file and its commands were validated locally, but no hosted GitHub run or branch protection was configured here. Workers Builds must not be configured to auto-publish before the owner's release gate.

## Rollback and incident recovery

Pause in-app processing and Meta activation if needed; record the incident and preserve the current snapshot/source/audit. Collect request IDs and operational state without logging customer records or secrets. Decide whether the problem is code, configuration or data before making a change.

For an authorised **code** rollback, select and record a specific known-good version and its schema compatibility. The verified Wrangler form is `npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config <TARGET_CONFIG>`; this changes the active Worker immediately and must not be run merely as a local check. A Worker rollback does not undo D1 data, schema migrations, R2 objects, bindings/secrets or imported customer history. Leave additive M6 indexes in place unless a reviewed correction requires otherwise. Earlier code may omit later tables from backups; maintain an appropriate backup implementation.

For **data** recovery, restore into a separate environment first, reconcile all table counts, receipt/source hashes, recent quotes/payments/bookings and immutable history, and keep jobs held/outbound off. Evaluate writes received after the snapshot, point-in-time recovery availability and a reviewed replay/correction plan. Replacing a live database can lose valid payments/history and needs explicit owner approval, a freeze and a verified recovery point. The supplied restore helper intentionally refuses remote/nonloopback targets and cannot overwrite production.

Release a recovery hold only after operator/owner review of tasks, financial records, files, source IDs and connector state. Held Meta records still require explicit retry. Keep WhatsApp manual; there is no customer-send pipeline to reactivate.

## Official references checked

- [Wrangler environments and non-inherited bindings](https://developers.cloudflare.com/workers/wrangler/environments/), [configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [Worker logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/) and [Worker CPU limits](https://developers.cloudflare.com/workers/platform/limits/).
- [Budget alerts and their limits](https://developers.cloudflare.com/billing/manage/budget-alerts/), [usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) and [D1 usage metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).
- [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). Current CLI options/schema were also checked against the pinned installed Wrangler.
