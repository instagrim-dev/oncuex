#!/usr/bin/env python3
"""Differential test: the engine must reproduce every oracle case.

Builds each scenario state directly, evaluates it, and compares against
fixtures/expected-impact.json. Also exercises the defect classes that the
contract review identified, so a regression reintroduces a failure.

    python3 tools/check_oracle.py
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
checks = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}: {detail}")


def project_for(scenario: dict, state_name: str, revision: int) -> dict:
    state = json.loads(json.dumps(scenario["state"][state_name]))
    state.pop("assessmentRevision", None)
    state.update({
        "id": scenario["scenario"]["id"],
        "brief": scenario["scenario"]["brief"],
        "circulationBuffer": scenario["scenario"]["brief"]["circulationBuffer"],
        "requirementSetVersion": scenario["scenario"]["requirementSetVersion"],
        "assessmentRevision": revision,
    })
    return state


def evidence_for(scenario: dict, ids: set[str]) -> list[dict]:
    return [e for e in scenario["evidence"] if e["id"] in ids]


def statuses(assessment: dict) -> dict[str, str]:
    return {r["requirementId"]: r["status"] for r in assessment["requirements"]}


def main() -> int:
    scenario = json.load(open(os.path.join(FIXTURES, "scenario.json"), encoding="utf-8"))
    oracle = json.load(open(os.path.join(FIXTURES, "expected-impact.json"), encoding="utf-8"))
    cases = {c["id"]: c for c in oracle["cases"]}

    all_base = {f"EV-{n}" for n in range(1, 8)}
    all_recovery = {f"EV-{n}" for n in range(8, 14)}

    # ------------------------------------------------------------ O1 baseline
    store = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    got = store.assess()
    check("O1 statuses", statuses(got) == cases["O1"]["requirementStatus"],
          json.dumps({k: v for k, v in statuses(got).items()
                      if cases["O1"]["requirementStatus"].get(k) != v}))
    check("O1 integrated pass", got["integrated"]["status"] == "pass",
          str(got["integrated"]["checks"]))
    check("O1 ready", got["readiness"] == cases["O1"]["readiness"], got["readiness"])

    # ------------------------------------------------------------ O2 change
    changed_store = Store(
        project_for(scenario, "venueChange", 9),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    got2 = changed_store.assess()
    check("O2 statuses", statuses(got2) == cases["O2"]["requirementStatus"],
          json.dumps({k: v for k, v in statuses(got2).items()
                      if cases["O2"]["requirementStatus"].get(k) != v}))
    expected_failing = {c["id"] for c in cases["O2"]["integrated"]["failingChecks"]}
    actual_failing = {c["id"] for c in got2["integrated"]["checks"]}
    check("O2 failing checks", actual_failing == expected_failing,
          f"missing={sorted(expected_failing - actual_failing)} "
          f"extra={sorted(actual_failing - expected_failing)}")
    check("O2 photographer preserved",
          statuses(got2)["REQ-photographer-deliverables-1"] == "supported")
    check("O2 not ready", got2["readiness"] == "not_ready")

    # ------------------------------------------------------------ O4 recovery
    recovery_store = Store(
        project_for(scenario, "recovered", 16),
        scenario["requirements"],
        evidence_for(scenario, all_base | all_recovery),
    )
    got4 = recovery_store.assess()
    check("O4 statuses", statuses(got4) == cases["O4"]["requirementStatus"],
          json.dumps({k: v for k, v in statuses(got4).items()
                      if cases["O4"]["requirementStatus"].get(k) != v}))
    check("O4 integrated pass", got4["integrated"]["status"] == "pass",
          str(got4["integrated"]["checks"]))
    check("O4 ready", got4["readiness"] == "ready_for_review", got4["readiness"])

    # ------------------------------------------------------------ O6 expiry
    expiring = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    # Advance the clock past EV-1's expiry instead of writing an expiry that
    # precedes its own observation. Unrelated evidence keeps a later expiry so
    # the case still isolates EV-1.
    expiring.project["_now"] = "2027-03-08T00:00:00Z"
    for ev in expiring.evidence:
        if ev["id"] != "EV-1":
            ev["expiresAt"] = "2027-03-20T00:00:00Z"
    got6 = expiring.assess()
    expected6 = cases["O6"]["expected"]
    check("O6 statuses", statuses(got6) == expected6["requirementStatus"],
          json.dumps({k: v for k, v in statuses(got6).items()
                      if expected6["requirementStatus"].get(k) != v}))
    check("O6 run-of-show dependent blocked",
          statuses(got6)["REQ-production-runofshow-1"] == "blocked",
          statuses(got6)["REQ-production-runofshow-1"])
    check("O6 not ready", got6["readiness"] == "not_ready")

    # ------------------------------------------------------------ O8 missing
    missing = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base - {"EV-2"}),
    )
    got8 = missing.assess()
    check("O8 capacity missing", statuses(got8)["REQ-venue-capacity-1"] == "missing",
          statuses(got8)["REQ-venue-capacity-1"])
    check("O8 not ready", got8["readiness"] == "not_ready")

    # ------------------------------------------------------------ O9/O10 decision
    accepting = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    before = accepting.assessment_revision
    accepting.record_decision({
        "commandId": "CMD-9", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-1", "expectedAssessmentRevision": before,
    })
    check("O9 revision unchanged", accepting.assessment_revision == 8,
          str(accepting.assessment_revision))
    check("O9 sequence advanced", accepting.sequence == 1, str(accepting.sequence))
    check("O9 current", accepting.currentness("DEC-1") == "current",
          accepting.currentness("DEC-1"))

    # ------------------------------------------------------------ O11 supersede
    recovering = Store(
        project_for(scenario, "recovered", 16),
        scenario["requirements"],
        evidence_for(scenario, all_base | all_recovery),
    )
    recovering.record_decision({
        "commandId": "CMD-17", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-2", "expectedAssessmentRevision": 16,
    })
    check("O11 current", recovering.currentness("DEC-2") == "current")
    check("O11 targets recovered revision",
          recovering.latest_decision()["targetAssessmentRevision"] == 16)

    # ------------------------------------------------------------ defect classes
    # a stale record must not veto a requirement that current evidence supports
    superseded = Store(
        project_for(scenario, "recovered", 16),
        scenario["requirements"],
        evidence_for(scenario, all_base | all_recovery),
    )
    got_sup = superseded.assess()
    check("regression: stale EV-1 does not block recovery",
          statuses(got_sup)["REQ-venue-loading-1"] == "supported",
          statuses(got_sup)["REQ-venue-loading-1"])

    # a wrong-typed binding must not match
    from oncuex.engine import binding_matches

    snapshot = project_for(scenario, "baseline", 8)
    check("regression: string binding cannot match an integer field",
          not binding_matches("location.capacity", "150", snapshot))
    check("regression: correct integer binding matches",
          binding_matches("location.capacity", 150, snapshot))

    # an undeclared binding path must be rejected
    from oncuex.engine import SchemaError, validate_snapshot

    bad = json.loads(json.dumps(scenario["requirements"]))
    bad[3]["fieldBindings"] = ["production.runOfShow"]
    try:
        validate_snapshot(snapshot, bad, evidence_for(scenario, all_base))
        check("regression: phantom binding path rejected", False, "no error")
    except SchemaError:
        check("regression: phantom binding path rejected", True)

    # contributor cannot accept
    guarded = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    try:
        guarded.record_decision({
            "commandId": "CMD-X", "actor": "CON-ana", "role": "contributor",
            "decisionId": "DEC-X", "expectedAssessmentRevision": 8,
        })
        check("regression: contributor rejected", False, "no error")
    except CommandError as exc:
        check("regression: contributor rejected", exc.code == "role_denied", exc.code)

    # duplicate command id is idempotent
    replay = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    command = {
        "commandId": "CMD-R", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-R", "expectedAssessmentRevision": 8,
    }
    replay.record_decision(dict(command))
    seq_after_first = replay.sequence
    replay.record_decision(dict(command))
    check("regression: replay appends nothing", replay.sequence == seq_after_first,
          f"{seq_after_first} -> {replay.sequence}")

    # ------------------------------------------------------------ honesty regressions
    # A rejected command must not mutate the record it refused to write.
    frozen = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    frozen_record = json.dumps(frozen.export(), sort_keys=True)
    stale_attempts = (
        ("change", lambda: frozen.adopt_change(
            {"commandId": "CMD-S1", "role": "project_manager",
             "expectedAssessmentRevision": 7},
            {"id": "CHG-S1", "changedFields": {"location.capacity": {"from": 150, "to": 999}}})),
        ("evidence", lambda: frozen.attach_evidence(
            {"commandId": "CMD-S2", "role": "project_manager",
             "expectedAssessmentRevision": 7},
            scenario["evidence"][7])),
        ("brief", lambda: frozen.adopt_brief(
            {"commandId": "CMD-S3", "role": "project_manager",
             "expectedAssessmentRevision": 7},
            {**scenario["scenario"]["brief"], "client": "MUTATED"})),
    )
    for label, attempt in stale_attempts:
        try:
            attempt()
            check(f"regression: stale {label} rejected", False, "no error")
        except CommandError as exc:
            check(f"regression: stale {label} rejected", exc.code == "conflict", exc.code)
    check("regression: rejected commands leave the record byte-identical",
          json.dumps(frozen.export(), sort_keys=True) == frozen_record)
    check("regression: rejected change did not move the venue capacity",
          frozen.snapshot()["location"]["capacity"] == 150,
          str(frozen.snapshot()["location"]["capacity"]))

    # expiry must be visible to decision currentness, not only to readiness
    expiring_decision = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    expiring_decision.record_decision({
        "commandId": "CMD-E", "actor": "PM-rowan", "role": "project_manager",
        "decisionId": "DEC-E", "expectedAssessmentRevision": 8,
    })
    check("regression: decision reads current before expiry",
          expiring_decision.currentness("DEC-E") == "current")
    expiring_decision.project["_now"] = "2027-03-08T00:00:00Z"
    check("regression: expired evidence cannot leave a decision current",
          expiring_decision.currentness("DEC-E") == "historical",
          expiring_decision.currentness("DEC-E"))

    # the latest decision is the last recorded, not the highest identifier
    ordered = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    for decision_id in ("DEC-1", "DEC-2", "DEC-10"):
        ordered.record_decision({
            "commandId": f"CMD-{decision_id}", "actor": "PM-rowan",
            "role": "project_manager", "decisionId": decision_id,
            "expectedAssessmentRevision": 8,
        })
    check("regression: latest decision is the last recorded, not the highest id",
          ordered.latest_decision()["id"] == "DEC-10",
          ordered.latest_decision()["id"])

    # a change may not invent a field in the schema
    phantom = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    phantom_before = json.dumps(phantom.export(), sort_keys=True)
    try:
        phantom.adopt_change(
            {"commandId": "CMD-PH", "role": "project_manager",
             "expectedAssessmentRevision": 8},
            {"id": "CHG-PH",
             "changedFields": {"location.inventedField": {"from": None, "to": "x"}}})
        check("regression: undeclared change path rejected", False, "no error")
    except CommandError as exc:
        check("regression: undeclared change path rejected",
              exc.code == "undeclared_path", exc.code)
    check("regression: rejected phantom path left the record byte-identical",
          json.dumps(phantom.export(), sort_keys=True) == phantom_before)
    check("regression: rejected phantom path created no field",
          phantom_before == json.dumps(phantom.export(), sort_keys=True))

    # a change may not rewrite the counter that governs currentness
    forged = Store(
        project_for(scenario, "baseline", 8),
        scenario["requirements"],
        evidence_for(scenario, all_base),
    )
    forged_before = json.dumps(forged.export(), sort_keys=True)
    try:
        forged.adopt_change(
            {"commandId": "CMD-FG", "role": "project_manager",
             "expectedAssessmentRevision": 8},
            {"id": "CHG-FG", "changedFields": {"assessmentRevision": {"from": 8, "to": 1}}})
        check("regression: counter rewrite rejected", False, "no error")
    except CommandError as exc:
        check("regression: counter rewrite rejected",
              exc.code == "immutable_path", exc.code)
    check("regression: rejected counter rewrite left the revision at 8",
          forged.assessment_revision == 8, str(forged.assessment_revision))
    check("regression: rejected counter rewrite appended no event",
          json.dumps(forged.export(), sort_keys=True) == forged_before)

    print(f"{checks - len(failures)}/{checks} checks passed")
    for failure in failures:
        print(f"  FAIL {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
