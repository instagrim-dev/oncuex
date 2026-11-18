#!/usr/bin/env python3
"""Executable tests for the canonical schema.

Positive tests prove the fixture satisfies the declaration. Negative tests
mutate one field at a time and prove the declaration rejects it, so a schema
that silently accepts everything cannot pass. Engine-level tests prove the same
declaration is enforced at load, not only in this tool.

    python3 tools/check_schema.py
"""

from __future__ import annotations

import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from oncuex.engine import SchemaError, validate_snapshot  # noqa: E402
from oncuex.schema import (  # noqa: E402
    FIELD_SCHEMA,
    TYPED_PATHS,
    digest,
    resolve,
    validate_document,
)

SCENARIO = os.path.join(ROOT, "fixtures", "scenario.json")

checks = 0
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}: {detail}")


def document() -> dict:
    with open(SCENARIO, encoding="utf-8") as handle:
        return json.load(handle)


def document_errors(mutate) -> list[str]:
    doc = copy.deepcopy(document())
    mutate(doc)
    try:
        return validate_document(doc)
    except Exception as exc:  # a crash is a schema failure, report it as one
        return [f"validator raised {type(exc).__name__}: {exc}"]


def expect_rejection(label: str, mutate, needle: str) -> None:
    errors = document_errors(mutate)
    check(label, any(needle in message for message in errors),
          f"expected {needle!r}, got {errors[:3]}")


def project_for(scenario: dict, state_name: str = "baseline", revision: int = 8) -> dict:
    state = copy.deepcopy(scenario["state"][state_name])
    state.pop("assessmentRevision", None)
    state.update({
        "id": scenario["scenario"]["id"],
        "brief": copy.deepcopy(scenario["scenario"]["brief"]),
        "circulationBuffer": scenario["scenario"]["brief"]["circulationBuffer"],
        "requirementSetVersion": scenario["scenario"]["requirementSetVersion"],
        "assessmentRevision": revision,
    })
    return state


def expect_schema_error(label: str, mutate) -> None:
    scenario = document()
    snapshot = project_for(scenario)
    requirements = copy.deepcopy(scenario["requirements"])
    evidence = copy.deepcopy(scenario["evidence"])
    mutate(snapshot, requirements, evidence)
    try:
        validate_snapshot(snapshot, requirements, evidence)
    except SchemaError:
        check(label, True)
        return
    check(label, False, "validate_snapshot accepted the input")


def main() -> int:
    scenario = document()

    # ---------------------------------------------------------------- positive
    check("fixture satisfies the canonical schema", validate_document(scenario) == [],
          str(validate_document(scenario)[:3]))
    check("fixture field table equals the canonical declaration",
          scenario["fieldSchema"] == FIELD_SCHEMA)
    check("TYPED_PATHS is the canonical table", TYPED_PATHS is FIELD_SCHEMA)

    for req in scenario["requirements"]:
        for path in req["fieldBindings"]:
            ok = path in FIELD_SCHEMA
            check(f"{req['id']} binds a declared path: {path}", ok)
            if ok:
                target = scenario["scenario"]["brief"] if path.startswith("brief.") else None
                if target is None:
                    check(f"{req['id']} binding resolves in every state: {path}",
                          all(resolve(state, path)[0] for state in scenario["state"].values()))
    try:
        validate_snapshot(project_for(scenario), copy.deepcopy(scenario["requirements"]),
                          copy.deepcopy(scenario["evidence"]))
        check("baseline snapshot loads", True)
    except SchemaError as exc:
        check("baseline snapshot loads", False, str(exc))

    # ---------------------------------------------------------------- document
    expect_rejection("undeclared requirement field rejected",
                     lambda d: d["requirements"][0].update({"sla": "24h"}),
                     "unexpected field")
    expect_rejection("undeclared evidence field rejected",
                     lambda d: d["evidence"][0].update({"confidence": 0.9}),
                     "unexpected field")
    expect_rejection("undeclared source field rejected",
                     lambda d: d["sourceReferences"][0].update({"url": "https://example.test"}),
                     "unexpected field")
    expect_rejection("undeclared state field rejected",
                     lambda d: d["state"]["baseline"]["location"].update({"inventedField": "x"}),
                     "not declared in fieldSchema")
    expect_rejection("undeclared brief field rejected",
                     lambda d: d["scenario"]["brief"].update({"deposit": 1000}),
                     "unexpected field")
    expect_rejection("undeclared document section rejected",
                     lambda d: d.update({"assumptions": []}),
                     "unexpected field")
    expect_rejection("wrong brief type rejected",
                     lambda d: d["scenario"]["brief"].update({"guestCount": "120"}),
                     "brief.guestCount")
    expect_rejection("wrong state type rejected",
                     lambda d: d["state"]["baseline"]["location"].update({"capacity": "150"}),
                     "location.capacity")
    expect_rejection("undeclared enum member rejected",
                     lambda d: d["state"]["baseline"]["location"].update({"fireAttestation": "checked"}),
                     "not a declared member")
    expect_rejection("missing declared state path rejected",
                     lambda d: d["state"]["baseline"]["location"].pop("roomPlan"),
                     "declared path location.roomPlan is not present")
    expect_rejection("schema drift rejected",
                     lambda d: d["fieldSchema"]["location.capacity"].update({"type": "string"}),
                     "differs from the canonical declaration")
    expect_rejection("undeclared schema path rejected",
                     lambda d: d["fieldSchema"].update({"location.inventedField": {"type": "string"}}),
                     "non-canonical paths")

    # ---------------------------------------------------------------- bindings
    expect_rejection("undeclared requirement binding rejected",
                     lambda d: d["requirements"][0]["fieldBindings"].append("production.runOfShow"),
                     "undeclared binding")
    expect_rejection("undeclared evidence binding rejected",
                     lambda d: d["evidence"][0]["boundFieldVersions"].update({"location.inventedField": 1}),
                     "undeclared bound field")
    expect_rejection("wrong-typed evidence binding rejected",
                     lambda d: d["evidence"][0]["boundFieldVersions"].update({"location.capacity": "150"}),
                     "is not a valid integer")
    expect_rejection("non-digest collection binding rejected",
                     lambda d: d["evidence"][4]["boundFieldVersions"].update({"budget.commitments": "all of them"}),
                     "must be a sha256 digest")
    expect_rejection("unknown prerequisite rejected",
                     lambda d: d["requirements"][2].update({"prerequisiteIds": ["REQ-venue-loading-2"]}),
                     "unknown prerequisite")
    expect_rejection("self prerequisite rejected",
                     lambda d: d["requirements"][0].update({"prerequisiteIds": ["REQ-venue-loading-1"]}),
                     "its own prerequisite")
    expect_rejection("duplicate requirement id rejected",
                     lambda d: d["requirements"][1].update({"id": d["requirements"][0]["id"]}),
                     "ids must be unique")
    expect_rejection("unknown evidence requirement rejected",
                     lambda d: d["evidence"][0].update({"requirementId": "REQ-missing-1"}),
                     "unknown requirement")
    expect_rejection("unknown evidence source rejected",
                     lambda d: d["evidence"][0].update({"sourceRefIds": ["SRC-99"]}),
                     "unknown source")
    expect_rejection("misspelled predicate parameter rejected",
                     lambda d: d["requirements"][4]["expectedValues"].update(
                         {"maxMinorUnits": 3000000}),
                     "does not read")
    expect_rejection("missing numeric bound rejected",
                     lambda d: d["requirements"][1]["expectedValues"].pop("minimum"),
                     "needs a minimum")
    expect_rejection("unknown predicate rejected",
                     lambda d: d["requirements"][0].update({"predicateType": "vibes"}),
                     "unknown predicateType")
    expect_rejection("stale content digest rejected",
                     lambda d: d["evidence"][0].update({"sourceExcerpt": "Different text entirely."}),
                     "contentDigest does not recompute")
    expect_rejection("expiry before observation rejected",
                     lambda d: d["evidence"][0].update({"expiresAt": "2027-01-01T00:00:00Z"}),
                     "expiresAt must be after observedAt")
    expect_rejection("unknown milestone rejected",
                     lambda d: d["requirements"][0].update({"milestoneId": "MS-9"}),
                     "unknown milestone")
    expect_rejection("unknown owner rejected",
                     lambda d: d["requirements"][0].update({"owner": "CON-nobody"}),
                     "unknown owner")
    expect_rejection("unknown role rejected",
                     lambda d: d["scenario"]["contributors"][0].update({"role": "admin"}),
                     "unknown role")
    expect_rejection("total currency mismatch rejected",
                     lambda d: d["state"]["baseline"]["budget"]["committedTotal"].update({"currency": "EUR"}),
                     "do not match total currency")

    # ---------------------------------------------------------------- engine
    expect_schema_error("engine rejects a wrong-typed brief value",
                        lambda snapshot, reqs, ev: snapshot["brief"].update({"guestCount": "120"}))
    expect_schema_error("engine rejects an undeclared requirement field",
                        lambda snapshot, reqs, ev: reqs[0].update({"sla": "24h"}))
    expect_schema_error("engine rejects an undeclared evidence field",
                        lambda snapshot, reqs, ev: ev[0].update({"confidence": 0.9}))
    expect_schema_error("engine rejects an undeclared binding path",
                        lambda snapshot, reqs, ev: reqs[3]["fieldBindings"].append("production.runOfShow"))
    expect_schema_error("engine rejects a snapshot without a brief",
                        lambda snapshot, reqs, ev: snapshot.pop("brief"))

    # ---------------------------------------------------------------- write boundary
    # The command service applies the same declaration, so an invalid record
    # cannot be committed and then fail only at the next assessment.
    from oncuex.store import CommandError, Store

    def fresh_store():
        sc = document()
        base = {f"EV-{n}" for n in range(1, 8)}
        return Store(
            project_for(sc),
            copy.deepcopy(sc["requirements"]),
            [e for e in copy.deepcopy(sc["evidence"]) if e["id"] in base],
        )

    def unchanged_after(label: str, attempt) -> None:
        store = fresh_store()
        before = json.dumps(store.export(), sort_keys=True)
        try:
            attempt(store)
            check(label, False, "no error raised")
        except CommandError as exc:
            check(label, True)
        check(f"{label} leaves the record byte-identical",
              json.dumps(store.export(), sort_keys=True) == before)

    bad_brief = copy.deepcopy(scenario["scenario"]["brief"])
    bad_brief.pop("openQuestions")
    unchanged_after(
        "write rejects a brief missing a declared field",
        lambda store: store.adopt_brief(
            {"commandId": "CMD-B1", "role": "project_manager",
             "expectedAssessmentRevision": 8}, bad_brief),
    )

    bad_evidence = copy.deepcopy(scenario["evidence"][0])
    bad_evidence["id"] = "EV-99"
    bad_evidence.pop("contentDigest")
    unchanged_after(
        "write rejects an incomplete evidence record",
        lambda store: store.attach_evidence(
            {"commandId": "CMD-E1", "role": "project_manager",
             "expectedAssessmentRevision": 8}, bad_evidence),
    )

    unchanged_after(
        "write rejects a mistyped change value",
        lambda store: store.adopt_change(
            {"commandId": "CMD-C1", "role": "project_manager",
             "expectedAssessmentRevision": 8},
            {"id": "CHG-1", "changedFields": {"location.capacity": {"from": 150, "to": "many"}}}),
    )

    # ---------------------------------------------------------------- isolation
    # The evaluator cannot read an expectation if it never opens a file and
    # never names a fixture artifact.
    sources = [name for name in os.listdir(os.path.join(ROOT, "oncuex")) if name.endswith(".py")]
    for name in sources:
        text = open(os.path.join(ROOT, "oncuex", name), encoding="utf-8").read()
        check(f"oncuex/{name} opens no file", "open(" not in text)
        check(f"oncuex/{name} names no fixture artifact", ".json" not in text)

    print(f"{checks - len(failures)}/{checks} schema checks passed")
    for failure in failures:
        print(f"  FAIL {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
