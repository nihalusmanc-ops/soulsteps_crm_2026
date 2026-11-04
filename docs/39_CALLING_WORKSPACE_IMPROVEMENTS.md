# Calling workspace improvements — approved 4 November 2026

The owner approved audit items 1–4 and 6–12 for New enquiries, Follow-ups and All enquiries. Item 5 is deferred: choosing a colour never logs a call or sets initialCallAt/lastContact. The explicit save icon still records a call with a required note.

## Staff workflow

- Notes save after a 750 ms pause or on blur. Empty notes can be saved; original imported notes and prior activities remain intact.
- Follow-up dates save after selection/editing, independently of call logging. Tomorrow and Next week keep the selected Dubai time, or use the current Dubai time when none exists. Clear cancels the active sales call schedule. Callback and initial-call tasks are included; unrelated task types are preserved.
- Drafts live outside visible rows, scoped to the signed-in identity. They survive filtering, tab switches and profile navigation. Untouched controls use refreshed data. If another staff member changes a dirty field, the draft is retained with Use latest / Keep my edit choices. Closing/reloading warns while drafts or saves remain. Completed saves persist on the server.
- Each enquiry has an ordered optimistic write queue. Other enquiries remain editable during a save. Failed rows pause independently, roll back their preview and retain their queued changes. Ambiguous failures retry the original request/revision/idempotency key. A confirmed revision conflict refreshes before an explicitly requested retry.
- Red sets LOST and cancels pending tasks atomically, without recording a call. A snapshot retains the prior colour/stage and pending task IDs. Undo or Reopen restores the prior active state and tasks; historical closed records without a snapshot reopen without inventing appointments. Non-red selections also reopen disqualified/on-hold sales records. Deposits/bookings remain guarded.
- Priority shows Auto or Manual. A manual priority dropdown offers Use automatic priority, which evaluates only the selected trip's current reviewed rules. Missing or ambiguous answers remain NQ. Closed/confirmed historical priorities are not automatically recomputed.

## Finding enquiries

- Each tab remembers its own search, filters and sorting during the signed-in session. Current choices stay in the URL. Removable chips and Showing X of Y explain the visible results. Reset filters preserves sorting; Default order clears sorting.
- Follow-ups offers All / Overdue / Today / Upcoming / Not scheduled. Counts respect other active filters. Overdue means the appointment time has passed; Today includes all appointments on the Dubai calendar day, including overdue times today. Upcoming means later calendar days. Closed records do not enter these queues.
- All enquiries adds Not called / Follow-up / Disqualified / Deposit received / Other closed. Priority, status and received-date filters combine.
- Received dates/age are displayed per row. Received sorting supports newest/oldest; colour sorting follows operational colour order, not alphabetic names. Ascending/descending works on mobile too. Editing does not reorder the visible rows; changing filters or sort refreshes their order.
- Sticky tabs, filters and desktop headings remain available while scrolling. Mobile secondary filters collapse behind Filters. The colour guide explains every outcome, deposit-derived green and NQ. The seven dots remain ring-free in rows of four and three.

## Release and verification

No database migration or record rewrite is needed: the existing JSON enquiry state, activities and task persistence store the new commands and red/undo snapshot. Existing financial guards, permissions, revision checks and idempotency receipts are used. Rollback uses the previous compatible Worker build; records and activity history are retained.

Validation covers queue ordering and isolation, failed/lost responses, draft conflicts, note clearing, callbacks and unrelated task preservation, red/undo persistence, manual-to-automatic ranking, combined filters, tab memory, sorting, six screen widths, keyboard date editing and sticky controls. Full unit, browser and UI regression checks accompany the release.
