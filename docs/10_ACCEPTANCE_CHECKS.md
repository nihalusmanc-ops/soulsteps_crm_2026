# 10 — Acceptance checks

| ID | Scenario | Expected result |
|---|---|---|
| A01 | Same Meta event delivered twice | One source/enquiry; no duplicate task |
| A02 | Customer enquires about second trip | One customer, separate enquiry/history |
| A03 | Redacted phone in historical sample | Review flag; no guessed merge or WhatsApp link |
| A04 | v2 shifted row + v3 ordinary row | Correct version-specific mapping, preview before commit |
| A05 | Old red/orange/cyan row | Raw style preserved; no inferred sales status |
| A06 | Dummy test lead | Excluded from live queues/metrics |
| A07 | Re-import after staff added note | No duplicate; newer operational edits retained |
| P01 | Couple/all visas and couple/no visas | P1 and P2 under reviewed active policy |
| P02 | Solo/yes and solo/no | P4 and P5; broad P3 cannot swallow solo |
| P03 | Family/all visas with unresolved P3 decision | Needs assessment until reviewed rule is active |
| P04 | Missing/mixed visa | Needs qualification/manual review |
| P05 | Ranking edited on Norway | Another trip unchanged; preview/recompute audited |
| P06 | Manual rank override + recomputation | Override preserved until explicitly cleared |
| T01 | P5 hot customer asks to pay | Appears in Ready to book |
| T02 | P6 callback due now, P1 callback later | Due commitment displayed first |
| T03 | Log no answer | Activity recorded; follow-up prompted; not auto-lost |
| T04 | Dubai midnight/date boundaries | Today/overdue filters use Dubai date correctly |
| T05 | Requested vague call time | Clarification/pending request; no fake appointment |
| F01 | Open WhatsApp clicked | No sent activity generated automatically |
| F02 | Receipt uploaded | Payment remains unverified |
| F03 | Partial verified deposit | Confirm booking blocked; remaining deposit visible |
| F04 | Sufficient verified deposit + explicit confirmation | One booking; confirmed stage/actor/time |
| F05 | Confirm request retried | Same booking, no duplicate |
| F06 | Required deposit missing | Confirmation blocked; missing terms shown |
| F07 | Full deposit but unpaid balance | Confirmed; outstanding balance still shown |
| F08 | Trip price updated after quote issued | Original quotation unchanged |
| F09 | Payment correction | Audited reversal, corrected totals, no silent delete |
| S01 | Staff requests manager endpoint | Backend rejects even if UI bypassed |
| S02 | Forged/expired/wrong-audience Access token | Request rejected |
| S03 | Request private receipt without permission | Access denied |
| S04 | Concurrent edits by manager/staff | Conflict detected; no silent overwrite |
| S05 | Staging tries outbound send | Disabled unless explicit test configuration |
| R01 | Queue consumer retries | No duplicate side effects; attempts visible |
| R02 | DB commit succeeds, queue push fails | Outbox/sweep recovers action |
| R03 | Backup restored | Records recover; old outbound actions held for reconciliation |
| U01 | Staff desktop/mobile workflow | Readable, keyboard usable, no clipped actions |
| U02 | API failure or empty dataset | Honest error/empty state, no invented metrics |

## Phase 2 gates
Phone app remains usable after supported onboarding. Customer and supported app-origin messages appear once. Human takeover/opt-out/reply cancels queued bot sends. Pending send checks state immediately before delivery. Provider timeout is reconciled before resend. Missing itinerary/price escalates rather than fabricates. Unknown trip prompts clarification. API session/template/permission restrictions enforced. Failed send is not logged as delivered. Source form and WhatsApp message link without duplicate enquiry/greeting. No claim that phone calls or app labels automatically change CRM payment/stage.
