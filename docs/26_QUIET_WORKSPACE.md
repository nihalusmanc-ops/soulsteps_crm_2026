# Quiet workspace redesign — 27 October 2026

The owner requested Claude-inspired styling, a clickable profile and simpler settings for both staff and managers. The existing sidebar was visually heavy; account actions were scattered above an inert profile; settings opened with queue internals and six operational tabs. This update uses warm neutral surfaces, charcoal text, restrained terracotta actions, serif page titles and softer navigation. Soulsteps artwork remains the brand. It is a CRM workspace, without adding chat features or Claude branding.

## Interaction changes

- The sidebar profile button opens account links and native sign-out. Initials derive from the actual display name. Opening focuses the first link; Escape closes and returns focus. Outside clicks dismiss. The menu fits within the sidebar on desktop and mobile.
- Settings opens at Profile for everyone, showing only actual identity, role, password management and workspace timezone. Security provides the existing password form. Name and role are read-only because no self-edit API exists; no decorative save button was added.
- Managers also see workspace settings, import and Meta integration. Health/backups, audit and release tools remain available under Advanced. Pipeline labels and technical form controls use disclosures. No management capability was removed.
- Staff can now access personal Settings, while manager sections remain unavailable. Backend authorization and authentication are unchanged. Deep links to existing manager sections continue to work. The old `/account/security` route is retained.
- Background-job polling runs only while viewing health, instead of every five seconds on ordinary workspace settings. Existing data, business rules, financial confirmation, permissions, integrations and manual WhatsApp behavior are unchanged.

## Verification

Type checking and production build pass. Thirty-five domain, import/preprocessing and release-policy tests pass. Browser preview checks with explicitly fictional intercepted API responses cover manager/staff Settings, profile menu links, keyboard focus and Escape, security form navigation, mobile drawer handling and layouts at 1440, 768 and 390 pixels; no overflow or page errors were found. Screenshots were inspected for Today, enquiries, Settings, security and the profile menu. Preview tooling/data is ignored under `.wrangler/quiet-review`; it is not part of the shipped app.

The existing native-login browser test now opens account actions through the profile menu and expects staff personal Settings while still asserting server-side management denial. The database-backed suite could not run on this machine: Windows Application Control blocks `workerd.exe`, producing `spawn UNKNOWN`. No security policy was changed or worked around. Thus preview interaction checks do not claim database-backed mutation or sign-out acceptance for this revision. Backend code was not changed.

Design reference: [Claude appearance settings](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings). Inspiration is the quiet layout and progressive disclosure, not a pixel-exact copy or affiliation.

Published staging source `b271e80` as version `8b384df9-3531-493d-a2e6-25cece3a122b`. A real browser loaded the deployed sign-in page at `/settings` without page errors; anonymous `/api/state` returned 401. No fixture data was uploaded, no database migration was needed and production was not deployed. Signed-in preview checks remain distinct from live authenticated acceptance, since no owner password was collected.
