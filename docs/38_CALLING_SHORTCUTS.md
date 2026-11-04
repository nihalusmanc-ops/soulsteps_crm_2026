# Calling workspace shortcuts

- Each row offers seven call-colour dots with accessible names and hover descriptions. A dot saves immediately through the audited command API and optimistic rollback. Green remains derived from received payments.
- Changing a colour does not record a completed call, alter notes, or complete follow-up tasks. The save icon records the call with its note and optional follow-up. A red row is excluded from active calling lists, as before.
- Priority can be selected directly as P1–P6. This uses the existing audited manual override and is preserved during subsequent qualification/rule updates. Edit details continues to compute priority for enquiries without overrides.
- Priority, trip, colour and received-date filters combine across all calling tabs. Received-date presets use rolling last 3, 7 or 30 days from enquiry creation. Monthly means the last 30 days.
- Column headings toggle ascending/descending sort. Smaller screens expose a sort dropdown. Filters and sorting are retained in the URL.
- Row identity remains stable during writes so unsaved note and date drafts survive colour/priority updates.

## Quiet background saves

Routine record writes have no generic Saved toast or in-flow Saving banner. Existing optimistic previews remain immediate, with reconciliation and rollback/retry on errors. Pending calling controls keep their normal appearance, and a stable scrollbar gutter avoids horizontal jumps. Visible row ordering stays fixed while editing; changing filters, tabs or sorting starts a fresh ordering. Errors remain visible and actionable.

Validation includes a held network response confirming immediate colour preview, unchanged row position and control opacity, preserved note drafts, and no success popup after reconciliation.
