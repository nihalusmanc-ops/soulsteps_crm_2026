# Soulsteps email and password login

The owner selected email and password on 25 October 2026, explicitly replacing the customer-facing Access sign-in experience. This supersedes the original Access-only requirement for deployments configured with `AUTH_MODE=password`. The existing Access implementation remains available for the transition and deployments that choose it. Business permissions and active staff invitations remain mandatory in either mode.

## Experience

The responsive Soulsteps sign-in page uses the existing wordmark and teal palette, with email, password, show/hide password, inline errors and submission feedback. Account security lets an authenticated user set or change their own password. There is no public registration, automatic promotion or fabricated password recovery. Managers and staff retain their existing permissions.

## Security defaults

- Passwords require 15–128 characters. Store only a random 32-byte salt and PBKDF2-HMAC-SHA256 digest with 600,000 iterations. Compare digests in constant time.
- Run the password derivation in an internal SQLite-backed `PasswordHasher` Durable Object using `nodejs_compat`. This supports the work factor without weakening it to fit a Free Worker request's CPU limit. The object has no public route or stored password state.
- Use a random 256-bit session token; store only its SHA-256 hash in D1. HTTPS uses a host-only Secure, HttpOnly, SameSite=Strict cookie. Sessions expire after 12 hours. Password changes revoke previous sessions; deactivation and role changes apply on the next request.
- Limit attempts per account and IP in 15-minute windows; obscure throttle identifiers using the Wrangler secret `PASSWORD_AUTH_SECRET`. Do not put this secret in config vars or frontend code. Unknown, inactive and incorrect-password accounts receive the same login error and password derivation work.
- Require same-origin requests and the workspace request header for mutations, including login/logout. Native mode rejects demo-role cookies and Access headers as authentication substitutes.
- Record successful sign-in and password changes in the audit history. Never log passwords, raw session tokens or digests.

## Staging transition

1. Apply migration 0012, provision `PASSWORD_AUTH_SECRET` privately and deploy the password-capable build with `AUTH_MODE=access`. Keep the existing Access application protecting staging.
2. The invited owner signs in normally and opens `/account/security` to choose their own password. The operator verifies only that a credential exists; the password is never shared.
3. Set staging `AUTH_MODE=password`, validate and deploy. Verify the owner's session and account screen while the edge gate still exists.
4. Remove only the CRM's Access gate after native authentication works. Verify anonymous business APIs return 401, the branded login opens, password sign-in works and staff cannot access manager endpoints. Retain the Access configuration for rollback, but do not accidentally leave its login intercepting the custom page.

Production, domain/DNS and live Meta/customer messaging are separate decisions. A temporary `workers.dev` hostname remains visible until a custom domain is connected.

## Invitations and recovery

Only active invited database users can sign in. Initial password provisioning requires an already authenticated invited identity; new staff cannot self-enrol. An email delivery provider and secure one-time invitation/recovery flow are not configured, so unattended onboarding and forgotten-password recovery remain future work. Do not work around this by sharing passwords or removing authentication. Before broader staff onboarding, implement a reviewed identity verification and provisioning/recovery flow.

## Backup and rollback

Operational backups now include `auth_credentials` (27 tables total); treat them as sensitive private backups. Sessions and throttle counters are intentionally excluded. Older manifests without credentials can restore business data but require password provisioning. Restore never enables outbound messaging automatically.

Rollback can restore `AUTH_MODE=access` and its exact-hostname edge policy, preserving the original verified invitation. Keep migration 0012: it is additive and removing credentials is unnecessary for rollback.

## Validation

Unit/integration tests cover login, invitation checks, throttling, CSRF, HTTPS cookies, role enforcement, session expiry, password changes and missing configuration. Browser tests exercise real local Workers/D1/Durable Object login, password changes, sign-out, staff restrictions and desktop/tablet/mobile layouts. Existing business workflows remain under the normal browser suite.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Workers Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
