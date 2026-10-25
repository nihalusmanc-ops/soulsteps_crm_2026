# Product usability redesign — 25 October 2026

## Audit and direction

The existing CRM supported the important sales, qualification, follow-up and financial workflows. The main usability problems were small low-contrast text, non-actionable dashboard summaries, lost filter context after navigation, buried next actions, decorative trip landscapes, and technical health information repeated across unrelated Settings sections.

Preserve the Soulsteps teal wordmark/navigation and use a restrained operational workspace: neutral surfaces, readable text, consistent controls, compact cards and real record drill-downs. Keep sales stage, trip fit, buying interest, contact flags and money verification independent. No new dependencies or backend business-rule changes.

## Implemented

- Shared tokens and responsive components in `src/web/workspace.css` and `src/web/components/ui/workspace.tsx`: metrics with links, selected view controls, neutral empty states and a loading skeleton. Existing structural styles remain in `styles.css`.
- Navigation includes page context, active states, a skip link, document titles and a mobile drawer with focus containment, Escape, focus restoration and an inert background.
- Today links overdue tasks, new/unassessed enquiries, upcoming follow-ups and outstanding deposits to real queues. Additional queues retain ready-to-book prospects, prospecting and missing next actions. Upcoming departures use only recorded dates, explicitly labelling drafts. No invented dates or metrics.
- Enquiry search, sorting, view and filters persist in URL state. Owner/trip filters and a visible reset were added. Record links return to the originating list and its filters. Mobile enquiry cards prioritise customer, stage, owner, fit/interest and next action.
- The enquiry workspace surfaces the next action before other details, displays actual recorded contact information, supports direct payment-tab links, and retains activity/source history. Rescheduling prefills the existing type, Dubai time and note. Dialog errors remain available inside the dialog; destructive action buttons name the action.
- Trips use compact destination/status/content cards with links to their open enquiries. Removed the static readiness panel and decorative landscape. Editing, publishing and rule previews retain their existing permissions.
- Bookings support customer/reference search and an outstanding-balance filter. Summaries drill into the relevant records; booking links open payments directly. Financial tables stack into labelled records on mobile.
- Overview metrics and stage/attention rows open their matching record sets, with creation/confirmation/payment-date scopes preserved. Settings remembers its selected section and shows job summaries/actions only in Health & retries.
- Reminders now handle failed “Mark seen” actions and disable the active request. Demo labels, manual WhatsApp behavior and explicit payment verification/booking confirmation remain visible.

## Validation and environment

The production build includes TypeScript checking. Browser validation covers all seven principal screens at 1440, 768 and 390 pixels, the daily call/payment workflow, keyboard dialogs, navigation, filter persistence, task defaults, staff permissions, private files, imports, rules and Meta intake.

The C: drive filled during verification. Automatic review rejected removal of old generated test folders; nothing was deleted. Temporary browser/database files were instead placed on D:. `scripts/test-server.mjs` accepts an optional `SOULSTEPS_TEST_STORAGE` scratch directory; its default remains `.wrangler`. The working local database was not moved or reset. Browser screenshots use Playwright's configured output directory.

Final results: production build and TypeScript checking passed; 23 browser tests passed, including all responsive layouts. All 68 unit/integration checks passed across runs: 66 passed in the full run on the alternate scratch drive, and two disk-intensive tests passed when rerun with a 30-second timeout after exceeding the default five seconds. No application test assertions were weakened. The initial run on the full C: drive could not complete database work. Read-only browser checks also verified the trip open-enquiry link count and the filtered empty state against the working app.

## Remaining limits

- No hosted release, domain cutover, R2 subscription activation or real customer messages. The existing Cloudflare and live integration prerequisites remain deferred.
- No new contact editing, inventory, quotation issuance or drag-and-drop stage logic was invented. Stage changes use the existing audited detail dialog; confirmation remains in the guarded payment workflow.
- Large lists still use the existing client-side loaded dataset; server pagination is a future scale improvement.
- The existing Vite JavaScript chunk-size advisory remains. Keyboard and browser layout checks are not a formal assistive-technology certification.
