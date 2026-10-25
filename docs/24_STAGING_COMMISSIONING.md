# Initial staging login commissioning — 25 October 2026

The owner continued the temporary hosting setup, supplied the intended manager email and Access audience, enabled One-time PIN and supplied a screenshot of the saved application with the exact staging hostname and CRM Manager policy. This initial deployment is solely to establish the real login path and invite the verified manager. It is not production release approval or completion of M6 live acceptance.

Before publishing, remote D1 read-only checks returned zero active users and zero enquiries. No customer/demo database seed is being uploaded. Authentication remains the compiled nonlocal implementation: cryptographic Access signature/issuer/audience/expiry checks plus an active exact email/subject database invitation. Until that invitation is bound, CRM APIs remain unavailable to signed-in but uninvited identities. No first-login auto-promotion or email-header bypass is added.

The target is `soulsteps-crm-staging.nihalusmanc.workers.dev`, using only staging D1, R2 and queues. Production and GoDaddy DNS remain untouched. The private R2 bucket has public development access disabled. Meta and customer messaging remain disabled; version previews stay disabled.

The first upload was rejected by Cloudflare with code 100328: custom CPU limits are unsupported on Workers Free. Removed the proposed `limits.cpu_ms` from staging, explicitly labelled its plan `workers-free` and kept production's CPU cap unchanged. The release-policy exception permits only explicitly configured staging to use the Free platform default. It does not approve a paid subscription or bypass Access/invitation evidence. Representative authenticated API/background workload must still be tested against the Free limit.

The regular release-evidence gates remain pending until actual login, private storage, staged staff workflow, restore, monitoring and other required acceptance checks are completed. No pending gate has been marked approved merely to publish this empty login-commissioning deployment. An owner-approved production release remains a separate step.

Validation before retry: six release-policy tests, TypeScript checking and structural release checks passed. Earlier dry-run bundles and compiled nonlocal authentication rejection checks passed. The Worker needs to be published before the real hostname-based login and manager identity can be exercised.

## Commissioning exit checks

- Record the deployed version and hostname.
- Verify unauthenticated root/API access redirects to the intended Access team. If protection does not apply, disable the temporary route and correct Access before continuing.
- Owner completes the one-time PIN flow in their own browser; no OTP, password or authorization cookie is pasted into chat.
- Bind the exact verified Access subject and email to the designated manager through a reviewed operator action; retain role and audit evidence.
- Verify the manager can open the empty CRM and ordinary uninvited identities cannot. Only then proceed to staged synthetic workflow acceptance and the full release gates.

## First deployed version

Published source commit `d8a6810` to staging only. Cloudflare returned version `d5320221-d3db-428a-862f-0764617a8da0` and the expected temporary hostname, five-minute Cron, staging queue producer and consumer. No subscription/plan upgrade was accepted. The initial upload rejected for custom CPU limits had uploaded static assets but did not activate a Worker version; the subsequent corrected upload succeeded.

Unauthenticated GET requests to `/`, `/api/me` and `/api/state` returned HTTP 302 to `mute-hall-89cf.cloudflareaccess.com`. This establishes edge login protection on the actual deployed hostname. Manager subject binding and the signed-in CRM workflow remain pending the owner's first login. Staging D1 had zero active users and enquiries at deployment; no database fixtures or real customer data were copied.
