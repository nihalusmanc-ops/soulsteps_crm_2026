# 04 — Screens and design

## Design direction (proposed)
Premium, calm, modern travel operations workspace. Light neutral background, restrained dark navy/teal navigation, readable typography, generous spacing without wasting table density. No official Soulsteps logo/brand colours supplied: use a tasteful text wordmark and editable design tokens, not a fabricated brand identity. Default light theme; dark mode optional later. Desktop first at 1366–1440px with usable tablet/phone layouts. Text labels accompany colours, visible focus, keyboard access, sufficient contrast, accessible dialogs and table headers. Use subtle row/card accents instead of saturated full-row fills.

## Navigation
Today, Enquiries, Customers, Trips, Bookings, Overview (manager), Settings (manager). Customers may be a tab inside Enquiries rather than another complex module. No Phase 1 inbox or fake live chats. Display manual WhatsApp mode and integration health clearly where useful, not implementation internals in ordinary sales flows.

## Today
Date in Dubai time; small real-data counters for calls due/overdue, new enquiries and open enquiries without next action. Sections: overdue, scheduled/requested callbacks (clearly distinguished), ready to book/confirmation pending, and prioritised follow-ups. Columns: customer, trip/departure, stage, P-rank/reason, temperature, visa/group, next action/time, last contact, owner. Quick actions: Open detail, Open WhatsApp, Log call, Set follow-up. Manager sees all; staff default own records with configurable team visibility. Empty states explain action needed. Loading/error/permission states required.

## Enquiries
Table/kanban toggle using same filtered dataset. Search name/contact, filters for trip/departure, stage, rank, temperature, visa, group, owner, source, created range, no-response, missing next action. Sort/paginate server-side once persisted. Table supports practical density and pinned customer/action columns. Kanban shows counts, stage labels, customer, tour, next action, owner, priority/temp. Dragging to Confirmed opens verification dialog and may be rejected. No invalid status changes via drag bypass. Save optimistic edits with rollback/error notice.

## Customer and enquiry detail
Customer header/contact actions. Separate enquiry selector for repeat customers. Main content: Overview, Activity, Payments/Booking, Files. Qualification fields: original group answer, normalised group, counts when known, visa summary, self-drive preference, booking intent timeframe, desired departure/dates, budget if volunteered/needed, special requests. Sidebar: owner, stage, ranking explanation/override, temperature, availability, next action. Timeline records calls, notes, tasks, stage changes, itinerary/quote sends, payments and system events with author/time/source. Preserve original source notes separately from new staff notes. Add note, Log call, Schedule follow-up, Record payment, Confirm booking. Persistent actions must survive reload.

## Trips
List with draft/published/inactive state. Edit trip details, itinerary file/version, FAQ, price variants per departure/sharing, solo supplement, currency, deposit terms, booking deadline and availability note. Multiple departures supported without duplicating the whole package. Fixed/bespoke type. Norway seed is draft with no real price. Separate priority-rule editor/preview. Publication requires mandatory content only for enabled features; missing itinerary must not block manual CRM usage but blocks automated itinerary sends. Warn when changing content used by existing quotes; retain snapshots.

## Bookings
Confirmed list with reference, customer/group count, trip/departure, booking amount, verified paid, balance, balance due date, owner. Detail links enquiry timeline and payments. No inventory reservation claim. Basic internal preparation checklist is optional later. Receipt viewing is authorised and private.

## Manager Overview
Counts by stage/trip/source, cohort conversion, confirmations by period, cash received by payment date, booking value by confirmation date, loss reasons, overdue tasks, actionless leads. Label date basis and currency. Do not sum different currencies into AED without approved FX conversion. Small source samples can be shown without pretending campaign ROI exists; ad spend is not supplied. Staff access to aggregated financial reports is restricted by default.

## Settings
Users and roles, business hours/timezone, stage label/colour settings, task/reminder defaults, trip rules, import history, integration state and failed actions. Destructive/bulk operations preview affected count and require a clear deliberate action. No unnecessary confirmation for ordinary reversible note/task edits.
