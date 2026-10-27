# Workbook status colours and client notes — 27 October 2026

The owner supplied the client's colour legend and explicitly clarified additional shades: red/dark red means disqualified; orange means warm; blue/cyan means follow-up or unsuccessful connection; yellow means interest/itinerary/follow-up; magenta means connected but could not talk; green means converted; purple requires review. The owner chose to flag conflicting colours across copies/submissions rather than guess which one is current. The owner confirmed the 2026 context for dates and requested leaving today/tomorrow wording unchanged. The prior question specified October 2026 for day-only notes; date extraction uses that context.

Original Excel styles were read from actual fills/cell formats. Status comes from the dominant fill across populated contact/form cells, excluding the free-text update columns, so colouring a single comment does not silently override the row. Equivalent blue shades and cyan share one status. Duplicate enquiries' source rows are combined; disagreement between mapped statuses produces Review required. No source rows, styles, Meta IDs or old notes are removed.

## Visible workflow

Each lead now shows a labelled colour badge and an adjacent client-note/next-step column. Notes opens an accessible right-hand drawer without leaving the list. It shows the client note, next-step cue, source follow-up, staff notes and all deduplicated workbook notes with sheet/cell references. Current staff-authored notes take precedence over imported text; current accepted tasks take precedence in the note card's next step. The same card appears beside enquiry details. All raw source context remains available in a disclosure. A client-status filter supports each colour category.

The rightmost populated note is included, and earlier note columns are retained instead of discarded. Rows without notes explicitly say no staff note was recorded and still provide a next-step cue. Excel numeric time cells with the workbook's time format are rendered as times while the original evidence remains unchanged.

## Date and lifecycle handling

Call/follow-up phrases supply source callback dates. Explicit date/time, date-only and relative/incomplete notes remain distinct. Travel date ranges, departure/embassy dates and completed-call dates do not create follow-ups. Today/tomorrow/weekdays and incomplete requests remain as source text for confirmation. Date-only follow-ups show the date and ask staff to agree a time. After 6pm is not converted into an invented exact 6pm appointment. No imported source note automatically creates a scheduled task.

Untouched imported lifecycle fields are updated to reflect the legend: red → Not suitable; orange/blue/magenta → Initial discussion; yellow → Interested; green → Decision pending with a Converted · verify booking source badge. Warm/yellow interest updates buying temperature, independent of trip-fit rank. Green never creates a quote, verified payment or confirmed booking. Existing revisions/bookings are protected from automatic stage/temperature/contact-flag replacement; source annotations remain visible alongside actual current workflow. Version and revision guards make the migration repeatable without overwriting later staff edits.

## Planned reconciliation and checks

The preflight identifies 312 enquiries: 91 red, 37 orange, 85 blue, 17 yellow, 18 magenta, four green, 21 review and 39 unmarked. Nineteen source follow-ups have dates, 23 have relative/incomplete wording and 82 enquiries have no free-text workbook note. All receive an explicit note/fallback and next-step cue. A private pre-update D1 export was saved.

SQLite simulation verifies idempotence, source completeness and unchanged enquiry/task/payment/booking counts. Four note/date/legend tests cover callbacks, approved date context, relative wording, time windows, travel dates and completed call history. Fifty focused rule/auth/import/access tests pass. Four isolated browser tests cover the notes drawer, filtering, keyboard/focus, mobile layout and the existing picker controls. Screenshots were inspected with fictional data. Type checking/build pass. Full local Workers testing remains blocked by Windows Application Control; the security policy was not changed. No real customer notes or contact details are committed to Git or public assets.

## Applied and verified

Published source `064e249` as staging version `3de3cd99-2b4e-4daa-bf1f-3a5f97d7f825`. Applied the 624-statement versioned/revision-guarded enrichment. Remote counts exactly match all eight categories above, with 312 enriched enquiries and 19 dated source follow-ups. Foreign-key checking returned no violations. Task, payment and booking counts remain zero; the separate source batches and original source history were not rewritten.

A real hosted staff login fetched the updated CRM state successfully: all 312 enriched shared records and the 19 dated follow-ups were readable, while manager reports still returned HTTP 403. The verification session was signed out. No password/session token or client details were logged. Production was not deployed, no customer message was sent, and no relative date was scheduled as an appointment.
