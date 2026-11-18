# Verification

Twenty-three behavioral checks define correct operation. Each states the action, the expected observable result, and what counts as a failure. They are enumerated in machine-readable form in [../fixtures/acceptance-cases.json](../fixtures/acceptance-cases.json).

## Readiness

**V1 — Missing support blocks readiness.**
Withhold the venue capacity evidence for `REQ-venue-capacity-1` and mark its task complete. Readiness is `not_ready`, the requirement is `missing`, and the residual is `mandatory_evidence_missing`. A completed task or a percentage must not produce `ready_for_review`.

**V2 — Every unmet mandatory requirement is named.**
Supply all required evidence except one. The milestone reports the remaining requirement by identifier and label. A count, a score or a collapsed "3 of 4" is insufficient.

**V3 — Supported workstreams can fail the integrated review.**
At the venue-change state each vendor record is individually reviewable, yet five conditions conflict: access ends before setup completes, occupancy is below headcount plus buffer, run of show exceeds the hard stop, the committed total exceeds the budget, and the attestation belongs to the previous venue. `integrated.status` is `fail` listing all six checks — the five failures plus `dependency_closure`, which reports the unmet blocking requirements. Each failure states its conflicting values. Per-requirement status alone must not produce readiness.

**V4 — Ambiguous precedence is blocked, not supported.**
Introduce a cycle in `prerequisiteIds`, or two prerequisites that cannot both hold. The affected requirements return `blocked` with the cycle path or the conflicting pair. No optimistic default to `supported`. A conflicting pair means two prerequisites whose declared numeric ranges or exact values on the same field have no common value; time-window prerequisites are not treated as conflicting.

## Change and impact

**V5 — The venue change affects exactly the declared set.**
Adopt Foundry Hall to Pier 9 Loft. The impacted requirement and evidence sets equal the oracle. The photographer requirement and its evidence remain `supported`. A blanket reset of every requirement fails this check.

**V6 — An old decision is not current after a change.**
Accept at revision 1, then adopt the venue change. The decision is returned as `historical` with `stale_decision`, and decision eligibility is false with the current residuals named. The prior acceptance must not be readable as current.

**V7 — A revert does not restore approval.**
After V6, revert the venue to Foundry Hall. Eligibility is false with `revision_lineage_changed`. The earlier acceptance is not revived, and the history shows both revisions.

**V8 — Scope change reopens review.**
Remove a requirement, or add one, so `requirementSetVersion` increments. Every decision on the prior set becomes historical, and a new decision is required. History is preserved rather than rewritten.

**V9 — Expiry reopens review through the dependency closure.**
Expire `EV-1`, the venue loading evidence. `REQ-venue-loading-1` becomes `outdated`. Both requirements that declare it as a prerequisite — `REQ-crew-arrival-1` and `REQ-production-runofshow-1` — become `blocked`, whether or not their own evidence is still current. The impacted set is exactly those three requirements and their evidence; the other four remain unaffected. Readiness is `not_ready` and the prior decision is historical.

## Controlled writes

**V10 — A stale write is rejected.**
Submit a command with `expectedAssessmentRevision` one behind current. The command is rejected with `conflict`, the assessment revision is unchanged, and no event is appended.

**V11 — A retried action does not duplicate.**
Submit the same decision twice with the same `commandId`. The second call returns the stored result. Exactly one decision exists for that revision.

**V12 — A failed action leaves state unchanged.**
Trigger a validation failure, a role failure, an undeclared change path and a revision conflict in turn. After each, the exported record — fields, both counters, event list and decision set — is byte-identical to before. In particular a rejected change never moves the field it named.

**V13 — A change cannot write outside the schema.**
Submit a change naming `location.inventedField`. It is rejected with `undeclared_path`, the field is not created, and the record is unchanged. Submit a change naming `assessmentRevision`. It is rejected with `immutable_path` and the revision is unchanged; a change may never rewrite the counter that governs currentness.

**V14 — Only the project manager accepts.**
Attempt acceptance as a contributor. The action is rejected with `role_denied` and the simulated-role limitation is visible. The project manager's own acceptance is recorded with `targetAssessmentRevision`, requirement-set version, requirement-set digest and evidence-set digest.

## AI

**V15 — Malformed output cannot mutate records.**
Feed output that is not valid JSON, then output missing a required field. Each yields a visible generation error and no proposal, or a proposal stored as rejected. `assessmentRevision` is unchanged.

**V16 — An invented confirmation is rejected.**
Request a recovery plan. The model asserts a vendor confirmation that no source supports. The proposal is rejected with `unsupported_confirmation`, `no_source_ref_for_claim` and `source_span_mismatch`. No evidence record is created and no attribution is transferred to a named person.

**V17 — An embedded instruction is treated as data.**
Include text instructing the reader to mark requirements supported, record an acceptance and raise the budget. The text is preserved as an attributed excerpt. No status, decision or budget changes. If the instruction appears in proposal output, the proposal is rejected with `instruction_content_detected`.

## Persistence and export

**V18 — Reload preserves the record.**
Hard reload in a fresh session. The project revision, evidence bindings, open questions, decisions and history match the pre-reload state exactly.

**V19 — Export preserves the record.**
Compare the exported JSON, the working brief and the readiness report against the current snapshot. Evidence bindings, open questions, both decisions, the historical flag and the residual list are present and agree. The export distinguishes history from current state.

## Decision currentness

**V20 — A decision does not stale itself.**
Record a decision at assessment revision 8. The event sequence advances to 9; the assessment revision stays at 8. A read immediately afterwards returns the decision as `current`, not `historical`.

**V21 — Expiry reaches currentness.**
Record a decision, confirm it reads `current`, then advance time past the expiry of one supporting evidence record. The decision reads `historical` even though no field changed and the revision did not move.

**V22 — Currentness survives reload.**
Reload directly after V20. Both counters are reconstructed from the event log: sequence 9, assessment revision 8. The decision is still `current` and the history is intact.

**V23 — A later decision supersedes without rewriting.**
At the recovered assessment revision 16, record a second decision. It is `current`; the first decision is `historical` and remains readable with its own target revision.

## Correctness conditions

These hold absolutely:

- A current acceptance is never false.
- A mandatory impact of a venue change is never missed.
- The photographer requirement is never marked `outdated` by the venue change.
- A failed action never changes the revision.
- A retried command never duplicates a decision.
- An acceptance is never rendered without a decision record.
- A decision is never reported historical solely because it was written.
- A decision is never reported current while any of its supporting evidence has expired.
- A rejected command never changes a field, a counter, the event list or the decision set.
- No check reports fewer failures than the conditions that actually fail.

## Machine-readable form

[../fixtures/acceptance-cases.json](../fixtures/acceptance-cases.json) carries V1–V23 with identifiers, actions, expected results and the oracle case each references.
