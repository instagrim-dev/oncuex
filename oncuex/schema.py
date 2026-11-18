"""Canonical executable schema for OnCueX records and fixtures.

The typed field table, record shapes, enumerations and identifier patterns are
declared once here. The engine, the fixture validator and the tests import this
module, so a schema change cannot reach one reader and miss another.

Expected results are deliberately absent. Nothing in this module knows which
requirements the venue-change or expiry cases should report; those live in the
expectation fixtures and are never read by the evaluator.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

SCHEMA_VERSION = "1.1"

STATUSES = ("missing", "blocked", "outdated", "supported")

CHECK_IDS = (
    "access_vs_arrival",
    "occupancy_vs_headcount",
    "runofshow_vs_hardstop",
    "total_cost",
    "attestation_current",
    "dependency_closure",
)

TYPE_NAMES = ("integer", "string", "time", "enum", "collection")

PREDICATE_TYPES = (
    "evidence_present",
    "numeric_within",
    "time_within_window",
    "set_equals",
    "attestation_reviewed",
)

# Parameter names a predicate may read. Anything else is a schema error, so a
# misspelled threshold cannot silently stop being enforced.
PREDICATE_PARAMS: dict[str, dict[str, tuple[str, ...]]] = {
    "evidence_present": {"required": (), "optional": ("deliverableCount", "deliveryDays")},
    "numeric_within": {
        "required": ("field",),
        "optional": ("minimum", "maximum", "maximumMinorUnits", "unit"),
    },
    "time_within_window": {"required": (), "optional": ("setupMinutes", "marginMinutes")},
    "set_equals": {"required": ("field", "value"), "optional": ()},
    "attestation_reviewed": {"required": (), "optional": ("attestationField",)},
}

EVIDENCE_TYPES = ("confirmation", "document", "measurement", "quote")
EXPIRY_MODES = ("absolute", "relative")
REVIEW_DISPOSITIONS = ("pending", "accepted", "rejected")
SOURCE_KINDS = ("brief", "vendor_document", "internal_note", "photo_plan", "ai_output")
TRUST_VALUES = ("untrusted_for_instructions",)
ROLES = ("project_manager", "contributor")
DECISION_DISPOSITIONS = ("accepted", "rejected")
EVENT_TYPES = (
    "brief.adopted",
    "evidence.attached",
    "evidence.reviewed",
    "change.adopted",
    "decision.recorded",
    "requirementSet.changed",
)

ID_PATTERNS = {
    "project": re.compile(r"^PRJ-[a-z0-9-]+$"),
    "milestone": re.compile(r"^MS-\d+$"),
    "requirement": re.compile(r"^REQ-[a-z0-9-]+-\d+$"),
    "evidence": re.compile(r"^EV-\d+$"),
    "source": re.compile(r"^SRC-\d+$"),
    "change": re.compile(r"^CHG-[A-Za-z0-9-]+$"),
    "decision": re.compile(r"^DEC-\d+$"),
    "command": re.compile(r"^CMD-[A-Za-z0-9-]+$"),
}

TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")

# The single declaration of every bindable path. Keyed by dotted path.
FIELD_SCHEMA: dict[str, dict[str, Any]] = {
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
    "location.fireAttestation": {
        "type": "enum",
        "values": ["reviewed", "not_reviewed", "missing"],
    },
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

# Compatibility alias: earlier modules called the same table TYPED_PATHS.
TYPED_PATHS = FIELD_SCHEMA


class SchemaError(ValueError):
    """Raised when a snapshot or binding violates the typed schema."""


# ---------------------------------------------------------------- primitives
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


def is_expired(evidence: dict, now: str) -> bool:
    """An evidence record is stale once its expiry has passed."""
    expires = evidence.get("expiresAt")
    return bool(expires) and expires <= now


def type_ok(kind: str, value: Any) -> bool:
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "time":
        return isinstance(value, str) and bool(TIME.match(value))
    if kind == "enum":
        return isinstance(value, str)
    if kind == "collection":
        return isinstance(value, (list, dict))
    return False


def value_matches(path: str, value: Any) -> bool:
    spec = FIELD_SCHEMA.get(path)
    if spec is None:
        return False
    kind = spec["type"]
    if kind == "enum":
        return value in spec.get("values", [])
    return type_ok(kind, value)


def binding_matches(path: str, value: Any, snapshot: dict) -> bool:
    """A binding is valid when its stored value equals the snapshot value.

    Collections are compared by canonical digest, scalars by equality after a
    type check, so a string bound where an integer lives cannot silently match.
    """
    spec = FIELD_SCHEMA.get(path)
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


# ---------------------------------------------------------------- record rules
def leaves(obj: Any, prefix: str = "") -> set[str]:
    out: set[str] = set()
    if isinstance(obj, dict):
        for key, val in obj.items():
            out |= leaves(val, f"{prefix}.{key}" if prefix else key)
    else:
        out.add(prefix)
    return out


def _ids(records: Iterable[dict], key: str = "id") -> set[str]:
    return {r[key] for r in records if isinstance(r, dict) and key in r}


def _check_keys(record: dict, allowed: set[str], required: Iterable[str], label: str) -> list[str]:
    errors: list[str] = []
    extra = sorted(set(record) - allowed)
    if extra:
        errors.append(f"{label}: unexpected field {extra}")
    errors.extend(f"{label}: missing field {name}" for name in required if name not in record)
    return errors


def validate_field_schema(schema: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(schema, dict):
        return ["fieldSchema must be an object"]
    for path, spec in schema.items():
        if not isinstance(spec, dict):
            errors.append(f"fieldSchema.{path}: spec must be an object")
            continue
        unknown = set(spec) - {"type", "values", "compare"}
        if unknown:
            errors.append(f"fieldSchema.{path}: unexpected spec keys {sorted(unknown)}")
        kind = spec.get("type")
        if kind not in TYPE_NAMES:
            errors.append(f"fieldSchema.{path}: unknown type {kind!r}")
            continue
        if kind == "enum":
            values = spec.get("values")
            if not (isinstance(values, list) and values and all(isinstance(v, str) for v in values)):
                errors.append(f"fieldSchema.{path}: enum needs a non-empty list of strings")
        if kind == "collection" and spec.get("compare") != "digest":
            errors.append(f"fieldSchema.{path}: collection must declare compare='digest'")
    if schema != FIELD_SCHEMA:
        missing = sorted(set(FIELD_SCHEMA) - set(schema))
        extra = sorted(set(schema) - set(FIELD_SCHEMA))
        if missing:
            errors.append(f"fieldSchema missing canonical paths {missing}")
        if extra:
            errors.append(f"fieldSchema declares non-canonical paths {extra}")
        for path in sorted(set(schema) & set(FIELD_SCHEMA)):
            if schema[path] != FIELD_SCHEMA[path]:
                errors.append(
                    f"fieldSchema.{path} differs from the canonical declaration"
                )
    return errors


def validate_brief(brief: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(brief, dict):
        return ["brief: must be an object"]
    allowed = {
        "client",
        "project",
        "guestCount",
        "guestCountIsFixed",
        "eventDate",
        "timezone",
        "approvedBudget",
        "owner",
        "openQuestions",
        "circulationBuffer",
    }
    required = {
        "client",
        "project",
        "guestCount",
        "eventDate",
        "timezone",
        "approvedBudget",
        "owner",
        "openQuestions",
        "circulationBuffer",
    }
    errors += _check_keys(brief, allowed, required, "brief")

    for name in ("client", "project", "timezone"):
        if name in brief and not isinstance(brief[name], str):
            errors.append(f"brief.{name}: must be a string")
    if "guestCount" in brief and not type_ok("integer", brief["guestCount"]):
        errors.append("brief.guestCount: must be an integer")
    if "guestCountIsFixed" in brief and not isinstance(brief["guestCountIsFixed"], bool):
        errors.append("brief.guestCountIsFixed: must be a boolean")
    if "circulationBuffer" in brief and not type_ok("integer", brief["circulationBuffer"]):
        errors.append("brief.circulationBuffer: must be an integer")
    if "eventDate" in brief and not (
        isinstance(brief["eventDate"], str) and DATE.match(brief["eventDate"])
    ):
        errors.append("brief.eventDate: must be YYYY-MM-DD")

    budget = brief.get("approvedBudget")
    if not isinstance(budget, dict):
        errors.append("brief.approvedBudget: must be an object")
    else:
        errors += _check_keys(budget, {"currency", "minorUnits"}, {"currency", "minorUnits"},
                              "brief.approvedBudget")
        if not isinstance(budget.get("currency"), str):
            errors.append("brief.approvedBudget.currency: must be a string")
        if not type_ok("integer", budget.get("minorUnits")):
            errors.append("brief.approvedBudget.minorUnits: must be an integer")

    owner = brief.get("owner")
    if not isinstance(owner, dict):
        errors.append("brief.owner: must be an object")
    else:
        errors += _check_keys(owner, {"id", "name", "role"}, {"id", "name", "role"},
                              "brief.owner")
        if owner.get("role") not in ROLES:
            errors.append(f"brief.owner.role: {owner.get('role')!r} is not a role")

    questions = brief.get("openQuestions")
    if not isinstance(questions, list) or not all(isinstance(q, str) for q in questions):
        errors.append("brief.openQuestions: must be a list of strings")

    for path in (p for p in FIELD_SCHEMA if p.startswith("brief.")):
        ok, value = resolve(brief, path[len("brief."):])
        if not ok:
            errors.append(f"brief: declared path {path} is not present")
        elif not value_matches(path, value):
            errors.append(f"brief.{path[6:]}: {value!r} is not a valid {FIELD_SCHEMA[path]['type']}")
    return errors


def validate_requirement(
    req: dict,
    requirement_ids: set[str] | None = None,
    owner_ids: set[str] | None = None,
    milestone_ids: set[str] | None = None,
) -> list[str]:
    label = req.get("id", "<requirement>") if isinstance(req, dict) else "<requirement>"
    if not isinstance(req, dict):
        return ["requirement: must be an object"]
    allowed = {
        "id",
        "version",
        "milestoneId",
        "owner",
        "label",
        "predicateType",
        "expectedValues",
        "prerequisiteIds",
        "requiredEvidenceType",
        "expiryPolicy",
        "blocking",
        "fieldBindings",
    }
    errors = _check_keys(req, allowed, allowed, str(label))

    if not (isinstance(req.get("id"), str) and ID_PATTERNS["requirement"].match(req["id"])):
        errors.append(f"{label}: id must match REQ-<domain>-<n>")
    if not type_ok("integer", req.get("version")) or req.get("version", 0) < 1:
        errors.append(f"{label}: version must be a positive integer")
    if milestone_ids is not None and req.get("milestoneId") not in milestone_ids:
        errors.append(f"{label}: unknown milestone {req.get('milestoneId')!r}")
    if owner_ids is not None and req.get("owner") not in owner_ids:
        errors.append(f"{label}: unknown owner {req.get('owner')!r}")
    if not isinstance(req.get("label"), str) or not req.get("label"):
        errors.append(f"{label}: label must be a non-empty string")

    predicate = req.get("predicateType")
    if predicate not in PREDICATE_TYPES:
        errors.append(f"{label}: unknown predicateType {predicate!r}")

    expected = req.get("expectedValues")
    if not isinstance(expected, dict):
        errors.append(f"{label}: expectedValues must be an object")
    elif predicate in PREDICATE_PARAMS:
        spec = PREDICATE_PARAMS[predicate]
        allowed_params = set(spec["required"]) | set(spec["optional"])
        unknown = set(expected) - allowed_params
        if unknown:
            errors.append(f"{label}: predicate {predicate} does not read {sorted(unknown)}")
        missing = [name for name in spec["required"] if name not in expected]
        if missing:
            errors.append(f"{label}: predicate {predicate} needs {missing}")
        errors += _validate_predicate_values(label, predicate, expected)

    prerequisites = req.get("prerequisiteIds")
    if not isinstance(prerequisites, list) or not all(isinstance(p, str) for p in prerequisites):
        errors.append(f"{label}: prerequisiteIds must be a list of strings")
    else:
        if len(prerequisites) != len(set(prerequisites)):
            errors.append(f"{label}: duplicate prerequisite")
        if req.get("id") in prerequisites:
            errors.append(f"{label}: requirement is its own prerequisite")
        if requirement_ids is not None:
            errors += [
                f"{label}: unknown prerequisite {p}" for p in prerequisites if p not in requirement_ids
            ]

    if req.get("requiredEvidenceType") not in EVIDENCE_TYPES:
        errors.append(f"{label}: unknown requiredEvidenceType {req.get('requiredEvidenceType')!r}")

    expiry = req.get("expiryPolicy")
    if not isinstance(expiry, dict):
        errors.append(f"{label}: expiryPolicy must be an object")
    else:
        errors += _check_keys(expiry, {"mode", "value"}, {"mode", "value"}, f"{label}.expiryPolicy")
        if expiry.get("mode") not in EXPIRY_MODES:
            errors.append(f"{label}: expiry mode {expiry.get('mode')!r} is not allowed")
        value = expiry.get("value")
        if not isinstance(value, str) or not value:
            errors.append(f"{label}: expiry value must be a non-empty string")
        elif expiry.get("mode") == "absolute" and not TIMESTAMP.match(value):
            errors.append(f"{label}: absolute expiry must be an ISO-8601 UTC timestamp")

    if not isinstance(req.get("blocking"), bool):
        errors.append(f"{label}: blocking must be a boolean")

    bindings = req.get("fieldBindings")
    if not isinstance(bindings, list) or not bindings or not all(isinstance(b, str) for b in bindings):
        errors.append(f"{label}: fieldBindings must be a non-empty list of strings")
    else:
        if len(bindings) != len(set(bindings)):
            errors.append(f"{label}: duplicate fieldBinding")
        errors += [f"{label}: undeclared binding {b}" for b in bindings if b not in FIELD_SCHEMA]
    return errors


def _validate_predicate_values(label: str, predicate: str, expected: dict) -> list[str]:
    errors: list[str] = []
    field = expected.get("field")
    if field is not None:
        if field not in FIELD_SCHEMA:
            errors.append(f"{label}: predicate field {field!r} is not declared")
        elif predicate == "numeric_within" and FIELD_SCHEMA[field]["type"] != "integer":
            errors.append(f"{label}: numeric_within field {field!r} is not an integer path")

    if predicate == "numeric_within":
        bounds = [k for k in ("minimum", "maximum", "maximumMinorUnits") if k in expected]
        if not bounds:
            errors.append(f"{label}: numeric_within needs a minimum, maximum or maximumMinorUnits")
        errors += [
            f"{label}: {name} must be an integer"
            for name in bounds
            if not type_ok("integer", expected[name])
        ]
        if "unit" in expected and not isinstance(expected["unit"], str):
            errors.append(f"{label}: unit must be a string")

    if predicate == "time_within_window":
        bounds = [k for k in ("setupMinutes", "marginMinutes") if k in expected]
        if len(bounds) > 1:
            errors.append(f"{label}: time_within_window accepts one of setupMinutes or marginMinutes")
        errors += [
            f"{label}: {name} must be a non-negative integer"
            for name in bounds
            if not type_ok("integer", expected[name]) or expected[name] < 0
        ]

    if predicate == "attestation_reviewed" and "attestationField" in expected:
        attestation = expected["attestationField"]
        if attestation not in FIELD_SCHEMA:
            errors.append(f"{label}: attestationField {attestation!r} is not declared")
        elif FIELD_SCHEMA[attestation]["type"] != "enum":
            errors.append(f"{label}: attestationField {attestation!r} is not an enum path")

    if predicate == "evidence_present":
        errors += [
            f"{label}: {name} must be an integer"
            for name in ("deliverableCount", "deliveryDays")
            if name in expected and not type_ok("integer", expected[name])
        ]
    return errors


def validate_source(src: dict) -> list[str]:
    if not isinstance(src, dict):
        return ["sourceReference: must be an object"]
    label = src.get("id", "<source>")
    errors = _check_keys(
        src, {"id", "kind", "excerpt", "attribution", "trust"}, 
        {"id", "kind", "excerpt", "attribution", "trust"}, str(label)
    )
    if not (isinstance(src.get("id"), str) and ID_PATTERNS["source"].match(src["id"])):
        errors.append(f"{label}: id must match SRC-<n>")
    if src.get("kind") not in SOURCE_KINDS:
        errors.append(f"{label}: unknown kind {src.get('kind')!r}")
    if not isinstance(src.get("excerpt"), str) or not src.get("excerpt").strip():
        errors.append(f"{label}: excerpt must be a non-empty string")
    if not isinstance(src.get("attribution"), str) or not src.get("attribution"):
        errors.append(f"{label}: attribution must be a non-empty string")
    if src.get("trust") not in TRUST_VALUES:
        errors.append(f"{label}: trust {src.get('trust')!r} is not allowed")
    return errors


def validate_evidence_record(
    ev: dict,
    requirement_ids: set[str] | None = None,
    source_ids: set[str] | None = None,
) -> list[str]:
    if not isinstance(ev, dict):
        return ["evidence: must be an object"]
    label = ev.get("id", "<evidence>")
    allowed = {
        "id",
        "requirementId",
        "type",
        "sourceRefIds",
        "sourceExcerpt",
        "contentDigest",
        "artifactRef",
        "issuer",
        "observedAt",
        "expiresAt",
        "boundFieldVersions",
        "reviewDisposition",
    }
    errors = _check_keys(ev, allowed, allowed, str(label))

    if not (isinstance(ev.get("id"), str) and ID_PATTERNS["evidence"].match(ev["id"])):
        errors.append(f"{label}: id must match EV-<n>")
    if requirement_ids is not None and ev.get("requirementId") not in requirement_ids:
        errors.append(f"{label}: unknown requirement {ev.get('requirementId')!r}")

    if ev.get("type") not in EVIDENCE_TYPES:
        errors.append(f"{label}: unknown evidence type {ev.get('type')!r}")

    refs = ev.get("sourceRefIds")
    if not isinstance(refs, list) or not refs or not all(isinstance(r, str) for r in refs):
        errors.append(f"{label}: sourceRefIds must be a non-empty list of strings")
    else:
        if len(refs) != len(set(refs)):
            errors.append(f"{label}: duplicate source reference")
        if source_ids is not None:
            errors += [f"{label}: unknown source {r}" for r in refs if r not in source_ids]

    if not isinstance(ev.get("sourceExcerpt"), str) or not ev.get("sourceExcerpt").strip():
        errors.append(f"{label}: sourceExcerpt must be a non-empty string")
    if not isinstance(ev.get("artifactRef"), str) or not ev.get("artifactRef"):
        errors.append(f"{label}: artifactRef must be a non-empty string")
    if not isinstance(ev.get("issuer"), str) or not ev.get("issuer"):
        errors.append(f"{label}: issuer must be a non-empty string")

    observed = ev.get("observedAt")
    expires = ev.get("expiresAt")
    if not (isinstance(observed, str) and TIMESTAMP.match(observed)):
        errors.append(f"{label}: observedAt must be an ISO-8601 UTC timestamp")
    if not (isinstance(expires, str) and TIMESTAMP.match(expires)):
        errors.append(f"{label}: expiresAt must be an ISO-8601 UTC timestamp")
    if isinstance(observed, str) and isinstance(expires, str) and expires <= observed:
        errors.append(f"{label}: expiresAt must be after observedAt")

    bound = ev.get("boundFieldVersions")
    if not isinstance(bound, dict) or not bound:
        errors.append(f"{label}: boundFieldVersions must be a non-empty object")
    else:
        for path, value in bound.items():
            if path not in FIELD_SCHEMA:
                errors.append(f"{label}: undeclared bound field {path}")
            elif FIELD_SCHEMA[path]["type"] == "collection":
                if not (isinstance(value, str) and DIGEST.match(value)):
                    errors.append(f"{label}: collection binding {path} must be a sha256 digest")
            elif not value_matches(path, value):
                errors.append(f"{label}: bound {path} = {value!r} is not a valid "
                              f"{FIELD_SCHEMA[path]['type']}")

    digest_expected = digest({"sourceRefIds": ev.get("sourceRefIds", []),
                              "sourceExcerpt": ev.get("sourceExcerpt", "")})
    if ev.get("contentDigest") != digest_expected:
        errors.append(f"{label}: contentDigest does not recompute from sourceRefIds and excerpt")
    if ev.get("reviewDisposition") not in REVIEW_DISPOSITIONS:
        errors.append(f"{label}: unknown reviewDisposition {ev.get('reviewDisposition')!r}")
    return errors


def validate_milestone(ms: dict, project_manager_id: str | None = None) -> list[str]:
    if not isinstance(ms, dict):
        return ["milestone: must be an object"]
    label = ms.get("id", "<milestone>")
    errors = _check_keys(ms, {"id", "label", "projectManagerId"},
                         {"id", "label", "projectManagerId"}, str(label))
    if not (isinstance(ms.get("id"), str) and ID_PATTERNS["milestone"].match(ms["id"])):
        errors.append(f"{label}: id must match MS-<n>")
    if not isinstance(ms.get("label"), str) or not ms.get("label"):
        errors.append(f"{label}: label must be a non-empty string")
    if project_manager_id is not None and ms.get("projectManagerId") != project_manager_id:
        errors.append(f"{label}: projectManagerId must be {project_manager_id!r}")
    return errors


def validate_state(name: str, state: dict) -> list[str]:
    errors: list[str] = []
    label = f"state.{name}"
    if not isinstance(state, dict):
        return [f"{label}: must be an object"]
    for path in (p for p in FIELD_SCHEMA if not p.startswith("brief.")):
        ok, value = resolve(state, path)
        if not ok:
            errors.append(f"{label}: declared path {path} is not present")
            continue
        if not type_ok(FIELD_SCHEMA[path]["type"], value):
            errors.append(f"{label}.{path}: {value!r} is not a valid {FIELD_SCHEMA[path]['type']}")
            continue
        if FIELD_SCHEMA[path]["type"] == "enum" and value not in FIELD_SCHEMA[path]["values"]:
            errors.append(f"{label}.{path}: {value!r} is not a declared member")
        if FIELD_SCHEMA[path]["type"] == "time" and not TIME.match(value):
            errors.append(f"{label}.{path}: {value!r} is not HH:MM")
    if not type_ok("integer", state.get("assessmentRevision")):
        errors.append(f"{label}.assessmentRevision: must be an integer")

    declared = set(FIELD_SCHEMA)
    for path in leaves(state):
        if path in declared:
            continue
        if any(candidate.startswith(path + ".") for candidate in declared):
            continue
        errors.append(f"{label}: path {path} is not declared in fieldSchema")

    errors += _validate_budget_block(label, state.get("budget"))
    return errors


def _validate_budget_block(label: str, budget: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(budget, dict):
        return [f"{label}.budget: must be an object"]
    commitments = budget.get("commitments")
    if not isinstance(commitments, list) or not commitments:
        errors.append(f"{label}.budget.commitments: must be a non-empty list")
        return errors
    currencies: set[str] = set()
    for index, commitment in enumerate(commitments):
        where = f"{label}.budget.commitments[{index}]"
        if not isinstance(commitment, dict):
            errors.append(f"{where}: must be an object")
            continue
        errors += _check_keys(commitment, {"vendor", "category", "amount"},
                              {"vendor", "category", "amount"}, where)
        if not isinstance(commitment.get("vendor"), str) or not commitment.get("vendor"):
            errors.append(f"{where}.vendor: must be a non-empty string")
        if not isinstance(commitment.get("category"), str) or not commitment.get("category"):
            errors.append(f"{where}.category: must be a non-empty string")
        amount = commitment.get("amount")
        if not isinstance(amount, dict):
            errors.append(f"{where}.amount: must be an object")
            continue
        errors += _check_keys(amount, {"currency", "minorUnits"}, {"currency", "minorUnits"},
                              f"{where}.amount")
        if not isinstance(amount.get("currency"), str):
            errors.append(f"{where}.amount.currency: must be a string")
        else:
            currencies.add(amount["currency"])
        if not type_ok("integer", amount.get("minorUnits")):
            errors.append(f"{where}.amount.minorUnits: must be an integer")

    total = budget.get("committedTotal")
    if not isinstance(total, dict):
        errors.append(f"{label}.budget.committedTotal: must be an object")
    else:
        errors += _check_keys(total, {"currency", "minorUnits"}, {"currency", "minorUnits"},
                              f"{label}.budget.committedTotal")
        if not type_ok("integer", total.get("minorUnits")):
            errors.append(f"{label}.budget.committedTotal.minorUnits: must be an integer")
        if isinstance(total.get("currency"), str) and currencies and currencies != {total["currency"]}:
            errors.append(f"{label}.budget: commitment currencies {sorted(currencies)} "
                          f"do not match total currency {total['currency']!r}")
    return errors


# ---------------------------------------------------------------- documents
def validate_document(doc: dict) -> list[str]:
    """Validate a scenario fixture document against the canonical schema."""
    if not isinstance(doc, dict):
        return ["scenario document: must be an object"]
    errors: list[str] = []
    allowed = {
        "schemaVersion",
        "fixtureVersion",
        "provenance",
        "scenario",
        "milestones",
        "fieldSchema",
        "requirements",
        "sourceReferences",
        "evidence",
        "state",
    }
    errors += _check_keys(doc, allowed, allowed, "scenario document")
    if not isinstance(doc.get("schemaVersion"), str):
        errors.append("scenario document.schemaVersion: must be a string")
    if not isinstance(doc.get("fixtureVersion"), str):
        errors.append("scenario document.fixtureVersion: must be a string")

    provenance = doc.get("provenance")
    if not isinstance(provenance, dict):
        errors.append("provenance: must be an object")
    else:
        errors += _check_keys(provenance, {"kind", "note"}, {"kind", "note"}, "provenance")

    schema = doc.get("fieldSchema")
    if not isinstance(schema, dict):
        errors.append("fieldSchema: must be an object")
        schema = {}
    else:
        errors += validate_field_schema(schema)

    scenario = doc.get("scenario")
    brief: dict = {}
    owner_id: str | None = None
    if not isinstance(scenario, dict):
        errors.append("scenario: must be an object")
    else:
        errors += _check_keys(
            scenario,
            {"id", "milestoneIds", "requirementSetVersion", "brief", "contributors"},
            {"id", "milestoneIds", "requirementSetVersion", "brief", "contributors"},
            "scenario",
        )
        if not (isinstance(scenario.get("id"), str) and ID_PATTERNS["project"].match(scenario["id"])):
            errors.append("scenario.id: must match PRJ-<slug>")
        if not type_ok("integer", scenario.get("requirementSetVersion")):
            errors.append("scenario.requirementSetVersion: must be an integer")
        brief = scenario.get("brief") if isinstance(scenario.get("brief"), dict) else {}
        if not brief:
            errors.append("scenario.brief: must be an object")
        else:
            errors += validate_brief(brief)
            owner = brief.get("owner")
            if isinstance(owner, dict):
                owner_id = owner.get("id")
        contributors = scenario.get("contributors")
        if not isinstance(contributors, list) or not contributors:
            errors.append("scenario.contributors: must be a non-empty list")
        else:
            for index, contributor in enumerate(contributors):
                where = f"scenario.contributors[{index}]"
                if not isinstance(contributor, dict):
                    errors.append(f"{where}: must be an object")
                    continue
                errors += _check_keys(contributor, {"id", "name", "role", "simulated"},
                                      {"id", "name", "role", "simulated"}, where)
                if contributor.get("role") not in ROLES:
                    errors.append(f"{where}: unknown role {contributor.get('role')!r}")
                if not isinstance(contributor.get("simulated"), bool):
                    errors.append(f"{where}: simulated must be a boolean")

    milestones = doc.get("milestones")
    milestone_ids: set[str] = set()
    if not isinstance(milestones, list) or not milestones:
        errors.append("milestones: must be a non-empty list")
    else:
        for ms in milestones:
            if isinstance(ms, dict) and isinstance(ms.get("id"), str):
                if ms["id"] in milestone_ids:
                    errors.append(f"milestones: duplicate id {ms['id']}")
                milestone_ids.add(ms["id"])
            errors += validate_milestone(ms, owner_id)

    if isinstance(scenario, dict):
        declared_milestones = scenario.get("milestoneIds")
        if not isinstance(declared_milestones, list) or not declared_milestones:
            errors.append("scenario.milestoneIds: must be a non-empty list")
        else:
            errors += [
                f"scenario.milestoneIds: unknown milestone {ms}" 
                for ms in declared_milestones 
                if milestone_ids and ms not in milestone_ids
            ]

    requirements = doc.get("requirements")
    requirement_ids: set[str] = set()
    owner_ids: set[str] = {owner_id} if owner_id else set()
    if isinstance(scenario, dict) and isinstance(scenario.get("contributors"), list):
        owner_ids |= _ids(scenario["contributors"])
    if not isinstance(requirements, list) or not requirements:
        errors.append("requirements: must be a non-empty list")
    else:
        ids = [r.get("id") for r in requirements if isinstance(r, dict)]
        requirement_ids = {rid for rid in ids if isinstance(rid, str)}
        if len(ids) != len(requirement_ids):
            errors.append("requirements: ids must be unique strings")
        for req in requirements:
            errors += validate_requirement(req, requirement_ids, owner_ids, milestone_ids or None)

    sources = doc.get("sourceReferences")
    source_ids: set[str] = set()
    if not isinstance(sources, list) or not sources:
        errors.append("sourceReferences: must be a non-empty list")
    else:
        ids = [s.get("id") for s in sources if isinstance(s, dict)]
        source_ids = {sid for sid in ids if isinstance(sid, str)}
        if len(ids) != len(source_ids):
            errors.append("sourceReferences: ids must be unique strings")
        for src in sources:
            errors += validate_source(src)

    evidence = doc.get("evidence")
    if not isinstance(evidence, list):
        errors.append("evidence: must be a list")
        evidence = []
    else:
        ids = [e.get("id") for e in evidence if isinstance(e, dict)]
        if len(ids) != len({eid for eid in ids if isinstance(eid, str)}):
            errors.append("evidence: ids must be unique strings")
        for ev in evidence:
            errors += validate_evidence_record(ev, requirement_ids or None, source_ids or None)

    states = doc.get("state")
    if not isinstance(states, dict) or not states:
        errors.append("state: must be a non-empty object")
    else:
        for name, state in states.items():
            errors += validate_state(name, state)

    return errors


def validate_snapshot(snapshot: dict, requirements: Iterable[dict], evidence: Iterable[dict]) -> None:
    """Validate a snapshot and its records before evaluation. Raises SchemaError."""
    if not isinstance(snapshot, dict):
        raise SchemaError("snapshot must be an object")
    brief = snapshot.get("brief")
    if not isinstance(brief, dict):
        raise SchemaError("snapshot has no brief object")

    for path in FIELD_SCHEMA:
        if path.startswith("brief."):
            ok, value = resolve(brief, path[len("brief."):])
        else:
            ok, value = resolve(snapshot, path)
        if not ok:
            raise SchemaError(f"declared path {path} missing from snapshot")
        if not value_matches(path, value):
            raise SchemaError(f"{path} holds {value!r}, not a valid {FIELD_SCHEMA[path]['type']}")

    requirement_list = list(requirements)
    requirement_ids = _ids(requirement_list)
    for req in requirement_list:
        problems = validate_requirement(req, requirement_ids)
        if problems:
            raise SchemaError(problems[0])

    evidence_list = list(evidence)
    for ev in evidence_list:
        problems = validate_evidence_record(ev, requirement_ids)
        if problems:
            raise SchemaError(problems[0])


# ---------------------------------------------------------------- export contract
EXPORT_VERSION = "2.0"


def _validate_decision(decision: dict, evidence_ids: set[str]) -> list[str]:
    if not isinstance(decision, dict):
        return ["decision: must be an object"]
    label = decision.get("id", "<decision>")
    allowed = {
        "id",
        "actor",
        "role",
        "targetAssessmentRevision",
        "requirementSetVersion",
        "requirementSetDigest",
        "evidenceSetDigest",
        "integrationReviewResult",
        "disposition",
        "stateDigest",
        "evidenceIds",
    }
    errors = _check_keys(decision, allowed, allowed, str(label))
    if not (isinstance(decision.get("id"), str) and ID_PATTERNS["decision"].match(decision["id"])):
        errors.append(f"{label}: id must match DEC-<n>")
    if decision.get("role") != "project_manager":
        errors.append(f"{label}: role must be project_manager")
    if decision.get("disposition") != "accepted":
        errors.append(f"{label}: disposition must be accepted")
    for name in ("targetAssessmentRevision", "requirementSetVersion"):
        if not type_ok("integer", decision.get(name)):
            errors.append(f"{label}: {name} must be an integer")
    for name in ("requirementSetDigest", "evidenceSetDigest", "stateDigest"):
        value = decision.get(name)
        if not (isinstance(value, str) and DIGEST.match(value)):
            errors.append(f"{label}: {name} must be a sha256 digest")
    if not isinstance(decision.get("integrationReviewResult"), dict):
        errors.append(f"{label}: integrationReviewResult must be an object")
    ids = decision.get("evidenceIds")
    if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
        errors.append(f"{label}: evidenceIds must be a list of strings")
    else:
        if len(ids) != len(set(ids)):
            errors.append(f"{label}: duplicate evidenceIds entry")
        errors += [
            f"{label}: evidenceIds names unknown record {i}" for i in ids if i not in evidence_ids
        ]
        if decision.get("evidenceSetDigest") != digest(ids):
            errors.append(f"{label}: evidenceSetDigest does not match evidenceIds")
    return errors


def _validate_archive_entry(entry: dict) -> list[str]:
    if not isinstance(entry, dict):
        return ["archivedEvidence: entry must be an object"]
    errors = _check_keys(
        entry,
        {"evidence", "archivedAtSequence", "archiveReason", "requirementSetVersion"},
        {"evidence", "archivedAtSequence", "archiveReason", "requirementSetVersion"},
        "archivedEvidence",
    )
    if not type_ok("integer", entry.get("archivedAtSequence")):
        errors.append("archivedEvidence: archivedAtSequence must be an integer")
    if not isinstance(entry.get("archiveReason"), str) or not entry["archiveReason"]:
        errors.append("archivedEvidence: archiveReason must be a non-empty string")
    if not type_ok("integer", entry.get("requirementSetVersion")):
        errors.append("archivedEvidence: requirementSetVersion must be an integer")
    errors += validate_evidence_record(entry.get("evidence", {}))
    return errors


def validate_export(export: dict) -> list[str]:
    """Validate the documented export contract before a store accepts it."""
    if not isinstance(export, dict):
        return ["export: must be an object"]
    allowed = {
        "exportVersion",
        "project",
        "requirements",
        "evidence",
        "archivedEvidence",
        "events",
        "decisions",
        "counters",
    }
    errors = _check_keys(export, allowed, allowed, "export")
    if export.get("exportVersion") != EXPORT_VERSION:
        errors.append(
            f"export: unsupported exportVersion {export.get('exportVersion')!r}; "
            f"expected {EXPORT_VERSION}"
        )

    project = export.get("project")
    requirements = export.get("requirements")
    evidence = export.get("evidence")
    if not isinstance(project, dict):
        errors.append("export.project: must be an object")
    if not isinstance(requirements, list):
        errors.append("export.requirements: must be a list")
    if not isinstance(evidence, list):
        errors.append("export.evidence: must be a list")
    if errors and not isinstance(project, dict):
        return errors

    try:
        validate_snapshot(project, requirements or [], evidence or [])
    except SchemaError as exc:
        errors.append(f"export record: {exc}")

    archived = export.get("archivedEvidence")
    archived_ids: set[str] = set()
    if not isinstance(archived, list):
        errors.append("export.archivedEvidence: must be a list")
        archived = []
    else:
        for entry in archived:
            errors += _validate_archive_entry(entry)
            if isinstance(entry, dict) and isinstance(entry.get("evidence"), dict):
                archived_ids.add(entry["evidence"].get("id"))
        if len(archived_ids) != len(archived):
            errors.append("export.archivedEvidence: evidence ids must be unique")

    current_ids = {e.get("id") for e in evidence or [] if isinstance(e, dict)}
    current_list = [e.get("id") for e in evidence or [] if isinstance(e, dict)]
    if len(current_list) != len(current_ids):
        duplicates = sorted({i for i in current_list if current_list.count(i) > 1})
        errors.append(f"export: evidence ids must be unique; duplicated {duplicates}")
    overlap = current_ids & archived_ids
    if overlap:
        errors.append(f"export: evidence ids appear current and archived {sorted(overlap)}")

    decisions = export.get("decisions")
    if not isinstance(decisions, list):
        errors.append("export.decisions: must be a list")
        decisions = []
    known_evidence = current_ids | archived_ids
    decision_ids = set()
    for decision in decisions:
        errors += _validate_decision(decision, known_evidence)
        if isinstance(decision, dict):
            if decision.get("id") in decision_ids:
                errors.append(f"export.decisions: duplicate id {decision.get('id')}")
            decision_ids.add(decision.get("id"))

    events = export.get("events")
    if not isinstance(events, list):
        errors.append("export.events: must be a list")
        events = []
    previous = 0
    for event in events:
        if not isinstance(event, dict):
            errors.append("export.events: entry must be an object")
            continue
        errors += _check_keys(
            event,
            {
                "id",
                "sequence",
                "commandId",
                "eventType",
                "actor",
                "expectedAssessmentRevision",
                "resultingAssessmentRevision",
                "assessedFactsChanged",
                "payload",
            },
            {
                "id",
                "sequence",
                "eventType",
                "resultingAssessmentRevision",
                "assessedFactsChanged",
                "payload",
            },
            f"event {event.get('id', '<event>')}",
        )
        sequence = event.get("sequence")
        if not type_ok("integer", sequence) or sequence != previous + 1:
            errors.append(f"event {event.get('id', '<event>')}: sequence must follow {previous}")
        previous = sequence if type_ok("integer", sequence) else previous
        if event.get("eventType") not in EVENT_TYPES:
            errors.append(f"event {event.get('id', '<event>')}: unknown eventType")
        if not isinstance(event.get("assessedFactsChanged"), bool):
            errors.append(f"event {event.get('id', '<event>')}: assessedFactsChanged must be boolean")
        if not isinstance(event.get("payload"), dict):
            errors.append(f"event {event.get('id', '<event>')}: payload must be an object")

    counters = export.get("counters")
    if not isinstance(counters, dict):
        errors.append("export.counters: must be an object")
    else:
        errors += _check_keys(counters, {"sequence", "assessmentRevision"},
                              {"sequence", "assessmentRevision"}, "export.counters")
        sequence = counters.get("sequence")
        revision = counters.get("assessmentRevision")
        if not type_ok("integer", sequence) or not type_ok("integer", revision):
            errors.append("export.counters: both counters must be integers")
        else:
            if sequence != previous:
                errors.append("export.counters.sequence does not equal the last event")
            if revision < 0:
                errors.append("export.counters.assessmentRevision must not be negative")
            for decision in decisions:
                target = decision.get("targetAssessmentRevision") if isinstance(decision, dict) else None
                if type_ok("integer", target) and target > revision:
                    errors.append(
                        f"{decision.get('id')}: targetAssessmentRevision exceeds the export"
                    )
            for entry in archived:
                if not isinstance(entry, dict):
                    continue
                archived_at = entry.get("archivedAtSequence")
                if type_ok("integer", archived_at) and archived_at > sequence:
                    errors.append(
                        f"archivedEvidence {entry.get('evidence', {}).get('id')}: "
                        f"archivedAtSequence exceeds the event sequence"
                    )
    return errors
