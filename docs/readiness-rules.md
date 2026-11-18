# Readiness rules

The evaluator is a pure function over one consistent snapshot. It returns per-requirement status with reasons, a named residual list, the impacted and unaffected sets, the integrated check results and a readiness determination. It performs no I/O, makes no model call and cannot record acceptance.

## Requirement predicates

| Predicate | Satisfied when |
| --- | --- |
| `evidence_present` | At least one reviewed, unexpired evidence record of the required type is bound to the requirement and every field in `fieldBindings` still holds its bound value |
| `numeric_within` | The bound field satisfies `minimum` / `maximum` as declared, using the evidence value rather than a claimed total |
| `time_within_window` | The interval the requirement constrains fits entirely inside the window it references, including any declared setup or margin in `expectedValues` |
| `set_equals` | The bound set matches `expectedValues` exactly |
| `attestation_reviewed` | A named attestation for the current bound fields carries `reviewDisposition: accepted` and an unexpired `expiresAt` |

A requirement is satisfied only when all of the following hold:

1. Evidence of `requiredEvidenceType` exists and `reviewDisposition` is `accepted`.
2. No field in `fieldBindings` has changed since the evidence was bound.
3. The evidence has not passed `expiresAt`.
4. Every `prerequisiteIds` entry resolves to `supported` and the graph is acyclic.
5. The predicate evaluates true against current values.

Failure maps to status by cause, not by severity:

| Cause | Status |
| --- | --- |
| No evidence of the required type | `missing` |
| Evidence exists but the predicate is false | `blocked` |
| Bound field changed, evidence expired, or scope changed | `outdated` |
| A prerequisite is `blocked`, `missing` or cyclic | `blocked` |

All five conditions hold only in the `supported` case.

## Integrated checks

Requirement status is necessary and not sufficient. The milestone is `ready_for_review` only when every blocking requirement is `supported` **and** all integrated checks pass.

| Check | Fails when |
| --- | --- |
| `access_vs_arrival` | Crew arrival plus declared setup extends past the venue's loading window |
| `occupancy_vs_headcount` | Licensed occupancy is below guest count plus the declared circulation buffer |
| `runofshow_vs_hardstop` | Run of show end plus the declared margin exceeds the venue hard stop |
| `total_cost` | Sum of line-item commitments exceeds the approved budget |
| `attestation_current` | A required attestation is bound to a venue that is no longer the booked venue |
| `dependency_closure` | Any blocking requirement is not `supported`, or the prerequisite graph has a cycle |

Each failing check returns an identifier and a reason containing the actual values that conflict. A check never returns a bare boolean.

## Decision eligibility

A project manager may record a decision when:

- Every blocking requirement is `supported`.
- Every integrated check passes.
- The snapshot is the current revision.
- The actor holds `project_manager`.
- The `expectedRevision` matches the current revision.

Eligibility is evaluated on read as well as on action. A decision that was eligible at revision N and is read at revision M > N returns `historical` with `stale_decision` and the named residuals that changed. Eligibility denial returns a reason code: `mandatory_requirements_not_supported`, `integration_failed`, `stale_revision`, `revision_lineage_changed`, `requirement_set_changed`, `mandatory_evidence_expired`, `role_denied`.

## Impact

Impact is computed from declared bindings, never from a diff heuristic.

1. Collect the changed field paths from the adopted change.
2. Select requirements whose `fieldBindings` intersect them.
3. Close over `prerequisiteIds` in both directions: dependents of an affected requirement become affected.
4. Select evidence whose `boundFieldVersions` intersect the changed paths, plus evidence attached to affected requirements.
5. Everything else is `unaffected` and retains its status.

The result is two explicit sets. A requirement absent from `impacted` that later changes status is a defect in the computation.

Expiry uses the same machinery with a synthetic trigger on the evidence's own validity, and scope change triggers a `requirementSetVersion` increment that marks every decision on the prior requirement set historical.

## Reverts

A revert is an ordinary change with a new revision. Because the revision lineage advanced, prior acceptance is not current, and a fresh decision is required. Comparing field values to decide currentness is prohibited: a plan that returns to the same venue is not the plan that was approved.

## Exceptions

An exception is an explicit scope decision recorded with a reason, an owner and the affected requirement. It is visible in the residuals and in the export. Unknowns are never deleted to improve a status, and safety, accessibility or legal determinations cannot be waived by the application.

## Output contract

```json
{
  "milestoneId": "MS-1",
  "revision": 2,
  "requirements": [
    {
      "requirementId": "REQ-venue-loading-1",
      "status": "outdated",
      "blocking": true,
      "residuals": [{ "code": "bound_field_changed", "field": "location.loadingWindow", "evidenceId": "EV-1", "sinceRevision": 2 }]
    }
  ],
  "integrated": { "status": "fail", "checks": [{ "id": "access_vs_arrival", "status": "fail", "reason": "..." }] },
  "readiness": "not_ready",
  "impact": {
    "impacted": { "requirementIds": [], "evidenceIds": [] },
    "unaffected": { "requirementIds": [], "evidenceIds": [] }
  }
}
```
