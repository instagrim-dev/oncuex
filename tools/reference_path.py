#!/usr/bin/env python3
"""Headless end-to-end path through the public command service.

brief adopted -> seven evidence records -> acceptance -> venue change
-> recovered plan adopted as a change -> six evidence records
-> acceptance -> export -> reload

Every state change goes through a command. The final revision is a consequence
of the event sequence, not a fixture constant: 8 assessed facts at baseline,
10 after the two changes, 16 after recovery evidence.

    python3 tools/reference_path.py
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from oncuex import CommandError, Store  # noqa: E402

FIXTURES = os.path.join(ROOT, "fixtures")
failures: list[str] = []

BASELINE_EVIDENCE = ["EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6", "EV-7"]
RECOVERY_EVIDENCE = ["EV-8", "EV-9", "EV-10", "EV-11", "EV-12", "EV-13"]


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "ok  " if condition else "FAIL"
    print(f"  [{mark}] {label}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(label)


def load():
    with open(os.path.join(FIXTURES, "scenario.json"), encoding="utf-8") as handle:
        scenario = json.load(handle)
    with open(os.path.join(FIXTURES, "expected-impact.json"), encoding="utf-8") as handle:
        oracle = json.load(handle)
    return scenario, oracle


def initial_store(scenario: dict) -> Store:
    """Baseline plan before any event: revision 0, no evidence, no brief."""
    state = json.loads(json.dumps(scenario["state"]["baseline"]))
    state.pop("assessmentRevision", None)
    project = {
        **state,
        "id": scenario["scenario"]["id"],
        "brief": {},
        "circulationBuffer": scenario["scenario"]["brief"]["circulationBuffer"],
        "requirementSetVersion": scenario["scenario"]["requirementSetVersion"],
        "assessmentRevision": 0,
    }
    return Store(project, scenario["requirements"], [])


def command(command_id: str, expected: int, **extra) -> dict:
    return {
        "commandId": command_id,
        "role": "project_manager",
        "expectedAssessmentRevision": expected,
        **extra,
    }


def statuses(assessment: dict) -> dict[str, str]:
    return {r["requirementId"]: r["status"] for r in assessment["requirements"]}


def main() -> int:
    scenario, oracle = load()
    cases = {case["id"]: case for case in oracle["cases"]}
    by_id = {e["id"]: e for e in scenario["evidence"]}
    store = initial_store(scenario)

    # ---------------------------------------------------------------- baseline
    print("\n1. Brief and baseline evidence through commands")
    store.adopt_brief(command("CMD-1", 0), scenario["scenario"]["brief"])
    check("brief adoption is the first assessed event",
          store.assessment_revision == 1, str(store.assessment_revision))
    for offset, ev_id in enumerate(BASELINE_EVIDENCE, start=2):
        store.attach_evidence(command(f"CMD-{offset}", store.assessment_revision), by_id[ev_id])
    check("seven evidence attachments reach revision 8",
          store.assessment_revision == 8, str(store.assessment_revision))
    check("the event log holds eight events",
          store.sequence == 8, str(store.sequence))

    assessment = store.assess()
    check("baseline is ready for review", assessment["readiness"] == "ready_for_review",
          str(assessment["residualReasonCodes"]))
    check("baseline has no failing integrated checks",
          assessment["integrated"]["status"] == "pass",
          json.dumps(assessment["integrated"]["checks"]))

    # ---------------------------------------------------------------- accept
    print("\n2. Acceptance and immediate readback")
    store.record_decision(command("CMD-9", 8, actor="PM-rowan", decisionId="DEC-1"))
    check("decision leaves the assessment revision at 8",
          store.assessment_revision == 8, str(store.assessment_revision))
    check("decision advances the event sequence to 9",
          store.sequence == 9, str(store.sequence))
    check("decision reads as current immediately after write",
          store.currentness("DEC-1") == "current")
    check("decision targets the assessed revision",
          store.latest_decision()["targetAssessmentRevision"] == 8)

    # ---------------------------------------------------------------- reload
    print("\n3. Reload after acceptance")
    restored = reload_from_export(store)
    check("sequence survives reload", restored.sequence == 9, str(restored.sequence))
    check("assessment revision survives reload",
          restored.assessment_revision == 8, str(restored.assessment_revision))
    check("decision still current after reload", restored.currentness("DEC-1") == "current")

    # ---------------------------------------------------------------- change
    print("\n4. Venue change and selective reopening")
    target = json.loads(json.dumps(scenario["state"]["venueChange"]))
    target.pop("assessmentRevision", None)
    changed = diff_state(store.project, target)
    check("venue change touches the budget as well as the venue",
          "budget.commitments" in changed, str(sorted(changed)))
    store.adopt_change(command("CMD-10", 8), {"id": "CHG-1", "changedFields": changed})
    reset = store.assess()
    got = statuses(reset)
    expected = cases["O2"]["requirementStatus"]
    check("venue-change statuses match the oracle", got == expected,
          json.dumps({k: v for k, v in got.items() if expected.get(k) != v}))
    check("photographer requirement stays supported",
          got["REQ-photographer-deliverables-1"] == "supported")
    check("exactly six integrated checks fail",
          len(reset["integrated"]["checks"]) == 6,
          str([c["id"] for c in reset["integrated"]["checks"]]))
    check("prior decision is now historical", store.currentness("DEC-1") == "historical")
    check("readiness is not_ready", reset["readiness"] == "not_ready")

    reopened = {rid for rid, status in got.items() if status != "supported"}
    check("six requirements reopened", len(reopened) == 6, str(sorted(reopened)))

    impact = reset.get("impact", {})
    check("the change reports an impact block", bool(impact))
    check("impacted requirements equal the oracle",
          set(impact.get("impacted", {}).get("requirementIds", []))
          == set(cases["O2"]["impacted"]["requirementIds"]),
          str(impact.get("impacted")))
    check("impacted evidence equals the oracle",
          set(impact.get("impacted", {}).get("evidenceIds", []))
          == set(cases["O2"]["impacted"]["evidenceIds"]),
          str(impact.get("impacted")))
    check("unaffected evidence is exactly the photographer's",
          set(impact.get("unaffected", {}).get("evidenceIds", []))
          == set(cases["O2"]["unaffected"]["evidenceIds"]),
          str(impact.get("unaffected")))

    # ---------------------------------------------------------------- recovery
    print("\n5. Recovered plan adopted as a change")
    recovered = json.loads(json.dumps(scenario["state"]["recovered"]))
    recovered.pop("assessmentRevision", None)
    recovery_change = diff_state(store.project, recovered)
    check("recovery touches the venue plan and the budget",
          {"location.capacity", "budget.commitments"} <= set(recovery_change),
          str(sorted(recovery_change)))
    store.adopt_change(command("CMD-11", 9), {"id": "CHG-2", "changedFields": recovery_change})
    check("recovery is one assessed change", store.assessment_revision == 10,
          str(store.assessment_revision))

    for offset, ev_id in enumerate(RECOVERY_EVIDENCE, start=12):
        store.attach_evidence(command(f"CMD-{offset}", store.assessment_revision), by_id[ev_id])
    check("six recovery records reach revision 16",
          store.assessment_revision == 16, str(store.assessment_revision))
    check("recovery events reach sequence 17", store.sequence == 17, str(store.sequence))

    final = store.assess()
    check("recovered plan is ready for review", final["readiness"] == "ready_for_review",
          str(final["residualReasonCodes"]))
    check("recovered statuses match O4",
          statuses(final) == cases["O4"]["requirementStatus"],
          json.dumps({k: v for k, v in statuses(final).items()
                      if cases["O4"]["requirementStatus"].get(k) != v}))
    check("recovered integrated checks pass", final["integrated"]["status"] == "pass")
    check("photographer evidence unchanged by recovery",
          next(e for e in store.evidence if e["id"] == "EV-7")["boundFieldVersions"]
          == by_id["EV-7"]["boundFieldVersions"])

    # ---------------------------------------------------------------- accept 2
    print("\n6. Second acceptance")
    store.record_decision(command("CMD-18", 16, actor="PM-rowan", decisionId="DEC-2"))
    check("second decision leaves the revision at 16",
          store.assessment_revision == 16, str(store.assessment_revision))
    check("second decision advances the sequence to 18", store.sequence == 18,
          str(store.sequence))
    check("final revision equals the oracle's recovered revision",
          store.assessment_revision == cases["O4"]["assessmentRevision"],
          f"{store.assessment_revision} vs {cases['O4']['assessmentRevision']}")
    check("final sequence equals the oracle's last event",
          store.sequence == cases["O11"]["expected"]["eventSequence"],
          f"{store.sequence} vs {cases['O11']['expected']['eventSequence']}")
    check("second decision is current", store.currentness("DEC-2") == "current")
    check("first decision remains historical", store.currentness("DEC-1") == "historical")
    check("history retains both target revisions",
          [d["targetAssessmentRevision"] for d in store.export()["decisions"]] == [8, 16],
          str([d["targetAssessmentRevision"] for d in store.export()["decisions"]]))

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
    record_before = json.dumps(store.export(), sort_keys=True)
    try:
        store.adopt_change(
            command("CMD-50", revision_before - 1),
            {"id": "CHG-X", "changedFields": {"location.capacity": {"from": 140, "to": 141}}},
        )
        check("stale write is rejected", False, "no error raised")
    except CommandError as exc:
        check("stale write is rejected", exc.code == "conflict", exc.code)
    check("failed write changed no counter",
          (store.sequence, store.assessment_revision) == (sequence_before, revision_before))
    check("failed write left the record byte-identical",
          json.dumps(store.export(), sort_keys=True) == record_before)
    check("failed write did not move the venue capacity",
          store.snapshot()["location"]["capacity"] == 140,
          str(store.snapshot()["location"]["capacity"]))

    # ---------------------------------------------------------------- export
    print("\n8. Export and full reload")
    export = store.export()
    assessment_before = store.assess()
    check("export carries both counters",
          export["counters"]["sequence"] == 18
          and export["counters"]["assessmentRevision"] == 16,
          str(export["counters"]))
    check("export carries both decisions", len(export["decisions"]) == 2)

    restored = reload_from_export(store)
    check("export round-trips byte-identically",
          json.dumps(restored.export(), sort_keys=True) == json.dumps(export, sort_keys=True))
    check("assessment after reload equals the pre-reload assessment",
          restored.assess() == assessment_before,
          "assessment changed across reload")
    check("reloaded decision is current", restored.currentness("DEC-2") == "current")
    check("reloaded history keeps the earlier decision historical",
          restored.currentness("DEC-1") == "historical")
    check("reloaded record still carries the impact",
          restored.assess().get("impact") == assessment_before.get("impact"))
    check("reloaded evidence keeps every review disposition",
          restored.evidence == store.evidence
          and all(e["reviewDisposition"] == "accepted" for e in restored.evidence),
          "evidence changed across reload")
    check("reloaded evidence keeps its declared types",
          all(e["type"] == "document" for e in restored.evidence),
          str(sorted({e["type"] for e in restored.evidence})))

    replay_sequence = restored.sequence
    replay = restored.record_decision(
        command("CMD-18", 16, actor="PM-rowan", decisionId="DEC-2"))
    check("a retried acceptance after reload returns the stored result",
          replay.get("decisionId") == "DEC-2", str(replay))
    check("a retried acceptance after reload appends nothing",
          restored.sequence == replay_sequence, str(restored.sequence))
    check("a retried acceptance after reload adds no decision",
          len(restored.export()["decisions"]) == 2,
          str(len(restored.export()["decisions"])))

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
    """Field-level diff, using the shape the change command expects."""
    now, want = flatten(current), flatten(target)
    changed = {}
    for path, value in want.items():
        if path in now and now[path] == value:
            continue
        changed[path] = {"from": now.get(path), "to": value}
    return changed


def reload_from_export(store: Store) -> Store:
    return Store.from_export(store.export())


if __name__ == "__main__":
    sys.exit(main())
