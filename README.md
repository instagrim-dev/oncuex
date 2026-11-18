# OnCueX

Event readiness that keeps approval tied to the evidence that supports it.

A launch plan is not ready because its tasks are checked off. It is ready when every mandatory requirement has current, attributable support, when the workstreams fit together, and when a project manager accepts that exact state. OnCueX maintains that distinction through a change: when a venue moves, it identifies precisely which commitments the move invalidates, keeps the evidence that never depended on the venue, and refuses to treat an earlier approval as current.

## The scenario

One fictional brand launch: 120 guests, a $30,000 budget, a fixed date. The plan is supported by a venue pack, a crew note, a production note, a photography scope and a budget sheet. The project manager adopts the brief, the integrated review passes, and the milestone is accepted.

The venue then moves from Foundry Hall to Pier 9 Loft. The loading window narrows to 06:00–07:30, licensed occupancy drops to 110, the hard stop moves to 21:30, and the committed total rises to $31,450. Loading, capacity, cost, run of show and the fire attestation become unsupported. The photographer's deliverable — 120 edited images within 10 days — binds to no venue field and stays valid.

Recovery requires current evidence, a re-run review and a new decision. Reverting the venue to Foundry Hall does not restore the earlier approval.

## Readiness and acceptance are separate

Readiness is computed. Each requirement reports as `missing`, `blocked`, `outdated` or `supported` with a named reason, and the integrated checks are reported separately. Acceptance is not computed. It exists only as a decision record made by the project manager against one revision, one requirement set and one evidence set.

A decision is current only while the revision and evidence it references remain current. After a bound fact changes, after expiry, or after a scope change, the decision is returned as historical alongside the named current residuals.

## AI proposes; people adopt

The model extracts a structured brief from pasted text and drafts recovery options. Every extracted claim carries a source reference. Output that fails schema validation, cites a source that is not present, or asserts a confirmation nobody issued is rejected as a proposal and cannot alter the record. Instructions embedded in uploaded material are treated as content, never as authority.

## Scope

OnCueX provides:

- A versioned brief with requirements, owners, dependencies, open questions and source-linked evidence.
- Deterministic readiness with named residuals, alongside integrated checks reported separately.
- Reviewed AI extraction and recovery drafting.
- A revision-bound project-manager decision with retained history.
- Reloadable, exportable records, and a working brief and readiness report rendered from reviewed state.

OnCueX does not provide:

- Production authentication, tenancy or multi-user security. Contributor roles are simulated and labeled.
- Marketplace search, live vendor outreach, booking, payments, permit adjudication or CRM integration.
- Multilingual output, graph animation or decorative reporting.
- Verification of physical reality. It checks records, dates and internal consistency; safety, accessibility and permit determinations remain with qualified people.

All people, venues, vendors and prices are fictional. No customer data, contracts or payment details are used.

## Specification

| Document | Contents |
| --- | --- |
| [docs/domain-model.md](docs/domain-model.md) | Records, identifiers, state transitions, currentness and write semantics. |
| [docs/readiness-rules.md](docs/readiness-rules.md) | Requirement predicates, integrated checks and impact computation. |
| [docs/ai-boundary.md](docs/ai-boundary.md) | Extraction and drafting contract, validation and rejection reasons. |
| [docs/verification.md](docs/verification.md) | The twenty-three behavioral checks the implementation must satisfy. |
| [fixtures/scenario.json](fixtures/scenario.json) | Typed field schema, project, requirements, sources, evidence and the three states. |
| [fixtures/expected-impact.json](fixtures/expected-impact.json) | Revision model, event timeline, expected outcomes and the invariants they imply. |
| [fixtures/acceptance-cases.json](fixtures/acceptance-cases.json) | The verification checks in machine-readable form. |
| [submission/overview.md](submission/overview.md) | One-page description of the problem, the mechanism and the limits. |

## Reference implementation

`oncuex/` is a headless engine covering the contract: typed schema validation, pure evaluation of readiness and selective impact, an append-only event log with two independent counters, and revision-bound decisions. `oncuex/schema.py` is the single declaration of every bindable path and record shape; the engine and the fixture validator both import it. It has no UI and no platform adapter.

```sh
python3 tools/validate_fixtures.py   # schema, bindings, evidence, oracle coherence
python3 tools/check_schema.py        # executable schema checks, positive and negative
python3 tools/check_core.py          # readiness, currentness and selective impact
python3 tools/check_oracle.py        # 40 differential checks against the oracle
python3 tools/reference_path.py      # baseline -> change -> recovery -> acceptance -> reload
```

`tools/reference_path.py` exercises the end-to-end path and asserts that a decision stays current through an immediate readback and a reload, that the venue change reopens exactly six requirements while the photographer deliverable stays supported, that a retried command appends nothing, and that a rejected write leaves the exported record byte-identical.
| [tools/validate_fixtures.py](tools/validate_fixtures.py) | Mechanical enforcement of the schema, binding, evidence and oracle rules. |

## License

MIT. See [LICENSE](LICENSE).
