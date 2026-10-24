# Soulsteps CRM — Codex starter pack
Version 1.0 · 23 October 2026 · Project timezone: Asia/Dubai

This folder contains the original specification and the local Soulsteps CRM implementation. It consolidates the decisions in the Soulsteps planning conversation. No WhatsApp provider, AI model, production credentials, actual Norway prices, or itinerary is supplied.

## Current application

Milestone 4 is implemented for synthetic historical imports: manager preview, private persistent batches, quarantine, explicit review/assignment and transactional idempotent commit. Controlled XLSX preprocessing preserves source cells/styles with reviewed form mappings. Actual workbook migration remains pending owner review. See [the current M4 handover](docs/17_MILESTONE_4_HANDOVER.md).

Milestones 1–3 provide the CRM interface, persistent D1, authorised Hono API, private receipts/backups, durable in-app checks, manager settings and reviewed trip rules. Run `npm ci` then `npm run dev` from this folder and open http://127.0.0.1:5173. Keep the server running. The [M3 setup guide](docs/15_MILESTONE_3_HANDOVER.md) covers the underlying runtime. The specification and original instructions below remain the project contract.

## Start in VS Code
1. Extract this ZIP into your `soulsteps-crm` folder. Open that folder in VS Code.
2. Open the official OpenAI Codex extension and sign in.
3. Read `docs/01_PRODUCT_BRIEF.md` and `docs/11_DECISIONS_AND_INPUTS.md`.
4. Paste `START_HERE_CODEX.md` into Codex. Root `AGENTS.md` supplies persistent project instructions.
5. Review the first usable screens locally. Then continue through the implementation milestones.

## Reading map
- 01 Product brief: business, goals, scope, and success measures.
- 02 Workflows: sales stages, payments, calls, follow-ups, handover.
- 03 Priority rules: Norway P1–P6, temperature, queue order, edge cases.
- 04 Screens and design: actual staff and manager experience.
- 05 Architecture: selected stack, Workers layout, future portability.
- 06 Data model: logical tables, integrity rules, indexes, and retention.
- 07 API and security: endpoint contract, Access, permissions, files.
- 08 Integrations and migration: Excel, Meta, WhatsApp, AI.
- 09 Implementation plan: milestone sequence and working deliverables.
- 10 Acceptance checks: meaningful tests and release conditions.
- 11 Decisions and inputs: confirmed requirements versus provisional defaults.
- 12 Costs and references: dated planning allowances and reference links.

## Phase boundaries
MVP / Phase 1: functional CRM, manual phone-app messaging, historical import, direct Meta lead intake when available. Build the UI using fictional data first, then persist it.
Phase 2: official WhatsApp integration and optional AI-assisted intake. Coexistence on the existing number is a requirement, subject to verified eligibility and onboarding route.

No WhatsApp provider subscription is needed to start building. A local mock integration must never be represented as a live integration. Open WhatsApp is a manual shortcut, not message synchronisation.

## Decisions that matter
Use React/TypeScript/Vite, Hono/TypeScript, Workers, D1/Drizzle, R2, Queues/Cron, Cloudflare Access, GitHub/Workers Builds. Do not replace them with Next.js, FastAPI, Supabase, or Railway without an explicit scope change.
Norway P3/P4 and family/group wording overlap in the original discussion. The proposed resolution and safe handling are recorded in document 03. Staff must confirm the rule preview before production automatic ranking.
Real customer data and the source workbook are intentionally not bundled. `samples/demo_enquiries.json` contains fictional examples only.
