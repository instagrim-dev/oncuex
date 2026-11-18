"""Typed field schema and pure evaluation."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

STATUSES = ("missing", "blocked", "outdated", "supported")

CHECK_IDS = (
    "access_vs_arrival",
    "occupancy_vs_headcount",
    "runofshow_vs_hardstop",
    "total_cost",
    "attestation_current",
    "dependency_closure",
)

# path -> (kind, extra)
TYPED_PATHS: dict[str, dict[str, Any]] = {
    "assessmentRevision": {"type": "integer"},
    "brief.guestCount": {"type": "integer"},
    "brief.approvedBudget.minorUnits": {"type": "integer"},
    "location.venueId": {"type": "string"},
    "location.venueName": {"type": "string"},
    "location.capacity": {"type": "integer"},
    "location.roomPlan": {"type": "string"},
    "location.loadingWindow.start": {"type": "time"},
    "location.loadingWindow.end": {"type": "time"},
    "location.hardStop": {"type": "time"},
    "location.fireAttestation": {"type": "enum", "values": ["reviewed", "not_reviewed", "missing"]},
    "crew.arrivalTime": {"type": "time"},
    "production.runOfShowEnd": {"type": "time"},
    "budget.commitments": {"type": "collection", "compare": "digest"},
    "budget.committedTotal.currency": {"type": "string"},
    "budget.committedTotal.minorUnits": {"type": "integer"},
    "photographer.arrivalWindow.start": {"type": "time"},
    "photographer.arrivalWindow.end": {"type": "time"},
    "photographer.deliverables.editedImages": {"type": "integer"},
    "photographer.deliverables.deliveryDays": {"type": "integer"},
}

_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class SchemaError(ValueError):
    """Raised when a snapshot or binding violates the typed schema."""


def canon(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(obj: Any) -> str:
    return "sha256:" + hashlib.sha256(canon(obj).encode()).hexdigest()


def resolve(doc: dict, path: str):
    cur: Any = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return (False, None)
        cur = cur[part]
    return (True, cur)


def value_matches(path: str, value: Any) -> bool:
    spec = TYPED_PATHS.get(path)
    if spec is None:
        return False
    kind = spec["type"]
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "time":
        return isinstance(value, str) and bool(_TIME.match(value))
    if kind == "enum":
        return value in spec["values"]
    if kind == "collection":
        return isinstance(value, (list, dict))
    return False


def binding_matches(path: str, value: Any, snapshot: dict) -> bool:
    """A binding is valid when its stored value equals the snapshot value.

    Collections are compared by canonical digest, scalars by equality after a
    type check, so a string bound where an integer lives cannot silently match.
    """
    spec = TYPED_PATHS.get(path)
    if spec is None:
        return False
    if spec["type"] == "collection":
        if not (isinstance(value, str) and value.startswith("sha256:")):
            return False
        ok, actual = resolve(snapshot, path)
        return ok and digest(actual) == value
    if not value_matches(path, value):
        return False
    ok, actual = resolve(snapshot, path)
    return ok and actual == value


def validate_snapshot(snapshot: dict, requirements: Iterable[dict], evidence: Iterable[dict]) -> None:
    for path in TYPED_PATHS:
        if not path.startswith("brief."):
            ok, value = resolve(snapshot, path)
            if not ok:
                raise SchemaError(f"declared path {path} missing from snapshot")
            if not value_matches(path, value):
                raise SchemaError(f"{path} holds {value!r}, not a valid {TYPED_PATHS[path]['type']}")

    for req in requirements:
        for path in req["fieldBindings"]:
            if path not in TYPED_PATHS:
                raise SchemaError(f"{req['id']} binds undeclared path {path}")
    for ev in evidence:
        for path, value in ev["boundFieldVersions"].items():
            if path not in TYPED_PATHS:
                raise SchemaError(f"{ev['id']} binds undeclared path {path}")
            if TYPED_PATHS[path]["type"] != "collection" and not value_matches(path, value):
                raise SchemaError(f"{ev['id']} binds {path} to {value!r}, wrong type")


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


def _evidence_for(req_id: str, evidence: Iterable[dict]) -> list[dict]:
    return [e for e in evidence if e["requirementId"] == req_id]


def evaluate(snapshot: dict, requirements: list[dict], evidence: list[dict]) -> dict:
    """Pure evaluation. Never writes, never records acceptance."""
    validate_snapshot(snapshot, requirements, evidence)

    by_id = {r["id"]: r for r in requirements}
    statuses: dict[str, str] = {}
    residuals: dict[str, list[dict]] = {}

    def direct_status(req: dict) -> tuple[str, list[dict]]:
        records = _evidence_for(req["id"], evidence)
        admissible = [e for e in records if e["reviewDisposition"] == "accepted"]
        if not admissible:
            return "missing", [{"code": "mandatory_evidence_missing"}]

        now = snapshot.get("_now", "1970-01-01T00:00:00Z")
        current: list[dict] = []
        stale: list[dict] = []
        for ev in admissible:
            if ev.get("expiresAt") and ev["expiresAt"] <= now:
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

    # resolve prerequisites first (graph validated acyclic by the caller)
    order: list[str] = []
    temporary: set[str] = set()
    permanent: set[str] = set()

    def visit(node: str) -> None:
        if node in permanent:
            return
        if node in temporary:
            raise SchemaError(f"prerequisite cycle at {node}")
        temporary.add(node)
        for parent in by_id[node]["prerequisiteIds"]:
            visit(parent)
        temporary.discard(node)
        permanent.add(node)
        order.append(node)

    for rid in by_id:
        visit(rid)

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

    return {
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


def _fmt(total: int) -> str:
    return f"{total // 60:02d}:{total % 60:02d}"


def _money(minor: int) -> str:
    return f"{minor / 100:,.2f}"
