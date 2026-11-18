# Reference scenario

A single fictional launch, held across three states so that change, impact and recovery can be specified exactly.

| Element | Baseline, revision 1 | Venue change, revision 2 | Corrected plan |
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

Guest count 120 and the $30,000 budget are fixed across all three states. The corrected plan's revision is assigned by the application, not declared here.

## Requirements

| ID | Requirement | Predicate | Blocking |
| --- | --- | --- | --- |
| `REQ-venue-loading-1` | Loading window covers crew arrival plus setup | `time_within_window` | yes |
| `REQ-venue-capacity-1` | Capacity covers guests plus circulation buffer | `numeric_within` | yes |
| `REQ-crew-arrival-1` | Crew call is inside venue access | `time_within_window` | yes |
| `REQ-production-runofshow-1` | Run of show ends before the venue hard stop | `time_within_window` | yes |
| `REQ-budget-total-1` | Committed total stays within budget | `numeric_within` | yes |
| `REQ-fire-permit-1` | Fire and occupancy attestation reviewed for the booked venue | `attestation_reviewed` | yes |
| `REQ-photographer-deliverables-1` | 120 edited images within 10 days | `evidence_present` | yes |

## Why the change breaks the plan

- Access 06:00–07:30 cannot absorb a 07:15 crew arrival plus 45 minutes of setup, which needs access until 08:00.
- Licensed occupancy 110 is below 120 guests plus the 10-seat circulation buffer.
- Committed total $31,450 exceeds the $30,000 budget by $1,450.
- A 22:00 run of show cannot keep a 30-minute margin before a 21:30 hard stop.
- The fire attestation was reviewed for Foundry Hall, so it no longer attaches to the booked venue.

## Why the photographer survives

`REQ-photographer-deliverables-1` binds to `photographer.deliverables` and `photographer.arrivalWindow` only. It has no venue binding and no venue prerequisite. A venue change cannot affect it, and marking it `outdated` is a defect in impact computation.

## How recovery works

The annex extension is a documented option in the venue pack, not an invented concession: it raises licensed occupancy to 140 and extends access to 08:00. Catering and production are rescoped downward to bring the total to $29,650. The corrected plan still requires current evidence and a new decision; consistency alone does not constitute acceptance.

## Files

| File | Contents |
| --- | --- |
| [scenario.json](scenario.json) | Project, requirements, source references and the three states. |
| [expected-impact.json](expected-impact.json) | Expected statuses, impacted and unaffected sets, eligibility, evidence bindings and invariants. |
| [acceptance-cases.json](acceptance-cases.json) | V1–V18 with actions and expected observables. |

Evidence bindings `EV-1`–`EV-7` are declared in `expected-impact.json`. Values in these files are reference values for the rules, not vendor facts.
