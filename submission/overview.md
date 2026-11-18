# One-page overview

**Live app:** <https://d606ece3407d419a80272571af62bfd2.prod.enter.pro>

## The problem

A completed checklist is not evidence that a launch is ready. Requirements have to be supported by current, attributable documents, and the workstreams have to fit together: access windows against crew arrival, run of show against the venue's hard stop, committed cost against the approved budget.

The harder failure is the stale approval. When a plan changes, some commitments lose their support and others do not. A person under time pressure cannot reliably tell which is which, and an approval granted before the change still looks current.

## What it does

OnCueX is an operator interface for one event, backed by a deterministic engine that decides what is genuinely supported.

**The plan.** A brief is adopted, its commitments become requirements with owners and dependencies, and each requirement is satisfied only by current, attributable evidence. The interface is organised around the launch rather than around the system's reasoning: Overview for the day at a glance and the next work, Checklist for the commitments grouped by venue, crew, production, photography and budget, Itinerary for the event-day sequence from access through hard stop, Budget for approved against committed, and Partners for the venue, caterer, production partner and photographer with their documents.

**The decision.** Readiness is computed and reported as named gaps — never a percentage, and a checked task never upgrades a status. Sign-off is a deliberate act in the header, available only when every blocking requirement is supported and all six integrated checks pass. Acceptance binds the exact revision, requirement set and evidence set it was made against.

**The change.** A venue move recomputes impact from declared field bindings. Loading, capacity, cost, run of show and the fire attestation lose their support with stated reasons; a photographer deliverable that binds to no venue field stays valid. The earlier acceptance becomes history, and reverting the venue does not revive it. Recovery requires current evidence, a re-run review and a new decision.

**The reading.** The model can extract a brief and draft a recovery, and it can draft a client update. Every extracted fact carries a source reference or is left explicitly unknown; an unsourced claim of vendor confirmation is rejected as a proposal rather than adopted.

**The sources.** Named-channel items arrive for review with a locator and a content digest. Reviewing one records a concern, dismissal, deferral, clarification or resolution. A concern is a separate record from a plan change — the review never mutates assessed project facts.

Reload and export preserve the record, including both decisions, the review dispositions and the residuals that separate them.

## What makes it different

Two separations do the work, and both are enforced in code rather than described:

- **Generation is not adoption.** A model proposal and a human command are different objects. Nothing the model returns can alter an authoritative record.
- **Readiness is not acceptance.** Readiness is computed by a pure function over one snapshot. Acceptance exists only as a decision record. A green status can never impersonate a person.

Both are checked by executable contracts: a Python reference implementation that is normative, and a TypeScript port behind the interface that is held to it.

## Limits

- It does not decide. The model extracts and drafts; a person adopts and accepts.
- It does not verify physical reality. It checks records, dates and internal consistency. Permits, accessibility and safety remain with qualified people.
- It does not secure multiple users. Contributor roles are simulated and labeled, and the record lives in the operator's browser rather than a shared store.
- It does not estimate savings.
- It does not use real data. All people, venues, vendors and prices are fictional.

## Mechanism

A deterministic evaluator, pure over one snapshot, separated from the interface, the persistence layer and the model adapter. Readiness can be re-derived from the record without the model, which is what makes an acceptance auditable later.

The store is append-only with two independent counters: one for every event, one for assessed facts only. That split is what lets a decision remain current the moment it is written — recording an opinion does not change the facts the opinion is about.

Built on Enter, a Converge.AI product.
