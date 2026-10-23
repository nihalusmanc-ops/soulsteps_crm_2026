# 08 — Integrations and migration

## Historical source findings
Reviewed sample: ss excel.xlsx, one Sheet1, nine sample enquiry rows including one dummy test row. Contact values were deliberately shortened by the user; do not treat those edits as actual business data defects. No original customer data is redistributed here.
Headers include id, created_time, ad_id/name, adset_id/name, campaign_id/name, form_id/name, is_organic, platform, group, booking timeframe, Schengen, self-drive, email/name/phone, lead_status, Priority. Earlier form-v2 rows contain an additional journey-type answer before group and shift later values relative to current headers. Notes extend beyond labelled columns. Later v3 rows align differently. Source lead_status CREATED is an intake state, not sales progress. One test row has Done, which does not establish a booking.
Notes include itinerary sent, did not pick up, follow-up after one hour/weekends, might join, converted, and partial date/day notes. Red/orange/cyan old colours have no known meaning. New CRM colours must not be retroactively assigned to those fills.

## Import procedure
1. Manager uploads original export privately. Compute file checksum; create import batch. Parse only server-side with a Workers-compatible method or approved controlled preprocessing. Preserve source IDs as text to avoid numeric precision loss. Never execute macros/formulas.
2. Preview sheet/header/rows, classify dummy tests, detect form version, shifted columns, contact redaction/invalidity, duplicate source IDs, incomplete dates and notes. Preserve raw row, column positions and colour identifiers for review.
3. Map by form/source schema version, not column number alone. Preview v2 and v3 separately. Unknown shapes go review, not silent guessed shifts. Skip truly blank rows, preserve meaningful unlabelled notes.
4. Customer match only with complete validated contact evidence. Existing external lead ID is strongest dedup for enquiry re-import. Partial phone never merges records; mark unresolved. Show create/update/skip/review/error counts.
5. New structured fields remain reviewable. Preserve original notes in timeline with imported source attribution, not a fabricated staff author/time. Ambiguous Wednesday/February stays raw note; no made-up year/time. Converted note becomes confirmation-review candidate, not an invented deposit/verified booking.
6. Commit selected validated rows idempotently with progress and errors. Re-import does not duplicate records or overwrite newer staff edits. Import never sends messages or creates stale historical calls automatically.

## Meta lead capture, late Phase 1
Use official webhook plus lead retrieval when permissions/business setup are ready, or a verified connector to our intake endpoint. Preserve lead/form/ad/adset/campaign IDs, platform, original created timestamp/timezone and received_at. Map form IDs to trip and schema version via settings, not free-text ad names alone. Unknown form maps to review queue. Do not deduce November travel selection from static form-question wording. Booking decision timeframe is separate.
Use retry/backfill/reconciliation for missed events, event dedup and source-ID uniqueness. Spreadsheet continues temporarily only if needed, then CRM becomes authoritative. Do not implement unrestricted two-way Excel sync. Check Microsoft Excel/OneDrive versus Google Sheets and current connector before attempting ongoing sync.

## Manual WhatsApp mode, Phase 1
Keep current Business phone app unchanged. CRM stores full contact and offers Open WhatsApp/copy approved text/download itinerary. Staff records actual calls and sends. No reading chats through browser scraping, unofficial QR/session bots or phone-device automation. No fake synced history.

## Official WhatsApp mode, Phase 2
Require existing-number Business-app Coexistence, eligibility verified before any migration. Options not selected: direct Meta route if eligible supported onboarding is established; otherwise Coexistence provider such as 360dialog. Twilio's documented standard migration does not preserve same-number app access; verify changed support if considering later. Do not delete/deregister live app account during exploratory setup.
Connection contract: send text/document/template, receive customer messages, receive app-originated message echoes, delivery events, verify signature, provider IDs, retrieve media securely, report failures. API and phone-origin messages identifiable where provider supports. Implement provider adapter so CRM services stay independent. Backfill/history availability is provider-specific; no promise of all old chats/groups/calls synchronising.
Consent and approved-template/window checks before business-initiated sends. Meta form submission alone is not proof of a customer-initiated WhatsApp session. Confirm marketing permission and template classification; generic sales nudges are not automatically utility. Provider fees and recipient-market rates must be checked at launch.

## AI, Phase 2
No model selected. Evaluate extraction accuracy, grounding, handover and cost with anonymised examples. Rules select trip and price where possible; AI interprets ambiguous text and suggests structured fields. Store evidence and permit correction. Never let message content override system rules. Use approved published content only; escalate missing/ambiguous prices, dates, visa advice or availability. No AI access to confirm bookings or verify money. Small structured FAQ initially; vector search is optional only if justified later.
