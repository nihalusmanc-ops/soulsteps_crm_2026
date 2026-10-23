# 02 — Workflows and status model

## Intake and ownership
Capture original source payload/message plus mapped fields, source IDs, timestamps and trip association. Match customer by normalised verified full phone number when possible; contact email is secondary evidence, never a reason to merge different people silently. Create a separate enquiry for a new trip/request, retain existing enquiry for duplicates or continued discussion. Assign initial enquiries to the single active staff member by default; manager can reassign. Unclear trip mapping goes to Needs qualification.

## Sales stages and colours
These are proposed operational defaults consolidating the discussion. Status codes are stable, display names/colours configurable by manager with validation; changes must not rewrite historical activity.

| Code | Display | Colour | Meaning |
|---|---|---|---|
| NEW | New enquiry | Purple #7C3AED | Captured; action not started |
| QUALIFYING | Initial discussion | Cyan #0891B2 | Collecting details, itinerary discussion |
| INTERESTED | Interested / consultation | Blue #2563EB | Staff/customer actively discussing suitability |
| PROPOSAL_SENT | Proposal sent | Amber #B45309 | Personal quote/proposal supplied |
| DECISION_PENDING | Decision pending | Amber #B45309 | Customer considering |
| AWAITING_DEPOSIT | Awaiting deposit | Orange #C2410C | Proceeding; deposit not yet verified in full |
| CONFIRMED | Booking confirmed | Green #15803D | Required deposit verified and staff confirmed |
| ON_HOLD | Future travel / on hold | Slate #64748B | Deferred with reason and review date if known |
| LOST | Lost / not interested | Muted red #B91C1C | Closed with reason |
| NOT_SUITABLE | Not suitable | Grey #6B7280 | Staff assessed no suitable offering; reason required |

Needs details and itinerary sent are fields/activities, not mandatory extra pipeline columns. Sending the general itinerary is not sending a personalised quotation. A manual phone-app send requires staff logging; clicking Open WhatsApp alone proves nothing was sent. Permit valid stage skips/reopening with history; confirmation always requires payment guard. No response/no answer never automatically means lost.

## Calls and tasks
Task types: initial call, callback, follow-up, availability check, payment check, general. Store due_at, owner, status, linked enquiry, source and notes. Statuses: pending, completed, cancelled. Requested callback date/time is distinct from staff-accepted appointment. Asia/Dubai default; clarify timezone for international customers.
Log call: connected, no answer, busy, unreachable/invalid number, callback requested, not interested. Require occurred_at, outcome and author. Prompt next action after every log; allow explicit no-next-action with a reason. Completing a call task and adding call activity should be one consistent operation. Preserve older tasks; reschedule/cancel explicitly rather than overwriting history.

## Availability and proposals
Staff manually records pending/confirmed/unavailable, applicable departure, checked_at and note. No bot may reserve or promise availability without an approved source. Price per head; quotation snapshot stores price, currency, party count, sharing basis, supplements, inclusions, deposit terms, expiry if used, and departure. Do not infer total from a group category when traveller count is unknown. Staff can log an externally sent proposal in Phase 1.

## Payment and conversion
Use Record payment, not a bare paid checkbox: amount in integer minor units, currency, date, reference optional, receipt optional, and verification status. Draft/receipt-received payment does not count as verified cash. Staff or manager verifies against bank and records verifier/time. Derive deposit unpaid/partial/paid and booking balance from verified non-reversed amounts. Required deposit is explicitly stored from accepted terms; actual values not supplied yet.
Confirm booking requires a valid accepted quote/booking amount, defined required deposit, sufficient verified deposit, and staff action. Overpayments/zero-deposit policy require explicit validation/review; do not assume zero for missing deposit. Save booking number, confirming actor/time and enquiry link atomically. Retrying must not create a second booking. Verified funds before confirmation show Deposit verified / Confirmation pending. Full deposit can leave remaining balance. Corrections use audited reversals, not silent payment deletion. Cancellation/refund rules need definition before those automated features are introduced.

## Follow-up defaults (proposed, editable)
Phase 1: in-app scheduled task checks only. Store configurable reminder rules; do not send nudges without Phase 2 connection.
Phase 2 candidate default: one nudge after 24 hours without a customer response to a response-required message; after another 24 hours without reply, flag No response and create staff task. Timing is provisional and must be approved/configured before sends. Respect working hours/timezones and messaging permissions/templates.
Re-check current state immediately before every send: reply since trigger? human takeover? opted out? closed/confirmed? duplicate/superseded job? If yes, cancel as applicable. Failed send is not delivered; record error/retry and surface in manager action queue. Any persistent failure must remain visible.

## Automated conversation target, Phase 2
Identify trip -> greet -> approved itinerary -> answer price questions -> ask only missing qualification questions -> ask when free to call -> record callback request -> staff handover. Handle fixed and bespoke requests: bespoke requires staff quotation. Do not repeat form answers. Short messages, clear human assistance option. No invented visa eligibility, Aurora guarantees, discounts, stock, or prices. Staff replies on supported app-message events should pause automation for that thread. Manual pause is also required; resumption is explicit. App-originated events are not attributed to a particular staff identity without evidence.
