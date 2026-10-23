# Paste this into Codex in VS Code

Build Soulsteps CRM from the specification in this folder. Read AGENTS.md, README.md, and docs/01–11 first. Use the selected React/Vite/TypeScript frontend, Hono/TypeScript Workers backend, and D1/Drizzle database. Follow docs/09_IMPLEMENTATION_PLAN.md.

Start milestone 1 now: create a polished, responsive, functional CRM interface using the fictional sample data. Include Today, Enquiries table/pipeline, enquiry detail, Trips, Bookings, and manager Overview. Make core interactions work through a typed data-access layer so we can replace the demo implementation with API calls. Clearly label demo mode. Include a manual Open WhatsApp shortcut but no fake chat synchronisation or live WhatsApp automation. Avoid adding a Phase 1 inbox.

Prioritise clear next actions, readable stage badges, call logging, follow-up scheduling, trip editing, and an explicit verified-deposit/confirm-booking flow. Enquiry detail must preserve activity history and distinguish trip fit from buying interest. Use the sample data to exercise edge cases, not only successful customers.

Run the app locally, check responsive layouts, type-check and build. Report the local run command, completed screens, checks, and unresolved business decisions. Do not deploy, purchase services, or send real customer messages as part of this first milestone.

After the interface checkpoint, implement persistence and secure staff/manager access, background tasks, import preview, and then Meta integration per the later milestones. Credentials and missing trip content must not block unrelated CRM work. Record proposed defaults and use the explicit Needs qualification state for unresolved ranking cases.
