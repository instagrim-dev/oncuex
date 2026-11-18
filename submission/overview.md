# One-page overview

## The problem

A completed checklist is not evidence that a launch is ready. Requirements have to be supported by current, attributable documents, and the workstreams have to fit together: access windows against crew arrival, run of show against the venue's hard stop, committed cost against the approved budget.

The harder failure is the stale approval. When a plan changes, some commitments lose their support and others do not. A person under time pressure cannot reliably tell which is which, and an approval granted before the change still looks current.

## What it does
A project manager pastes a brief. The model proposes a structured requirement set with a source reference on every extracted fact, and leaves unknown details as unknown. The manager reviews and adopts the brief.

Evidence is attached per requirement with an issuer, an observation time and an expiry. The readiness engine evaluates each requirement against current field values and reports `missing`, `blocked`, `outdated` or `supported` with a named reason. It evaluates the integrated checks separately. Readiness is never a percentage, and a checked task never upgrades a status.

When every blocking requirement is supported and every integrated check passes, the milestone is ready for review. Only then can the project manager accept, and the acceptance binds the revision, the requirement-set digest and the evidence-set digest.

A change to the venue recomputes impact from declared field bindings. Loading, capacity, cost, run of show and the fire attestation lose their support with reasons. A photographer deliverable that binds to no venue field remains supported. An AI recovery draft is reviewed; an unsourced claim of vendor confirmation is rejected rather than adopted. Recovery requires current evidence, a re-run review and a new decision. The earlier acceptance is shown as history, and reverting the venue does not revive it.

Reload and export preserve the record, including both decisions and the residuals that separate them.

## Limits

- It does not decide. The model extracts and drafts; a person adopts and accepts.
- It does not verify physical reality. It checks records, dates and internal consistency. Permits, accessibility and safety remain with qualified people.
- It does not secure multiple users. Contributor roles are simulated and labeled, and persistence is single-operator wherever durable shared state is unavailable.
- It does not estimate savings.
- It does not use real data. All people, venues, vendors and prices are fictional.

## Mechanism

A deterministic evaluator, pure over one snapshot, separated from the interface, the persistence layer and the model adapter. Readiness can be re-derived from the record without the model, which is what makes an acceptance auditable later.

Built on Enter, a Converge.AI product.
