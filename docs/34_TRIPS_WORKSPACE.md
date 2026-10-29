# Trips workspace redesign

The Trips list now uses compact desktop rows and responsive cards. Search matches trip name or destination; status filters and sorting are stored in the URL. Default sorting is departure ascending, with unset departures last. Rows/cards open a dedicated trip page; linked enquiry and booking counts retain their own destinations. Native links support keyboard navigation.

Trip pages show saved description, itinerary, supplier availability notes, dates, pricing and deposit. Overview, Enquiries and Bookings sections use actual records visible to the signed-in user. Open enquiries exclude closed/on-hold records; bookings require an actual confirmed booking record. Booking amounts/balances use accepted quotations and verified funds rather than current catalogue prices. Missing content remains Not set. Staff get a read-only view without disabled manager controls.

Managers can edit trip details, including destination and journey type. New/Edit forms share grouped fields for trip details, dates/pricing and itinerary/availability. Creation accepts these optional fields in a single transaction and retains compatibility with previous minimal requests. Server validation rejects invalid departure dates and deposits exceeding the supplied price; authentication, manager authorization, idempotency and auditing remain in force. Existing quotations are preserved when trip details or pricing change.

Deletion sits inside a three-dot action menu and uses the existing confirmation/linked-record safeguards. Publication review and trip-fit rules are available under manager-only Advanced. Version metadata remains available in review workflows rather than the main list. Published status retains its existing meaning and is not an inventory availability guarantee.

Routine edits retain the optimistic mutation flow; amounts, creation, deletion and publication wait for server confirmation. List filters survive opening a trip and changing its section; linked enquiries provide a Back to trip link. No inventory, capacity, date, price, itinerary or conversion data is invented.

Verification: 65 focused tests, including full-draft creation against SQLite/Hono, staff rejection, creation idempotency, validation and preservation of accepted quotations after editing. Thirteen browser workflows cover existing controls, optimistic updates, customer/deletion flows and the new trip list/detail/create/edit flows. Mobile/tablet checks at 390, 768 and 1024 pixels and desktop visual review verify readable layouts without page overflow. TypeScript/Vite build passes with the existing bundle-size warning. Full local workerd tests remain blocked by Windows application control; live customer records are not mutated for testing.

No migration is needed. Existing hosted data, passwords, permissions and integration activation settings are preserved. Rollback can redeploy the previous application; newly saved optional trip fields remain compatible with older readers.
