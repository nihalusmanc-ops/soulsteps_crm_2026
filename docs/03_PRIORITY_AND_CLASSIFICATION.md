# 03 — Priority, buying interest and call order

## Independent classifications
1. Sales stage = process progress.
2. Trip priority = target-profile fit for a particular trip.
3. Temperature = buying interest (unassessed/hot/warm/cold).
4. Contact flag = no response / no answer / unreachable / none.
5. Payment state = derived from financial records.
Keep all visible and independently editable where appropriate. No visa does not mean unsuitable or cold. Silence does not mean disinterest.

## User's updated Norway list, preserved verbatim in meaning
P1 couple with Schengen; P2 couple without Schengen; P3 anyone with Schengen; P4 solo with Schengen; P5 solo without Schengen; P6 family, friends and everyone else (no separate family/friends rank).

## Overlap and proposed executable resolution
The list overlaps: anyone with Schengen includes solo, and family/friends may be covered by P3 or P6. The assistant previously proposed the following carve-out; the user has not explicitly confirmed its exact edge-case behaviour. Do not silently call it final.

| Priority | Proposed rule |
|---|---|
| P1 | Couple and all relevant travellers report valid Schengen visas |
| P2 | Couple and none report valid Schengen visas |
| P3 | Non-couple/non-solo groups with all relevant travellers reporting valid Schengen visas |
| P4 | Solo and valid Schengen visa |
| P5 | Solo and no valid Schengen visa |
| P6 | Remaining fully assessed groups, including family/friends without visas |

Use these as DRAFT demo defaults with a rule-preview screen. Manager must review P3 behaviour for family/friends with visas before activating production automatic ranking. If unconfirmed, leave affected profiles Needs assessment while unaffected explicit couple/solo cases can rank after activation. Unknown/mixed visas go Needs qualification/manual review instead of guessed P2/P6. Group labels couple/two_people from historical source need review: two people are not necessarily a couple. Preserve original answer and normalised category.

## Rule configuration
Per trip, versioned ordered conditions with enabled flag, group criterion, visa criterion, output rank and explanation. Check specific matches before broader matches; fallback only for complete inputs. Restrict initial editor to known fields/operators, not executable user code. Validate overlaps and gaps with preview examples. Record rule_version, computed rank, explanation and computed_at. Manual override stores rank, reason, actor/time; recomputation must not silently overwrite an override. Recompute open enquiries on publish only through a previewed operation; preserve confirmed historical ranking snapshots. Never rank solely from an ad title.

## Temperature defaults (staff controlled in Phase 1)
- Unassessed: not enough buying-intent evidence.
- Hot: explicit intent to proceed/pay/reserve or active closing discussion.
- Warm: engaged, asking questions, considering options.
- Cold: explicitly browsing or deferring without a concrete plan.
Phase 2 AI may suggest a temperature with source evidence; staff can correct. ready_to_plan_now is intent evidence but not proof of payment readiness. Original 1–3 months timing is booking decision timing, not travel date.

## Today ordering
Separate overdue tasks, appointments, ready-to-book and unscheduled prospecting views. Do not produce duplicate rows for a task in different views without indication. Scheduled commitments take precedence over fit ranking. Within overdue: oldest due first; within upcoming: due time first. In prospecting: Hot, Warm, Cold, Unassessed as visible default with a separate new/unassessed lane to prevent neglect; then P1–P6; then oldest last-contact/created timestamp. Missing rank is shown separately as Needs qualification. Provide filters and explicit sort selection. No endless starvation of lower priority leads; manager sees ageing and unowned/actionless records.

## Boundary examples
Couple/all visas -> P1; couple/no visas -> P2; solo/yes -> P4 even though broad P3 also matches; solo/no -> P5; family/no -> P6; family/all -> P3 only after rule decision confirmed; unknown or mixed -> qualification; confirmed enquiry excluded from prospecting regardless of rank. A P5 hot customer requesting payment must still be surfaced in Ready to book.
