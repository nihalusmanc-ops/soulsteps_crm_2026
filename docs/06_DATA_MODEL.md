# 06 — Logical data model

This is a design contract, not executable production SQL. Implement with Drizzle/D1 migrations and verify constraints in the actual runtime. IDs should be stable UUID/ULID text. Store UTC timestamps consistently; render Asia/Dubai by default. Money is integer minor units plus ISO currency. Unknown booleans are null/explicit unknown, not false.

| Table | Core fields and relations |
|---|---|
| users | id, identity_subject, unique login email, display_name, role staff/manager, active, created_at |
| customers | id, name, full phone_e164 nullable, email nullable, contact_validity, created/updated timestamps |
| customer_contact_preferences | customer_id, channel, opt-out state/time/source, recorded permission evidence where applicable |
| trips | id, name, destination, type fixed/bespoke, draft/published/inactive, description, active_version |
| departures | id, trip_id, start/end dates nullable, booking deadline, staff availability state/note/checked_at |
| trip_content_versions | id, trip_id, version, itinerary_file_id, approved FAQs/inclusions/exclusions, published_by/at |
| price_options | id, trip/departure, currency, per-person amount, sharing_basis, solo supplement, effective dates, deposit type/value, balance terms, version |
| priority_rule_versions | id, trip_id, version, draft/active, conditions JSON, reviewed_by/at |
| enquiries | id, customer_id, trip/departure nullable, owner_id, stage, temperature, response flag, computed rank/explanation/rule version, override rank/reason/actor/time, qualification state, group/visa/self-drive answers, counts, booking timeframe, desired dates, budget nullable, availability, last_contact_at, created/updated timestamps, revision |
| enquiry_sources | id, enquiry_id, provider, unique external lead/form key, ad/adset/campaign/form IDs and names, platform, organic flag, original created timestamp, received_at, source data ref |
| tasks | id, enquiry_id, owner, type, requested_at/time separate from accepted due_at, status, notes, completed/cancelled_at, source, revision |
| activities | id, enquiry_id, actor/source, type, occurred_at, logged_at, text/metadata, linked task/payment/quote; append-only critical events |
| quotations | id, enquiry_id, version, offered amount/currency, travellers, price/content snapshots, required deposit, validity, sent_at, accepted_at, status |
| bookings | id, unique enquiry_id, unique reference, accepted quotation_id, amount/currency, required deposit, balance_due_at, confirmed_by/at, status |
| payments | id, enquiry_id, booking_id nullable, amount/currency, received_at, reference, receipt file, pending/verified/reversed, verifier/time, reversal reason |
| files | id, private R2 key, safe filename, MIME, size, purpose, enquiry/trip association, uploaded_by/at, scan state if used |
| imports/import_rows | batch identity/checksum, actor, mapping version, raw row ref, original notes/styles, preview classification, errors, commit status, resulting IDs |
| integration_events | provider, unique external_event_id/key, payload ref, received_at, processing state/error/retry |
| scheduled_actions/outbox | unique action key, enquiry, kind, due_at, expected revision/state, status, attempts, provider message ID, error |
| audit_events | actor, object type/id, action, safe before/after, timestamp, request ID |
| settings | business timezone/hours, stage labels/colours, follow-up policy and version |

## Phase 2 only
conversations (customer/channel/thread, linked enquiry, automation mode, last inbound/outbound, assigned staff), messages (provider IDs, direction, app/API origin, type, body/file ref, status timestamps), consent evidence and template catalogue as needed. Store message events separately so late delivery events do not downgrade read/delivered state. Multi-trip ambiguous messages need staff routing, not automatic new records per message.

## Integrity and indexes
- Foreign keys enabled; unique source lead key, unique booking per enquiry, unique message/event/action keys.
- Index enquiries(owner,stage), (trip,stage), created_at, last_contact_at, normalised contact lookups; tasks(owner,status,due_at); events(status,next_retry_at); payments(enquiry,status); activities(enquiry,occurred_at); source campaign/form IDs.
- Normalised exact valid phone may be unique for active customer contact identity; shared/family phone conflicts require review. Never merge using a redacted/partial phone. Email comparison case-normalises domains and stores original display.
- Use revision/updated_at checks for concurrent stage/payment/task edits; return conflict instead of overwriting manager/staff changes.
- Derived paid = verified payments less verified reversals in the booking currency. No mixed-currency total. Quote snapshots immutable after issue; corrections create versions.
- Deactivate used trips/users rather than breaking historical records. No public self-signup. Customer deletion/retention/anonymisation policy requires owner choice; do not invent indefinite retention. Preserve needed audit with minimum personal data.

## Backup
Use D1 Time Travel within plan retention plus scheduled exports to private storage, defined retention and a tested restore. Record export status and alert on failure. Restoring data can also revive old pending sends, so disable outbound actions during recovery and reconcile before reactivation.
