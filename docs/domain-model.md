# Domain model

## Two counters

The project carries two independent monotonic counters. Conflating them stales a decision the instant it is written, because recording a decision appends an event.

| Counter | Advances on | Purpose |
| --- | --- | --- |
| `eventSequence` | Every appended event, including `decision.recorded` | Audit total ordering |
| `assessmentRevision` | Only events that change assessed facts: a bound field, the evidence set, an evidence's review disposition, or the requirement set | Binding target for a decision |

The current record is a projection over the event sequence. `assessmentRevision` is a projection over assessed facts.

A decision is **current** if and only if all hold:

1. Its `targetAssessmentRevision` equals the current `assessmentRevision`.
2. Its `requirementSetVersion` equals the current `requirementSetVersion`.
3. Every evidence record in its `evidenceSetDigest` is still `accepted`.
4. None of those evidence records has passed `expiresAt`.

Condition 4 makes expiry visible to currentness, not only to readiness. A decision whose supporting evidence has since expired reads as `historical` even when nothing else changed.

Recording a decision increments `eventSequence` and leaves `assessmentRevision` unchanged, so an immediate read returns it as current. A reload reconstructs both counters from the event log and returns the same decision.

## Identifiers

```
PRJ-<slug>          project
MS-<n>              milestone
REQ-<domain>-<n>    requirement
EV-<n>              evidence record
SRC-<n>             source reference
CHG-<n>             change proposal
DEC-<n>             decision
CMD-<n>             command identity
```

Records carry `schemaVersion` and ISO-8601 UTC timestamps.

## Typed field schema

Every field that can appear in `fieldBindings` or `boundFieldVersions` is declared once, with a type. Bindings are validated against this schema at load time; an undeclared path is a schema error, not a runtime miss.

| Path | Type |
| --- | --- |
| `assessmentRevision` | integer |
| `brief.guestCount` | integer |
| `brief.approvedBudget.minorUnits` | integer |
| `location.venueId` | string |
| `location.venueName` | string |
| `location.capacity` | integer |
| `location.roomPlan` | string |
| `location.loadingWindow.start` | time |
| `location.loadingWindow.end` | time |
| `location.hardStop` | time |
| `location.fireAttestation` | enum: `reviewed`, `not_reviewed`, `missing` |
| `crew.arrivalTime` | time |
| `production.runOfShowEnd` | time |
| `budget.commitments` | collection, compared by digest |
| `budget.committedTotal.currency` | string |
| `budget.committedTotal.minorUnits` | integer |
| `photographer.arrivalWindow.start` | time |
| `photographer.arrivalWindow.end` | time |
| `photographer.deliverables.editedImages` | integer |
| `photographer.deliverables.deliveryDays` | integer |

A `time` is `HH:MM` on the event date. A `collection` is compared by `sha256` over its canonical JSON (sorted keys, no whitespace); the digest verifies identity, not truth.

## Records

### Project

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `PRJ-oncuex-launch` |
| `eventSequence` | integer | Appended events |
| `assessmentRevision` | integer | Assessed-fact state |
| `brief` | object | Structured brief, including `approvedBudget` and `guestCount` |
| `eventDate` | date | Fixed |
| `timezone` | string | IANA zone |
| `location` | object | Venue fields evidence binds to |
| `milestoneIds` | string[] | Ordered |
| `requirementSetVersion` | integer | Increments on any scope change |

### Requirement

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `version` | integer | |
| `milestoneId` | string | |
| `owner` | string | Named person |
| `label` | string | Shown in the residuals list |
| `predicateType` | enum | `evidence_present`, `numeric_within`, `time_within_window`, `set_equals`, `attestation_reviewed` |
| `expectedValues` | object | Predicate parameters |
| `prerequisiteIds` | string[] | Must resolve acyclic |
| `requiredEvidenceType` | enum | `confirmation`, `document`, `measurement`, `quote` |
| `expiryPolicy` | object | `{ mode: "absolute" \| "relative", value }` |
| `blocking` | boolean | Mandatory support vs advisory |
| `fieldBindings` | string[] | Declared schema paths this requirement depends on |

### Evidence

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `requirementId` | string | |
| `sourceRefIds` | string[] | Every source the excerpt is drawn from |
| `sourceExcerpt` | string | Required; must be textually present in a cited source |
| `contentDigest` | string | `sha256` over `{sourceRefIds, sourceExcerpt}` |
| `artifactRef` | string | Immutable reference |
| `issuer` | string | Who stated it |
| `observedAt` | timestamp | |
| `expiresAt` | timestamp | |
| `boundFieldVersions` | object | Schema path to the value at binding time, typed as the schema declares |
| `reviewDisposition` | enum | `pending`, `accepted`, `rejected` |

### Source reference

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `SRC-*` |
| `kind` | enum | `brief`, `vendor_document`, `internal_note`, `photo_plan`, `ai_output` |
| `excerpt` | string | Minimal quoted span |
| `attribution` | string | Location within the source corpus |
| `trust` | enum | Always untrusted for instruction purposes |

### Change proposal

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `baseAssessmentRevision` | integer | Rejected if it does not match current |
| `changedFields` | object | Schema path to `{ from, to }` |
| `rationale` | string | |
| `sourceRefIds` | string[] | |
| `predictedImpacts` | string[] | Requirement and evidence IDs the author expects to be affected |
| `author` | object | `{ id, kind: "human" \| "model" }` |
| `status` | enum | `proposed`, `adopted`, `rejected` |

### Decision

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `actor` | string | Must hold the project-manager role |
| `role` | enum | `project_manager` \| `contributor` |
| `targetAssessmentRevision` | integer | The assessed-fact revision evaluated |
| `requirementSetVersion` | integer | |
| `requirementSetDigest` | string | |
| `evidenceSetDigest` | string | |
| `integrationReviewResult` | object | `{ status, failedChecks[] }` |
| `explicitExceptions` | object[] | Each with reason, owner and affected requirement |
| `disposition` | enum | `accepted`, `rejected` |
| `timestamp` | timestamp | |

### Domain event

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `sequence` | integer | Gap-free per project |
| `commandId` | string | A repeated `commandId` returns the stored result |
| `projectId` | string | |
| `expectedAssessmentRevision` | integer | Compare-and-swap; mismatch rejects |
| `resultingAssessmentRevision` | integer | Equal to expected for events that do not change assessed facts |
| `actor` | string | |
| `eventType` | enum | `brief.adopted`, `evidence.attached`, `evidence.reviewed`, `change.adopted`, `decision.recorded`, `requirementSet.changed` |
| `payload` | object | Event-specific |

`decision.recorded` and `evidence.reviewed` where the disposition is unchanged are the events that advance `sequence` without advancing `assessmentRevision`.

## Assessment vocabulary

Fixed terms, no synonyms:

| Status | Meaning |
| --- | --- |
| `missing` | No admissible evidence for a mandatory requirement |
| `blocked` | Evidence exists but fails the predicate, or a prerequisite is unresolved or cyclic |
| `outdated` | Evidence existed but a bound field changed, the evidence expired, or the scope changed |
| `supported` | Current, reviewed evidence satisfies the predicate against current field values |

Requirement output:

```json
{
  "requirementId": "REQ-venue-loading-1",
  "status": "outdated",
  "residuals": [
    { "code": "bound_field_changed", "field": "location.loadingWindow.end",
      "evidenceId": "EV-1", "sourceRefId": "SRC-2", "sinceAssessmentRevision": 9 }
  ],
  "blocking": true
}
```

Milestone output. `integrated` and `readiness` are separate fields and do not collapse:

```json
{
  "milestoneId": "MS-1",
  "assessmentRevision": 9,
  "integrated": {
    "status": "fail",
    "checks": [
      { "id": "occupancy_vs_headcount", "status": "fail",
        "reason": "Licensed occupancy 110 is below guest count 120 plus circulation buffer 10, which requires 130." }
    ]
  },
  "readiness": "not_ready",
  "residualReasonCodes": ["mandatory_outdated", "integration_failed"]
}
```

`ready_for_review` requires every blocking requirement `supported` **and** all six integrated checks passing. `accepted` is never emitted by the evaluator; it exists only as a decision record. Unknown or ambiguous precedence yields `blocked` with a reason. No percentage substitutes for a named residual, and no task completion or model confidence upgrades a status.

## Currentness

| Situation | Behavior |
| --- | --- |
| A bound field changes | Bound evidence becomes `outdated`; dependents recomputed transitively; `assessmentRevision` increments |
| Evidence passes `expiresAt` | Becomes `outdated`; the relevant review reopens; `assessmentRevision` increments |
| Scope changes | New `requirementSetVersion`; a new decision is required; the prior decision remains history |
| A value reverts to an earlier one | Lineage advanced; the prior decision is not current; no automatic restoration |
| A decision is read at a later `assessmentRevision` | Returns `historical` plus named current residuals |
| Evidence supporting a decision expires | The decision returns `historical` even though no field changed |
| An unrelated field changes | Unaffected evidence stays `supported`; only the declared dependent set moves |
| A decision is recorded | `eventSequence` increments; `assessmentRevision` does not; the decision reads as current |

## Write semantics

A command is validated before any state is touched. A rejected write leaves the record byte-identical to the record that preceded it: no field moves, no event is appended, and neither counter advances.

1. Every write carries `commandId` and `expectedAssessmentRevision`.
2. A command whose `commandId` has already succeeded returns the stored result and appends nothing. Replay is checked before every other rule, so a retried acceptance is idempotent rather than a duplicate.
3. A revision mismatch rejects with `conflict`.
4. Validation order: event type, replay, role, duplicate identity, expected revision, field paths, types, domain rules.
5. A **change** may write only paths declared in the typed schema. An undeclared path rejects with `undeclared_path`; it cannot create a field.
6. A change may not write a counter or an identity. `assessmentRevision` rejects with `immutable_path`, because rewriting it would corrupt the binding every decision depends on.
7. Only `project_manager` records a decision. A `contributor` attempt is rejected with `role_denied`.
8. Exceptions are additive records with reason, owner and affected requirement IDs.

### Rejection codes

| Code | Cause |
| --- | --- |
| `conflict` | `expectedAssessmentRevision` does not match current |
| `role_denied` | Actor does not hold the required role |
| `duplicate_evidence` | Evidence ID already attached |
| `duplicate_decision` | Decision ID already recorded under a different command |
| `invalid_brief` | Brief does not satisfy the declared brief schema |
| `invalid_evidence` | Evidence record does not satisfy the declared record schema |
| `undeclared_path` | Change path is not in the typed schema |
| `immutable_path` | Change path is a counter or identity |
| `bad_path` | Intermediate container does not exist |
| `type_mismatch` | Bound evidence value does not match the declared type |
| `not_eligible` | Readiness or integrated checks do not permit a decision |

## Impact computation

A requirement declares `fieldBindings`; evidence declares `boundFieldVersions`. A change computes the transitive dependent set over both `fieldBindings` and `prerequisiteIds`, and returns `impacted` and `unaffected` requirement and evidence IDs.

Dependency closure runs in both the change and the expiry case. Expiring a prerequisite's evidence makes every dependent `blocked`, not merely its own requirement `outdated`.

There is no blanket reset. In the reference scenario the photographer requirement binds only to `photographer.deliverables.*` and `photographer.arrivalWindow.*`, so it remains `supported` across a venue change. A cycle or unresolved prerequisite yields `blocked` with the cycle path in the reason.

## Separation that must hold

| Kept separate | Consequence of merging |
| --- | --- |
| Event sequence vs assessment revision | A decision stales itself on write |
| Validated write vs applied write | A refused command leaves a half-written record |
| Generation vs adoption | A suggestion becomes an authoritative fact |
| Readiness vs acceptance | A computed status impersonates a human decision |
| Evidence existence vs evidence truth | A digest is presented as verified reality |
| Historical decision vs current acceptance | An old approval silently applies to a new plan |
