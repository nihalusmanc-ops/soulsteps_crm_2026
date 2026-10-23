# 05 — Architecture and selected stack

| Layer | Technology | Responsibility |
|---|---|---|
| UI | React + TypeScript + Vite | Private interactive CRM |
| Styling | Tailwind CSS + shadcn/ui | Consistent accessible components |
| Navigation/data | React Router + TanStack Query | Routes, server state, cache invalidation |
| API | Hono + TypeScript | Application routes and business services |
| Validation | Zod | Server-validated request/response shapes |
| SQL | Drizzle + D1 | Schema, queries and versioned migrations |
| Hosting | Cloudflare Workers + Static Assets | React assets and API same origin |
| Attachments | Cloudflare R2 | Private file bytes, not database blobs |
| Jobs | Cloudflare Queues + Cron | Durable processing, due-action sweeps |
| Identity | Cloudflare Access | Approved staff authentication |
| Roles | Application code + D1 | Staff/manager authorisation |
| Source/deploy | GitHub + Workers Builds | History, tests, preview/production releases |

No need for a separate Node server, Next.js adapter, FastAPI, Supabase, paid n8n instance, Redis, or vector database for the initial scope. Hono is a framework; Workers is its runtime. D1 uses SQLite, not PostgreSQL. Use a normal project repository, not a hosting-specific generated site.

## Suggested repository shape
src/web/ (routes, components, features, data adapters), src/server/ (Hono routes, services, repositories, middleware), src/shared/ (types, schemas, enums), src/jobs/ (scheduled and queue handlers), drizzle/ (schema and migrations), tests/, docs/, samples/. A simple single package is fine; avoid unnecessary monorepo complexity.
Serve /api/* through Worker before SPA fallback. Keep staff routes same-origin and non-cacheable for private data. Static assets may be cached. Webhooks live on a separate public integration host/Worker so Access never blocks valid Meta verification requests. Verify webhook signatures independently.

## Data flow
UI -> authorised Hono API -> domain service -> D1 repository. Files -> authorised upload/download route -> R2. Intake webhook -> signature validation -> durable inbox event -> Queues -> mapped/deduplicated enquiry. Cron -> due pending actions -> queue -> action handler that rechecks state. D1 is source of truth for task state, not an in-memory timer.

## Reliability
Use unique source/event keys and idempotency keys for callbacks, imports, payments and confirmations. Queue delivery can repeat; handlers must be safe on retries. Persist events/jobs before acknowledgment or ensure durable queue handoff before responding. Track pending/processing/succeeded/failed/cancelled states, attempts and next retry; expose dead letters. Use an outbox or equivalent recovery sweep so DB writes and queue submission gaps cannot lose work. Group D1 changes using supported atomic batches/constraints; do not assume interactive Postgres transaction semantics. External sends cannot be atomically committed with SQL; record provider IDs and reconcile uncertain timeouts rather than blindly resending.

## Environments
Separate local, staging and production D1/R2/queues/secrets. Bindings proposed: DB, FILES_BUCKET, JOBS_QUEUE; env: APP_ENV, PUBLIC_APP_URL, BUSINESS_TIMEZONE, ACCESS_TEAM_DOMAIN, ACCESS_AUDIENCE. Phase 2 adds integration secrets, never VITE_ secrets. Local dev identity fixture works only on local runtime and must fail closed in deployed environments. Configure exact trusted origins and CSRF protections.

## Portability
Keep business rules independent of Hono request objects and D1 bindings. Repositories own SQLite SQL. Drizzle aids schema management but does not make a Postgres migration automatic: data types, SQL, constraints, migrations and transactions must be converted and verified. Keep exports and stable IDs. Queues, R2 and Access are provider-specific and need replacements if moving hosting. No promise of one-click migration.

## Runtime and release
Verify current official Cloudflare/Vite/Hono scaffold at implementation. Pin compatible versions, use Workers local preview for tests, and define lint/typecheck/test/build/dev/deploy scripts. Budget runtime resources and indexes. D1 maximum individual database size is currently 10 GB on paid; monitor growth, store file bytes in R2. No premature sharding. Deployment needs a preview check, backward-compatible migrations, backup/restore procedure, and rollback plan. Code rollback does not automatically undo database migration.
