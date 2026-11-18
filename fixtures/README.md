# Reference scenario

A single fictional launch held across three states, so that change, impact and recovery can be specified exactly. Every amount asserted in any state is stated by a referenced source; see [Verification of asserted values](#verification-of-asserted-values).

| Element | Baseline, assessment revision 8 | Venue change, assessment revision 9 | Corrected plan, assessment revision 15 |
| --- | --- | --- | --- |
| Venue | Foundry Hall, capacity 150 | Pier 9 Loft, capacity 110 | Pier 9 Loft plus annex, capacity 140 |
| Loading window | 05:00–12:00 | 06:00–07:30 | 05:00–08:00 |
| Hard stop | 23:00 | 21:30 | 22:30 |
| Crew arrival | 07:00 | 07:15 | 06:30 |
| Run of show end | 22:00 | 22:00 | 21:00 |
| Committed total | $29,100 | $31,450 | $29,650 |
| Approved budget | $30,000 | $30,000 | $30,000 |
| Photographer | 120 images in 10 days | unchanged | unchanged |
| Readiness | ready for review | not ready | ready for review |

Guest count 120 and the $30,000 budget are fixed across all three states. Assessment revisions are stated because the baseline needs eight evidence-attachment events to reach `ready_for_review`; the numbers are consequences of the event log, not independent choices.

## Requirements

| ID | Requirement | Predicate | Prerequisites | Blocking |
| --- | --- | --- | --- | --- |
| `REQ-venue-loading-1` | Loading window covers crew arrival plus setup | `time_within_window` | — | yes |
| `REQ-venue-capacity-1` | Capacity covers guests plus circulation buffer | `numeric_within` | — | yes |
| `REQ-crew-arrival-1` | Crew call is inside venue access | `time_within_window` | `REQ-venue-loading-1` | yes |
| `REQ-production-runofshow-1` | Run of show ends before the venue hard stop | `time_within_window` | `REQ-venue-loading-1` | yes |
| `REQ-budget-total-1` | Committed total stays within budget | `numeric_within` | — | yes |
| `REQ-fire-permit-1` | Fire and occupancy attestation reviewed for the booked venue | `attestation_reviewed` | — | yes |
| `REQ-photographer-deliverables-1` | 120 edited images within 10 days | `evidence_present` | — | yes |

The two dependents of `REQ-venue-loading-1` are the reason expiry and venue change both require dependency closure; see V9.

## Why the change breaks the plan

- Access 06:00–07:30 cannot absorb a 07:15 crew arrival plus 45 minutes of setup, which reaches 08:00.
- Licensed occupancy 110 is below 120 guests plus the 10-seat circulation buffer.
- Committed total $31,450 exceeds the $30,000 budget by $1,450.
- A 22:00 run of show cannot keep a 30-minute margin before a 21:30 hard stop.
- The fire attestation was reviewed for Foundry Hall, so it no longer attaches to the booked venue.

All five conditions fail, and six requirements are unsupported, so `dependency_closure` fails as well. The venue-change case reports six failing checks, not the four that are visible from the timing and cost conflicts alone.

## Why the photographer survives

`REQ-photographer-deliverables-1` binds only to `photographer.deliverables.editedImages`, `photographer.deliverables.deliveryDays`, `photographer.arrivalWindow.start` and `photographer.arrivalWindow.end`. It has no venue binding and no venue prerequisite. A venue change cannot affect it, and marking it `outdated` is a defect in impact computation. Its evidence `EV-7` is reused at recovery rather than re-created.

## How recovery is evidenced

The corrected plan asserts four new concessions. Each is stated by a source and bound by an accepted evidence record, so recovery is not accepted on internal consistency alone.

| Recovered claim | Stated by | Bound by |
| --- | --- | --- |
| Annex raises licensed occupancy to 140 and extends access to 08:00 | `SRC-3`, `SRC-8` | `EV-9`, `EV-8` |
| Combined venue fee is $1,245,000 | `SRC-3`, `SRC-12` | `EV-12` |
| Catering rescoped to $895,000 | `SRC-6`, `SRC-12` | `EV-12` |
| Production reduced build is $585,000 | `SRC-7`, `SRC-12` | `EV-12` |
| Crew call moves to 06:30 | `SRC-9` | `EV-10` |
| Run of show ends 21:00 | `SRC-10` | `EV-11` |
| Annex attestation reviewed to 2027-03-10 | `SRC-8` | `EV-13` |

The recovered plan still requires current evidence and a new decision; consistency alone does not constitute acceptance. If a recovered value has no source, the correct behavior is to leave that requirement unresolved, not to mark it supported.

## Verification of asserted values

The scenario ships with a validator that enforces the contract mechanically:

- Every `fieldSchema` path resolves in every state, and every state path is declared.
- Every value matches its declared type; every `enum` is a member; every `time` is in range.
- Every requirement binding and every evidence binding names a declared path.
- The prerequisite graph is acyclic and every prerequisite exists.
- Every evidence `contentDigest` recomputes from its excerpt.
- Every `collection` binding is a digest matching one of the actual states.
- Every budget amount is stated by at least one source, and each state's total equals the sum of its line items.
- Each oracle case is checked against the requirements derived from the scenario, not against the oracle's own claims: the O2 failing-check set must equal all six checks, and the O6 impacted set must equal the dependency closure of `REQ-venue-loading-1`.
- Every requirement that O4 marks `supported` has accepted recovery evidence whose bound values equal the recovered state's values.
- `decision.recorded` events never advance `assessmentRevision`, and decision cases never report a decision as historical at the revision it targeted.

## Files

| File | Contents |
| --- | --- |
| [scenario.json](scenario.json) | Typed field schema, project, requirements, sources, evidence records and the three states. |
| [expected-impact.json](expected-impact.json) | Revision model, event timeline, expected outcomes O1–O11, and the invariants they imply. |
| [acceptance-cases.json](acceptance-cases.json) | V1–V21 with actions and expected observables. |
