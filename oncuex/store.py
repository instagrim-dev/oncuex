"""Event log, counters and decision currentness.

Two counters, deliberately independent:

    sequence             every appended event
    assessment_revision  only events that change assessed facts

Recording a decision advances the first and not the second, so a decision is
current the instant it is written.
"""

from __future__ import annotations

import copy
from typing import Any

from .engine import digest, evaluate


class CommandError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


# events that change assessed facts
ASSESSED_EVENTS = {
    "brief.adopted",
    "evidence.attached",
    "evidence.reviewed",
    "change.adopted",
    "requirementSet.changed",
}

# events that advance the sequence only
OPINION_EVENTS = {"decision.recorded"}


class Store:
    """Append-only project store with compare-and-swap writes."""

    def __init__(self, project: dict, requirements: list[dict], evidence: list[dict]):
        self.project = copy.deepcopy(project)
        self.requirements = copy.deepcopy(requirements)
        self.evidence = copy.deepcopy(evidence)
        self.events: list[dict] = []
        self.sequence = 0
        self.assessment_revision = self.project.get("assessmentRevision", 1)
        self._results: dict[str, dict] = {}
        self._decisions: dict[str, dict] = {}

    # ---------------------------------------------------------------- reads
    def snapshot(self) -> dict:
        snap = copy.deepcopy(self.project)
        snap["assessmentRevision"] = self.assessment_revision
        return snap

    def assess(self) -> dict:
        return evaluate(self.snapshot(), self.requirements, self.evidence)

    def latest_decision(self) -> dict | None:
        if not self._decisions:
            return None
        return self._decisions[sorted(self._decisions)[-1]]

    def currentness(self, decision_id: str) -> str:
        decision = self._decisions.get(decision_id)
        if decision is None:
            raise CommandError("unknown_decision", decision_id)
        if decision["targetAssessmentRevision"] != self.assessment_revision:
            return "historical"
        if decision["requirementSetVersion"] != self.project.get("requirementSetVersion", 1):
            return "historical"
        for ev_id in decision["_evidenceIds"]:
            ev = next((e for e in self.evidence if e["id"] == ev_id), None)
            if ev is None or ev.get("reviewDisposition") != "accepted":
                return "historical"
        return "current"

    # ---------------------------------------------------------------- writes
    def _append(self, command: dict, event_type: str, payload: dict) -> dict:
        if event_type not in ASSESSED_EVENTS | OPINION_EVENTS:
            raise CommandError("unknown_event", event_type)

        command_id = command.get("commandId")
        expected = command.get("expectedAssessmentRevision")
        if expected is not None and expected != self.assessment_revision:
            raise CommandError(
                "conflict",
                f"expected assessment revision {expected}, current {self.assessment_revision}",
            )

        if self._results.get(command_id):
            return self._results[command_id]

        assessed = event_type in ASSESSED_EVENTS
        if assessed:
            self.assessment_revision += 1
        self.sequence += 1

        event = {
            "id": f"EVT-{self.sequence}",
            "sequence": self.sequence,
            "commandId": command_id,
            "eventType": event_type,
            "actor": command.get("actor"),
            "expectedAssessmentRevision": expected,
            "resultingAssessmentRevision": self.assessment_revision,
            "payload": payload,
        }
        self.events.append(event)
        result = {
            "sequence": self.sequence,
            "assessmentRevision": self.assessment_revision,
            "assessedFactsChanged": assessed,
        }
        self._results[command_id] = result
        return result

    def adopt_brief(self, command: dict, brief: dict) -> dict:
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        self.project["brief"] = copy.deepcopy(brief)
        return self._append(command, "brief.adopted", {"brief": brief})

    def attach_evidence(self, command: dict, evidence: dict) -> dict:
        if any(e["id"] == evidence["id"] for e in self.evidence):
            raise CommandError("duplicate_evidence", evidence["id"])
        for path, value in evidence["boundFieldVersions"].items():
            from .engine import TYPED_PATHS, value_matches

            spec = TYPED_PATHS.get(path)
            if spec is None:
                raise CommandError("undeclared_path", path)
            if spec["type"] != "collection" and not value_matches(path, value):
                raise CommandError("type_mismatch", f"{path}={value!r}")
        self.evidence.append(copy.deepcopy(evidence))
        return self._append(command, "evidence.attached", {"evidenceId": evidence["id"]})

    def adopt_change(self, command: dict, change: dict) -> dict:
        """Apply field changes, bumping the assessed revision exactly once."""
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        for path, delta in change["changedFields"].items():
            self._set_path(path, delta["to"])
        return self._append(command, "change.adopted", {"changeId": change["id"]})

    def record_decision(self, command: dict) -> dict:
        # A repeated command returns the stored result before any other validation,
        # so a retried acceptance is idempotent rather than a duplicate.
        if self._results.get(command.get("commandId")):
            return self._results[command["commandId"]]
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        decision_id = command["decisionId"]
        if decision_id in self._decisions:
            raise CommandError("duplicate_decision", decision_id)

        assessment = self.assess()
        if assessment["readiness"] != "ready_for_review":
            raise CommandError(
                "not_eligible",
                f"readiness={assessment['readiness']}, "
                f"reasons={assessment['residualReasonCodes']}",
            )

        evidence_ids = [e["id"] for e in self.evidence if e["reviewDisposition"] == "accepted"]
        decision = {
            "id": decision_id,
            "actor": command.get("actor"),
            "role": command.get("role"),
            "targetAssessmentRevision": self.assessment_revision,
            "requirementSetVersion": self.project.get("requirementSetVersion", 1),
            "requirementSetDigest": digest([r["id"] for r in self.requirements]),
            "evidenceSetDigest": digest(evidence_ids),
            "integrationReviewResult": assessment["integrated"],
            "disposition": "accepted",
            "_evidenceIds": evidence_ids,
        }
        self._decisions[decision_id] = decision
        result = self._append(command, "decision.recorded", {"decisionId": decision_id})
        result["decisionId"] = decision_id
        return result

    # ---------------------------------------------------------------- helpers
    def _set_path(self, path: str, value: Any) -> None:
        parts = path.split(".")
        cursor = self.project
        for part in parts[:-1]:
            if not isinstance(cursor.get(part), dict):
                raise CommandError("bad_path", path)
            cursor = cursor[part]
        cursor[parts[-1]] = copy.deepcopy(value)

    def export(self) -> dict:
        return {
            "project": self.snapshot(),
            "requirements": self.requirements,
            "evidence": self.evidence,
            "events": self.events,
            "decisions": list(self._decisions.values()),
            "counters": {
                "sequence": self.sequence,
                "assessmentRevision": self.assessment_revision,
            },
        }
