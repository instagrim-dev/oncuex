#!/usr/bin/env python3
"""Contract validator for the OnCueX reference scenario.

Enforces the schema, binding, evidence and oracle rules mechanically so that a
fixture cannot drift from the specification. Exit code 1 on any error.

    python3 tools/validate_fixtures.py
"""

import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENARIO = os.path.join(ROOT, "fixtures", "scenario.json")
ORACLE = os.path.join(ROOT, "fixtures", "expected-impact.json")
CASES = os.path.join(ROOT, "fixtures", "acceptance-cases.json")

CHECK_IDS = {
    "access_vs_arrival",
    "occupancy_vs_headcount",
    "runofshow_vs_hardstop",
    "total_cost",
    "attestation_current",
    "dependency_closure",
}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(obj) -> str:
    return "sha256:" + hashlib.sha256(canon(obj).encode()).hexdigest()


def resolve(doc, path: str):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return (False, None)
        cur = cur[part]
    return (True, cur)


def leaves(obj, prefix: str = "") -> set[str]:
    out: set[str] = set()
    if isinstance(obj, dict):
        for key, val in obj.items():
            out |= leaves(val, f"{prefix}.{key}" if prefix else key)
    else:
        out.add(prefix)
    return out


def type_ok(kind: str, value) -> bool:
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "time":
        return isinstance(value, str) and bool(re.fullmatch(r"\d{2}:\d{2}", value or ""))
    if kind == "enum":
        return True
    if kind == "collection":
        return isinstance(value, (list, dict))
    return False


def load():
    scenario = json.load(open(SCENARIO, encoding="utf-8"))
    oracle = json.load(open(ORACLE, encoding="utf-8"))
    cases = json.load(open(CASES, encoding="utf-8"))
    return scenario, oracle, cases


def check_schema(scn) -> dict:
    schema = scn["fieldSchema"]
    brief = scn["scenario"]["brief"]

    for path, spec in schema.items():
        for name in scn["state"]:
            if path.startswith("brief."):
                ok, _ = resolve(brief, path[len("brief."):])
            else:
                ok, _ = resolve(scn["state"][name], path)
            if not ok:
                err(f"fieldSchema: {path} not present in state.{name}")

    declared = set(schema)
    for name, doc in scn["state"].items():
        for path in leaves(doc):
            if path in declared:
                continue
            if any(d.startswith(path + ".") for d in declared):
                continue
            err(f"state.{name}: path {path} not declared in fieldSchema")

    for path, spec in schema.items():
        kind = spec["type"] if isinstance(spec, dict) else spec
        if path.startswith("brief."):
            ok, val = resolve(brief, path[len("brief."):])
            if ok and not type_ok(kind, val):
                err(f"type: brief.{path} = {val!r} not {kind}")
            continue
        for name, doc in scn["state"].items():
            ok, val = resolve(doc, path)
            if not ok:
                continue
            if not type_ok(kind, val):
                err(f"type: state.{name}.{path} = {val!r} not {kind}")
                continue
            if kind == "enum" and val not in spec.get("values", [val]):
                err(f"enum: state.{name}.{path} = {val!r} not declared")
            if kind == "time" and val:
                hours, minutes = val.split(":")
                if not (0 <= int(hours) < 24 and 0 <= int(minutes) < 60):
                    err(f"time: state.{name}.{path} = {val!r} out of range")
    return schema


def check_engine_schema(schema: dict) -> None:
    """The engine's typed path table must not drift from the fixture schema."""
    sys.path.insert(0, ROOT)
    try:
        from oncuex.engine import TYPED_PATHS
    except Exception as exc:
        err(f"engine schema not importable: {exc}")
        return

    missing = sorted(set(schema) - set(TYPED_PATHS))
    extra = sorted(set(TYPED_PATHS) - set(schema))
    if missing:
        err(f"engine schema missing paths: {missing}")
    if extra:
        err(f"engine schema declares paths absent from fieldSchema: {extra}")


def check_bindings(scn, schema) -> dict:
    req_ids = {r["id"] for r in scn["requirements"]}
    for req in scn["requirements"]:
        for path in req["fieldBindings"]:
            if path not in schema:
                err(f"binding {req['id']} -> {path} not declared in fieldSchema")
        for pre in req["prerequisiteIds"]:
            if pre not in req_ids:
                err(f"prerequisite {req['id']} -> {pre} unknown")

    graph = {r["id"]: list(r["prerequisiteIds"]) for r in scn["requirements"]}
    seen: set[str] = set()
    stack: set[str] = set()

    def dfs(node, path):
        if node in stack:
            err(f"cycle: {' -> '.join(path + [node])}")
            return
        if node in seen:
            return
        stack.add(node)
        for child in graph.get(node, []):
            dfs(child, path + [node])
        stack.discard(node)
        seen.add(node)

    for node in graph:
        dfs(node, [])
    return graph


def check_evidence(scn, schema) -> list:
    req_ids = {r["id"] for r in scn["requirements"]}
    sources = {s["id"]: s for s in scn["sourceReferences"]}
    evidence = scn["evidence"]
    ids = [e["id"] for e in evidence]
    if len(ids) != len(set(ids)):
        err("duplicate evidence id")

    for ev in evidence:
        if ev["requirementId"] not in req_ids:
            err(f"{ev['id']}: unknown requirement {ev['requirementId']}")
        for ref in ev["sourceRefIds"]:
            if ref not in sources:
                err(f"{ev['id']}: unknown source {ref}")

        for path, val in ev["boundFieldVersions"].items():
            if path not in schema:
                err(f"{ev['id']}: bound field {path} not in fieldSchema")
                continue
            spec = schema[path]
            kind = spec["type"] if isinstance(spec, dict) else spec
            if kind == "collection":
                if not (isinstance(val, str) and val.startswith("sha256:")):
                    err(f"{ev['id']}: composite {path} not stored as digest")
                    continue
                for name, doc in scn["state"].items():
                    ok, actual = resolve(doc, path)
                    if ok and digest(actual) == val:
                        break
                else:
                    err(f"{ev['id']}: composite digest for {path} matches no state")
                continue
            if not type_ok(kind, val):
                err(f"{ev['id']}: bound {path} = {val!r} not {kind}")

        expected = digest(
            {"sourceRefIds": ev["sourceRefIds"], "sourceExcerpt": ev["sourceExcerpt"]}
        )
        if expected != ev["contentDigest"]:
            err(f"{ev['id']}: contentDigest does not match excerpt")

        cited = [sources[r] for r in ev["sourceRefIds"] if r in sources]
        if cited and not any(
            ev["sourceExcerpt"][:40] in s["excerpt"] or s["excerpt"][:40] in ev["sourceExcerpt"]
            for s in cited
        ):
            warn(f"{ev['id']}: excerpt not textually present in a cited source")
    return evidence


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


def check_oracle(scn, oracle, graph, evidence, schema) -> None:
    cases = {c["id"]: c for c in oracle["cases"]}
    req_ids = {r["id"] for r in scn["requirements"]}

    o2 = cases["O2"]
    got = {c["id"] for c in o2["integrated"]["failingChecks"]}
    if got != CHECK_IDS:
        err(f"O2 failingChecks {sorted(got)} != all six {sorted(CHECK_IDS)}")
    impacted = set(o2["impacted"]["requirementIds"])
    unaffected = set(o2["unaffected"]["requirementIds"])
    if impacted & unaffected:
        err("O2 impacted/unaffected overlap")
    if impacted | unaffected != req_ids:
        err("O2 impacted + unaffected != all requirements")
    for rid, status in o2["requirementStatus"].items():
        if rid not in req_ids:
            err(f"O2 unknown requirement {rid}")

    o6 = cases["O6"]["expected"]
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
            for e in evidence
            if e["requirementId"] == rid
            and e["reviewDisposition"] == "accepted"
            and (e["id"] in recovery_ids or e["id"] == "EV-7")
        ]
        if not have:
            err(f"O4: {rid} supported with no accepted recovery evidence")
            continue
        for ev in have:
            for path, val in ev["boundFieldVersions"].items():
                if path.startswith("brief."):
                    ok, actual = resolve(brief, path[len("brief."):])
                else:
                    ok, actual = resolve(recovered, path)
                if not ok:
                    err(f"O4: {ev['id']} binds {path} absent from recovered state")
                    continue
                kind = schema[path]["type"] if isinstance(schema[path], dict) else schema[path]
                if kind == "collection":
                    if digest(actual) != val:
                        err(f"O4: {ev['id']} {path} digest does not match recovered state")
                elif actual != val:
                    err(f"O4: {ev['id']} binds {path}={val!r} but recovered state holds {actual!r}")

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


def check_cases(cases) -> None:
    ids = [c["id"] for c in cases["cases"]]
    expected = [f"V{n}" for n in range(1, len(ids) + 1)]
    if ids != expected:
        err(f"acceptance case ids not contiguous from V1: {ids}")


def main() -> int:
    scenario, oracle, cases = load()
    schema = check_schema(scenario)
    check_engine_schema(schema)
    graph = check_bindings(scenario, schema)
    evidence = check_evidence(scenario, schema)
    check_amounts(scenario)
    check_oracle(scenario, oracle, graph, evidence, schema)
    check_cases(cases)

    for message in warnings:
        print(f"WARN  {message}")
    for message in errors:
        print(f"ERROR {message}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
