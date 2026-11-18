/**
 * Canonical schema for OnCueX records, ported from the Python reference so the
 * operator UI evaluates the same declarations the contract is written against.
 *
 * No expected outcome is declared here. Field types, identifier shapes and the
 * export contract only.
 */

import { sha256Hex } from "./sha256";
import type {
  ArchiveEntry,
  Decision,
  EvidenceRecord,
  FieldSpec,
  FieldType,
  ProjectState,
  Requirement,
} from "./types";

export const SCHEMA_VERSION = "1.1";
export const EXPORT_VERSION = "2.0";

export const STATUSES = ["missing", "blocked", "outdated", "supported"] as const;

export const CHECK_IDS = [
  "access_vs_arrival",
  "occupancy_vs_headcount",
  "runofshow_vs_hardstop",
  "total_cost",
  "attestation_current",
  "dependency_closure",
] as const;

export const TYPE_NAMES: FieldType[] = ["integer", "string", "time", "enum", "collection"];

export const PREDICATE_TYPES = [
  "evidence_present",
  "numeric_within",
  "time_within_window",
  "set_equals",
  "attestation_reviewed",
] as const;

const PREDICATE_PARAMS: Record<string, { required: string[]; optional: string[] }> = {
  evidence_present: { required: [], optional: ["deliverableCount", "deliveryDays"] },
  numeric_within: {
    required: ["field"],
    optional: ["minimum", "maximum", "maximumMinorUnits", "unit"],
  },
  time_within_window: { required: [], optional: ["setupMinutes", "marginMinutes"] },
  set_equals: { required: ["field", "value"], optional: [] },
  attestation_reviewed: { required: [], optional: ["attestationField"] },
};

export const EVIDENCE_TYPES = ["confirmation", "document", "measurement", "quote"];
export const EXPIRY_MODES = ["absolute", "relative"];
export const REVIEW_DISPOSITIONS = ["pending", "accepted", "rejected"];
export const ROLES = ["project_manager", "contributor"];

export const EVENT_TYPES = [
  "brief.adopted",
  "evidence.attached",
  "evidence.reviewed",
  "change.adopted",
  "decision.recorded",
  "requirementSet.changed",
];

export const ID_PATTERNS = {
  project: /^PRJ-[a-z0-9-]+$/,
  milestone: /^MS-\d+$/,
  requirement: /^REQ-[a-z0-9-]+-\d+$/,
  evidence: /^EV-\d+$/,
  source: /^SRC-\d+$/,
  change: /^CHG-[A-Za-z0-9-]+$/,
  decision: /^DEC-\d+$/,
  command: /^CMD-[A-Za-z0-9-]+$/,
};

export const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;

/** The single declaration of every bindable path, keyed by dotted path. */
export const FIELD_SCHEMA: Record<string, FieldSpec> = {
  assessmentRevision: { type: "integer" },
  "brief.guestCount": { type: "integer" },
  "brief.approvedBudget.minorUnits": { type: "integer" },
  "location.venueId": { type: "string" },
  "location.venueName": { type: "string" },
  "location.capacity": { type: "integer" },
  "location.roomPlan": { type: "string" },
  "location.loadingWindow.start": { type: "time" },
  "location.loadingWindow.end": { type: "time" },
  "location.hardStop": { type: "time" },
  "location.fireAttestation": {
    type: "enum",
    values: ["reviewed", "not_reviewed", "missing"],
  },
  "crew.arrivalTime": { type: "time" },
  "production.runOfShowEnd": { type: "time" },
  "budget.commitments": { type: "collection", compare: "digest" },
  "budget.committedTotal.currency": { type: "string" },
  "budget.committedTotal.minorUnits": { type: "integer" },
  "photographer.arrivalWindow.start": { type: "time" },
  "photographer.arrivalWindow.end": { type: "time" },
  "photographer.deliverables.editedImages": { type: "integer" },
  "photographer.deliverables.deliveryDays": { type: "integer" },
};

export const TYPED_PATHS = FIELD_SCHEMA;

export class SchemaError extends Error {}

/* ---------------------------------------------------------------- primitives */

export const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Canonical JSON: sorted keys, no whitespace. Matches Python's separators. */
export function canon(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canon).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canon(record[key])}`).join(",")}}`;
}

export function digest(value: unknown): string {
  return `sha256:${sha256Hex(canon(value))}`;
}

export function resolve(doc: unknown, path: string): { ok: boolean; value: unknown } {
  let cursor: unknown = doc;
  for (const part of path.split(".")) {
    if (!isDict(cursor) || !(part in cursor)) {
      return { ok: false, value: null };
    }
    cursor = cursor[part];
  }
  return { ok: true, value: cursor };
}

export function isExpired(record: { expiresAt?: string }, now: string): boolean {
  const expires = record.expiresAt;
  return Boolean(expires) && String(expires) <= now;
}

export function typeOk(kind: string, value: unknown): boolean {
  switch (kind) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "time":
      return typeof value === "string" && TIME.test(value);
    case "enum":
      return typeof value === "string";
    case "collection":
      return Array.isArray(value) || isDict(value);
    default:
      return false;
  }
}

export function valueMatches(path: string, value: unknown): boolean {
  const spec = FIELD_SCHEMA[path];
  if (!spec) return false;
  if (spec.type === "enum") return Boolean(spec.values?.includes(value as string));
  return typeOk(spec.type, value);
}

/**
 * A binding is valid when its stored value equals the snapshot value.
 * Collections compare by canonical digest so a stale commitment list cannot
 * silently match, and scalars pass a type check before equality.
 */
export function bindingMatches(path: string, value: unknown, snapshot: unknown): boolean {
  const spec = FIELD_SCHEMA[path];
  if (!spec) return false;
  if (spec.type === "collection") {
    if (typeof value !== "string" || !value.startsWith("sha256:")) return false;
    const actual = resolve(snapshot, path);
    return actual.ok && digest(actual.value) === value;
  }
  if (!valueMatches(path, value)) return false;
  const actual = resolve(snapshot, path);
  return actual.ok && actual.value === value;
}

/** Every leaf path in a nested object. Arrays are leaves, as in the reference. */
export function leaves(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDict(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      Object.assign(out, leaves(value, prefix ? `${prefix}.${key}` : key));
    }
  } else if (prefix) {
    out[prefix] = obj;
  }
  return out;
}

/* ---------------------------------------------------------------- record rules */

function checkKeys(
  record: Record<string, unknown>,
  allowed: string[],
  required: string[],
  label: string,
): string[] {
  const errors: string[] = [];
  const extra = Object.keys(record).filter((key) => !allowed.includes(key)).sort();
  if (extra.length) errors.push(`${label}: unexpected field ${extra.join(", ")}`);
  for (const name of required) {
    if (!(name in record)) errors.push(`${label}: missing field ${name}`);
  }
  return errors;
}

export function validateBrief(brief: unknown): string[] {
  if (!isDict(brief)) return ["brief: must be an object"];
  const errors: string[] = [];
  const allowed = [
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
  ];
  const required = [
    "client",
    "project",
    "guestCount",
    "eventDate",
    "timezone",
    "approvedBudget",
    "owner",
    "openQuestions",
    "circulationBuffer",
  ];
  errors.push(...checkKeys(brief, allowed, required, "brief"));

  for (const name of ["client", "project", "timezone"]) {
    if (name in brief && typeof brief[name] !== "string") {
      errors.push(`brief.${name}: must be a string`);
    }
  }
  if ("guestCount" in brief && !typeOk("integer", brief.guestCount)) {
    errors.push("brief.guestCount: must be an integer");
  }
  if ("guestCountIsFixed" in brief && typeof brief.guestCountIsFixed !== "boolean") {
    errors.push("brief.guestCountIsFixed: must be a boolean");
  }
  if ("circulationBuffer" in brief && !typeOk("integer", brief.circulationBuffer)) {
    errors.push("brief.circulationBuffer: must be an integer");
  }
  if (
    "eventDate" in brief &&
    !(typeof brief.eventDate === "string" && DATE.test(brief.eventDate))
  ) {
    errors.push("brief.eventDate: must be YYYY-MM-DD");
  }

  const budget = brief.approvedBudget;
  if (!isDict(budget)) {
    errors.push("brief.approvedBudget: must be an object");
  } else {
    errors.push(
      ...checkKeys(budget, ["currency", "minorUnits"], ["currency", "minorUnits"], "brief.approvedBudget"),
    );
    if (typeof budget.currency !== "string") {
      errors.push("brief.approvedBudget.currency: must be a string");
    }
    if (!typeOk("integer", budget.minorUnits)) {
      errors.push("brief.approvedBudget.minorUnits: must be an integer");
    }
  }

  const owner = brief.owner;
  if (!isDict(owner)) {
    errors.push("brief.owner: must be an object");
  } else {
    errors.push(...checkKeys(owner, ["id", "name", "role"], ["id", "name", "role"], "brief.owner"));
    if (!ROLES.includes(owner.role as string)) {
      errors.push(`brief.owner.role: ${JSON.stringify(owner.role)} is not a role`);
    }
  }

  const questions = brief.openQuestions;
  if (!Array.isArray(questions) || !questions.every((q) => typeof q === "string")) {
    errors.push("brief.openQuestions: must be a list of strings");
  }

  for (const path of Object.keys(FIELD_SCHEMA).filter((p) => p.startsWith("brief."))) {
    const found = resolve(brief, path.slice("brief.".length));
    if (!found.ok) {
      errors.push(`brief: declared path ${path} is not present`);
    } else if (!valueMatches(path, found.value)) {
      errors.push(
        `brief.${path.slice(6)}: ${JSON.stringify(found.value)} is not a valid ${FIELD_SCHEMA[path].type}`,
      );
    }
  }
  return errors;
}

function validatePredicateValues(label: string, predicate: string, expected: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const field = expected.field;
  if (field !== undefined) {
    if (typeof field !== "string" || !FIELD_SCHEMA[field]) {
      errors.push(`${label}: predicate field ${JSON.stringify(field)} is not declared`);
    } else if (predicate === "numeric_within" && FIELD_SCHEMA[field].type !== "integer") {
      errors.push(`${label}: numeric_within field ${JSON.stringify(field)} is not an integer path`);
    }
  }

  if (predicate === "numeric_within") {
    const bounds = ["minimum", "maximum", "maximumMinorUnits"].filter((key) => key in expected);
    if (!bounds.length) {
      errors.push(`${label}: numeric_within needs a minimum, maximum or maximumMinorUnits`);
    }
    for (const name of bounds) {
      if (!typeOk("integer", expected[name])) errors.push(`${label}: ${name} must be an integer`);
    }
    if ("unit" in expected && typeof expected.unit !== "string") {
      errors.push(`${label}: unit must be a string`);
    }
  }

  if (predicate === "time_within_window") {
    const bounds = ["setupMinutes", "marginMinutes"].filter((key) => key in expected);
    if (bounds.length > 1) {
      errors.push(`${label}: time_within_window accepts one of setupMinutes or marginMinutes`);
    }
    for (const name of bounds) {
      if (!typeOk("integer", expected[name]) || (expected[name] as number) < 0) {
        errors.push(`${label}: ${name} must be a non-negative integer`);
      }
    }
  }

  if (predicate === "attestation_reviewed" && "attestationField" in expected) {
    const attestation = expected.attestationField;
    if (typeof attestation !== "string" || !FIELD_SCHEMA[attestation]) {
      errors.push(`${label}: attestationField ${JSON.stringify(attestation)} is not declared`);
    } else if (FIELD_SCHEMA[attestation].type !== "enum") {
      errors.push(`${label}: attestationField ${JSON.stringify(attestation)} is not an enum path`);
    }
  }

  if (predicate === "evidence_present") {
    for (const name of ["deliverableCount", "deliveryDays"]) {
      if (name in expected && !typeOk("integer", expected[name])) {
        errors.push(`${label}: ${name} must be an integer`);
      }
    }
  }
  return errors;
}

export function validateRequirement(
  input: unknown,
  requirementIds?: Set<string>,
  ownerIds?: Set<string>,
  milestoneIds?: Set<string>,
): string[] {
  if (!isDict(input)) return ["requirement: must be an object"];
  const req = input;
  const label = typeof req.id === "string" ? req.id : "<requirement>";
  const allowed = [
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
  ];
  const errors = checkKeys(req, allowed, allowed, label);

  if (typeof req.id !== "string" || !ID_PATTERNS.requirement.test(req.id)) {
    errors.push(`${label}: id must match REQ-<domain>-<n>`);
  }
  if (!typeOk("integer", req.version) || (req.version as number) < 1) {
    errors.push(`${label}: version must be a positive integer`);
  }
  if (milestoneIds && !milestoneIds.has(req.milestoneId as string)) {
    errors.push(`${label}: unknown milestone ${JSON.stringify(req.milestoneId)}`);
  }
  if (ownerIds && !ownerIds.has(req.owner as string)) {
    errors.push(`${label}: unknown owner ${JSON.stringify(req.owner)}`);
  }
  if (typeof req.label !== "string" || !req.label) {
    errors.push(`${label}: label must be a non-empty string`);
  }

  const predicate = req.predicateType;
  if (!PREDICATE_TYPES.includes(predicate as (typeof PREDICATE_TYPES)[number])) {
    errors.push(`${label}: unknown predicateType ${JSON.stringify(predicate)}`);
  }

  const expected = req.expectedValues;
  if (!isDict(expected)) {
    errors.push(`${label}: expectedValues must be an object`);
  } else if (typeof predicate === "string" && PREDICATE_PARAMS[predicate]) {
    const spec = PREDICATE_PARAMS[predicate];
    const allowedParams = [...spec.required, ...spec.optional];
    const unknownParams = Object.keys(expected).filter((key) => !allowedParams.includes(key));
    if (unknownParams.length) {
      errors.push(
        `${label}: predicate ${predicate} does not read ${unknownParams.sort().join(", ")}`,
      );
    }
    const missing = spec.required.filter((name) => !(name in expected));
    if (missing.length) errors.push(`${label}: predicate ${predicate} needs ${missing.join(", ")}`);
    errors.push(...validatePredicateValues(label, predicate, expected));
  }

  const prerequisites = req.prerequisiteIds;
  if (!Array.isArray(prerequisites) || !prerequisites.every((p) => typeof p === "string")) {
    errors.push(`${label}: prerequisiteIds must be a list of strings`);
  } else {
    if (new Set(prerequisites).size !== prerequisites.length) {
      errors.push(`${label}: duplicate prerequisite`);
    }
    if (prerequisites.includes(req.id as string)) {
      errors.push(`${label}: requirement is its own prerequisite`);
    }
    if (requirementIds) {
      for (const p of prerequisites) {
        if (!requirementIds.has(p)) errors.push(`${label}: unknown prerequisite ${p}`);
      }
    }
  }

  if (!EVIDENCE_TYPES.includes(req.requiredEvidenceType as string)) {
    errors.push(
      `${label}: unknown requiredEvidenceType ${JSON.stringify(req.requiredEvidenceType)}`,
    );
  }

  const expiry = req.expiryPolicy;
  if (!isDict(expiry)) {
    errors.push(`${label}: expiryPolicy must be an object`);
  } else {
    errors.push(
      ...checkKeys(expiry, ["mode", "value"], ["mode", "value"], `${label}.expiryPolicy`),
    );
    if (!EXPIRY_MODES.includes(expiry.mode as string)) {
      errors.push(`${label}: expiry mode ${JSON.stringify(expiry.mode)} is not allowed`);
    }
    if (typeof expiry.value !== "string" || !expiry.value) {
      errors.push(`${label}: expiry value must be a non-empty string`);
    } else if (expiry.mode === "absolute" && !TIMESTAMP.test(expiry.value)) {
      errors.push(`${label}: absolute expiry must be an ISO-8601 UTC timestamp`);
    }
  }

  if (typeof req.blocking !== "boolean") errors.push(`${label}: blocking must be a boolean`);

  const bindings = req.fieldBindings;
  if (!Array.isArray(bindings) || !bindings.length || !bindings.every((b) => typeof b === "string")) {
    errors.push(`${label}: fieldBindings must be a non-empty list of strings`);
  } else {
    if (new Set(bindings).size !== bindings.length) {
      errors.push(`${label}: duplicate fieldBinding`);
    }
    for (const binding of bindings) {
      if (!FIELD_SCHEMA[binding]) errors.push(`${label}: undeclared binding ${binding}`);
    }
  }
  return errors;
}

export function validateEvidenceRecord(
  input: unknown,
  requirementIds?: Set<string>,
  sourceIds?: Set<string>,
): string[] {
  if (!isDict(input)) return ["evidence: must be an object"];
  const ev = input;
  const label = typeof ev.id === "string" ? ev.id : "<evidence>";
  const allowed = [
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
  ];
  const errors = checkKeys(ev, allowed, allowed, label);

  if (typeof ev.id !== "string" || !ID_PATTERNS.evidence.test(ev.id)) {
    errors.push(`${label}: id must match EV-<n>`);
  }
  if (requirementIds && !requirementIds.has(ev.requirementId as string)) {
    errors.push(`${label}: unknown requirement ${JSON.stringify(ev.requirementId)}`);
  }
  if (!EVIDENCE_TYPES.includes(ev.type as string)) {
    errors.push(`${label}: unknown evidence type ${JSON.stringify(ev.type)}`);
  }

  const refs = ev.sourceRefIds;
  if (!Array.isArray(refs) || !refs.length || !refs.every((r) => typeof r === "string")) {
    errors.push(`${label}: sourceRefIds must be a non-empty list of strings`);
  } else {
    if (new Set(refs).size !== refs.length) {
      errors.push(`${label}: duplicate source reference`);
    }
    if (sourceIds) {
      for (const ref of refs) {
        if (!sourceIds.has(ref)) errors.push(`${label}: unknown source ${ref}`);
      }
    }
  }

  if (typeof ev.sourceExcerpt !== "string" || !ev.sourceExcerpt.trim()) {
    errors.push(`${label}: sourceExcerpt must be a non-empty string`);
  }
  if (typeof ev.artifactRef !== "string" || !ev.artifactRef) {
    errors.push(`${label}: artifactRef must be a non-empty string`);
  }
  if (typeof ev.issuer !== "string" || !ev.issuer) {
    errors.push(`${label}: issuer must be a non-empty string`);
  }

  const observed = ev.observedAt;
  const expires = ev.expiresAt;
  if (typeof observed !== "string" || !TIMESTAMP.test(observed)) {
    errors.push(`${label}: observedAt must be an ISO-8601 UTC timestamp`);
  }
  if (typeof expires !== "string" || !TIMESTAMP.test(expires)) {
    errors.push(`${label}: expiresAt must be an ISO-8601 UTC timestamp`);
  }
  if (typeof observed === "string" && typeof expires === "string" && expires <= observed) {
    errors.push(`${label}: expiresAt must be after observedAt`);
  }

  const bound = ev.boundFieldVersions;
  if (!isDict(bound) || !Object.keys(bound).length) {
    errors.push(`${label}: boundFieldVersions must be a non-empty object`);
  } else {
    for (const [path, value] of Object.entries(bound)) {
      if (!FIELD_SCHEMA[path]) {
        errors.push(`${label}: undeclared bound field ${path}`);
      } else if (FIELD_SCHEMA[path].type === "collection") {
        if (typeof value !== "string" || !DIGEST.test(value)) {
          errors.push(`${label}: collection binding ${path} must be a sha256 digest`);
        }
      } else if (!valueMatches(path, value)) {
        errors.push(
          `${label}: bound ${path} = ${JSON.stringify(value)} is not a valid ${FIELD_SCHEMA[path].type}`,
        );
      }
    }
  }

  const expectedDigest = digest({
    sourceRefIds: Array.isArray(ev.sourceRefIds) ? ev.sourceRefIds : [],
    sourceExcerpt: typeof ev.sourceExcerpt === "string" ? ev.sourceExcerpt : "",
  });
  if (ev.contentDigest !== expectedDigest) {
    errors.push(`${label}: contentDigest does not recompute from sourceRefIds and excerpt`);
  }
  if (!REVIEW_DISPOSITIONS.includes(ev.reviewDisposition as string)) {
    errors.push(`${label}: unknown reviewDisposition ${JSON.stringify(ev.reviewDisposition)}`);
  }
  return errors;
}

export function validateSnapshot(
  snapshot: unknown,
  requirements: Requirement[],
  evidence: EvidenceRecord[],
): void {
  if (!isDict(snapshot)) throw new SchemaError("snapshot must be an object");
  const brief = snapshot.brief;
  if (!isDict(brief)) throw new SchemaError("snapshot has no brief object");

  for (const path of Object.keys(FIELD_SCHEMA)) {
    const found = path.startsWith("brief.")
      ? resolve(brief, path.slice("brief.".length))
      : resolve(snapshot, path);
    if (!found.ok) throw new SchemaError(`declared path ${path} missing from snapshot`);
    if (!valueMatches(path, found.value)) {
      throw new SchemaError(
        `${path} holds ${JSON.stringify(found.value)}, not a valid ${FIELD_SCHEMA[path].type}`,
      );
    }
  }

  const requirementIds = new Set(requirements.map((r) => r.id));
  for (const req of requirements) {
    const problems = validateRequirement(req, requirementIds);
    if (problems.length) throw new SchemaError(problems[0]);
  }
  for (const ev of evidence) {
    const problems = validateEvidenceRecord(ev, requirementIds);
    if (problems.length) throw new SchemaError(problems[0]);
  }
}

/* ---------------------------------------------------------------- export contract */

function validateDecision(decision: unknown, evidenceIds: Set<string>): string[] {
  if (!isDict(decision)) return ["decision: must be an object"];
  const label = typeof decision.id === "string" ? decision.id : "<decision>";
  const allowed = [
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
  ];
  const errors = checkKeys(decision, allowed, allowed, label);
  if (typeof decision.id !== "string" || !ID_PATTERNS.decision.test(decision.id)) {
    errors.push(`${label}: id must match DEC-<n>`);
  }
  if (decision.role !== "project_manager") errors.push(`${label}: role must be project_manager`);
  if (decision.disposition !== "accepted") errors.push(`${label}: disposition must be accepted`);
  for (const name of ["targetAssessmentRevision", "requirementSetVersion"]) {
    if (!typeOk("integer", decision[name])) errors.push(`${label}: ${name} must be an integer`);
  }
  for (const name of ["requirementSetDigest", "evidenceSetDigest", "stateDigest"]) {
    if (typeof decision[name] !== "string" || !DIGEST.test(decision[name] as string)) {
      errors.push(`${label}: ${name} must be a sha256 digest`);
    }
  }
  if (!isDict(decision.integrationReviewResult)) {
    errors.push(`${label}: integrationReviewResult must be an object`);
  }
  const ids = decision.evidenceIds;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    errors.push(`${label}: evidenceIds must be a list of strings`);
  } else {
    if (new Set(ids).size !== ids.length) errors.push(`${label}: duplicate evidenceIds entry`);
    for (const id of ids) {
      if (!evidenceIds.has(id)) errors.push(`${label}: evidenceIds names unknown record ${id}`);
    }
    if (decision.evidenceSetDigest !== digest(ids)) {
      errors.push(`${label}: evidenceSetDigest does not match evidenceIds`);
    }
  }
  return errors;
}

function validateArchiveEntry(entry: unknown): string[] {
  if (!isDict(entry)) return ["archivedEvidence: entry must be an object"];
  const errors = checkKeys(
    entry,
    ["evidence", "archivedAtSequence", "archiveReason", "requirementSetVersion"],
    ["evidence", "archivedAtSequence", "archiveReason", "requirementSetVersion"],
    "archivedEvidence",
  );
  if (!typeOk("integer", entry.archivedAtSequence)) {
    errors.push("archivedEvidence: archivedAtSequence must be an integer");
  }
  if (typeof entry.archiveReason !== "string" || !entry.archiveReason) {
    errors.push("archivedEvidence: archiveReason must be a non-empty string");
  }
  if (!typeOk("integer", entry.requirementSetVersion)) {
    errors.push("archivedEvidence: requirementSetVersion must be an integer");
  }
  errors.push(...validateEvidenceRecord(entry.evidence ?? {}));
  return errors;
}

export function validateExport(input: unknown): string[] {
  if (!isDict(input)) return ["export: must be an object"];
  const doc = input;
  const allowed = [
    "exportVersion",
    "project",
    "requirements",
    "evidence",
    "archivedEvidence",
    "events",
    "decisions",
    "counters",
  ];
  const errors = checkKeys(doc, allowed, allowed, "export");
  if (doc.exportVersion !== EXPORT_VERSION) {
    errors.push(
      `export: unsupported exportVersion ${JSON.stringify(doc.exportVersion)}; expected ${EXPORT_VERSION}`,
    );
  }

  const project = doc.project;
  const requirements = doc.requirements;
  const evidence = doc.evidence;
  if (!isDict(project)) errors.push("export.project: must be an object");
  if (!Array.isArray(requirements)) errors.push("export.requirements: must be a list");
  if (!Array.isArray(evidence)) errors.push("export.evidence: must be a list");
  if (errors.length && !isDict(project)) return errors;

  try {
    validateSnapshot(
      project,
      (Array.isArray(requirements) ? requirements : []) as Requirement[],
      (Array.isArray(evidence) ? evidence : []) as EvidenceRecord[],
    );
  } catch (error) {
    if (error instanceof SchemaError) errors.push(`export record: ${error.message}`);
    else throw error;
  }

  let archived = doc.archivedEvidence;
  const archivedIds = new Set<string>();
  if (!Array.isArray(archived)) {
    errors.push("export.archivedEvidence: must be a list");
    archived = [];
  } else {
    for (const entry of archived) {
      errors.push(...validateArchiveEntry(entry));
      if (isDict(entry) && isDict(entry.evidence)) {
        archivedIds.add(entry.evidence.id as string);
      }
    }
    if (archivedIds.size !== archived.length) {
      errors.push("export.archivedEvidence: evidence ids must be unique");
    }
  }

  const currentIds = new Set(
    (Array.isArray(evidence) ? evidence : [])
      .filter(isDict)
      .map((record) => record.id as string),
  );
  const overlap = [...currentIds].filter((id) => archivedIds.has(id));
  if (overlap.length) {
    errors.push(`export: evidence ids appear current and archived ${overlap.sort().join(", ")}`);
  }

  let decisions = doc.decisions;
  if (!Array.isArray(decisions)) {
    errors.push("export.decisions: must be a list");
    decisions = [];
  }
  const knownEvidence = new Set([...currentIds, ...archivedIds]);
  const decisionIds = new Set<unknown>();
  for (const decision of decisions) {
    errors.push(...validateDecision(decision, knownEvidence));
    if (isDict(decision)) {
      if (decisionIds.has(decision.id)) {
        errors.push(`export.decisions: duplicate id ${String(decision.id)}`);
      }
      decisionIds.add(decision.id);
    }
  }

  let events = doc.events;
  if (!Array.isArray(events)) {
    errors.push("export.events: must be a list");
    events = [];
  }
  let previous = 0;
  for (const event of events) {
    if (!isDict(event)) {
      errors.push("export.events: entry must be an object");
      continue;
    }
    errors.push(
      ...checkKeys(
        event,
        [
          "id",
          "sequence",
          "commandId",
          "eventType",
          "actor",
          "expectedAssessmentRevision",
          "resultingAssessmentRevision",
          "assessedFactsChanged",
          "payload",
        ],
        [
          "id",
          "sequence",
          "eventType",
          "resultingAssessmentRevision",
          "assessedFactsChanged",
          "payload",
        ],
        `event ${String(event.id ?? "<event>")}`,
      ),
    );
    const sequence = event.sequence;
    if (!typeOk("integer", sequence) || sequence !== previous + 1) {
      errors.push(`event ${String(event.id ?? "<event>")}: sequence must follow ${previous}`);
    }
    previous = typeOk("integer", sequence) ? (sequence as number) : previous;
    if (!EVENT_TYPES.includes(event.eventType as string)) {
      errors.push(`event ${String(event.id ?? "<event>")}: unknown eventType`);
    }
    if (typeof event.assessedFactsChanged !== "boolean") {
      errors.push(
        `event ${String(event.id ?? "<event>")}: assessedFactsChanged must be boolean`,
      );
    }
    if (!isDict(event.payload)) {
      errors.push(`event ${String(event.id ?? "<event>")}: payload must be an object`);
    }
  }

  const counters = doc.counters;
  if (!isDict(counters)) {
    errors.push("export.counters: must be an object");
  } else {
    errors.push(
      ...checkKeys(counters, ["sequence", "assessmentRevision"], ["sequence", "assessmentRevision"], "export.counters"),
    );
    const sequence = counters.sequence;
    const revision = counters.assessmentRevision;
    if (!typeOk("integer", sequence) || !typeOk("integer", revision)) {
      errors.push("export.counters: both counters must be integers");
    } else {
      if (sequence !== previous) {
        errors.push("export.counters.sequence does not equal the last event");
      }
      if ((revision as number) < 0) {
        errors.push("export.counters.assessmentRevision must not be negative");
      }
      for (const decision of decisions) {
        const target = isDict(decision) ? decision.targetAssessmentRevision : undefined;
        if (typeOk("integer", target) && (target as number) > (revision as number)) {
          errors.push(`${String((decision as Decision).id)}: targetAssessmentRevision exceeds the export`);
        }
      }
      for (const entry of archived as ArchiveEntry[]) {
        if (!isDict(entry)) continue;
        const archivedAt = entry.archivedAtSequence;
        if (typeOk("integer", archivedAt) && (archivedAt as number) > (sequence as number)) {
          errors.push(
            `archivedEvidence ${String(entry.evidence?.id)}: archivedAtSequence exceeds the event sequence`,
          );
        }
      }
    }
  }
  return errors;
}

/** Compile-time sanity: the ported table keeps the canonical project shape. */
export type CanonicalProject = ProjectState;
