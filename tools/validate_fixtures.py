#!/usr/bin/env python3
"""Contract validator for the OnCueX reference scenario.

Schema and record validation come from oncuex.schema, the canonical
declaration the engine also uses. This tool adds the checks that need the
whole document or the oracle: state-level digest matches, source provenance,
asserted amounts, expectation coherence and acceptance-case references.

Expected results are read here and only here. Nothing under oncuex/ imports
this file or the oracle, so an expectation cannot become an evaluator input.

    python3 tools/validate_fixtures.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from oncuex.schema import (  # noqa: E402
    CHECK_IDS,
    FIELD_SCHEMA,
    digest,
    resolve,
    validate_document,
)

SCENARIO = os.path.join(ROOT, "fixtures", "scenario.json")
ORACLE = os.path.join(ROOT, "fixtures", "expected-impact.json")
CASES = os.path.join(ROOT, "fixtures", "acceptance-cases.json")

CHECK_ID_SET = set(CHECK_IDS)
AREAS = {"readiness", "change", "writes", "ai", "persistence", "decision"}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for key, val in obj.items():
            out.update(flatten(val, f"{prefix}.{key}" if prefix else key))
    else:
        out[prefix] = obj
    return out


def load():
    with open(SCENARIO, encoding="utf-8") as handle:
        scenario = json.load(handle)
    with open(ORACLE, encoding="utf-8") as handle:
        oracle = json.load(handle)
    with open(CASES, encoding="utf-8") as handle:
        cases = json.load(handle)
    return scenario, oracle, cases


def check_document(scn) -> None:
    errors.extend(validate_document(scn))


def check_state_digests(scn) -> None:
    """A collection binding must name a digest of some declared state value."""
    for ev in scn["evidence"]:
        for path, value in ev["boundFieldVersions"].items():
            if FIELD_SCHEMA.get(path, {}).get("type") != "collection":
                continue
            for state in scn["state"].values():
                ok, actual = resolve(state, path)
                if ok and digest(actual) == value:
                    break
            else:
                err(f"{ev['id']}: composite digest for {path} matches no state")


def check_provenance(scn) -> None:
    sources = {s["id"]: s for s in scn["sourceReferences"]}
    for ev in scn["evidence"]:
        cited = [sources[r] for r in ev["sourceRefIds"] if r in sources]
        if cited and not any(
            ev["sourceExcerpt"][:40] in s["excerpt"] or s["excerpt"][:40] in ev["sourceExcerpt"]
            for s in cited
        ):
            warn(f"{ev['id']}: excerpt not textually present in a cited source")


def check_amounts(scn) -> None:
    def amounts(text: str) -> set[int]:
        return {int(x.replace(",", "")) for x in re.findall(r"([0-9][0-9,]{2,})", text)}

    sourced: set[int] = set()
    for src in scn["sourceReferences"]:
        sourced |= amounts(src["excerpt"])
    sourced |= {scn["scenario"]["brief"]["approvedBudget"]["minorUnits"]}

    for name, doc in scn["state"].items():
        for commit in doc["budget"]["commitments"]:
            if commit["amount"]["minorUnits"] not in sourced:
                err(f"state.{name}: {commit['vendor']} amount not stated by any source")
        total = sum(c["amount"]["minorUnits"] for c in doc["budget"]["commitments"])
        if total != doc["budget"]["committedTotal"]["minorUnits"]:
            err(f"state.{name}: declared total != sum of line items")


def failing_checks(case) -> list:
    if "integrated" in case:
        return case["integrated"].get("failingChecks", [])
    return case.get("expected", {}).get("integrated", {}).get("failingChecks", [])


def check_failing_check_shape(oracle) -> None:
    """Every expected failure names its check and states why it failed."""
    for case in oracle["cases"]:
        entries = failing_checks(case)
        if not entries:
            continue
        seen = set()
        for entry in entries:
            if not isinstance(entry, dict):
                err(f"{case['id']}: failing check {entry!r} must be "
                    f"{{'id', 'reason'}}, not a bare identifier")
                continue
            if set(entry) != {"id", "reason"}:
                err(f"{case['id']}: failing check must carry exactly id and reason")
                continue
            if entry["id"] not in CHECK_ID_SET:
                err(f"{case['id']}: unknown failing check {entry['id']!r}")
            if not isinstance(entry["reason"], str) or not entry["reason"].strip():
                err(f"{case['id']}: failing check {entry['id']} has no stated reason")
            if entry["id"] in seen:
                err(f"{case['id']}: duplicate failing check {entry['id']}")
            seen.add(entry["id"])


def check_impact(scn, oracle) -> None:
    """The declared venue change is exactly the field-level state diff."""
    o2 = next(case for case in oracle["cases"] if case["id"] == "O2")
    before = scn["state"]["baseline"]
    after = scn["state"]["venueChange"]
    before_fields, after_fields = flatten(before), flatten(after)
    actual = {
        path
        for path in set(before_fields) | set(after_fields)
        if path != "assessmentRevision"
        and before_fields.get(path) != after_fields.get(path)
    }
    declared = set(o2["trigger"]["changedFields"])
    if declared != actual:
        err(f"O2 changedFields missing {sorted(actual - declared)} "
            f"and inventing {sorted(declared - actual)}")


def check_oracle(scn, oracle) -> None:
    cases = {case["id"]: case for case in oracle["cases"]}
    req_ids = {r["id"] for r in scn["requirements"]}

    check_failing_check_shape(oracle)
    check_impact(scn, oracle)

    o2 = cases["O2"]
    got = {c["id"] for c in o2["integrated"]["failingChecks"]}
    if got != CHECK_ID_SET:
        err(f"O2 failingChecks {sorted(got)} != all six {sorted(CHECK_ID_SET)}")
    impacted = set(o2["impacted"]["requirementIds"])
    unaffected = set(o2["unaffected"]["requirementIds"])
    if impacted & unaffected:
        err("O2 impacted/unaffected overlap")
    if impacted | unaffected != req_ids:
        err("O2 impacted + unaffected != all requirements")
    for rid, status in o2["requirementStatus"].items():
        if rid not in req_ids:
            err(f"O2 unknown requirement {rid}")

    # The expiry case must equal the closure derived from the scenario graph,
    # not a set asserted independently of it.
    o6 = cases["O6"]["expected"]
    graph = {r["id"]: list(r["prerequisiteIds"]) for r in scn["requirements"]}
    seed = "REQ-venue-loading-1"
    closure = {seed}
    changed = True
    while changed:
        changed = False
        for rid, prereqs in graph.items():
            if rid not in closure and any(p in closure for p in prereqs):
                closure.add(rid)
                changed = True
    if set(o6["impacted"]["requirementIds"]) != closure:
        err(f"O6 impacted set != derived dependency closure {sorted(closure)}")
    if "REQ-production-runofshow-1" not in closure:
        err("O6 closure omits REQ-production-runofshow-1, a declared dependent")
    for rid in closure:
        if rid not in o6["requirementStatus"]:
            err(f"O6: dependent {rid} missing from requirementStatus")
        elif rid == seed and o6["requirementStatus"][rid] != "outdated":
            err(f"O6: expired requirement {rid} must be outdated")
        elif rid != seed and o6["requirementStatus"][rid] != "blocked":
            err(f"O6: dependent {rid} must be blocked")

    o4 = cases["O4"]
    recovered = scn["state"]["recovered"]
    brief = scn["scenario"]["brief"]
    recovery_ids = set(o4["evidenceRequired"])
    for rid, status in o4["requirementStatus"].items():
        if status != "supported":
            continue
        have = [
            e
            for e in scn["evidence"]
            if e["requirementId"] == rid
            and e["reviewDisposition"] == "accepted"
            and (e["id"] in recovery_ids or e["id"] == "EV-7")
        ]
        if not have:
            err(f"O4: {rid} supported with no accepted recovery evidence")
            continue
        for ev in have:
            for path, value in ev["boundFieldVersions"].items():
                if path.startswith("brief."):
                    ok, actual = resolve(brief, path[len("brief."):])
                else:
                    ok, actual = resolve(recovered, path)
                if not ok:
                    err(f"O4: {ev['id']} binds {path} absent from recovered state")
                    continue
                if FIELD_SCHEMA[path]["type"] == "collection":
                    if digest(actual) != value:
                        err(f"O4: {ev['id']} {path} digest does not match recovered state")
                elif actual != value:
                    err(f"O4: {ev['id']} binds {path}={value!r} but recovered state holds {actual!r}")

    for cid in ("O9", "O10", "O11"):
        exp = cases[cid]["expected"]
        if exp["assessmentRevision"] == exp["eventSequence"]:
            err(f"{cid}: assessmentRevision must differ from eventSequence")
        if exp.get("decisionCurrentness") != "current":
            err(f"{cid}: decision must read as current immediately after write")

    sequence = [t["eventSequence"] for t in oracle["timeline"]]
    if sequence != sorted(sequence) or len(sequence) != len(set(sequence)):
        err("timeline eventSequence not strictly increasing")
    revisions = [t["assessmentRevision"] for t in oracle["timeline"]]
    if revisions != sorted(revisions):
        err("timeline assessmentRevision decreases")
    for idx, entry in enumerate(oracle["timeline"]):
        if entry["event"] == "decision.recorded" and idx > 0:
            if oracle["timeline"][idx - 1]["assessmentRevision"] != entry["assessmentRevision"]:
                err("decision.recorded advanced assessmentRevision")


def check_cases(cases, oracle_ids: set[str]) -> None:
    ids = [case["id"] for case in cases["cases"]]
    expected = [f"V{n}" for n in range(1, len(ids) + 1)]
    if ids != expected:
        err(f"acceptance case ids not contiguous from V1: {ids}")

    for case in cases["cases"]:
        label = case["id"]
        if case.get("area") not in AREAS:
            err(f"{label}: unknown area {case.get('area')!r}")
        if not isinstance(case.get("action"), str) or not case["action"].strip():
            err(f"{label}: action must be a non-empty string")
        if not isinstance(case.get("expected"), dict) or not case["expected"]:
            err(f"{label}: expected must be a non-empty object")
        if "oracle" in case and case["oracle"] not in oracle_ids:
            err(f"{label}: unknown oracle case {case['oracle']!r}")
        for entry in failing_checks(case):
            if not isinstance(entry, str):
                err(f"{label}: acceptance failing check must be a check id string")
            elif entry not in CHECK_ID_SET:
                err(f"{label}: unknown failing check {entry!r}")


def main() -> int:
    scenario, oracle, cases = load()

    check_document(scenario)
    if errors:
        # Structural failures make the semantic checks unsafe to run.
        for message in errors:
            print(f"ERROR {message}")
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1

    check_state_digests(scenario)
    check_provenance(scenario)
    check_amounts(scenario)
    check_oracle(scenario, oracle)
    check_cases(cases, {case["id"] for case in oracle["cases"]})

    for message in warnings:
        print(f"WARN  {message}")
    for message in errors:
        print(f"ERROR {message}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
