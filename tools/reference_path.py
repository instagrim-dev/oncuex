#!/usr/bin/env python3
"""Headless end-to-end path.

baseline -> venue change -> selective reopening -> evidenced recovery
         -> acceptance -> reload

Asserts the properties the contract cares about, then prints a short report.
Exit code 1 if any assertion fails.

    python3 tools/reference_path.py
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from oncuex import CommandError, Store  # noqa: E402
from oncuex.engine import digest  # noqa: E402

FIXTURES = os.path.join(ROOT, "fixtures")
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "ok  " if condition else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(label)


def load():
    scenario = json.load(open(os.path.join(FIXTURES, "scenario.json"), encoding="utf-8"))
    oracle = json.load(open(os.path.join(FIXTURES, "expected-impact.json"), encoding="utf-8"))
    return scenario, oracle


def fresh_store(scenario: dict, state_name: str = "baseline") -> Store:
    state = json.loads(json.dumps(scenario["state"][state_name]))
    state.pop("assessmentRevision", None)
    project = {
        **state,
        "id": scenario["scenario"]["id"],
        "brief": scenario["scenario"]["brief"],
        "circulationBuffer": scenario["scenario"]["brief"]["circulationBuffer"],
        "requirementSetVersion": scenario["scenario"]["requirementSetVersion"],
        "assessmentRevision": 1,
    }
    evidence = scenario["evidence"] if state_name != "venueChange" else [
        e for e in scenario["evidence"] if e["id"] in {
            "EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6", "EV-7"
        }
    ]
    evidence = [e for e in evidence if e["id"] not in {"EV-8","EV-9","EV-10","EV-11","EV-12","EV-13"}]
    return Store(project, scenario["requirements"], evidence)


def main() -> int:
    scenario, oracle = load()
    cases = {c["id"]: c for c in oracle["cases"]}

    # ---------------------------------------------------------------- baseline
    print("\n1. Baseline readiness")
    store = fresh_store(scenario)
    assessment = store.assess()
    check("baseline is ready for review", assessment["readiness"] == "ready_for_review",
          str(assessment["residualReasonCodes"]))
    check("baseline has no failing integrated checks",
          assessment["integrated"]["status"] == "pass",
          json.dumps(assessment["integrated"]["checks"]))

    # ---------------------------------------------------------------- accept
    print("\n2. Acceptance and immediate readback")
    before_revision = store.assessment_revision
    before_sequence = store.sequence
    result = store.record_decision({
        "commandId": "CMD-9", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-1", "expectedAssessmentRevision": before_revision,
    })
    check("decision does not advance the assessment revision",
          store.assessment_revision == before_revision,
          f"{before_revision} -> {store.assessment_revision}")
    check("decision advances the event sequence",
          store.sequence == before_sequence + 1, f"{store.sequence}")
    check("decision reads as current immediately after write",
          store.currentness("DEC-1") == "current")
    check("decision targets the assessed revision",
          store.latest_decision()["targetAssessmentRevision"] == before_revision)

    # ---------------------------------------------------------------- reload
    print("\n3. Reload")
    restored = reload_from_export(store)
    check("sequence survives reload", restored.sequence == store.sequence)
    check("assessment revision survives reload",
          restored.assessment_revision == store.assessment_revision)
    check("decision still current after reload", restored.currentness("DEC-1") == "current")

    # ---------------------------------------------------------------- change
    print("\n4. Venue change and selective reopening")
    before = set(
        r["requirementId"] for r in store.assess()["requirements"] if r["status"] == "supported"
    )
    target = json.loads(json.dumps(scenario["state"]["venueChange"]))
    target.pop("assessmentRevision", None)
    changed = diff_state(store.project, target)
    check("venue change touches the budget as well as the venue",
          "budget.commitments" in changed, str(sorted(changed)))
    store.adopt_change(
        {
            "commandId": "CMD-10", "actor": "PM-rowan", "role": "project_manager",
            "expectedAssessmentRevision": store.assessment_revision,
        },
        {"id": "CHG-1", "changedFields": changed},
    )
    after = store.assess()
    statuses = {r["requirementId"]: r["status"] for r in after["requirements"]}
    expected = cases["O2"]["requirementStatus"]
    check("venue-change statuses match the oracle", statuses == expected,
          json.dumps({k: v for k, v in statuses.items() if expected.get(k) != v}))
    check("photographer requirement stays supported",
          statuses["REQ-photographer-deliverables-1"] == "supported")
    check("exactly six integrated checks fail",
          len(after["integrated"]["checks"]) == 6,
          str([c["id"] for c in after["integrated"]["checks"]]))
    check("all six check ids present",
          {c["id"] for c in after["integrated"]["checks"]} == {
              "access_vs_arrival", "occupancy_vs_headcount", "runofshow_vs_hardstop",
              "total_cost", "attestation_current", "dependency_closure"})
    check("prior decision is now historical", store.currentness("DEC-1") == "historical")
    check("readiness is not_ready", after["readiness"] == "not_ready")

    reopened = set(
        r["requirementId"] for r in after["requirements"] if r["status"] != "supported"
    )
    check("six requirements reopened", len(reopened) == 6, str(sorted(reopened)))

    # ---------------------------------------------------------------- recovery
    print("\n5. Evidenced recovery")
    recovery = [
        "EV-8", "EV-9", "EV-10", "EV-11", "EV-12", "EV-13",
    ]
    by_id = {e["id"]: e for e in scenario["evidence"]}
    recovered = scenario["state"]["recovered"]
    rec_target = json.loads(json.dumps(recovered))
    rec_target.pop("assessmentRevision", None)
    for path, delta in diff_state(store.project, rec_target).items():
        store._set_path(path, delta["to"])
    for ev_id in recovery:
        store.attach_evidence(
            {"commandId": f"CMD-{ev_id}", "role": "project_manager",
             "expectedAssessmentRevision": store.assessment_revision},
            by_id[ev_id],
        )
    final = store.assess()
    check("recovered plan is ready for review",
          final["readiness"] == "ready_for_review",
          str(final["residualReasonCodes"]))
    check("recovered integrated checks pass", final["integrated"]["status"] == "pass")
    check("photographer evidence unchanged by recovery",
          next(e for e in store.evidence if e["id"] == "EV-7")["boundFieldVersions"]
          == by_id["EV-7"]["boundFieldVersions"])

    # ---------------------------------------------------------------- accept 2
    print("\n6. Second acceptance")
    revision_at_recovery = store.assessment_revision
    store.record_decision({
        "commandId": "CMD-17", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-2", "expectedAssessmentRevision": revision_at_recovery,
    })
    check("second decision is current", store.currentness("DEC-2") == "current")
    check("second decision targets the recovered revision",
          store.latest_decision()["targetAssessmentRevision"] == revision_at_recovery,
          str(revision_at_recovery))
    check("first decision remains historical", store.currentness("DEC-1") == "historical")
    check("recording the second decision did not advance the revision",
          store.assessment_revision == revision_at_recovery)

    # ---------------------------------------------------------------- guard rails
    print("\n7. Guard rails")
    try:
        store.record_decision({
            "commandId": "CMD-99", "actor": "CON-ana", "role": "contributor",
            "decisionId": "DEC-3", "expectedAssessmentRevision": store.assessment_revision,
        })
        check("contributor acceptance is rejected", False, "no error raised")
    except CommandError as exc:
        check("contributor acceptance is rejected", exc.code == "role_denied", exc.code)

    sequence_before = store.sequence
    revision_before = store.assessment_revision
    try:
        store.adopt_change(
            {"commandId": "CMD-50", "role": "project_manager",
             "expectedAssessmentRevision": revision_before - 1},
            {"id": "CHG-X", "changedFields": {"location.capacity": {"from": 140, "to": 141}}},
        )
        check("stale write is rejected", False, "no error raised")
    except CommandError as exc:
        check("stale write is rejected", exc.code == "conflict", exc.code)
    check("failed write changed no counter",
          (store.sequence, store.assessment_revision) == (sequence_before, revision_before))

    print("\n8. Export")
    export = store.export()
    check("export carries both counters",
          export["counters"]["sequence"] == store.sequence
          and export["counters"]["assessmentRevision"] == store.assessment_revision)
    check("export carries both decisions", len(export["decisions"]) == 2)
    check("export preserves the historical decision's target revision",
          next(d for d in export["decisions"] if d["id"] == "DEC-1")["targetAssessmentRevision"]
          < next(d for d in export["decisions"] if d["id"] == "DEC-2")["targetAssessmentRevision"])

    print()
    if failures:
        print(f"{len(failures)} check(s) failed:")
        for name in failures:
            print(f"  - {name}")
        return 1
    print("All checks passed.")
    return 0


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for key, val in obj.items():
            out.update(flatten(val, f"{prefix}.{key}" if prefix else key))
    else:
        out[prefix] = obj
    return out


def diff_state(current: dict, target: dict) -> dict:
    """Field-level diff, using the shape the command layer expects."""
    now, want = flatten(current), flatten(target)
    changed = {}
    for path, value in want.items():
        if path in now and now[path] == value:
            continue
        changed[path] = {"from": now.get(path), "to": value}
    return changed


def reload_from_export(store: Store) -> Store:
    export = store.export()
    project = export["project"]
    revision = export["counters"]["assessmentRevision"]
    rebuilt = Store(project, export["requirements"], export["evidence"])
    rebuilt.sequence = export["counters"]["sequence"]
    rebuilt.assessment_revision = revision
    rebuilt.events = export["events"]
    rebuilt._decisions = {d["id"]: d for d in export["decisions"]}
    return rebuilt


if __name__ == "__main__":
    sys.exit(main())
