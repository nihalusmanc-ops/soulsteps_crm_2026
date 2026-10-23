# 09 — Implementation milestones

## M0 — Repository foundation
Read pack; record unresolved decisions; initialise selected stack, consistent TypeScript, lint, lockfile and local Workers/Vite setup. Establish design tokens, typed models, demo adapter, error/loading patterns and basic routing. No secrets/production data. Keep existing docs.

## M1 — Interactive UI with fictional data
Implement Today, Enquiries table/kanban, detail/activity/tasks, Trips, Bookings and Overview. Use samples to show new/unassessed, no response, scheduled call, partial deposit, verified deposit pending confirmation and confirmed balance outstanding. Actions work locally with clear demo mode. No Phase 1 inbox. Responsive and keyboard checks. Exit: user can complete the daily staff flow and inspect all states; typecheck and production build pass. This is the first reviewable milestone, not the final app.

## M2 — Persistence and secure identity
D1 schema/migrations; R2; Hono API; Zod; repositories; Access identity and staff/manager roles; API adapter replaces mock. Local seed command separate from production migrations. Persist activities/tasks/quotes/payments and guarded confirmation with concurrency/idempotency. Exit: data survives reload; permissions tested directly at API; no deployed auth bypass.

## M3 — Follow-up reliability and management
Cron/Queues/outbox for in-app due actions, retries and failure visibility; manager settings/trip rules/reports; audit; backups/restore check. No automatic WhatsApp nudge. Exit: overdue queue and rule updates correct, retries don't duplicate tasks/bookings/payments, failures visible.

## M4 — Historical import
Preview/map v2/v3, notes/colours preservation, dummy exclusion, safe contact matching, idempotent commit. Start with synthetic import fixture, then user-reviewed original data. Exit: counts reconcile, ambiguous rows quarantined, repeated import safe, no outbound messages.

## M5 — Direct Meta intake
Verify existing lead-to-Excel connector and correct Meta assets; implement signed webhook/retrieval and form mapping; test with test leads; reconcile. Missing credentials block only this integration. Exit: one lead one enquiry, source preserved, failures retried, no form/WhatsApp double greeting.

## M6 — Staging and production release
Separate environments/secrets; authorised end-to-end staff workflow, restore drill, integration health, budget alerts, database indexes and usage monitoring. Team reviews Norway rank rule preview and actual prices/deposit terms. Live migration has a preview/count reconciliation and defined cutover. Protect alternate domains and private R2. Release only when owner has approved production content/data and required credentials are available. No subscriptions or external customer messaging merely to demonstrate UI.

## Phase 2 — WhatsApp and AI
Select/verify Coexistence route and costs; test with appropriate number before changing live setup. Implement provider adapter/webhooks and supported app/API sync; takeover; template/permission handling; selective AI; greet/itinerary/price/callback flow; nudge with cancellation and idempotency; delivery reports and opt-out. Verify phone reply cancels pending bot response. Only activate after content and timing configured. Track billable usage and keep manual-only fallback.

## Suggested engineering checks
Vitest for domain rules, Workers-compatible integration tests for API/D1, Playwright for key staff flows where practical. Verify current compatible tool versions. Test money and dedup, permissions and queue cancellation thoroughly; avoid tests that merely mirror UI implementation. A green build alone is not a verified sales workflow.

## Handover
Working repo and lockfile; env.example; dev/typecheck/test/build commands; migrations/seed/import help; Cloudflare binding/deploy configuration; credentials checklist without values; tests/results; known gaps; rollback and restore guide. Do not claim a mock integration or pending credential setup is complete.
