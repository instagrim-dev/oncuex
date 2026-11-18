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

from .engine import combine_impact, evaluate, impact_of_change, impact_of_expiry
from .schema import (
    EXPORT_VERSION,
    FIELD_SCHEMA,
    REVIEW_DISPOSITIONS,
    TYPED_PATHS,
    canon,
    digest,
    is_expired,
    validate_brief,
    validate_evidence_record,
    validate_requirement,
    validate_export,
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
        self.archived_evidence: list[dict] = []

    # ---------------------------------------------------------------- reads
    def snapshot(self) -> dict:
        snap = copy.deepcopy(self.project)
        snap["assessmentRevision"] = self.assessment_revision
        return snap

    def assess(self) -> dict:
        return evaluate(
            self.snapshot(), self.requirements, self.evidence, impact=self.impact()
        )

    def impact(self) -> dict | None:
        """Impact of the last adopted change and of currently expired evidence.

        Both triggers are computed from declared bindings and the prerequisite
        closure. When neither is present, no impact block is reported.
        """
        changed = self.last_changed_paths()
        change = (
            impact_of_change(changed, self.requirements, self.evidence) if changed else None
        )
        now = self.project.get("_now", "1970-01-01T00:00:00Z")
        expiry = impact_of_expiry(self.requirements, self.evidence, now)
        return combine_impact([change, expiry], self.requirements, self.evidence)

    def last_changed_paths(self) -> set[str]:
        """Changed paths recorded by the most recent adopted change.

        Deriving this from the event log rather than instance state means a
        reload reproduces the same impact without a private side channel.
        """
        for event in reversed(self.events):
            if event["eventType"] == "change.adopted":
                return set(event.get("payload", {}).get("changedPaths", ()))
        return set()

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
        for ev_id in decision.get("evidenceIds", []):
            ev = next((e for e in self.evidence if e["id"] == ev_id), None)
            if ev is None or ev.get("reviewDisposition") != "accepted":
                return "historical"
            if is_expired(ev, now):
                return "historical"
        return "current"

    def decision_status(self, decision_id: str) -> dict:
        """Currentness plus the reason code that explains a historical decision."""
        decision = self._decisions.get(decision_id)
        if decision is None:
            raise CommandError("unknown_decision", decision_id)
        if self.currentness(decision_id) == "current":
            return {"id": decision_id, "currentness": "current", "residualReasonCodes": []}
        if decision["requirementSetVersion"] != self.project.get("requirementSetVersion", 1):
            code = "requirement_set_changed"
        elif decision["targetAssessmentRevision"] == self.assessment_revision:
            # Same revision and set: the only way to be historical is expiry.
            code = "mandatory_evidence_expired"
        elif self._state_digest() == decision.get("stateDigest"):
            code = "revision_lineage_changed"
        else:
            code = "stale_decision"
        return {
            "id": decision_id,
            "currentness": "historical",
            "residualReasonCodes": [code],
            "targetAssessmentRevision": decision["targetAssessmentRevision"],
            "currentResidualReasonCodes": self.assess()["residualReasonCodes"],
        }

    def decision_evidence(self, decision_id: str) -> list[dict]:
        """Evidence a decision was based on, including withdrawn records."""
        decision = self._decisions.get(decision_id)
        if decision is None:
            raise CommandError("unknown_decision", decision_id)
        archived = {entry["evidence"]["id"]: entry["evidence"]
                    for entry in self.archived_evidence}
        records: list[dict] = []
        for evidence_id in decision.get("evidenceIds", []):
            record = next((e for e in self.evidence if e["id"] == evidence_id), None)
            record = record if record is not None else archived.get(evidence_id)
            if record is None:
                raise CommandError("unknown_evidence", evidence_id)
            records.append(copy.deepcopy(record))
        return records

    def eligibility(self, role: str = "project_manager") -> dict:
        """Whether acceptance is available now, with the codes that block it."""
        assessment = self.assess()
        reasons: list[str] = []
        if role != "project_manager":
            reasons.append("role_denied")
        if any(r["status"] != "supported" for r in assessment["requirements"]):
            reasons.append("mandatory_requirements_not_supported")
        now = self.project.get("_now", "1970-01-01T00:00:00Z")
        if any(
            e.get("reviewDisposition") == "accepted" and is_expired(e, now)
            for e in self.evidence
        ):
            reasons.append("mandatory_evidence_expired")
        # A closed dependency graph is already reported as an unmet requirement,
        # so integration_failed counts only the other five checks.
        if any(c["id"] != "dependency_closure" for c in assessment["integrated"]["checks"]):
            reasons.append("integration_failed")

        latest = self.latest_decision()
        if latest:
            if latest["requirementSetVersion"] != self.project.get("requirementSetVersion", 1):
                reasons.append("requirement_set_changed")
            elif (
                assessment["readiness"] == "ready_for_review"
                and latest["targetAssessmentRevision"] != self.assessment_revision
            ):
                if self._state_digest() == latest.get("stateDigest"):
                    reasons.append("revision_lineage_changed")
                else:
                    reasons.append("stale_revision")
        return {
            "eligible": not reasons,
            "reasons": reasons,
            "targetAssessmentRevision": self.assessment_revision,
        }

    def _state_digest(self) -> str:
        assessed_state = {k: v for k, v in self.project.items() if not k.startswith("_")}
        return digest(assessed_state)

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

    def _commit(
        self,
        command: dict,
        event_type: str,
        payload: dict,
        assessed: bool | None = None,
    ) -> dict:
        """Append the event and advance both counters. Cannot reject."""
        if event_type not in ASSESSED_EVENTS | OPINION_EVENTS:
            raise CommandError("unknown_event", event_type)

        if assessed is None:
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
            "assessedFactsChanged": assessed,
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
        if any(e["id"] == evidence["id"] for e in self.evidence) or any(
            entry["evidence"]["id"] == evidence["id"] for entry in self.archived_evidence
        ):
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
        return self._commit(command, "change.adopted", {
            "changeId": change["id"],
            "changedPaths": sorted(fields),
        })

    def review_evidence(self, command: dict, evidence_id: str, disposition: str) -> dict:
        """Record a review disposition. A changed disposition is an assessed fact."""
        replay = self._replay(command)
        if replay is not None:
            return replay
        if command.get("role") not in ("project_manager", "contributor"):
            raise CommandError("role_denied")
        record = next((e for e in self.evidence if e["id"] == evidence_id), None)
        if record is None:
            raise CommandError("unknown_evidence", evidence_id)
        if disposition not in REVIEW_DISPOSITIONS:
            raise CommandError("invalid_disposition", disposition)
        replay = self._begin(command, "evidence.reviewed")
        if replay is not None:
            return replay
        previous = record["reviewDisposition"]
        record["reviewDisposition"] = disposition
        return self._commit(
            command,
            "evidence.reviewed",
            {
                "evidenceId": evidence_id,
                "disposition": disposition,
                "previousDisposition": previous,
            },
            assessed=disposition != previous,
        )

    def change_requirement_set(
        self,
        command: dict,
        requirements: list[dict],
        evidence: list[dict],
    ) -> dict:
        """Replace the requirement set, incrementing its version once."""
        replay = self._replay(command)
        if replay is not None:
            return replay
        if command.get("role") != "project_manager":
            raise CommandError("role_denied")
        replay = self._begin(command, "requirementSet.changed")
        if replay is not None:
            return replay

        requirement_ids = {r.get("id") for r in requirements if isinstance(r, dict)}
        if len(requirement_ids) != len(requirements):
            raise CommandError("invalid_requirement", "requirements need unique string ids")
        for req in requirements:
            problems = validate_requirement(req, requirement_ids)
            if problems:
                raise CommandError("invalid_requirement", problems[0])
        archived_ids = {entry["evidence"]["id"] for entry in self.archived_evidence}
        existing = {e["id"]: e for e in self.evidence}
        for record in evidence:
            if record["id"] in archived_ids:
                raise CommandError("duplicate_evidence", record["id"])
            previous = existing.get(record["id"])
            if previous is not None and canon(previous) != canon(record):
                raise CommandError(
                    "invalid_evidence",
                    f"{record['id']}: records are immutable; withdraw and attach a new id",
                )

        for ev in evidence:
            problems = validate_evidence_record(ev, requirement_ids)
            if problems:
                raise CommandError("invalid_evidence", problems[0])

        version = self.project.get("requirementSetVersion", 1) + 1
        kept_ids = {e["id"] for e in evidence}
        for record in self.evidence:
            if record["id"] in kept_ids:
                continue
            self.archived_evidence.append({
                "evidence": copy.deepcopy(record),
                "archivedAtSequence": self.sequence + 1,
                "archiveReason": "requirement_set_changed",
                "requirementSetVersion": version,
            })
        self.requirements = copy.deepcopy(requirements)
        self.evidence = copy.deepcopy(evidence)
        self.project["requirementSetVersion"] = version
        return self._commit(command, "requirementSet.changed", {
            "requirementSetVersion": version,
            "requirementIds": sorted(requirement_ids),
            "evidenceIds": [e["id"] for e in evidence],
        })

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
            "stateDigest": self._state_digest(),
            "evidenceIds": evidence_ids,
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

    @classmethod
    def from_export(cls, export: dict) -> "Store":
        """Rebuild a store, including replay results, from a validated export."""
        problems = validate_export(export)
        if problems:
            raise CommandError("invalid_export", problems[0])
        store = cls(export["project"], export["requirements"], export["evidence"])
        store.sequence = export["counters"]["sequence"]
        store.assessment_revision = export["counters"]["assessmentRevision"]
        store.events = copy.deepcopy(export["events"])
        store.archived_evidence = copy.deepcopy(export["archivedEvidence"])
        store._decisions = {d["id"]: copy.deepcopy(d) for d in export["decisions"]}
        for event in store.events:
            command_id = event.get("commandId")
            if not command_id:
                continue
            result = {
                "sequence": event["sequence"],
                "assessmentRevision": event["resultingAssessmentRevision"],
                "assessedFactsChanged": bool(event.get("assessedFactsChanged")),
            }
            if event["eventType"] == "decision.recorded":
                result["decisionId"] = event.get("payload", {}).get("decisionId")
            store._results[command_id] = result
        return store

    def export(self) -> dict:
        return {
            "exportVersion": EXPORT_VERSION,
            "project": self.snapshot(),
            "requirements": self.requirements,
            "evidence": self.evidence,
            "archivedEvidence": self.archived_evidence,
            "events": self.events,
            "decisions": list(self._decisions.values()),
            "counters": {
                "sequence": self.sequence,
                "assessmentRevision": self.assessment_revision,
            },
        }
