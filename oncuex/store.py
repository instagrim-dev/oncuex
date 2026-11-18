"""Event log, counters and decision currentness.

Two counters, deliberately independent:

    sequence             every appended event
    assessment_revision  only events that change assessed facts

Recording a decision advances the first and not the second, so a decision is
current the instant it is written.

A command is validated before any state is touched, so a rejected write leaves
the record byte-identical to the record that preceded it.
"""

from __future__ import annotations

import copy
from typing import Any

from .engine import evaluate
from .schema import (
    FIELD_SCHEMA,
    TYPED_PATHS,
    digest,
    is_expired,
    validate_brief,
    validate_evidence_record,
    value_matches,
)


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

# Fields a change command may never write. assessmentRevision is owned by the
# event log, and rewriting it would corrupt the binding every decision depends on.
IMMUTABLE_PATHS = {"assessmentRevision"}


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
        # Insertion order, not identifier order: DEC-10 follows DEC-2.
        return list(self._decisions.values())[-1]

    def currentness(self, decision_id: str) -> str:
        decision = self._decisions.get(decision_id)
        if decision is None:
            raise CommandError("unknown_decision", decision_id)
        if decision["targetAssessmentRevision"] != self.assessment_revision:
            return "historical"
        if decision["requirementSetVersion"] != self.project.get("requirementSetVersion", 1):
            return "historical"
        now = self.project.get("_now", "1970-01-01T00:00:00Z")
        for ev_id in decision["_evidenceIds"]:
            ev = next((e for e in self.evidence if e["id"] == ev_id), None)
            if ev is None or ev.get("reviewDisposition") != "accepted":
                return "historical"
            if is_expired(ev, now):
                return "historical"
        return "current"

    # ---------------------------------------------------------------- writes
    def _replay(self, command: dict) -> dict | None:
        command_id = command.get("commandId")
        if command_id is None:
            return None
        return self._results.get(command_id)

    def _check_revision(self, command: dict) -> None:
        expected = command.get("expectedAssessmentRevision")
        if expected is not None and expected != self.assessment_revision:
            raise CommandError(
                "conflict",
                f"expected assessment revision {expected}, current {self.assessment_revision}",
            )

    def _begin(self, command: dict, event_type: str) -> dict | None:
        """Replay or validate a command before any state is touched."""
        if event_type not in ASSESSED_EVENTS | OPINION_EVENTS:
            raise CommandError("unknown_event", event_type)
        replay = self._replay(command)
        if replay is not None:
            return replay
        self._check_revision(command)
        return None

    def _commit(self, command: dict, event_type: str, payload: dict) -> dict:
        """Append the event and advance both counters. Cannot reject."""
        if event_type not in ASSESSED_EVENTS | OPINION_EVENTS:
            raise CommandError("unknown_event", event_type)

        assessed = event_type in ASSESSED_EVENTS
        if assessed:
            self.assessment_revision += 1
        self.sequence += 1

        event = {
            "id": f"EVT-{self.sequence}",
            "sequence": self.sequence,
            "commandId": command.get("commandId"),
            "eventType": event_type,
            "actor": command.get("actor"),
            "expectedAssessmentRevision": command.get("expectedAssessmentRevision"),
            "resultingAssessmentRevision": self.assessment_revision,
            "payload": payload,
        }
        self.events.append(event)
        result = {
            "sequence": self.sequence,
            "assessmentRevision": self.assessment_revision,
            "assessedFactsChanged": assessed,
        }
        command_id = command.get("commandId")
        if command_id is not None:
            self._results[command_id] = result
        return result

    def adopt_brief(self, command: dict, brief: dict) -> dict:
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        replay = self._begin(command, "brief.adopted")
        if replay is not None:
            return replay
        problems = validate_brief(brief)
        if problems:
            raise CommandError("invalid_brief", problems[0])
        self.project["brief"] = copy.deepcopy(brief)
        return self._commit(command, "brief.adopted", {"brief": brief})

    def attach_evidence(self, command: dict, evidence: dict) -> dict:
        replay = self._begin(command, "evidence.attached")
        if replay is not None:
            return replay
        if any(e["id"] == evidence["id"] for e in self.evidence):
            raise CommandError("duplicate_evidence", evidence["id"])
        for path, value in evidence["boundFieldVersions"].items():
            spec = TYPED_PATHS.get(path)
            if spec is None:
                raise CommandError("undeclared_path", path)
            if spec["type"] != "collection" and not value_matches(path, value):
                raise CommandError("type_mismatch", f"{path}={value!r}")
        problems = validate_evidence_record(evidence, {r["id"] for r in self.requirements})
        if problems:
            raise CommandError("invalid_evidence", problems[0])
        self.evidence.append(copy.deepcopy(evidence))
        return self._commit(command, "evidence.attached", {"evidenceId": evidence["id"]})

    def adopt_change(self, command: dict, change: dict) -> dict:
        """Apply field changes, bumping the assessed revision exactly once."""
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        replay = self._begin(command, "change.adopted")
        if replay is not None:
            return replay
        fields = change["changedFields"]
        for path, delta in fields.items():
            self._check_path(path)
            target = delta.get("to")
            if FIELD_SCHEMA[path]["type"] == "collection":
                if not isinstance(target, (list, dict)):
                    raise CommandError("type_mismatch", f"{path}={target!r}")
            elif not value_matches(path, target):
                raise CommandError("type_mismatch", f"{path}={target!r}")
        for path, delta in fields.items():
            self._set_path(path, delta["to"])
        return self._commit(command, "change.adopted", {"changeId": change["id"]})

    def record_decision(self, command: dict) -> dict:
        # A repeated command returns the stored result before any other validation,
        # so a retried acceptance is idempotent rather than a duplicate.
        replay = self._replay(command)
        if replay is not None:
            return replay
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        decision_id = command["decisionId"]
        if decision_id in self._decisions:
            raise CommandError("duplicate_decision", decision_id)
        self._check_revision(command)

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
        result = self._commit(command, "decision.recorded", {"decisionId": decision_id})
        self._decisions[decision_id] = decision
        result["decisionId"] = decision_id
        return result

    # ---------------------------------------------------------------- helpers
    def _check_path(self, path: str) -> None:
        """Reject any field path a change may not write.

        Two conditions. The path must be declared in the typed schema, so a
        change cannot invent a field; and it must not be a counter or an identity,
        so a change cannot rewrite what governs currentness or attribution.
        """
        if path not in TYPED_PATHS:
            raise CommandError("undeclared_path", path)
        if path in IMMUTABLE_PATHS:
            raise CommandError("immutable_path", path)
        cursor: Any = self.project
        for part in path.split(".")[:-1]:
            if not isinstance(cursor, dict) or not isinstance(cursor.get(part), dict):
                raise CommandError("bad_path", path)
            cursor = cursor[part]

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
