#!/usr/bin/env python3
"""Focused behavioral tests for the deterministic core.

Covers the three things the core must compute and the boundary it must not
cross:

    readiness            a completed checklist cannot produce ready_for_review
    evidence currentness stale records cannot veto current support
    selective impact     a change or an expiry moves exactly the declared set,
                         and never the photographer deliverable

Expected sets are read from the oracle only to compare against computed output.
No module under oncuex/ reads a fixture.

    python3 tools/check_core.py
"""

from __future__ import annotations

import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from oncuex import CommandError, Store  # noqa: E402
from oncuex.engine import evaluate, impact_of_change, impact_of_expiry  # noqa: E402
from oncuex.schema import FIELD_SCHEMA  # noqa: E402

SCENARIO = os.path.join(ROOT, "fixtures", "scenario.json")
ORACLE = os.path.join(ROOT, "fixtures", "expected-impact.json")

checks = 0
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}: {detail}")


def load():
    with open(SCENARIO, encoding="utf-8") as handle:
        scenario = json.load(handle)
    with open(ORACLE, encoding="utf-8") as handle:
        oracle = json.load(handle)
    return scenario, oracle


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for key, val in obj.items():
            out.update(flatten(val, f"{prefix}.{key}" if prefix else key))
    else:
        out[prefix] = obj
    return out


def project_for(scenario: dict, state_name: str, revision: int) -> dict:
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


def base_evidence(scenario: dict) -> list[dict]:
    wanted = {f"EV-{n}" for n in range(1, 8)}
    return [copy.deepcopy(e) for e in scenario["evidence"] if e["id"] in wanted]


def changed_fields(before: dict, after: dict) -> dict:
    now, want = flatten(before), flatten(after)
    changed = {}
    for path, value in want.items():
        if path == "assessmentRevision":
            continue
        if path in now and now[path] == value:
            continue
        changed[path] = {"from": now.get(path), "to": value}
    return changed


def sets(block: dict) -> tuple[set[str], set[str], set[str], set[str]]:
    return (
        set(block["impacted"]["requirementIds"]),
        set(block["impacted"]["evidenceIds"]),
        set(block["unaffected"]["requirementIds"]),
        set(block["unaffected"]["evidenceIds"]),
    )


def statuses(assessment: dict) -> dict[str, str]:
    return {r["requirementId"]: r["status"] for r in assessment["requirements"]}


def main() -> int:
    scenario, oracle = load()
    cases = {case["id"]: case for case in oracle["cases"]}
    requirements = copy.deepcopy(scenario["requirements"])
    evidence = base_evidence(scenario)

    # ------------------------------------------------------------ baseline
    baseline_store = Store(project_for(scenario, "baseline", 8), requirements, evidence)
    baseline = baseline_store.assess()
    check("baseline is ready for review", baseline["readiness"] == "ready_for_review",
          str(baseline["residualReasonCodes"]))
    check("no change means no impact block", "impact" not in baseline,
          str(baseline.get("impact")))

    # ------------------------------------------------------------ evidence type
    mistyped = copy.deepcopy(evidence)
    mistyped[0]["type"] = "confirmation"
    typed = evaluate(project_for(scenario, "baseline", 8),
                     copy.deepcopy(requirements), mistyped)
    check("evidence of the wrong type cannot support a requirement",
          statuses(typed)["REQ-venue-loading-1"] == "missing",
          statuses(typed).get("REQ-venue-loading-1"))

    # ------------------------------------------------------------ V5 impact
    changed = changed_fields(scenario["state"]["baseline"], scenario["state"]["venueChange"])
    change_store = Store(project_for(scenario, "baseline", 8),
                         copy.deepcopy(requirements), base_evidence(scenario))
    change_store.adopt_change(
        {"commandId": "CHG-1", "role": "project_manager", "expectedAssessmentRevision": 8},
        {"id": "CHG-1", "changedFields": changed},
    )
    after_change = change_store.assess()
    o2 = cases["O2"]
    impact = after_change.get("impact", {})
    check("venue change reports an impact block", bool(impact), "no impact in assessment")
    if impact:
        got = sets(impact)
        expected = sets({"impacted": o2["impacted"], "unaffected": o2["unaffected"]})
        check("venue change impacted requirements equal the oracle",
              got[0] == expected[0], f"{sorted(got[0])} != {sorted(expected[0])}")
        check("venue change impacted evidence equals the oracle",
              got[1] == expected[1], f"{sorted(got[1])} != {sorted(expected[1])}")
        check("venue change unaffected requirements equal the oracle",
              got[2] == expected[2], f"{sorted(got[2])} != {sorted(expected[2])}")
        check("venue change unaffected evidence equals the oracle",
              got[3] == expected[3], f"{sorted(got[3])} != {sorted(expected[3])}")
        check("photographer requirement is unaffected",
              "REQ-photographer-deliverables-1" in got[2])
        check("photographer evidence is unaffected", "EV-7" in got[3])

    status = statuses(after_change)
    check("photographer deliverable stays supported through the change",
          status["REQ-photographer-deliverables-1"] == "supported",
          status.get("REQ-photographer-deliverables-1"))
    check("venue change is not ready", after_change["readiness"] == "not_ready")

    # ------------------------------------------------------------ V9 impact
    expiry_store = Store(project_for(scenario, "baseline", 8),
                         copy.deepcopy(requirements), base_evidence(scenario))
    expiry_store.project["_now"] = "2027-03-08T00:00:00Z"
    for record in expiry_store.evidence:
        if record["id"] != "EV-1":
            record["expiresAt"] = "2027-03-20T00:00:00Z"
    after_expiry = expiry_store.assess()
    o6 = cases["O6"]["expected"]
    expiry_impact = after_expiry.get("impact", {})
    check("expiry reports an impact block", bool(expiry_impact), "no impact in assessment")
    if expiry_impact:
        got = sets(expiry_impact)
        expected = sets({"impacted": o6["impacted"], "unaffected": o6["unaffected"]})
        check("expiry impacted requirements equal the closure",
              got[0] == expected[0], f"{sorted(got[0])} != {sorted(expected[0])}")
        check("expiry impacted evidence equals the oracle",
              got[1] == expected[1], f"{sorted(got[1])} != {sorted(expected[1])}")
        check("expiry unaffected requirements equal the oracle",
              got[2] == expected[2], f"{sorted(got[2])} != {sorted(expected[2])}")
        check("expiry leaves the photographer unaffected",
              "REQ-photographer-deliverables-1" in got[2] and "EV-7" in got[3])
        check("expiry propagates to production",
              "REQ-production-runofshow-1" in got[0])

    expiry_status = statuses(after_expiry)
    check("expired loading evidence is outdated",
          expiry_status["REQ-venue-loading-1"] == "outdated",
          expiry_status.get("REQ-venue-loading-1"))
    check("crew arrival is blocked by the expired prerequisite",
          expiry_status["REQ-crew-arrival-1"] == "blocked",
          expiry_status.get("REQ-crew-arrival-1"))
    check("production run of show is blocked by the expired prerequisite",
          expiry_status["REQ-production-runofshow-1"] == "blocked",
          expiry_status.get("REQ-production-runofshow-1"))
    check("capacity is unaffected by expiry",
          expiry_status["REQ-venue-capacity-1"] == "supported",
          expiry_status.get("REQ-venue-capacity-1"))

    # ------------------------------------------------------------ pure functions
    computed = impact_of_change(set(changed), requirements, evidence)
    check("impact_of_change is independent of store state",
          sets(computed) == sets({"impacted": o2["impacted"], "unaffected": o2["unaffected"]}),
          "pure function disagrees with the store")
    no_expiry = impact_of_expiry(requirements, evidence, "2027-01-01T00:00:00Z")
    check("no expired evidence means no expiry impact", no_expiry is None, str(no_expiry))

    # ------------------------------------------------------------ V4 cycle boundary
    cyclic = copy.deepcopy(requirements)
    by_id = {req["id"]: req for req in cyclic}
    by_id["REQ-venue-loading-1"]["prerequisiteIds"] = ["REQ-crew-arrival-1"]
    try:
        assessment = evaluate(project_for(scenario, "baseline", 8), cyclic, evidence)
    except Exception as exc:  # a raise is the current failure mode
        check("a prerequisite cycle is reported, not raised", False,
              f"{type(exc).__name__}: {exc}")
        assessment = None
    if assessment is not None:
        cycle_status = statuses(assessment)
        check("cycle members are blocked", cycle_status["REQ-venue-loading-1"] == "blocked"
              and cycle_status["REQ-crew-arrival-1"] == "blocked",
              f"{cycle_status['REQ-venue-loading-1']}/{cycle_status['REQ-crew-arrival-1']}")
        residuals = next(r for r in assessment["requirements"]
                         if r["requirementId"] == "REQ-venue-loading-1")["residuals"]
        check("cycle residual names the path",
              any(r.get("code") == "prerequisite_cycle" and r.get("path")
                  for r in residuals), str(residuals))
        check("a dependent of a cycle is blocked",
              cycle_status["REQ-production-runofshow-1"] == "blocked",
              cycle_status["REQ-production-runofshow-1"])
        check("a cycle does not optimistically support any member",
              all(cycle_status[rid] != "supported"
                  for rid in ("REQ-venue-loading-1", "REQ-crew-arrival-1")))
        check("a cycle is not ready", assessment["readiness"] == "not_ready")
        check("a cycle fails dependency_closure",
              any(c["id"] == "dependency_closure" for c in assessment["integrated"]["checks"]),
              str([c["id"] for c in assessment["integrated"]["checks"]]))

    # ------------------------------------------------------------ unaffected stability
    before_photo = next(r for r in baseline["requirements"]
                        if r["requirementId"] == "REQ-photographer-deliverables-1")
    after_photo = next(r for r in after_change["requirements"]
                       if r["requirementId"] == "REQ-photographer-deliverables-1")
    check("photographer residual list is unchanged by the venue change",
          before_photo["residuals"] == after_photo["residuals"] == [],
          str(after_photo["residuals"]))

    print(f"{checks - len(failures)}/{checks} core checks passed")
    for failure in failures:
        print(f"  FAIL {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
