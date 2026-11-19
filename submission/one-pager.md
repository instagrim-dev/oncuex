# OnCueX — event readiness that keeps approval tied to its evidence

**Team 17 · OnCueX (Northwind Provisions) · Converge.AI Stanford 30×30 Buildathon**
**Prototype:** d606ece3407d419a80272571af62bfd2.prod.enter.pro · **Video (2:59):** youtu.be/4r6gBrXQnpM

## The problem

OnCueX coordinates complex event delivery — launches, hackathons, corporate summits — with a small core team marshalling venues, vendors, crew and exhibitors at once. Their work depends on information that arrives from many directions and lives in scattered documents and people's heads.

The failure that costs them is **drift, not change**. When a venue moves, some commitments lose their support and others do not. Nothing in their current tools distinguishes the two, so a plan that has stopped being true still looks current — and the sign-off given last week still looks like it applies. A small team then spends hours re-reading documents to answer a question that should be immediate: *which of these commitments can we still stand behind?*

## The solution

One record holds the plan and the evidence for it, and separates two things usually conflated:

- **Readiness is computed** from current, attributable evidence against one exact revision. Every commitment reports *supported*, *outdated*, *blocked* or *missing* with a named reason — never a score.
- **Sign-off is recorded** by the event lead against that revision. The system cannot approve anything, and an approval becomes history the moment the facts it covered move.

When the venue changes, impact is derived from what each commitment actually depends on. On the reference launch, six commitments reopen with stated reasons while the photographer deliverable — which binds to no venue field — stays valid. One change does not reset the whole plan, and unrelated work is not re-checked out of caution.

The interface is built for a producer, not an auditor: **Overview** for the day and next work, **Checklist** for commitments by area, **Itinerary** for the event-day sequence, **Budget** for approved against committed, **Partners** for outside parties and their documents. Sign-off sits in the header. Where a conflict exists the row says so in words — *"Access ends 07:30. Crew arrives 07:15"* — and offers the fix.

## How it was built

Built and deployed on **Enter**, Converge.AI's product. Four responsibilities are separated so each can be verified alone: a **deterministic evaluator** (pure function over one snapshot; no model, no I/O); a **command service** (the only writer, validating schema, role and expected revision before touching state); an **append-only event store** with two independent counters — one for every event, one for assessed facts only, which is why a sign-off does not invalidate itself on write; and a **bounded AI adapter** with one path, turning a client brief into a structured, source-referenced proposal. There is no code path from model output to the record.

A real model call reads a brief and returns requirements with a quoted source span per fact, inventing nothing and leaving unknowns unknown. Source items from email, chat and call notes are recorded as dispositions — a concern is never silently promoted to a plan change. Four specification documents sit beside a normative Python reference; the shipped TypeScript app is held to it by 33 self-checks and 39 review checks.

## Results

Observed on the deployed app, one synthetic launch: the venue move reopened exactly **six** commitments and left photography **valid**; the budget flagged the **$1,450** overrun from the same change; a sign-off at one revision **became historical** and reverting the venue did not revive it; expired evidence reopened review with the reason named; and a malformed AI response, a fabricated vendor confirmation and an embedded instruction each failed to alter the record.

**Not claimed:** any time or cost saving. No comparison against OnCueX's own records was run — that measurement is the first task of a pilot.

## What it needs to go live

**1. Read-only imports** from the sources OnCueX already uses — email, drive, project tools — into the review queue. **2. Real identity and shared storage**; roles are simulated today and the record lives in the reviewer's browser. **3. Dependency-graph tuning with OnCueX**, so routine edits stop reopening an entire plan. **4. A measured pilot** across several real projects before any claim about delivery capacity.

The record shape, assessment vocabulary and impact model are not event-specific: swapping the scenario, requirements and sources needs no engine change.

*Synthetic people, venues and prices throughout. The system checks records and internal consistency — permits, accessibility and safety remain with qualified people. AI proposes; the event lead decides.*
