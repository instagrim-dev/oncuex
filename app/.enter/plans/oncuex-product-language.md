# OnCueX: the launch, not the system

## The problem with the current page

The page still explains itself. “Cross-checks”, “Before you approve”, “Approval” and “Changes” are sections about how the product knows something, not about the event. “Plan is ready” is a status about the system’s assessment sitting above the actual work. A producer with a limited attention budget should not have to read the product’s reasoning before they can run the launch.

The product should feel like a great wedding planner’s binder: the day, the people, the checklist, the budget, the timeline, and the few things that need a decision now. The planner does not narrate how they know the seating plan works. They show the plan and flag the one table that does not fit.

## Who it is for

The primary user is the OnCueX event lead for the Northwind spring launch: Rowan Iyer. Rowan is client-facing, manages several partners at once and has to keep the day moving. Ana and Priya are producing with Rowan. The venue, caterer, production partner and photographer all sit outside OnCueX.

Rowan does not need a readiness dashboard. Rowan needs to know:

- What is happening next, and who owns it.
- What is waiting on a partner or a document.
- Whether the day, the guest count and the budget fit together.
- Whether the plan is ready to sign off and share.

The tone should carry OnCueX’s cultural fluency and creative judgment: warm, specific and calm. Not a compliance console, not an audit log, not a project-management tool explaining its own method.

## The new shape

Five product tabs, with the launch as the default:

- **Overview** — the launch at a glance, next up, what needs a look, the team and the budget snapshot.
- **Checklist** — the actual work, grouped by Venue, Crew, Production, Photography and Budget.
- **Timeline** — the event-day sequence: access, crew call, setup, run of show and hard stop.
- **Budget** — approved, committed, remaining and the partner commitments.
- **Partners** — the venue, caterer, production partner and photographer, with their documents.

Three things sit outside the tabs:

- **Sign off** — a single action in the header, not an “Approval” section.
- **Activity** — a drawer with recent updates, document confirmations and sign-offs, not a “Changes” or “History” tab.
- **Settings** — sample reload, start over and a short note about the fictional event. No counters, review clock or role switch.

The old Approval, Changes, Sources and Cross-checks tabs are removed. Those concepts still exist underneath, but they surface only where they matter: inline on the checklist, timeline, budget or partner card.

## The top of the page

The page opens like an event cover, not a status dashboard.

> **Northwind Provisions**  
> **Spring product launch**  
> 14 March 2027 · 17 days to go  
> 120 guests · Foundry Hall · $30,000 approved

Under that, **Next up** — the work that actually needs Rowan, Priya or Ana next. At the start of the sample that is the open work from the brief:

> Confirm whether the venue provides a freight lift — Priya  
> Confirm whether the photo delivery date is fixed — Ana  
> Walk the venue pack with Priya — Rowan

After a venue update, the same list becomes the affected work: confirm capacity, the loading window, the run of show and the fire attestation. It reads as work, not as system state.

There is no “Plan is ready” badge at the top. When the checklist and the open questions are settled, the next-up list is simply “Next: sign off,” and a **Sign off** button appears in the header. When something is off, a single line under the event cover says “2 things need a look” and links to the checklist row or the budget line — not a cross-check panel.

“Plan is ready” as a global status disappears. The plan’s readiness is expressed by the absence of open work and by the sign-off action, not by a labelled state.

## Screen by screen

### Overview

- Event cover: client, event name, date and countdown, guest count, venue, approved budget.
- **Next up**: the three most relevant open tasks, with owner and where they are waiting.
- **On your radar**: only exceptions, in plain sentences with a link to the fix. No list of all six checks. After a venue update, for example: “Committed $31,450 is $1,450 over the $30,000 budget” and “The fire attestation is for Foundry Hall, not Pier 9 Loft.”
- **The team**: Rowan, Ana and Priya, with their roles.
- **Budget snapshot**: approved vs committed, with a simple bar.
- **Recent activity**: the last few updates, linking to the Activity drawer.
- No “Before you approve”, “Cross-checks”, “Approval” or “What changed” sections.

### Checklist

The checklist is the plan. It is grouped by the five work areas, and each row is a piece of work, not a system state:

> **Venue**  
> ☐ Confirm Pier 9 Loft can take 120 guests plus circulation — Priya  
>   Waiting on the venue pack · the current pack says 110  
> ☑ Confirm the loading window covers crew setup — Priya  
>   Foundry Hall pack, received 20 Feb, valid to 7 Mar  
> ☐ Check the fire and occupancy attestation for the booked venue — Ana  
>   The attestation still names Foundry Hall

Rows use a small checkbox or a quiet inline note (“waiting on the venue”, “needs a new confirmation”, “done”). The tick is a state, not a manual to-do: a row is done because the document behind it is current, and clicking the row opens that document. There is no global “confirmed / outdated / blocked” status bar and no plan-item ID. Documents sit with the task they support. Conflicts appear on the row they affect, not in a separate section.

### Timeline

A day timeline, not a checks page:

> 05:00 access opens · 07:00 crew call · 07:45 setup complete · 16:00 photography · 22:00 run of show ends · 23:00 hard stop

Conflicts are written next to the time they affect. After the venue update, the same page shows 06:00–07:30 access and says “The 07:15 crew call plus setup runs past the 07:30 access close,” and “Run of show ends at 22:00, after the 21:30 hard stop.” After the annex, it shows the recovered times: 05:00–08:00, 06:30 crew, 21:00 run of show, 22:30 hard stop. No “cross-checks” heading and no check identifiers.

### Budget

A planner’s budget view:

- Approved budget, committed total and remaining, with a simple bar.
- Commitments by partner: venue, catering, production, photography.
- A plain note when the total is over: “Committed $31,450 is $1,450 over the $30,000 budget.”
- The budget sheet and reconciliation document sit here, with their received and valid-until dates.

No cost-check section; the over-budget line is part of the budget.

### Partners

Four partner cards: the venue, Cedar & Salt catering, Lantern Studio production and Mira Okonjo photography. Each card shows:

- What they provide, in a sentence.
- Their documents, with received and valid-until dates and a quiet state: “Confirmed”, “Needs a new confirmation”, “Waiting for a document”.
- Actions to confirm a document or ask for a new version.
- A short note when the plan has moved away from what the document says.

No “Sources” language, no source IDs, no digests. Documents belong to the partner and to the task they support.

### Sign off

Sign off is an action in the header, not a tab.

- If the plan is ready, the panel says: “Everything on the checklist is in place. Sign off the plan?” with the event, date and five areas listed in plain language.
- If it is not ready, the same panel says: “A few things still need a look,” with two or three links to the exact checklist rows or partner documents. No eligibility codes, no “approval current” language.
- After signing off, the header shows a quiet “Signed off” state. Previous sign-offs appear in Activity, with who signed off and what the plan looked like at the time. No dedicated Approval page.

### Activity

A drawer, opened from the header:

- “Venue changed to Pier 9 Loft — six checklist items need a new confirmation.”
- “Annex confirmation added — Priya.”
- “Plan signed off — Rowan.”
- “Catering quote replaced — new total $8,950.”

Human entries, in order. No event log, no counters, no IDs, no technical payloads. A removed document reads “Removed from the plan; kept for reference.”

## How the system’s checks disappear

The underlying rules do not change; their presentation does.

| System concept | Where it surfaces now |
| --- | --- |
| Occupancy vs guests | On the venue task, next to the guest count |
| Loading window vs crew setup | On the crew task and the timeline |
| Run of show vs hard stop | On the timeline |
| Committed total vs budget | In Budget |
| Fire attestation | On the venue task, next to the attestation document |
| Dependency closure | As “waiting on the venue” on the dependent task |
| Expiry / stale document | On the partner document and the task it supports |
| Approval no longer applies | In Activity and a quiet note after a change |

The planner never sees a list of six checks. They see the one line that matters where they would fix it.

## Updates without a Changes tab

A small **Update event** action (in the event cover menu) holds the prepared venue and recovery updates for this sample:

- “Move the venue to Pier 9 Loft.”
- “Use the annex and revised budget.”
- “Add the annex confirmation.”

Applying one updates the checklist, timeline, budget and partners in place. A short banner says what changed and how many tasks need a new confirmation, with a link to the checklist. There is no separate Changes page and no “impact set”. The event update is a normal edit, not a tour of the system’s reasoning.

## Language

Remove from the product:

- Plan is ready, readiness, cross-checks, before you approve, approval, eligibility, changes, impact, sources, plan items, record, status, workspace.
- IDs, revisions, counters, digests, roles, simulated identities, browser-only, self-check.

Use instead:

- **17 days to go**, **next up**, **on your radar**, **checklist**, **timeline**, **budget**, **partners**, **documents**, **activity**.
- **Sign off** / **signed off**, **waiting on the venue**, **needs a new confirmation**, **done**, **update event**.
- Partner and task names in full: “Confirm Pier 9 Loft can take 120 guests plus circulation.”

The page should sound like a producer talking to a producer, not a system describing itself.

## Look and feel

Keep the indigo/amber palette and the warm paper background, but move from dashboard to planning binder:

- A large editorial serif event title and a prominent date/countdown.
- A main column with the next work and a quiet right rail for the team, budget and recent activity.
- Checkboxes, dates, names and inline notes instead of a grid of status badges.
- A day timeline with times and a simple budget bar.
- Fewer panels, more space; one accent for “needs a look”, not a traffic-light system.
- Light and dark mode, mobile-friendly.

## What stays the same

- The rule that a venue change reopens the affected work and leaves photography valid.
- The rule that a sign-off stops applying when the plan it covered changes.
- Documents can be confirmed or replaced; history is retained.
- The sample event and the prepared venue/recovery updates.
- No new backend, AI, authentication, payments or live partner feeds.

## Outcomes

- [ ] The first screen leads with the launch, date/countdown, venue and next work; no readiness badge, approval section or cross-check panel.
- [ ] Navigation is Overview, Checklist, Timeline, Budget and Partners; Approval, Changes, Sources and Cross-checks tabs are gone.
- [ ] Checklist rows are real tasks with an owner and a quiet inline state; a row is done because its document is current, and conflicts appear on the affected row.
- [ ] Timeline shows the event-day sequence and time conflicts in place.
- [ ] Budget shows approved vs committed, partner commitments and an over-budget note in place.
- [ ] Partners show what each provides, their documents and plain confirm/replace actions.
- [ ] Sign off is a header action with a plain preflight; previous sign-offs live in Activity.
- [ ] Activity is a human drawer; no counters, IDs or event log.
- [ ] The prepared venue update changes the checklist, timeline, budget and partners inline; no Changes page.
- [ ] No technical vocabulary, IDs or backend observability remains on screen.
- [ ] The product remains usable on mobile and in dark mode.
