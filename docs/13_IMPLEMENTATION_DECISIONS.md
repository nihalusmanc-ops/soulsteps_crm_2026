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
