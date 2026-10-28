# Enquiry workspace simplification

Removed workspace/timezone labels from the top bar. Enquiry notes now use the title “Note”; import provenance remains stored privately but is hidden from enquiry detail and source activities. Legacy source wording is normalized for display without changing stored source identifiers or filters.

Edit details now supports customer name, email, phone, traveller count, self-drive preference, desired departure and booking timeframe alongside existing qualification fields. Self-drive defaults to an unambiguous original answer, otherwise Not decided. Contact edits apply to the shared customer; trip preferences apply to the enquiry. Existing notes, source records, quotations and booking/payment rules are preserved.

Contact writes use the existing transactional command flow and revision protection, check the original customer snapshot to prevent lost contact edits, reject duplicate customer phone numbers, and reset phone verification when a number changes. No migration is required for optional enquiry JSON fields.

Verified: 28 focused domain/import-context/SQLite repository tests; four browser control tests including desktop/mobile notes, keyboard focus, hidden source wording and edit form command submission; TypeScript and Vite build. Full local Workers integration tests remain unavailable because Windows application control blocks workerd. Vite reports the existing bundle-size warning. No live customer contact data was changed for testing.
