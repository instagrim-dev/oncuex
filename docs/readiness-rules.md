# Readiness rules

The evaluator is a pure function over one consistent snapshot. It returns per-requirement status with reasons, a named residual list, the impacted and unaffected sets, the six integrated check results and a readiness determination. It performs no I/O, makes no model call and cannot record acceptance.

## Schema validation at load

Before evaluation, the snapshot is validated:

1. Every path in `fieldSchema` resolves in every state.
2. Every state path is declared in `fieldSchema`; an undeclared path is an error, not an ignored field.
3. Every value matches its declared type. A `time` matches `HH:MM` and is in range; an `enum` value is a declared member; an `integer` is not a boolean.
4. Every entry in a requirement's `fieldBindings` and an evidence record's `boundFieldVersions` is a declared path.
5. Every `prerequisiteIds` entry names a known requirement, and the graph is acyclic.
6. Every evidence `boundFieldVersions` value matches its declared type at binding time.
7. A `collection` binding is stored as a `sha256` digest of the canonical JSON of the value it was taken from.

A path that names a field the schema does not declare is the failure mode that lets a real dependency go undetected, so it is rejected at load rather than treated as "no match".

## Requirement predicates

| Predicate | Satisfied when |
| --- | --- |
| `evidence_present` | At least one reviewed, unexpired evidence record of the required type is bound to the requirement and every path in `fieldBindings` still holds its bound value |
| `numeric_within` | The bound integer field satisfies `minimum` / `maximum` as declared, read from state, not from a claimed total |
| `time_within_window` | The interval the requirement constrains fits entirely inside the window it references, including any declared setup or margin in `expectedValues` |
| `set_equals` | The bound set matches `expectedValues` exactly |
| `attestation_reviewed` | A named attestation for the current bound fields carries `reviewDisposition: accepted`, an unexpired `expiresAt`, and a state value of `reviewed` |

A requirement is satisfied only when all hold:

1. Evidence of `requiredEvidenceType` exists and `reviewDisposition` is `accepted`.
2. No path in `fieldBindings` has changed since the evidence was bound.
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

## Conflicting prerequisites

Two prerequisites conflict when their declared constraints on the same field admit no common value. The comparison covers numeric ranges (`minimum`, `maximum`, `maximumMinorUnits`) and exact values (`set_equals` and the `reviewed` literal of `attestation_reviewed`). The dependent returns `blocked` with `prerequisite_conflict`, naming the field, both prerequisite ids and the constraints. This is independent of a cycle, which reports `prerequisite_cycle`.

Time-window constraints are not compared: they constrain when work happens rather than the value a field holds, so treating disjoint windows as a contradiction would assert a rule the contract does not state.

## Integrated checks

Requirement status is necessary and not sufficient. The six checks are evaluated against current state, independently of evidence currency. A requirement can be `outdated` while its check also fails; both are reported.

| Check | Fails when |
| --- | --- |
| `access_vs_arrival` | Crew arrival plus declared setup extends past the venue's loading window |
| `occupancy_vs_headcount` | Licensed occupancy is below guest count plus the declared circulation buffer |
| `runofshow_vs_hardstop` | Run of show end plus the declared margin exceeds the venue hard stop |
| `total_cost` | Sum of line-item commitments exceeds the approved budget |
| `attestation_current` | A required attestation is bound to a venue that is no longer the booked venue, or the state value is not `reviewed` |
| `dependency_closure` | Any blocking requirement is not `supported`, or the prerequisite graph has a cycle |

The set has exactly six members. Reporting a subset of the checks that actually fail is incorrect: a case that lists three failures when five conditions fail is wrong even if those three are right.

Each failing check returns an identifier and a reason containing the actual values that conflict. A check never returns a bare boolean.

## Decision eligibility

A project manager may record a decision when:

- Every blocking requirement is `supported`.
- All six integrated checks pass.
- `targetAssessmentRevision` equals the current `assessmentRevision`.
- The actor holds `project_manager`.
- `expectedAssessmentRevision` matches the current `assessmentRevision`.

Eligibility is evaluated on read as well as on action. A decision that was eligible at `assessmentRevision` 8 and is read at 9 returns `historical` with `stale_decision` and the named residuals that changed.

Reason codes: `mandatory_requirements_not_supported`, `integration_failed`, `stale_revision`, `revision_lineage_changed`, `requirement_set_changed`, `mandatory_evidence_expired`, `role_denied`.

## Impact

Impact is computed from declared bindings, never from a diff heuristic.

1. Collect the changed paths from the adopted change.
2. Select requirements whose `fieldBindings` intersect them.
3. Close over `prerequisiteIds` in both directions: dependents of an affected requirement become affected.
4. Select evidence whose `boundFieldVersions` intersect the changed paths, plus evidence attached to affected requirements.
5. Everything else is `unaffected` and retains its status.

The result is two explicit sets. A requirement absent from `impacted` that later changes status is a defect in the computation.

Expiry uses the same closure. Expiring evidence `E` of requirement `R` marks `R` `outdated`, and every requirement whose prerequisite closure includes `R` becomes `blocked`. In the reference scenario, expiring `EV-1` makes `REQ-venue-loading-1` outdated and blocks both `REQ-crew-arrival-1` and `REQ-production-runofshow-1`.

Scope change triggers a `requirementSetVersion` increment and marks every decision on the prior requirement set historical.

## Reverts

A revert is an ordinary change with a new `assessmentRevision`. Because the lineage advanced, prior acceptance is not current, and a fresh decision is required. Comparing field values to decide currentness is prohibited: a plan that returns to the same venue is not the plan that was approved.

## Exceptions

An exception is an explicit scope decision recorded with a reason, an owner and the affected requirement. It is visible in the residuals and in the export. Unknowns are never deleted to improve a status, and safety, accessibility or legal determinations cannot be waived by the application.

## Output contract

```json
{
  "milestoneId": "MS-1",
  "assessmentRevision": 9,
  "requirements": [
    {
      "requirementId": "REQ-venue-loading-1",
      "status": "outdated",
      "blocking": true,
      "residuals": [{ "code": "bound_field_changed", "field": "location.loadingWindow.end", "evidenceId": "EV-1", "sinceAssessmentRevision": 9 }]
    }
  ],
  "integrated": {
    "status": "fail",
    "checks": [{ "id": "access_vs_arrival", "status": "fail", "reason": "..." }]
  },
  "readiness": "not_ready",
  "impact": {
    "impacted": { "requirementIds": [], "evidenceIds": [] },
    "unaffected": { "requirementIds": [], "evidenceIds": [] }
  }
}
```
