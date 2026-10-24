# Milestone 5 — local Meta intake implementation

The direct-intake implementation is working with synthetic fixtures. Live M5 acceptance remains pending verification of the existing Excel connector, Meta app/page/forms, permissions and an official test-lead round trip. No deployment, live lead retrieval, subscriptions or customer messages occurred.

## Run and inspect

Run `npm ci`, then `npm run dev` from the repository. Open http://127.0.0.1:5173/settings as the local manager and select **Meta intake**. Keep the development server running. Migration `0010_oval_reavers.sql` is applied locally by the dev script; existing data is preserved. `npm run db:migrate:local` applies it independently.

The working demo contains one fictional unknown-form delivery in review, with preserved source data and no new enquiry. No Meta form mapping has been approved in the working database. For a complete isolated-style demonstration:

1. Review the fictional page/form IDs already shown, choose a trip and active staff owner, enter a reason and acknowledge the exact fields. Save the reviewed mapping. This approves fictional local routing only.
2. Choose **Add mapped fixture**. The real local Queue processes the durable record and creates one enquiry. It remains NEW, unassessed and Needs qualification. No tasks, quotation, payment, booking or outbound message is created.
3. **Add unknown-form fixture** preserves the payload in review without creating an enquiry. Add the exact form mapping and explicitly retry to process it later.
4. **Simulate one retrieval failure** records a failure and delayed retry. **Check pending leads** dispatches eligible work; it does not bypass the retry time. The local Cron driver also sweeps every minute; the production schedule is every five minutes.
5. Review source evidence and linked enquiries. Manager retries are audited. Ordinary retry reuses a saved lead response; **Retrieve again** on live review/failure records archives the previous response in the audit event before requesting fresh data.

The UI refreshes every five seconds. Totals cover all records; the delivery list shows the newest 100. This is an integration review view, not a messaging inbox. Synthetic controls require the compile-time local flag, loopback host, local environment and manager access. Production rejects synthetic processing.

## Intake and security contract

- Exact public endpoint: `GET/POST /webhooks/meta/leads`. The verification challenge requires the configured verify token and subscribe mode. POST verifies HMAC-SHA256 over exact raw bytes before JSON parsing or D1 writes. Missing/incorrect signatures are rejected. The endpoint is disabled by default, including in local mode.
- Public bodies are limited to 256 KB and 100 lead changes. IDs must be strings of digits; large IDs never pass through JavaScript numeric conversion. Other fields are preserved as untrusted source data, never executed or used as instructions.
- A successful webhook acknowledgement follows an atomic durable insert. Background request-context handoff dispatches pending Queue jobs immediately, with Cron as the recovery path. Duplicate lead IDs do not create additional work or enquiries. Conflicting page/form identities stay visible for review. No Graph request runs in the webhook request.
- Cron dispatches up to three eligible intake records through the existing Queue per sweep. Claims have five-minute leases. Stale deliveries recover; handoff, lease and processing failures consume a bounded attempt budget. Processing retries back off up to one hour; exhausted records remain failed for manager review. Workspace pause and recovery holds prevent processing and guard new enquiry creation atomically.
- Graph requests use only a configured version and numeric IDs on `https://graph.facebook.com`. The page token stays in the Authorization header; redirects are refused. Reads time out after ten seconds and responses are bounded to 256 KB. Error messages omit provider bodies, tokens and customer data. There is no arbitrary provider URL option or client-supplied fetch target.
- One configured page/token pair is supported initially. Other pages remain blocked. No live Graph version is guessed or defaulted. Local execution refuses live Graph calls even if credentials happen to be present.
- Submitted field names map explicitly to name/contact/group/visa and separate booking timeframe/travel selection keys. Unknown forms, duplicate field names, missing/ambiguous names or mismatched retrieved IDs/forms do not become enquiries. No travel month is inferred from question wording, no hot/warm interest is inferred, and no consent or WhatsApp session is inferred from form submission.
- Complete E.164-shaped form numbers are retained as **submitted**, not independently verified, for manual staff use. Shortened numbers remain raw evidence and have no WhatsApp shortcut. Meta numbers never automatically merge customers; source ID deduplication is stronger than contact matching. Source activity explicitly states that ownership/consent are unverified.
- Canonical external key `lead:<lead ID>` is shared with historical imports. Legacy `historical:` and `meta:` keys remain recognised in both lookup and the atomic creation guard. A Meta/historical overlap preserves the existing enquiry and staff history. Different lead IDs can create separate enquiries; repeated people with unverified contacts remain separate customers pending reviewed resolution.
- Automatic intake uses the same D1 transaction service as M4: optional customer, enquiry, source evidence, source-attributed activity, audit and persisted outcome succeed together. Submitted fields, original creation string/timezone, notification metadata, page/form/ad/adset/campaign IDs when provided, received time and mapping snapshot remain available privately. Existing enquiries are never rewritten by a changed mapping.
- Mapping changes use expected versions and audit the approving manager/reason. Approved snapshots are recorded with each processed lead. Already completed leads are not re-routed or changed. A mapping edit applies to subsequent processing attempts; review quarantined records explicitly.
- Every manager status/source/mapping/retry/backfill/reconciliation endpoint requires server-side manager permission and existing same-origin mutation protection. Staff cannot inspect lead-source payloads or configure the integration. All existing staff APIs retain Access authentication.

## Backfill and reconciliation

For a configured live mapping, **Scan latest 25 IDs** reads one bounded form-leads page and deduplicates its IDs into the same durable intake table. **Continue backfill** uses the stored opaque cursor. The code never follows the provider's `paging.next` URL. Re-scanning is safe; counts and cursor/last-scan metadata are visible per form. This is a bounded operator-driven reconciliation, not an unrestricted periodic historical download.

`POST /api/management/meta/backfill` accepts an authenticated manager's explicit `{pageId, formId, ids}` list of at most 25 known lead IDs for recovery. Local mode rejects live backfill/reconciliation; local fixtures exercise intake and retry independently. Existing Excel syncing is not modified. A signed notification is not proof that the app can retrieve the lead; blocked/permission failures remain visible.

## Live configuration still required

Server-only environment references are in `.env.example`. Never use `VITE_` variables or commit real `.dev.vars`/tokens. No real secret was installed.

| Variable | Purpose |
|---|---|
| `META_LIVE_INTAKE_ENABLED` | Explicit activation, defaults false |
| `META_APP_SECRET` | Raw-body signature validation |
| `META_VERIFY_TOKEN` | Owner-chosen webhook verification token |
| `META_PAGE_ID` | Authorised page ID |
| `META_PAGE_ACCESS_TOKEN` | Page token with approved lead access |
| `META_GRAPH_VERSION` | Explicit currently supported version, e.g. `vNN.0` after verification |

Before live acceptance, identify the present Meta-to-Excel connector and prevent duplicate ownership/cutover gaps; verify the correct Business assets, app mode/review, page subscription to leadgen, permissions, Leads Access Manager access, token lifecycle and any app-secret-proof requirements. Configure exact form IDs/submitted keys and approved owners/trips. Verify field availability against the chosen Graph version. Establish a public HTTPS callback with an exact Cloudflare Access exception for `/webhooks/meta/leads` only; retain Access on staff routes and protect alternate domains. Configure public rate limits/monitoring as part of M6. No Access exception, external resource or subscription was changed here.

Then use Meta's official test-lead tool to verify challenge, signed event, retrieval, duplicates, a failed/retried retrieval and form-level reconciliation/counts. Confirm that the existing connector's same lead ID resolves to one enquiry. Confirm no form/WhatsApp greeting occurs. These checks require the owner's real asset configuration and cannot be replaced by the local fixtures.

Reference shapes were checked against [Meta's official sample](https://github.com/fbsamples/lead-ads-webhook-sample) and [Meta's lead-retrieval setup checker](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md). The sample is archived. The [current lead retrieval docs](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/) and [webhook docs](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/) returned HTTP 429 during this implementation; permissions and live behaviour must be verified in the actual app before activation. No unsupported promise of live connectivity is made.

## Validation, recovery and rollback

Type-check and build, 63 unit/integration tests and 18 browser tests passed. Unit/integration tests use actual Workers-compatible D1/R2, Web Crypto signatures and injected provider responses, without external Meta calls. Browser tests use the actual local Worker/Queue and isolated storage. Coverage includes raw-byte tampering, disabled ingress, challenge rejection, duplicate event/Queue/connector sources, unknown mapping recovery, complete submitted contacts without auto-merge, bounded backoff, queue handoff/lease recovery, pause, provider identity mismatch, pinned Graph URLs/cursors, permission denial, version conflicts, source preservation and mobile/tablet/desktop layouts.

Backups now include 26 tables, including `meta_forms` and `meta_leads`. The restore drill checks preserved Meta source payloads through the restored manager API. Pending/queued/processing/failed Meta records restore held, with global checks paused and outbound messaging disabled. Earlier M3/M4 snapshots initialise absent later table pairs empty. Inspect source and integration configuration before releasing recovery holds; held Meta records require explicit manager retry.

To stop live intake, set activation false and pause processing; already acknowledged records remain durable. Code rollback may leave the additive tables intact. Do not delete evidence or enquiries to undo intake; investigate with source IDs/audit and use reviewed correction. Pre-M5 code does not include Meta tables in newly generated backups. Existing import and staff workflows remain covered by regression tests. The prior >500 KB client chunk warning remains non-blocking.
