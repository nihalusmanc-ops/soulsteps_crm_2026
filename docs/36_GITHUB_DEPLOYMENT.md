# GitHub to Cloudflare deployment

The owner authorised automatic deployment of the existing hosted review CRM on
30 October 2026. This supersedes the earlier validation-only CI checkpoint for
that Worker. It does not authorise a separate production environment, DNS cutover,
paid services, customer messaging or Meta live intake.

## Target and trigger

- Repository: `nihalusmanc-ops/soulsteps_crm_2026`, branch `main`.
- Workflow: `.github/workflows/validate.yml`, **Validate and deploy Soulsteps CRM**.
- Existing Worker: `soulsteps-crm-staging` via `wrangler.staging.jsonc`.
- URL: https://soulsteps-crm-staging.nihalusmanc.workers.dev.
- Pull requests run validation only. Successful pushes to `main` and manual
  workflow runs on `main` can deploy after the validation job succeeds.
- Deployment is enabled only when the repository variable
  `CLOUDFLARE_DEPLOY_ENABLED` equals `true`. It starts disabled while the credential
  and first successful CI run are being commissioned.
- Runs for `main` are serialised without cancelling an active deployment.

Validation retains the full unit suite, real isolated Workers/D1/R2 browser tests,
password-session browser tests, current UI control tests, release-template
checks, compiled authentication verification and the synthetic restore exercise.
CI test fixtures never use the hosted CRM database. The deployment job installs
the locked dependencies, builds the exact checked-out commit and runs Wrangler.

After deployment, `scripts/smoke-deployment.mjs` checks the exact built JavaScript
and CSS assets, password-login availability and anonymous rejection by private
endpoints. It uses GET requests only and changes no CRM records.

## One-time credential

Create a dedicated Cloudflare API token named **Soulsteps GitHub Deploy**. For
the existing Wrangler configuration, start with these account-scoped permissions:

- Workers Scripts: Edit.
- Queues: Edit, because deployment reconciles the configured queue consumers.
- Account Settings: Read.

Restrict account resources to the account holding the existing Worker. The job
does not query D1 or access R2 objects directly, so it does not require database
or object-storage data permissions. It does not configure custom-domain routes.
If Cloudflare rejects a specific deployment API operation, inspect that operation
before adding permissions. Do not substitute a global account key.

Save the value directly in the repository's Actions secret named
`CLOUDFLARE_API_TOKEN`. Never commit it, paste it into chat or store the local
Wrangler OAuth refresh token in GitHub. The deployment step alone receives this
secret; pull requests and validation do not.

After validation and credential setup, the operator enables deployment:

```bash
gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true --repo nihalusmanc-ops/soulsteps_crm_2026
gh workflow run validate.yml --ref main --repo nihalusmanc-ops/soulsteps_crm_2026
```

Confirm both jobs and the smoke check succeed before reporting automatic
deployment as active. Inspect subsequent runs in the repository's **Actions** tab.
GitHub's `cloudflare-staging` environment records successful deployments.

## Routine changes and recovery

Edit, test, commit and push `main`. GitHub validates and then deploys to the same
URL. Existing D1 data, private R2 receipts and Worker secrets are retained. The
workflow does not seed, reset, import or automatically migrate the hosted database.
Database schema changes require a separately reviewed migration sequence before
code that depends on the new schema is published.

To pause automatic publishing, set `CLOUDFLARE_DEPLOY_ENABLED` to `false`. A failed
validation never starts deployment. A failed post-deployment check marks the run
failed; the new version may already be serving. Inspect Cloudflare's deployment
history and use an appropriate compatible earlier Worker version if rollback is
needed. A Worker rollback does not roll back database records or schema changes.

References: [Cloudflare GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
and [Workers permissions and resource bindings](https://developers.cloudflare.com/workers/authorization/).
