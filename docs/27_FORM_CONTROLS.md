# Dropdown and calendar improvements — 27 October 2026

Replaced the native popup windows for six date/time fields with a shared `DateTimeField`: call follow-up, scheduled task/rescheduling, payment received date, trip departure, and workspace business start/end. The actual inputs remain native for FormData, required/min/max validation, existing controlled onChange handlers and direct keyboard editing. No API formats, Dubai timezone conversion, payment verification or booking confirmation rules changed.

The picker uses the existing Radix Dialog dependency, including nested modal focus management. It provides month/year selection, adjacent-month navigation, a Monday-first calendar, Today/Tomorrow shortcuts, a 24-hour hour/minute selector, Apply/Cancel, and Clear for optional fields. Empty scheduling fields require an explicit time before Apply. Calendar arrows, Home/End and PageUp/PageDown support keyboard navigation. Escape returns focus to the originating control without closing its parent form.

Dropdown styling retains actual select/option semantics, keyboard/type-to-select behavior, disabled options and selected checkmarks. Supporting browsers receive styled `base-select` popups with consistent spacing and bounded scrolling. Other browsers retain a styled native control and their platform popup. No new runtime dependencies were added.

## Checks

`npm run test:controls` runs three browser tests against an isolated form harness with no API calls. It verifies calendar selection, controlled business-time changes, FormData, date-only input, leap day and month-crossing keyboard navigation, Cancel/Clear, direct typing, dropdown keyboard selection, responsive sizing at 768/390 pixels and Escape/focus in nested dialogs. Screenshots were inspected for the calendar and dropdown. Type checking/build pass.

The control harness is under `tests/controls`, outside the production build entry; previews and screenshots are not deployed assets. It supplements the existing full CRM tests, which remain locally blocked by Windows Application Control denying the Cloudflare runtime. Early preview attempts were inconclusive; the dedicated browser runner subsequently passed all three checks. No real CRM records were changed during control testing.
