"""Requirement evaluation and integrated checks.

Schema declarations, record validation and the binding primitives live in
oncuex.schema. This module re-exports them as the engine's public surface and
evaluates readiness over exactly one snapshot.
"""

from __future__ import annotations

from typing import Iterable

from .schema import (
    CHECK_IDS,
    STATUSES,
    SchemaError,
    TYPED_PATHS,
    binding_matches,
    digest,
    is_expired,
    resolve,
    validate_snapshot,
    value_matches,
)


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def _predicate_ok(req: dict, snapshot: dict, evidence: dict) -> bool:
    kind = req["predicateType"]
    expected = req.get("expectedValues", {})

    if kind == "evidence_present":
        return True  # presence and currency are checked before the predicate

    if kind == "numeric_within":
        path = expected.get("field")
        ok, value = resolve(snapshot, path)
        if not ok or not isinstance(value, int):
            return False
        if "minimum" in expected and value < expected["minimum"]:
            return False
        if "maximumMinorUnits" in expected and value > expected["maximumMinorUnits"]:
            return False
        if "maximum" in expected and value > expected["maximum"]:
            return False
        return True

    if kind == "time_within_window":
        if "marginMinutes" in expected:
            ok, end = resolve(snapshot, "production.runOfShowEnd")
            ok2, stop = resolve(snapshot, "location.hardStop")
            if not (ok and ok2):
                return False
            return _minutes(end) + expected["marginMinutes"] <= _minutes(stop)
        ok, arrival = resolve(snapshot, "crew.arrivalTime")
        ok2, window_end = resolve(snapshot, "location.loadingWindow.end")
        if not (ok and ok2):
            return False
        return _minutes(arrival) + expected.get("setupMinutes", 0) <= _minutes(window_end)

    if kind == "attestation_reviewed":
        ok, value = resolve(snapshot, expected.get("attestationField", "location.fireAttestation"))
        return bool(ok) and value == "reviewed"

    if kind == "set_equals":
        path = expected.get("field")
        ok, value = resolve(snapshot, path)
        return ok and value == expected.get("value")

    return False


def _evidence_for(req: dict, evidence: Iterable[dict]) -> list[dict]:
    """Only a record of the required type can support the requirement."""
    return [
        e
        for e in evidence
        if e["requirementId"] == req["id"] and e.get("type") == req["requiredEvidenceType"]
    ]


def evaluate(
    snapshot: dict,
    requirements: list[dict],
    evidence: list[dict],
    impact: dict | None = None,
) -> dict:
    """Pure evaluation. Never writes, never records acceptance."""
    validate_snapshot(snapshot, requirements, evidence)

    by_id = {r["id"]: r for r in requirements}
    statuses: dict[str, str] = {}
    residuals: dict[str, list[dict]] = {}

    def direct_status(req: dict) -> tuple[str, list[dict]]:
        records = _evidence_for(req, evidence)
        admissible = [e for e in records if e["reviewDisposition"] == "accepted"]
        if not admissible:
            return "missing", [{"code": "mandatory_evidence_missing"}]

        now = snapshot.get("_now", "1970-01-01T00:00:00Z")
        current: list[dict] = []
        stale: list[dict] = []
        for ev in admissible:
            if is_expired(ev, now):
                stale.append({"code": "evidence_expired", "evidenceId": ev["id"]})
                continue
            changed = next(
                (
                    path
                    for path, bound in ev["boundFieldVersions"].items()
                    if not binding_matches(path, bound, snapshot)
                ),
                None,
            )
            if changed is not None:
                stale.append(
                    {"code": "bound_field_changed", "field": changed, "evidenceId": ev["id"]}
                )
                continue
            current.append(ev)

        # Current evidence decides the requirement. Stale records are history and
        # cannot veto a requirement that a newer record now supports.
        if not current:
            return "outdated", stale

        matching = [ev for ev in current if _predicate_ok(req, snapshot, ev)]
        if not matching:
            return "blocked", [{"code": "predicate_false"}]
        return "supported", []

    # Resolve prerequisites first. A cycle is a blocked condition, not a crash:
    # ambiguous precedence must never default to supported.
    graph = {rid: list(by_id[rid]["prerequisiteIds"]) for rid in by_id}
    cycle_paths = _cycle_paths(graph)

    order: list[str] = []
    temporary: set[str] = set()
    permanent: set[str] = set()

    def visit(node: str) -> None:
        if node in permanent or node in cycle_paths:
            return
        if node in temporary:
            return
        temporary.add(node)
        for parent in graph[node]:
            visit(parent)
        temporary.discard(node)
        permanent.add(node)
        order.append(node)

    for rid in by_id:
        visit(rid)

    for rid, path in cycle_paths.items():
        statuses[rid] = "blocked"
        residuals[rid] = [{
            "code": "prerequisite_cycle",
            "path": path,
            "prerequisiteIds": graph[rid],
        }]

    for rid in order:
        req = by_id[rid]
        status, why = direct_status(req)
        blocked_by = [
            p for p in req["prerequisiteIds"] if statuses.get(p) not in (None, "supported")
        ]
        if status == "supported" and blocked_by:
            status = "blocked"
            why = [{"code": "prerequisite_not_supported", "prerequisiteIds": blocked_by}]
        statuses[rid] = status
        residuals[rid] = why

    for rid, req in by_id.items():
        if rid in cycle_paths:
            continue
        conflicts = prerequisite_conflicts(req, by_id)
        if conflicts:
            statuses[rid] = "blocked"
            residuals[rid] = conflicts[:1]

    integrated = integrated_checks(snapshot, requirements, statuses)
    ready = all(
        statuses[r["id"]] == "supported" for r in requirements if r["blocking"]
    ) and integrated["status"] == "pass"

    reason_codes: list[str] = []
    if any(statuses[r["id"]] == "outdated" for r in requirements if r["blocking"]):
        reason_codes.append("mandatory_outdated")
    if any(statuses[r["id"]] == "missing" for r in requirements if r["blocking"]):
        reason_codes.append("mandatory_missing")
    if any(statuses[r["id"]] == "blocked" for r in requirements if r["blocking"]):
        reason_codes.append("mandatory_blocked")
    if integrated["status"] == "fail":
        reason_codes.append("integration_failed")

    result = {
        "assessmentRevision": snapshot["assessmentRevision"],
        "requirements": [
            {
                "requirementId": rid,
                "status": statuses[rid],
                "blocking": by_id[rid]["blocking"],
                "residuals": residuals[rid],
            }
            for rid in by_id
        ],
        "integrated": integrated,
        "readiness": "ready_for_review" if ready else "not_ready",
        "residualReasonCodes": reason_codes,
    }
    if impact is not None:
        result["impact"] = impact
    return result


def integrated_checks(snapshot: dict, requirements: list[dict], statuses: dict) -> dict:
    """Six checks against current state, independent of evidence currency."""
    checks: list[dict] = []

    _, arrival = resolve(snapshot, "crew.arrivalTime")
    _, window_end = resolve(snapshot, "location.loadingWindow.end")
    setup = next(
        (r["expectedValues"].get("setupMinutes", 45)
         for r in requirements if r["id"] == "REQ-venue-loading-1"),
        45,
    )
    if _minutes(arrival) + setup > _minutes(window_end):
        checks.append({
            "id": "access_vs_arrival",
            "status": "fail",
            "reason": (
                f"Crew arrival {arrival} plus {setup} minutes setup reaches "
                f"{_fmt(_minutes(arrival) + setup)}; the loading window ends {window_end}."
            ),
        })

    _, capacity = resolve(snapshot, "location.capacity")
    _, guests = resolve(snapshot, "brief.guestCount")
    needed = guests + snapshot.get("circulationBuffer", 10)
    if capacity < needed:
        checks.append({
            "id": "occupancy_vs_headcount",
            "status": "fail",
            "reason": (
                f"Licensed occupancy {capacity} is below guest count {guests} plus "
                f"circulation buffer {needed - guests}, which requires {needed}."
            ),
        })

    _, show_end = resolve(snapshot, "production.runOfShowEnd")
    _, stop = resolve(snapshot, "location.hardStop")
    margin = next(
        (r["expectedValues"].get("marginMinutes", 30)
         for r in requirements if r["id"] == "REQ-production-runofshow-1"),
        30,
    )
    if _minutes(show_end) + margin > _minutes(stop):
        checks.append({
            "id": "runofshow_vs_hardstop",
            "status": "fail",
            "reason": (
                f"Run of show ends {show_end}; a {margin} minute margin requires "
                f"{_fmt(_minutes(show_end) + margin)}, but the hard stop is {stop}."
            ),
        })

    _, committed = resolve(snapshot, "budget.committedTotal.minorUnits")
    _, budget = resolve(snapshot, "brief.approvedBudget.minorUnits")
    if committed > budget:
        checks.append({
            "id": "total_cost",
            "status": "fail",
            "reason": (
                f"Committed total {_money(committed)} exceeds approved budget "
                f"{_money(budget)} by {_money(committed - budget)}."
            ),
        })

    if snapshot["location"]["fireAttestation"] != "reviewed":
        checks.append({
            "id": "attestation_current",
            "status": "fail",
            "reason": (
                f"The fire and occupancy attestation for {snapshot['location']['venueId']} "
                f"is {snapshot['location']['fireAttestation']}."
            ),
        })

    unmet = [rid for rid, status in statuses.items() if status != "supported"]
    if unmet:
        checks.append({
            "id": "dependency_closure",
            "status": "fail",
            "reason": f"{len(unmet)} blocking requirement(s) not supported: {', '.join(sorted(unmet))}.",
        })

    return {"status": "fail" if checks else "pass", "checks": checks}


def _cycle_paths(graph: dict[str, list[str]]) -> dict[str, list[str]]:
    """Return each requirement that sits on a prerequisite cycle, with a path."""
    state: dict[str, int] = {}
    stack: list[str] = []
    cycles: dict[str, list[str]] = {}

    def dfs(node: str) -> None:
        state[node] = 1
        stack.append(node)
        for parent in graph.get(node, []):
            if state.get(parent, 0) == 0:
                dfs(parent)
            elif state.get(parent) == 1:
                start = stack.index(parent)
                path = stack[start:] + [parent]
                for member in stack[start:]:
                    cycles.setdefault(member, list(path))
        stack.pop()
        state[node] = 2

    for node in graph:
        if state.get(node, 0) == 0:
            dfs(node)
    return cycles


def _constraint(req: dict) -> dict | None:
    """A prerequisite's declared constraint on one field, when one is stated."""
    kind = req["predicateType"]
    expected = req.get("expectedValues", {})
    if kind == "numeric_within":
        field = expected.get("field")
        if not field:
            return None
        return {
            "kind": "numeric",
            "field": field,
            "low": expected.get("minimum"),
            "high": expected.get("maximum", expected.get("maximumMinorUnits")),
        }
    if kind == "set_equals":
        field = expected.get("field")
        if not field:
            return None
        return {"kind": "equals", "field": field, "value": expected.get("value")}
    if kind == "attestation_reviewed":
        return {
            "kind": "equals",
            "field": expected.get("attestationField", "location.fireAttestation"),
            "value": "reviewed",
        }
    return None


def _conflict(a: dict, b: dict) -> dict | None:
    ca, cb = _constraint(a), _constraint(b)
    if not ca or not cb or ca["field"] != cb["field"]:
        return None
    field = ca["field"]
    pair = [a["id"], b["id"]]
    if ca["kind"] == "numeric" and cb["kind"] == "numeric":
        lows = [c["low"] for c in (ca, cb) if c["low"] is not None]
        highs = [c["high"] for c in (ca, cb) if c["high"] is not None]
        if lows and highs and max(lows) > min(highs):
            return {"field": field, "prerequisiteIds": pair, "constraints": [ca, cb]}
        return None
    if ca["kind"] == "equals" and cb["kind"] == "equals":
        if ca["value"] != cb["value"]:
            return {"field": field, "prerequisiteIds": pair, "constraints": [ca, cb]}
        return None
    numeric, exact = (ca, cb) if ca["kind"] == "numeric" else (cb, ca)
    value = exact["value"]
    if not isinstance(value, int):
        return None
    below = numeric["low"] is not None and value < numeric["low"]
    above = numeric["high"] is not None and value > numeric["high"]
    if below or above:
        return {"field": field, "prerequisiteIds": pair, "constraints": [ca, cb]}
    return None


def prerequisite_conflicts(req: dict, by_id: dict[str, dict]) -> list[dict]:
    """Pairs of declared prerequisites that no single value can satisfy.

    Only declared constraints are compared: numeric ranges and exact values on
    the same field. Time windows constrain when work happens, not what value a
    field holds, so they are not treated as conflicting.
    """
    prerequisites = [by_id[pid] for pid in req["prerequisiteIds"] if pid in by_id]
    conflicts: list[dict] = []
    for index, first in enumerate(prerequisites):
        for second in prerequisites[index + 1:]:
            conflict = _conflict(first, second)
            if conflict:
                conflict["code"] = "prerequisite_conflict"
                conflicts.append(conflict)
    return conflicts


def dependent_closure(seeds: set[str], requirements: list[dict]) -> set[str]:
    """Requirement ids affected by the seeds, following prerequisites downward."""
    graph = {req["id"]: list(req["prerequisiteIds"]) for req in requirements}
    affected = set(seeds)
    changed = True
    while changed:
        changed = False
        for rid, prerequisites in graph.items():
            if rid not in affected and any(p in affected for p in prerequisites):
                affected.add(rid)
                changed = True
    return affected


def _impact_block(
    requirements: list[dict],
    evidence: list[dict],
    affected_requirements: set[str],
    affected_evidence: set[str],
) -> dict:
    return {
        "impacted": {
            "requirementIds": [r["id"] for r in requirements if r["id"] in affected_requirements],
            "evidenceIds": [e["id"] for e in evidence if e["id"] in affected_evidence],
        },
        "unaffected": {
            "requirementIds": [r["id"] for r in requirements if r["id"] not in affected_requirements],
            "evidenceIds": [e["id"] for e in evidence if e["id"] not in affected_evidence],
        },
    }


def impact_of_change(
    changed_paths: set[str],
    requirements: list[dict],
    evidence: list[dict],
) -> dict:
    """Impact of a set of changed field paths, computed from declared bindings."""
    changed = set(changed_paths)
    seeds = {r["id"] for r in requirements if changed & set(r["fieldBindings"])}
    seeds |= {e["requirementId"] for e in evidence if changed & set(e["boundFieldVersions"])}
    affected_requirements = dependent_closure(seeds, requirements)
    affected_evidence = {
        e["id"]
        for e in evidence
        if e["requirementId"] in affected_requirements or changed & set(e["boundFieldVersions"])
    }
    return _impact_block(requirements, evidence, affected_requirements, affected_evidence)


def impact_of_expiry(
    requirements: list[dict],
    evidence: list[dict],
    now: str,
) -> dict | None:
    """Impact of currently expired evidence, propagated through dependents."""
    expired = {
        e["id"]
        for e in evidence
        if e.get("reviewDisposition") == "accepted" and is_expired(e, now)
    }
    if not expired:
        return None
    seeds = {e["requirementId"] for e in evidence if e["id"] in expired}
    affected_requirements = dependent_closure(seeds, requirements)
    affected_evidence = {
        e["id"] for e in evidence if e["requirementId"] in affected_requirements
    }
    return _impact_block(requirements, evidence, affected_requirements, affected_evidence)


def combine_impact(
    blocks: list[dict | None],
    requirements: list[dict],
    evidence: list[dict],
) -> dict | None:
    """Union of impact triggers, with unaffected recomputed from the union."""
    present = [block for block in blocks if block]
    if not present:
        return None
    if len(present) == 1:
        return present[0]
    affected_requirements: set[str] = set()
    affected_evidence: set[str] = set()
    for block in present:
        affected_requirements |= set(block["impacted"]["requirementIds"])
        affected_evidence |= set(block["impacted"]["evidenceIds"])
    return _impact_block(requirements, evidence, affected_requirements, affected_evidence)


def _fmt(total: int) -> str:
    return f"{total // 60:02d}:{total % 60:02d}"


def _money(minor: int) -> str:
    return f"{minor / 100:,.2f}"
