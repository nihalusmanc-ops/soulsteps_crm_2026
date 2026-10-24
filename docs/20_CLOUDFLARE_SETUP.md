# Guided Cloudflare staging setup

Start with staging. The application configuration exists in `wrangler.staging.jsonc`; production is separate in `wrangler.jsonc`. Nothing has been provisioned or deployed by this guide.

Update: initial staging database/queue provisioning has now been performed during assisted account setup. See [actual setup progress](21_CLOUDFLARE_SETUP_PROGRESS.md) before running any creation commands below again. DNS, R2, Access and deployment are still pending.

## 1. Sign in and select the account

In the project terminal:

```powershell
Set-Location 'C:\Users\nihal\OneDrive\Desktop\Soulsteps CRM 2026\Soulsteps_Codex_Starter_Pack'
npx wrangler login
npx wrangler whoami
```

Complete sign-in in your own browser. Do not paste passwords, API tokens, login codes or JWTs into chat. If multiple accounts appear, identify the account that owns the intended domain before creating resources. Do not use the temporary-preview deployment suggestion: this CRM's nonlocal configuration requires Access and disables alternate public URLs.

## 2. Choose the staging hostname

Supply the domain you own, whether its DNS is already managed by Cloudflare, and the desired staging hostname. For example, `crm-staging.<your-domain>` is a naming example, not an assumed domain purchase or DNS change. We will check the existing zone before changing anything. Moving DNS/nameservers requires reviewing existing records, particularly email; it is not necessary to guess or replace them to prepare local configs.

The same hostname must appear in:

- `vars.PUBLIC_APP_URL`: exact `https://<staging-hostname>`, without a path.
- `routes[0].pattern`: hostname only, with `custom_domain: true`.
- The staging Cloudflare Access application.

## 3. Create only the reviewed staging resources

After the account, existing resources and available services/plan have been checked, these are the names already expected by the configuration:

| Resource | Name |
|---|---|
| D1 | `soulsteps-staging` |
| Private R2 | `soulsteps-staging-private-receipts` |
| Queue | `soulsteps-staging-jobs` |
| Dead-letter queue | `soulsteps-staging-dead-letters` |

Resource-creation commands for that reviewed account are below. They create remote resources; they are not local verification commands. We have not run them. Do not accept a paid upgrade or billing activation as an incidental part of following this guide.

```powershell
npx wrangler d1 create soulsteps-staging --config wrangler.staging.jsonc --update-config=false
npx wrangler r2 bucket create soulsteps-staging-private-receipts --config wrangler.staging.jsonc --update-config=false
npx wrangler queues create soulsteps-staging-jobs --config wrangler.staging.jsonc
npx wrangler queues create soulsteps-staging-dead-letters --config wrangler.staging.jsonc
```

Choose any required storage jurisdiction/location deliberately before creation; no data-residency requirement or geography has been inferred. Existing resources should be inspected/reused only if they belong to this staging environment. Keep the R2 public development URL and custom-domain access disabled. The Worker uses its R2 binding; it needs no S3 API keys.

Record the returned D1 UUID in `d1_databases[0].database_id`. Set the selected account ID explicitly if there are multiple accounts. Do not add a duplicate DB binding, enable remote development, seed demo identities remotely or modify production resource IDs.

## 4. Protect the staging hostname with Access

In Cloudflare One/Zero Trust, create a self-hosted public application for the exact staging hostname. Give it a distinct staging application audience. Use an Allow policy for specific invited email addresses, with the chosen identity provider or email one-time PIN. Do not use Everyone/Bypass for the staff application.

Collect these non-secret configuration values:

| Cloudflare value | Staging config |
|---|---|
| Team hostname, e.g. `team-name.cloudflareaccess.com` | `vars.ACCESS_TEAM_DOMAIN` (no `https://`) |
| Application Audience (AUD) tag | `vars.ACCESS_AUDIENCE` |
| Exact HTTPS staff origin | `vars.PUBLIC_APP_URL` |
| Owned staging hostname | `routes[0].pattern` |
| Created staging database UUID | `d1_databases[0].database_id` |

Keep `__LOCAL_DEV__` false, `APP_ENV` staging, workers.dev/preview URLs disabled and Meta activation false. No Meta secret is required for initial staging setup. Do not copy `.env.example`'s local APP_ENV into nonlocal secret storage.

An Access login and a CRM invitation are two separate checks. The CRM requires an active database user with the exact verified Access subject and email; selecting Allow in Access alone does not grant manager access. We will prepare the first manager binding through a private, reviewed operator step after actual Access identity verification. Do not paste the Access cookie/JWT into chat or enable the demo bypass to bootstrap an account. The existing `users:invite:local` command cannot invite remote users.

Keep the hostname protected in full for now. The exact public `/webhooks/meta/leads` exception is needed only when deliberately configuring signed Meta intake; do not bypass `/api`, `/management` or the whole site.

## 5. Validate configuration before release

```powershell
npm run build
npm run release:templates
npm run release:bundle
npm run release:verify-auth
npm run release:check -- --environment staging
```

The bundle command is always a dry run. The actual release checker remains blocked until private approval evidence, real bindings, domains and Access configuration are supplied. This is expected. These commands do not provision, migrate or deploy.

After those values are reviewed, the next concrete work is the first-manager bootstrap plan, staging migrations, approved synthetic test data and the authorised staging deployment. We will follow the [M6 runbook](19_MILESTONE_6_RELEASE_RUNBOOK.md); production migration/content/Meta acceptance are separate later gates. No deployment or remote schema write has been authorised by this guide alone.

References checked: [Wrangler/D1 creation](https://developers.cloudflare.com/d1/wrangler-commands/), [R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/), [Queues setup](https://developers.cloudflare.com/queues/get-started/), [Access self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) and [Access application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/). Resource command flags were checked against the installed Wrangler help.
