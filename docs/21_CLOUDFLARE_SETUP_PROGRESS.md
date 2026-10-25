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

Update, 25 October: the owner supplied the first manager email. It is recorded privately in ignored `.wrangler/staging-manager.json`, pending verified Cloudflare Access identity binding; no invitation, login email or active database identity has been created from an unverified subject. Staff can be added later.

Staging can use an Access-protected `workers.dev` address before connecting the custom domain. GoDaddy access is therefore not a prerequisite for temporary hosting. The current custom-domain staging configuration still needs a temporary-host adjustment, Access setup and storage readiness before deployment. Domain cutover remains deferred.

Update, 25 October, after the owner reported R2 activation: Wrangler authenticated successfully and listed the account's buckets. Created `soulsteps-staging-private-receipts` using Standard storage and the existing staging account/configuration; verified zero objects, zero bytes, public `r2.dev` access disabled and no custom domains. Cloudflare selected EEUR automatically; this was not a requested residency guarantee. The existing `FILES_BUCKET` binding already points to this bucket, so no duplicate binding was added. No object uploads, subscription changes or production resources were created by this step.

Read-only account checks returned no registered Workers subdomain (HTTP 404 / code 10007). Access organization/application reads were denied to the Wrangler OAuth credential (HTTP 403); that does not establish whether Zero Trust is already configured. The owner needs to confirm/register an account Workers subdomain in the dashboard and complete or inspect Zero Trust setup. Do not request an API token or sign-in code in chat. The exact temporary hostname, Access team domain, application audience and verified manager subject remain pending. No Worker is deployed.

Later on 25 October, owner screenshots showed account subdomain `nihalusmanc.workers.dev` and a Zero Trust Free team named `mute-hall-89cf`. The owner configured a self-hosted public-hostname application for `soulsteps-crm-staging.nihalusmanc.workers.dev`, attached the CRM Manager Allow policy and supplied its audience ID. Staging now uses that exact HTTPS origin, `workers_dev: true`, empty custom-domain routes, the supplied audience and `mute-hall-89cf.cloudflareaccess.com`. The team's public certificate endpoint returned HTTP 200 with two signing keys. Production custom-domain settings and both environments' disabled version previews are preserved. Public CRM URL still returns 404; nothing is deployed.

Updated release-policy validation permits only a correctly named, Access-configured temporary staging origin with no additional routes; production still prohibits workers.dev. Actual Access policy and invited-identity evidence remain required. Five release-policy tests, template validation, TypeScript checking, dry-run bundling and compiled nonlocal authentication rejection checks passed. The login provider, exact policy contents and manager identity subject have not yet been verified. No Access session/token was collected or login email sent.

The owner confirmed that domain management is in GoDaddy, but access is currently unavailable. At the owner's request, domain connection and DNS cutover are deferred until access is restored. Continue building and reviewing locally; neither a custom domain nor R2 activation is required for local development. Existing staging resources remain provisioned but no hosted CRM has been deployed.

The Cloudflare account has no zone for `thesoulsteps.com`. Public DNS currently reports `ns07.domaincontrol.com` and `ns08.domaincontrol.com`; registrar/authoritative DNS dashboard ownership still needs confirmation. Hostinger may be the website host rather than the active DNS provider. The public MX currently points to `smtp.google.com` (priority 1); this and the full existing website/email/DKIM/SPF/DMARC records must be preserved during any future DNS move. Public DNS lookups cannot replace a complete zone export/review.

Workers custom domains require an active Cloudflare zone. The next domain step is adding the existing root domain `thesoulsteps.com` to Cloudflare for DNS review. Do not add only the CRM hostname as though it were the owned root domain. Do not change nameservers or overwrite any existing DNS record before comparing a complete export and obtaining the owner's cutover decision. The registrar and Hostinger website hosting need not be transferred merely to use Cloudflare DNS.

Historical R2 status before 25 October: account activation was required and the owner had not accepted the subscription. This is superseded by the owner's activation confirmation and verified private staging bucket creation above. Local file storage remains available through Wrangler's local R2 implementation.

Cloudflare One/Access setup remains unverified. Once the temporary Workers hostname is known, create or inspect an exact-host staging self-hosted application, email allowlist and distinct audience. Team domain, AUD and verified first-manager identity are still missing. Live Meta remains disabled. Production D1 remains a placeholder; no production resources were created.

No Worker deployment, customer import, production schema write, website/email DNS change, nameserver change, subscription purchase or outbound customer message occurred. The CRM's local demo remains separate.

Local availability was verified after this deferral: `http://127.0.0.1:5173` returned HTTP 200, and the API at `http://127.0.0.1:8787/api/health` reported milestone 6, local-demo mode, D1 persistence and outbound messaging disabled. Run `npm run dev` from the project directory whenever the local servers need restarting.

Follow [guided staging setup](20_CLOUDFLARE_SETUP.md) for the remaining account/Access steps and [M6 release gates](19_MILESTONE_6_RELEASE_RUNBOOK.md) before deployment.

References: [Workers custom-domain requirements](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Hostinger/Cloudflare setup](https://www.hostinger.com/support/4741545-how-to-use-cloudflare-in-hostinger/) and [Cloudflare nameserver cutover](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).
