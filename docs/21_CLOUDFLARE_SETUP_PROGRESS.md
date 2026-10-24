# Cloudflare setup progress — 24 October 2026

The owner supplied `crm.thesoulsteps.com` and completed Wrangler OAuth sign-in. One account was available; its ID is now explicitly selected in both nonlocal configs. No credential was copied into the repository or chat.

## Prepared and verified

- Production hostname in the local template: `crm.thesoulsteps.com`.
- Proposed separate staging hostname in the local config: `crm-staging.thesoulsteps.com`. This is not yet a published or active DNS record.
- Created remote staging D1 `soulsteps-staging`, UUID `ee7afca5-5b69-40e9-a20e-355225a78afd`, and retained the existing `DB` binding.
- Verified the new database was empty, then applied all 12 existing migrations through `0011_far_joystick.sql` to staging only. Read-only verification returned 12 applied migrations, zero customers, zero enquiries and zero active users. Only the inactive system identity/default settings from migrations exist; no demo/customer seed ran remotely.
- Created empty `soulsteps-staging-jobs` and `soulsteps-staging-dead-letters` queues. No Worker or consumer is deployed.
- D1 automatically selected APAC/SIN. No explicit jurisdiction requirement has been supplied or inferred; review the location before introducing customer data.

## Current external prerequisites

The Cloudflare account has no zone for `thesoulsteps.com`. Public DNS currently reports `ns07.domaincontrol.com` and `ns08.domaincontrol.com`; registrar/authoritative DNS dashboard ownership still needs confirmation. Hostinger may be the website host rather than the active DNS provider. The public MX currently points to `smtp.google.com` (priority 1); this and the full existing website/email/DKIM/SPF/DMARC records must be preserved during any future DNS move. Public DNS lookups cannot replace a complete zone export/review.

Workers custom domains require an active Cloudflare zone. The next domain step is adding the existing root domain `thesoulsteps.com` to Cloudflare for DNS review. Do not add only the CRM hostname as though it were the owned root domain. Do not change nameservers or overwrite any existing DNS record before comparing a complete export and obtaining the owner's cutover decision. The registrar and Hostinger website hosting need not be transferred merely to use Cloudflare DNS.

R2 inventory returned HTTP 403 / code 10042, indicating account activation is required. `soulsteps-staging-private-receipts` has **not** been created. The owner must inspect the R2 dashboard and decide any activation/billing step separately; no paid upgrade or payment setup was accepted here.

Cloudflare One/Access is not configured yet. After the hostname/zone is prepared, create an exact-host staging self-hosted application, email allowlist and distinct audience. Team domain, AUD and verified first-manager identity are still missing. Live Meta remains disabled. Production D1 remains a placeholder; no production resources were created.

No Worker deployment, customer import, production schema write, website/email DNS change, nameserver change, subscription purchase or outbound customer message occurred. The CRM's local demo remains separate.

Follow [guided staging setup](20_CLOUDFLARE_SETUP.md) for the remaining account/Access steps and [M6 release gates](19_MILESTONE_6_RELEASE_RUNBOOK.md) before deployment.

References: [Workers custom-domain requirements](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Hostinger/Cloudflare setup](https://www.hostinger.com/support/4741545-how-to-use-cloudflare-in-hostinger/) and [Cloudflare nameserver cutover](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).
