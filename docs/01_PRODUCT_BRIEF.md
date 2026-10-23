# 01 — Product brief

## Business and current process
Soulsteps is a UAE travel and tour operator offering exclusive fixed packages and bespoke/private journeys. Launch with one Norway package. Team: one staff member and one manager. Meta advertisements produce enquiries that currently populate an Excel workbook automatically. Customers can also send a prepared form-answer message from their own WhatsApp number to the company's WhatsApp Business phone app. The exact automation writing to Excel is unknown.

The sample workbook includes Meta lead, ad, ad-set, campaign, and form identifiers, Facebook/Instagram source, multiple form versions, qualification answers, and manually entered sales notes/colours. It proves the presence of lead-form source data but not which connector performs the spreadsheet write. Do not assume every form submitter has already messaged on WhatsApp or consented to all outbound messaging.

Staff checks availability manually, makes calls, shares itineraries/prices, follows up, verifies bank transfers, and marks progress. Booking is confirmed manually by staff after the required deposit is verified. No payment gateway is required in Phase 1.

## Why build
Replace unstructured colour-coded rows and scattered notes with one operational record per enquiry. Reduce missed enquiries and forgotten follow-ups, improve response handling and visibility, and make a two-person team efficient. Initial focus is lead leakage and conversion; post-trip retention is a later opportunity. No promised conversion uplift is assumed.

## Goals
- Staff can immediately see who to call, when, and why.
- All open enquiries have an owner and a visible next action, or an explicit hold state.
- Each trip has editable published information and priority rules.
- Customer history survives repeat enquiries and changes of staff.
- Deposit, booking value, and cash collected remain distinct.
- Manager can understand volume, ageing, conversion and lost reasons from recorded data.

## Phase 1 scope
Today screen; enquiries table and pipeline; customer/enquiry detail; notes and activity timeline; call outcomes/tasks; trip and departure configuration; editable ranking; manual payment records and confirmation; bookings view; manager reporting; roles; audit; file storage; historical import preview; Meta lead intake when setup is ready; manual phone-app WhatsApp shortcut.

## Phase 2 scope
Official WhatsApp API with eligible Coexistence; inbox and live supported message sync; automated greeting, itinerary, approved price answers, qualification and callback request; takeover/pause; no-response nudge; selective AI extraction and summaries. Provider and model remain undecided.

## Later opportunities, not MVP commitments
Supplier/operations checklists, document collection, balance reminders via WhatsApp, post-trip feedback/referrals, email integrations, payment links, calling platform, campaign conversion feedback, online customer portal, multiple organisations, and full travel-operations automation. No flight/hotel scraping, autonomous purchases, or 15% margin rules are inherited from other projects.

## Measures
Track enquiries by source/trip/date; time to first logged human contact (and first sent/delivered system reply separately in Phase 2); calls due/overdue/completed; open enquiries without next actions; confirmed bookings; recorded deposit amounts; lost reasons. Define cohort conversion as confirmed enquiries from an enquiry-created cohort divided by non-test enquiries in that same cohort. Also show confirmations by confirmation date as a separate metric. No fabricated targets.
