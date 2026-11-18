# Prior work and eligibility

The event rules ask for disclosure of any code or project reused from before the official build period. This file states what was and was not reused.

## Summary

**No pre-existing code was copied into this submission.** Every tracked file in this repository was written during the official period on November 18, 2026. The first commit is `94bff35` at 07:31 PST.

## What was reused

Design thinking only. Three influences are worth naming because a reviewer would notice them:

| Influence | Form | Not reused |
| --- | --- | --- |
| Separation of readiness from independent verification, adoption, currentness and residual reporting | General design principle, applied to event coordination | No code, schema, fixture or test copied |
| The invariant that completed child work does not by itself establish an acceptable parent outcome | Principle restated in event terms | No implementation imported |
| An existing Enter workspace for a different challenge | A platform account, already authenticated | No application code carried over |

The third is operational rather than technical: the Converge.AI account used to build on Enter predates this event. That account held an unrelated project from a separate buildathon. Nothing from that project's source is present here.

## What was not reused

- No vendor, customer or organizer-supplied code.
- No private research or internal documents from another project.
- No third-party libraries beyond public package dependencies declared in `app/package.json`, all under their own licenses.
- No fixture data from any previous work. The 120-guest scenario, venue values, prices and source excerpts were authored for this submission and are fictional.

## Repository provenance

All twelve commits are dated November 18, 2026, within the official period:

```
94bff35  OnCueX: event readiness specification
8e01e69  Separate assessment revision from event sequence; type the schema
cec122e  Make commands atomic and currentness expiry-aware
5ef4e20  Extract the canonical schema and validate records at every boundary
db38663  Compute selective impact from declared bindings
7e9c0ad  Complete decision history and reload behaviour
57030e9  Keep decision evidence resolvable and version the export
8e011da  Report prerequisite conflicts alongside the evidence finding
3a3fe5f  feat(app): add OnCueX operator UI
7f3cfab  feat(app): adopt the authoritative Enter workspace
eedcf8f  feat(app): integrate source review and itinerary workflows
95b4762  docs(submission): add readiness plan
```

The `app/` directory derives from a repository synchronised with the Enter workspace, which is itself the event build. The vendored `app/patches/` directory records that derivation so it can be audited.

## Language discipline

Describe this as an event-readiness prototype with an explicit evidence and approval model. Do not describe it as a port of, or equivalent to, any other project's verification system. Do not name or link private research in a public deployment.

## Eligibility

Team composition, event enrolment and any further organizer disclosure requirement remain the submission owner's responsibility. This file records what was reused; it is not an eligibility determination.
