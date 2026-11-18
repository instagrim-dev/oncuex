# Domain model

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

Records carry `schemaVersion` and ISO-8601 UTC timestamps. Revisions are monotonic integers scoped to the project.

## Project

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `PRJ-oncuex-launch` |
| `revision` | integer | Increments once per accepted command |
| `brief` | object | Structured brief |
| `eventDate` | date | Fixed |
| `timezone` | string | IANA zone |
| `location` | object | Venue ID and the venue fields evidence binds to |
| `approvedBudget` | amount | Currency plus minor units |
| `currency` | string | ISO-4217 |
| `owner` | string | Project manager identity |
| `milestoneIds` | string[] | Ordered |
| `requirementSetVersion` | integer | Increments on any scope change |

## Requirement

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
| `fieldBindings` | string[] | Project or venue fields this requirement depends on; drives impact |

## Evidence

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `requirementId` | string | |
| `contentDigest` | string | Digest of the excerpt or artifact; identity check only |
| `artifactRef` | string \| null | Immutable reference |
| `sourceExcerpt` | string | Required; untrusted input |
| `sourceRefId` | string | Link to `SRC-*` |
| `issuer` | string | Who stated it |
| `observedAt` | timestamp | |
| `expiresAt` | timestamp \| null | |
| `boundFieldVersions` | object | Field path to the value at binding time; impact detection uses this |
| `reviewDisposition` | enum | `pending`, `accepted`, `rejected` |

## Source reference

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `SRC-*` |
| `kind` | enum | `brief`, `vendor_document`, `internal_note`, `photo_plan`, `ai_output` |
| `excerpt` | string | Minimal quoted span |
| `attribution` | string | Location within the source corpus |
| `trust` | enum | Always untrusted for instruction purposes |

A source reference records where a statement came from. It does not make the statement true, and a digest does not make a document confidential.

## Change proposal

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `baseRevision` | integer | Rejected if it does not match current |
| `changedFields` | object | Field path to `{ from, to }` |
| `rationale` | string | |
| `sourceRefIds` | string[] | |
| `predictedImpacts` | string[] | Requirement and evidence IDs the author expects to be affected |
| `author` | object | `{ id, kind: "human" \| "model" }` |
| `status` | enum | `proposed`, `adopted`, `rejected` |

## Decision

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `actor` | string | Must hold the project-manager role |
| `role` | enum | `project_manager` \| `contributor` |
| `targetRevision` | integer | The exact revision assessed |
| `requirementSetVersion` | integer | |
| `requirementSetDigest` | string | |
| `evidenceSetDigest` | string | |
| `integrationReviewResult` | object | `{ status, failedChecks[] }` |
| `explicitExceptions` | object[] | Each with reason, owner and affected requirement |
| `disposition` | enum | `accepted`, `rejected` |
| `timestamp` | timestamp | |

## Domain event

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `sequence` | integer | Gap-free per project |
| `commandId` | string | A repeated `commandId` returns the stored result |
| `projectId` | string | |
| `expectedRevision` | integer | Compare-and-swap; mismatch rejects |
| `resultingRevision` | integer | |
| `actor` | string | |
| `eventType` | enum | `brief.adopted`, `evidence.attached`, `evidence.reviewed`, `change.adopted`, `decision.recorded`, `requirementSet.changed` |
| `payload` | object | Event-specific |

The store is append-only. The current record is a projection over the event sequence.

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
    { "code": "bound_field_changed", "field": "location.venueId",
      "evidenceId": "EV-1", "sourceRefId": "SRC-2", "sinceRevision": 2 }
  ],
  "blocking": true
}
```

Milestone output. `integrated` and `readiness` are separate fields and do not collapse:

```json
{
  "milestoneId": "MS-1",
  "integrated": {
    "status": "fail",
    "checks": [
      { "id": "access_vs_arrival", "status": "fail",
        "reason": "Loading window 06:00-07:30 ends before crew arrival 07:15 plus 45 minutes setup, which needs access to 08:00." },
      { "id": "total_cost", "status": "fail",
        "reason": "Committed total 31,450.00 exceeds approved budget 30,000.00 by 1,450.00." }
    ]
  },
  "readiness": "not_ready",
  "residualReasonCodes": ["mandatory_outdated", "integration_failed"]
}
```

`ready_for_review` requires every blocking requirement `supported` and `integrated.status == "pass"`. `accepted` is never emitted by the evaluator; it exists only as a decision record. Unknown or ambiguous precedence yields `blocked` with a reason. No percentage substitutes for a named residual, and no task completion or model confidence upgrades a status.

## Currentness

| Situation | Behavior |
| --- | --- |
| A bound field changes | Bound evidence becomes `outdated`; dependents recomputed transitively |
| Evidence passes `expiresAt` | Becomes `outdated`; the relevant review reopens |
| Scope changes | New `requirementSetVersion`; a new decision is required; the prior decision remains history |
| A value reverts to an earlier one | Revision lineage changed; the prior decision is not current; no automatic restoration |
| A decision is read at a later revision | Returns `historical` plus named current residuals |
| An unrelated field changes | Unaffected evidence stays `supported`; only the declared dependent set moves |

## Write semantics

1. Every write carries `commandId` and `expectedRevision`.
2. A revision mismatch rejects with `conflict`; authoritative state is unchanged and the caller is told to reload.
3. A repeated `commandId` returns the stored result and appends nothing.
4. Validation order: schema, role, action identity, expected revision, domain rules.
5. A failed action appends no event.
6. Only `project_manager` records a decision. A `contributor` attempt is rejected with `role_denied`.
7. Exceptions are additive records with reason, owner and affected requirement IDs.

## Impact computation

A requirement declares `fieldBindings`; evidence declares `boundFieldVersions`. A change computes the transitive dependent set over both `fieldBindings` and `prerequisiteIds`, and returns `impacted` and `unaffected` requirement and evidence IDs.

There is no blanket reset. In the reference scenario the photographer requirement binds only to `photographer.deliverables` and `photographer.arrivalWindow`, so it remains `supported` across a venue change. A cycle or unresolved prerequisite yields `blocked` with the cycle path in the reason.

## Separation that must hold

| Kept separate | Consequence of merging |
| --- | --- |
| Generation vs adoption | A suggestion becomes an authoritative fact |
| Readiness vs acceptance | A computed status impersonates a human decision |
| Evidence existence vs evidence truth | A digest is presented as verified reality |
| Historical decision vs current acceptance | An old approval silently applies to a new plan |
