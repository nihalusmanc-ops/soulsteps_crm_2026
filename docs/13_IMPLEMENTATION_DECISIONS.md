# Implementation decision log

Date: 23 October 2026. These entries are proposed implementation defaults, not approvals of business policy.

| Decision | Checkpoint implementation | Production decision still needed |
|---|---|---|
| Branding | Calm teal navigation, light neutral surfaces, text wordmark, abstract CSS landscape | Brand kit if desired |
| Ambiguous Norway ranking | Family/friends with all visas, mixed visas and unknown answers show Needs qualification | P3 vs P6; visa policy; group normalisation |
| Buying interest | Staff-controlled hot/warm/cold/unassessed; independent of fit and stage | Confirm definitions |
| Today ordering | Oldest due first; separate new/unassessed; unscheduled prospecting ordered interest, fit, oldest contact | Approve operational sorting and working hours |
| Timezone | Asia/Dubai; datetime-local values explicitly parsed with +04:00 | Customer timezone / callback scheduling policy |
| Money | Integer AED minor units; fictional quote snapshots only | Real prices, deposit terms, balance dates, overpayment/zero-deposit/refund policy |
| Confirmation | Explicit staff action after sufficient verified deposit; no inventory promise | Live availability/terms and cancellation policy |
| Contacts | No full phone numbers in fixtures; manual shortcut disabled for missing/partial numbers | Approved contact data and permission evidence |
| Staff/manager | Clearly labelled demo preview switch; backend private routes disabled | Invited identities, team visibility, Access audience/domain |
| Persistence | Browser-local repository behind typed interface for M1 | M2 D1 persistence, security, concurrency and file policy |
| Quote editing | Issued snapshots immutable; no correction-version UI at M1 | M2 versioned quote amendment workflow |
| Trip content | Draft/no price; edits remain draft; rule preview does not activate | Actual itinerary, FAQs, dates, prices, deposit terms and policy approval |
| Integrations | No live state, credentials, sends, subscriptions or inbox | Import source/mapping, Excel connector, Meta assets; WhatsApp Coexistence in Phase 2 |
| Retention | No real records accepted for this checkpoint | Privacy, retention/export and authorised data lifecycle |

Missing content and credentials do not block the independent M2–M4 engineering work. Production ranking and communications remain gated on the relevant decisions, not on guessed defaults.

## Milestone 2 implementation — 24 October 2026

- D1 through Hono replaces browser-local persistence. Missing fictional fixture IDs can be seeded locally without overwriting operational edits; one other-owner fixture exercises isolation.
- Production access requires a signed Access JWT and active invited email/subject match. Local fixture identities require a separate compile-time configuration, loopback and local environment. Actual Access setup remains pending identities/configuration.
- Repeat enquiries explicitly reuse accessible customer IDs, with separate activity and enquiry histories. Partial phone/email values never trigger a silent merge.
- Atomic conditional D1 batches implement revision checks and idempotent command results; child records, audit and booking cannot commit when the parent revision update loses.
- Receipts are private PDF/PNG/JPEG attachments up to 5 MB, not automatic verification evidence. Signature/extension checks are implemented; malware scanning and interrupted-upload orphan reconciliation remain later work.
- Core entities have relational keys/indexes/constraints; extended qualification and terms use typed JSON in the relevant table. SQL-backed filtering/aggregation and richer multi-departure editing remain follow-on work.
- Reversals and rank overrides retain reason, actor and time. Issued quotation correction/version UI is still follow-on work; existing snapshots are immutable.
- Live release needs real Access/storage configuration, approved content/policies, restore verification and staging review. No deployment, external send, service purchase or production import occurred. See docs/14 for commands and verification.

## Milestone 3 implementation — 24 October 2026

- In-app reminders are one per task, backed by an atomic outbox, Cron reconciliation, Queue leases, retry history and explicit failed-job retry. Marking seen never completes a call task. No customer-send job kind exists.
- Proposed defaults are 09:00–18:00 Monday–Friday, Dubai timezone, 24-hour follow-up suggestion, zero-minute reminder lead and five attempts. Accepted appointments are never rescheduled by these defaults.
- Stage label/colour changes are versioned and contrast-validated; codes and historical activity stay stable. Outbound customer automation remains fixed false.
- Rule publication uses an explicit, expiring server preview and trip/enquiry revision snapshot. Only the target trip's eligible enquiries change; overrides and closed/confirmed/held history remain untouched. Family/friends all-visa cases remain disabled in the working draft until reviewed. Isolated test policy changes are not production business approval.
- Manual-use trip content can be published without fabricating missing dates, prices or itinerary. Price/itinerary automation remains disabled; accepted quotes retain original snapshots.
- Private daily/on-demand backups include consistent operational tables and checkpointed receipt copies. The local restore drill passed all 22 table-count and two receipt-hash checks; restored checks are held until explicit review. Retention/automatic cleanup remains an owner decision; no objects are automatically deleted.
- Reconciliation reports missing/unlinked receipt objects with an upload grace period. Production Access/identities/resource provisioning, live monitoring and release checks remain pending. M4 historical import preview is next; no live data, messages, deployment or purchase occurred.
# M4 preview checkpoint

Proposed implementation default: start with an explicitly versioned synthetic JSON preprocessing contract, not a guessed mapping for an unavailable workbook. Server validates string cells and preserves raw positions/styles; review-only preview has no database side effects. Mapping is not approved for real form IDs. Missing original data does not block the remaining batch persistence and transactional commit work. See docs/16_IMPORT_PREVIEW_CHECKPOINT.md for scope and remaining M4 requirements.
