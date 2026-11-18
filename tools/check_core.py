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

    # ------------------------------------------------------------ evidence review
    review_store = Store(project_for(scenario, "baseline", 8),
                         copy.deepcopy(requirements), base_evidence(scenario))
    review_store.review_evidence(command("CMD-R1", 8), "EV-1", "pending")
    review_check = review_store.assess()
    check("a withdrawn review withdraws support",
          statuses(review_check)["REQ-venue-loading-1"] == "missing",
          statuses(review_check).get("REQ-venue-loading-1"))
    check("a changed disposition increments the assessed revision",
          review_store.assessment_revision == 9, str(review_store.assessment_revision))

    sequence_before = review_store.sequence
    review_store.review_evidence(command("CMD-R2", 9), "EV-1", "pending")
    check("an unchanged disposition advances only the sequence",
          review_store.assessment_revision == 9
          and review_store.sequence == sequence_before + 1,
          f"rev={review_store.assessment_revision} seq={review_store.sequence}")

    review_store.review_evidence(command("CMD-R3", 9), "EV-1", "accepted")
    check("re-accepting the record restores support",
          statuses(review_store.assess())["REQ-venue-loading-1"] == "supported"
          and review_store.assessment_revision == 10,
          statuses(review_store.assess()).get("REQ-venue-loading-1"))

    # ------------------------------------------------------------ reload idempotency
    replay_store = Store(project_for(scenario, "baseline", 8),
                         copy.deepcopy(requirements), base_evidence(scenario))
    decision_command = command("CMD-RL", 8, actor="PM-rowan", decisionId="DEC-9")
    replay_store.record_decision(copy.deepcopy(decision_command))
    restored_store = Store.from_export(replay_store.export())
    sequence_before = restored_store.sequence
    replay_result = restored_store.record_decision(copy.deepcopy(decision_command))
    check("a command replayed after reload returns the stored result",
          replay_result.get("decisionId") == "DEC-9", str(replay_result))
    check("a command replayed after reload appends nothing",
          restored_store.sequence == sequence_before, str(restored_store.sequence))
    check("a command replayed after reload keeps one decision",
          len(restored_store.export()["decisions"]) == 1)

    # ------------------------------------------------------------ scope change
    scope_store = Store(project_for(scenario, "baseline", 8),
                        copy.deepcopy(requirements), base_evidence(scenario))
    scope_store.record_decision(command("CMD-S1", 8, actor="PM-rowan", decisionId="DEC-S"))
    trimmed_requirements = [copy.deepcopy(r) for r in requirements
                            if r["id"] != "REQ-photographer-deliverables-1"]
    trimmed_evidence = [copy.deepcopy(e) for e in evidence if e["id"] != "EV-7"]
    scope_store.change_requirement_set(
        command("CMD-S2", 8), trimmed_requirements, trimmed_evidence)
    check("scope change increments the requirement set version",
          scope_store.project["requirementSetVersion"] == 2,
          str(scope_store.project["requirementSetVersion"]))
    check("scope change keeps the prior decision as history",
          scope_store.currentness("DEC-S") == "historical")
    check("scope change explains why acceptance is closed",
          scope_store.eligibility()["reasons"] == ["requirement_set_changed"],
          str(scope_store.eligibility()["reasons"]))
    check("scope change preserves the earlier decision's target revision",
          scope_store.latest_decision()["targetAssessmentRevision"] == 8)
    check("the trimmed set is still ready for review",
          scope_store.assess()["readiness"] == "ready_for_review",
          str(scope_store.assess()["residualReasonCodes"]))

    stale_scope = Store(project_for(scenario, "baseline", 8),
                        copy.deepcopy(requirements), base_evidence(scenario))
    record_before = json.dumps(stale_scope.export(), sort_keys=True)
    try:
        stale_scope.change_requirement_set(
            command("CMD-S3", 8), trimmed_requirements, copy.deepcopy(evidence))
        check("scope change rejects evidence for a removed requirement", False, "no error")
    except CommandError as exc:
        check("scope change rejects evidence for a removed requirement",
              exc.code == "invalid_evidence", exc.code)
    check("rejected scope change leaves the record byte-identical",
          json.dumps(stale_scope.export(), sort_keys=True) == record_before)

    added_store = Store(project_for(scenario, "baseline", 8),
                        copy.deepcopy(requirements), base_evidence(scenario))
    added_store.record_decision(command("CMD-A1", 8, actor="PM-rowan", decisionId="DEC-A"))
    extended = copy.deepcopy(requirements)
    extended.append({
        "id": "REQ-logistics-1",
        "version": 1,
        "milestoneId": "MS-1",
        "owner": "CON-ana",
        "label": "Freight logistics confirm the dock booking",
        "predicateType": "evidence_present",
        "expectedValues": {},
        "prerequisiteIds": [],
        "requiredEvidenceType": "document",
        "expiryPolicy": {"mode": "absolute", "value": "2027-03-07T00:00:00Z"},
        "blocking": True,
        "fieldBindings": ["location.venueId"],
    })
    added_store.change_requirement_set(
        command("CMD-A2", 8), extended, copy.deepcopy(evidence))
    added_status = statuses(added_store.assess())
    check("an added requirement without evidence is missing",
          added_status.get("REQ-logistics-1") == "missing",
          str(added_status.get("REQ-logistics-1")))
    check("an added requirement closes readiness",
          added_store.assess()["readiness"] == "not_ready")
    check("adding scope keeps the prior decision historical",
          added_store.currentness("DEC-A") == "historical")
    check("adding scope still reports the changed requirement set",
          "requirement_set_changed" in added_store.eligibility()["reasons"],
          str(added_store.eligibility()["reasons"]))

    # ------------------------------------------------------------ revert lineage
    lineage_store = Store(project_for(scenario, "baseline", 8),
                          copy.deepcopy(requirements), base_evidence(scenario))
    lineage_store.record_decision(command("CMD-L1", 8, actor="PM-rowan", decisionId="DEC-L"))
    venue_target = copy.deepcopy(scenario["state"]["venueChange"])
    venue_target.pop("assessmentRevision", None)
    lineage_store.adopt_change(command("CMD-L2", 8), {
        "id": "CHG-L1",
        "changedFields": changed_fields(scenario["state"]["baseline"], venue_target),
    })
    venue_status = lineage_store.decision_status("DEC-L")
    check("a venue change returns the decision as historical",
          venue_status["currentness"] == "historical")
    check("a venue change is explained as a stale decision",
          venue_status["residualReasonCodes"] == ["stale_decision"],
          str(venue_status["residualReasonCodes"]))
    check("venue-change eligibility matches the oracle",
          set(lineage_store.eligibility()["reasons"])
          == set(cases["O2"]["decisionEligibility"]["reasons"]),
          str(lineage_store.eligibility()["reasons"]))

    baseline_target = copy.deepcopy(scenario["state"]["baseline"])
    baseline_target.pop("assessmentRevision", None)
    lineage_store.adopt_change(command("CMD-L3", 9), {
        "id": "CHG-L2",
        "changedFields": changed_fields(venue_target, baseline_target),
    })
    check("revert restores readiness", lineage_store.assess()["readiness"] == "ready_for_review",
          str(lineage_store.assess()["residualReasonCodes"]))
    check("revert does not revive the acceptance",
          lineage_store.currentness("DEC-L") == "historical")
    revert_eligibility = lineage_store.eligibility()
    check("revert is explained by revision lineage",
          revert_eligibility["reasons"] == ["revision_lineage_changed"]
          and revert_eligibility["eligible"] is False,
          str(revert_eligibility))
    check("a reverted state reports lineage, not staleness",
          lineage_store.decision_status("DEC-L")["residualReasonCodes"]
          == ["revision_lineage_changed"],
          str(lineage_store.decision_status("DEC-L")))

    # ------------------------------------------------------------ expiry eligibility
    expiry_decision = Store(project_for(scenario, "baseline", 8),
                            copy.deepcopy(requirements), base_evidence(scenario))
    expiry_decision.record_decision(command("CMD-X1", 8, actor="PM-rowan", decisionId="DEC-X"))
    expiry_decision.project["_now"] = "2027-03-08T00:00:00Z"
    for record in expiry_decision.evidence:
        if record["id"] != "EV-1":
            record["expiresAt"] = "2027-03-20T00:00:00Z"
    check("expiry makes the prior acceptance historical",
          expiry_decision.currentness("DEC-X") == "historical")
    check("expiry is explained by expired evidence, not lineage",
          expiry_decision.decision_status("DEC-X")["residualReasonCodes"]
          == ["mandatory_evidence_expired"],
          str(expiry_decision.decision_status("DEC-X")))
    check("expiry does not move the assessment revision",
          expiry_decision.assessment_revision == 8,
          str(expiry_decision.assessment_revision))
    expiry_eligibility = expiry_decision.eligibility()
    check("expiry eligibility matches the oracle",
          set(expiry_eligibility["reasons"])
          == set(cases["O6"]["expected"]["decisionEligibility"]["reasons"]),
          str(expiry_eligibility["reasons"]))
    check("expiry closes acceptance", expiry_eligibility["eligible"] is False)

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

    # ------------------------------------------------------------ archived evidence
    archive_store = Store(project_for(scenario, "baseline", 8),
                          copy.deepcopy(requirements), base_evidence(scenario))
    archive_store.record_decision(command("CMD-AR1", 8, actor="PM-rowan", decisionId="DEC-8"))
    trimmed_evidence = [copy.deepcopy(e) for e in evidence if e["id"] != "EV-7"]
    archive_store.change_requirement_set(
        command("CMD-AR2", 8), trimmed_requirements, trimmed_evidence)
    check("withdrawn evidence is archived", len(archive_store.archived_evidence) == 1,
          str(len(archive_store.archived_evidence)))
    entry = archive_store.archived_evidence[0]
    check("the archive keeps the record, its sequence and the reason",
          entry["evidence"]["id"] == "EV-7"
          and entry["archivedAtSequence"] == 2
          and entry["archiveReason"] == "requirement_set_changed"
          and entry["requirementSetVersion"] == 2,
          json.dumps({k: v for k, v in entry.items() if k != "evidence"}))
    check("archived evidence leaves the current set",
          all(e["id"] != "EV-7" for e in archive_store.evidence))
    snapshots = archive_store.decision_evidence("DEC-8")
    check("a historical decision's evidence stays readable",
          [e["id"] for e in snapshots] == [f"EV-{n}" for n in range(1, 8)],
          str([e["id"] for e in snapshots]))
    check("the archived snapshot keeps its content digest",
          snapshots[-1]["contentDigest"]
          == next(e for e in evidence if e["id"] == "EV-7")["contentDigest"])

    archive_reload = Store.from_export(archive_store.export())
    check("the archive survives reload",
          archive_reload.archived_evidence == archive_store.archived_evidence)
    check("historical evidence is readable after reload",
          [e["id"] for e in archive_reload.decision_evidence("DEC-8")]
          == [f"EV-{n}" for n in range(1, 8)])
    check("the scope-changed decision stays historical after reload",
          archive_reload.currentness("DEC-8") == "historical")
    check("export round-trips with the archive",
          json.dumps(archive_reload.export(), sort_keys=True)
          == json.dumps(archive_store.export(), sort_keys=True))
    try:
        archive_reload.attach_evidence(
            command("CMD-AR3", 9), next(e for e in evidence if e["id"] == "EV-7"))
        check("an archived record cannot be re-attached", False, "accepted")
    except CommandError as exc:
        check("an archived record cannot be re-attached", exc.code == "duplicate_evidence",
              exc.code)

    # ------------------------------------------------------------ export contract
    exported = archive_store.export()
    check("the export declares its version", exported["exportVersion"] == "2.0",
          str(exported.get("exportVersion")))
    check("decisions serialize the documented evidence field",
          "evidenceIds" in exported["decisions"][0]
          and "_evidenceIds" not in exported["decisions"][0])
    check("the export carries the archive",
          exported["archivedEvidence"][0]["evidence"]["id"] == "EV-7")

    immutable = Store(project_for(scenario, "baseline", 8),
                      copy.deepcopy(requirements), base_evidence(scenario))
    record_before = json.dumps(immutable.export(), sort_keys=True)
    rewritten = [copy.deepcopy(e) for e in evidence]
    rewritten[0]["sourceExcerpt"] = "A rewritten record that no source states."
    try:
        immutable.change_requirement_set(command("CMD-IM1", 8),
                                         copy.deepcopy(requirements), rewritten)
        check("scope change cannot rewrite a retained record", False, "accepted")
    except CommandError as exc:
        check("scope change cannot rewrite a retained record",
              exc.code == "invalid_evidence", exc.code)
    check("a rejected rewrite leaves the record byte-identical",
          json.dumps(immutable.export(), sort_keys=True) == record_before)

    try:
        archive_store.change_requirement_set(
            command("CMD-IM2", 9), trimmed_requirements,
            trimmed_evidence + [copy.deepcopy(entry["evidence"])])
        check("a withdrawn record cannot return through a scope change", False, "accepted")
    except CommandError as exc:
        check("a withdrawn record cannot return through a scope change",
              exc.code == "duplicate_evidence", exc.code)

    def rejects(label: str, mutate) -> None:
        bad = json.loads(json.dumps(exported))
        mutate(bad)
        try:
            Store.from_export(bad)
            check(label, False, "import accepted")
        except CommandError as exc:
            check(label, exc.code == "invalid_export", exc.code)

    rejects("an import without a version is rejected",
            lambda e: e.pop("exportVersion"))
    rejects("an unsupported export version is rejected",
            lambda e: e.__setitem__("exportVersion", "1.0"))
    rejects("a decision without evidenceIds is rejected",
            lambda e: e["decisions"][0].pop("evidenceIds"))
    rejects("a legacy private evidence field is rejected",
            lambda e: (e["decisions"][0].pop("evidenceIds"),
                       e["decisions"][0].__setitem__("_evidenceIds", [])))
    rejects("a malformed archive entry is rejected",
            lambda e: e["archivedEvidence"][0].pop("archiveReason"))
    rejects("duplicate current evidence ids are rejected",
            lambda e: e["evidence"].append(copy.deepcopy(e["evidence"][0])))
    rejects("an archive entry overlapping current evidence is rejected",
            lambda e: e["archivedEvidence"][0]["evidence"].__setitem__(
                "id", e["evidence"][0]["id"]))
    rejects("an event sequence gap is rejected",
            lambda e: e["events"][0].__setitem__("sequence", 5))
    rejects("a mismatched decision evidence digest is rejected",
            lambda e: e["decisions"][0].__setitem__("evidenceSetDigest",
                                                    "sha256:" + "0" * 64))
    rejects("an archive sequence beyond the log is rejected",
            lambda e: e["archivedEvidence"][0].__setitem__("archivedAtSequence", 999))
    rejects("a decision targeting a future revision is rejected",
            lambda e: e["decisions"][0].__setitem__("targetAssessmentRevision", 99))

    # ------------------------------------------------------------ conflicting prerequisites
    conflict_requirements = copy.deepcopy(requirements)
    by_req = {r["id"]: r for r in conflict_requirements}
    by_req["REQ-venue-capacity-1"]["expectedValues"] = {
        "field": "location.capacity", "minimum": 150, "unit": "people"}
    capped = {
        "id": "REQ-capped-capacity-1",
        "version": 1,
        "milestoneId": "MS-1",
        "owner": "CON-ana",
        "label": "Licensed occupancy stays below 120",
        "predicateType": "numeric_within",
        "expectedValues": {"field": "location.capacity", "maximum": 120, "unit": "people"},
        "prerequisiteIds": [],
        "requiredEvidenceType": "document",
        "expiryPolicy": {"mode": "absolute", "value": "2027-03-07T00:00:00Z"},
        "blocking": True,
        "fieldBindings": ["location.capacity"],
    }
    combined = {
        "id": "REQ-combined-capacity-1",
        "version": 1,
        "milestoneId": "MS-1",
        "owner": "CON-ana",
        "label": "The room satisfies both occupancy limits",
        "predicateType": "evidence_present",
        "expectedValues": {},
        "prerequisiteIds": ["REQ-venue-capacity-1", "REQ-capped-capacity-1"],
        "requiredEvidenceType": "document",
        "expiryPolicy": {"mode": "absolute", "value": "2027-03-07T00:00:00Z"},
        "blocking": True,
        "fieldBindings": ["location.capacity"],
    }
    conflict_requirements.extend([capped, combined])
    conflicted = evaluate(project_for(scenario, "baseline", 8),
                          conflict_requirements, evidence)
    conflict_status = statuses(conflicted)
    check("a dependent of conflicting prerequisites is blocked",
          conflict_status["REQ-combined-capacity-1"] == "blocked",
          conflict_status["REQ-combined-capacity-1"])
    conflict_residual = next(
        r for r in conflicted["requirements"]
        if r["requirementId"] == "REQ-combined-capacity-1")["residuals"]
    check("the conflict names the field and both prerequisites",
          conflict_residual
          and conflict_residual[0]["code"] == "prerequisite_conflict"
          and conflict_residual[0]["field"] == "location.capacity"
          and set(conflict_residual[0]["prerequisiteIds"])
          == {"REQ-venue-capacity-1", "REQ-capped-capacity-1"},
          str(conflict_residual))
    check("conflicting prerequisites do not default to supported",
          conflict_status["REQ-capped-capacity-1"] != "supported")
    check("the unmodified scenario reports no prerequisite conflict",
          not any(r["code"] == "prerequisite_conflict"
                  for req in baseline["requirements"] for r in req["residuals"]))

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
