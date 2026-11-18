# AI boundary

The model has two jobs: turn pasted text into a structured brief proposal, and draft a recovery plan from the affected requirements and retained source material. Both produce proposals. Neither produces records.

## Contract

A model call is allowlisted to one of two operations:

| Operation | Input | Output |
| --- | --- | --- |
| `extractBrief` | Pasted text, source reference IDs | Proposed requirements, stated facts with source spans, and explicit unknowns |
| `draftRecovery` | Affected requirement IDs, current state, retained source excerpts | Proposed field changes with rationale and source references |

Every output is validated before storage:

1. Valid JSON against a declared schema. Unknown fields are rejected, not ignored.
2. Every factual claim carries a `sourceRefId` that exists in the corpus. A claim with no reference, or with a reference to a span that does not support it, fails.
3. Missing values are represented as `unknown`, never as a plausible default.
4. Output is stored as a `CHG-*` proposal with `author.kind = "model"` and `status = "proposed"`.
5. The proposal is inert until a human adopts it through a command carrying a `baseRevision` and `expectedRevision`.

A validation failure yields one of `schema_invalid`, `unsupported_confirmation`, `no_source_ref_for_claim`, `source_span_mismatch`, `instruction_content_detected`. The UI renders the failure with the failing field, and authoritative state is untouched.

## Prohibited outputs

The following are rejected regardless of how confidently the model states them:

- A vendor confirmation, availability, price or permit status that no source asserts.
- Attribution to a person who did not issue the statement.
- Any change to requirement status, readiness, acceptance or the approved budget.
- Any representation that an action was taken: sent, booked, paid, filed or approved.

The model cannot call tools that mutate state, and it has no channel to the command service other than a proposal.

## Untrusted input

Briefs, vendor documents, notes and model output are untrusted content. Instruction-like text inside them is preserved as a quoted excerpt with attribution and never executed. A document that says to ignore previous instructions, mark requirements supported, record an acceptance or raise the budget is recorded as a source excerpt and reported as `instruction_content_detected` if it appears in proposal output.

## Generated documents

The working brief and readiness report are rendered from reviewed structured state, not from an unconstrained chat summary. A document that omits an open question, a residual or a historical decision is defective. Generation is deterministic given the same revision.

## Failure behavior

| Failure | Behavior |
| --- | --- |
| Model unavailable | The action reports unavailability. No substitute content is inserted. |
| Timeout | The proposal is not created. The user may retry. |
| Validation failure | The proposal is stored as rejected, or not stored, with the reason. |
| Partial response | Treated as invalid; partial proposals are never adopted automatically. |

A failed call leaves the project revision and every record unchanged.
