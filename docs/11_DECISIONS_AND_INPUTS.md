# 11 — Decision register and missing inputs

## Confirmed by user
- Soulsteps UAE travel/tour operator; fixed and bespoke trips; one Norway package initially.
- One staff + one manager. Excel currently receives Meta enquiries automatically; staff colours/notes manually.
- Current WhatsApp Business phone app; customers send prepared form-answer message from their own number.
- Trip-specific itinerary and per-person pricing; greet before itinerary; ask when free to call.
- Staff confirms availability, verifies bank deposits, and manually confirms booking after deposit.
- Follow-up nudge desired in automated phase, then no-response flag and staff task.
- Trip-specific editable ranking and colour-based status desired.
- React/Vite frontend, Hono backend, D1 database; Cloudflare hosting; VS Code Codex implementation.
- Build core CRM without WhatsApp connection first; keep future integration possible.
- Keep phone-app messaging when WhatsApp automation is added, via verified Coexistence.

## Proposed defaults, not asserted as user-approved details
- Stage codes/colours, role access scope, Today sort order, draft/publication controls and call-task schema.
- P3 other visa-holding groups versus P6 everyone else needs explicit Norway rule preview approval.
- Visa all/some/none/unknown handling; couple/two-person source normalisation needs care.
- Nudge at 24h, then staff task after another 24h; production sending remains disabled until policy set.
- Manager publishes trips/prices/rules, manages users and reverses verified payments.
- Design colours/fonts are provisional because no Soulsteps brand kit supplied.

## Needed before relevant live feature
| Input | Needed for | Blocks other work? |
|---|---|---|
| Actual itinerary PDF and approved FAQs | Live itinerary delivery | No |
| Norway dates, prices/sharing/supplements, inclusions/exclusions | Live quotes and pricing answers | No; use draft/no price |
| Deposit amount/percentage, due dates, currency | Real booking confirmations | No; demo uses fictional terms |
| P3 group handling and visa policy approval | Automatic production ranking of ambiguous profiles | No |
| Staff/manager login identities | Live Access login | No; safe local fixture |
| Business hours/callback timezone policy | Appointment and nudge scheduling | No; proposed Dubai default |
| Original complete export and field mapping review | Real customer migration | No |
| Excel versus Sheets location and current connector | Interim sync/cutover | No |
| Meta Business/Page/form assets and permissions | Direct lead intake | No |
| WhatsApp Coexistence eligibility/onboarding/provider | Phase 2 messaging | No |
| Privacy/retention/export policy and permission wording | Production data handling | No demo blocker |
| AI provider/model budget and evaluation | Phase 2 conversational AI | No |

Do not block the entire development on these inputs. Mark drafts and enforce guards on affected production actions. Maintain a decisions log in the repository as owner feedback arrives. This pack supersedes earlier exploratory suggestions where scope changed; provider/model are not selected and no live automation has been built.
