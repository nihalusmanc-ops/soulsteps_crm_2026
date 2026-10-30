# Manual payment entry — 30 October 2026

The owner removed the separate funds-verification requirement. Staff enter the
amount, received date and reference, then save once. The saved payment counts
toward the deposit, payments received, outstanding balance and manager reports.
The enquiry turns green on payment entry as before. Booking confirmation remains
an explicit action, enabled after the required deposit is saved; partial deposits,
missing quotation terms and overpayments retain their existing booking guards.

New payments record the authenticated staff name and timestamp in their JSON data
and retain the existing actor-linked activity/audit history. No bank check,
receipt approval or booking confirmation is fabricated. The UI no longer offers
a Verify funds button, verification checkbox or unverified-payment label.

Existing `pending` and `verified` storage statuses are retained for compatibility;
both count as saved received payments. `pending` is a historical storage value,
not a requirement to perform another staff action. Reversed payments are excluded
from all balances and totals. New screens use `receivedTotal`; `verifiedTotal`
remains a compatibility alias for older internal callers. The legacy verification
command remains compatible with older API clients but is not required or exposed
in the current UI. No migration or rewriting of historical payments is needed.

Managers can reverse any recorded payment with a reason, including entries created
under the previous pending status. Staff cannot reverse payments. Reversals retain
the payment and audit history; they do not silently cancel existing bookings.
Uploading a receipt creates an attachment only, with no payment or booking effect.

Payment entry still previews immediately through TanStack Query, rolls back after
a failed save and retries with the original request key. Booking confirmation stays
disabled during the pending write and never occurs automatically.

Checks cover manual-entry totals, historical payment compatibility, partial and
excess deposits, recorder attribution, database persistence and idempotency,
manager-only reversals, receipt isolation, optimistic rollback/retry and explicit
booking confirmation without an intervening verification command.
