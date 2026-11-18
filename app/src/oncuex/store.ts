/**
 * Append-only project store with compare-and-swap commands.
 *
 * Two counters, deliberately independent:
 *   sequence             every appended event
 *   assessmentRevision   only events that change assessed facts
 *
 * Recording a decision advances the first and not the second, so a decision is
 * current the instant it is written. A command is validated before any state
 * is touched, so a rejected write leaves the record byte-identical.
 */

import {
  combineImpact,
  evaluate,
  impactOfChange,
  impactOfExpiry,
} from "./engine";
import {
  EXPORT_VERSION,
  FIELD_SCHEMA,
  REVIEW_DISPOSITIONS,
  SchemaError,
  TYPED_PATHS,
  canon,
  digest,
  isDict,
  isExpired,
  validateBrief,
  validateEvidenceRecord,
  validateExport,
  validateRequirement,
  valueMatches,
} from "./schema";
import { flawedLegacySample } from "./evidence-trust";
import type {
  ArchiveEntry,
  Assessment,
  Brief,
  ChangeProposal,
  Command,
  CommandResult,
  Decision,
  DecisionStatus,
  Eligibility,
  EventRecord,
  EvidenceRecord,
  ExportDoc,
  ImpactBlock,
  ProjectState,
  Requirement,
  Role,
} from "./types";

const clone = <T>(value: T): T => structuredClone(value);

export class CommandError extends Error {
  code: string;

  constructor(code: string, message = "") {
    super(message || code);
    this.name = "CommandError";
    this.code = code;
  }
}

/** Events that change assessed facts. */
export const ASSESSED_EVENTS = new Set([
  "brief.adopted",
  "evidence.attached",
  "evidence.reviewed",
  "change.adopted",
  "requirementSet.changed",
]);

/** Events that advance the sequence only. */
export const OPINION_EVENTS = new Set(["decision.recorded"]);

/** Fields a change command may never write. */
const IMMUTABLE_PATHS = new Set(["assessmentRevision"]);

const isRecord = isDict;

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!isRecord(next)) throw new CommandError("bad_path", path);
    cursor = next;
  }
  cursor[parts[parts.length - 1]] = clone(value);
}

export class Store {
  project: ProjectState;
  requirements: Requirement[];
  evidence: EvidenceRecord[];
  events: EventRecord[];
  sequence: number;
  assessmentRevision: number;
  archivedEvidence: ArchiveEntry[];
  private results: Map<string, CommandResult>;
  private decisions: Map<string, Decision>;

  constructor(project: ProjectState, requirements: Requirement[], evidence: EvidenceRecord[]) {
    this.project = clone(project);
    this.requirements = clone(requirements);
    this.evidence = clone(evidence);
    this.events = [];
    this.sequence = 0;
    this.assessmentRevision = this.project.assessmentRevision ?? 1;
    this.results = new Map();
    this.decisions = new Map();
    this.archivedEvidence = [];
  }

  /* ---------------------------------------------------------------- reads */

  snapshot(): ProjectState {
    const snap = clone(this.project);
    snap.assessmentRevision = this.assessmentRevision;
    return snap;
  }

  assess(): Assessment {
    return evaluate(this.snapshot(), this.requirements, this.evidence, this.impact());
  }

  /**
   * Impact of the last adopted change and of currently expired evidence.
   * Derived from the event log, so a reload reproduces the same impact.
   */
  impact(): ImpactBlock | null {
    const changed = this.lastChangedPaths();
    const change = changed.size
      ? impactOfChange(changed, this.requirements, this.evidence)
      : null;
    const now = typeof this.project._now === "string" ? this.project._now : "1970-01-01T00:00:00Z";
    const expiry = impactOfExpiry(this.requirements, this.evidence, now);
    return combineImpact([change, expiry], this.requirements, this.evidence);
  }

  lastChangedPaths(): Set<string> {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event.eventType === "change.adopted") {
        const paths = event.payload?.changedPaths;
        return new Set(Array.isArray(paths) ? (paths as string[]) : []);
      }
    }
    return new Set();
  }

  latestDecision(): Decision | null {
    if (!this.decisions.size) return null;
    return [...this.decisions.values()][this.decisions.size - 1];
  }

  decisionsList(): Decision[] {
    return [...this.decisions.values()];
  }

  decisionById(id: string): Decision | undefined {
    return this.decisions.get(id);
  }

  now(): string {
    return typeof this.project._now === "string" ? this.project._now : "1970-01-01T00:00:00Z";
  }

  currentness(decisionId: string): "current" | "historical" {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new CommandError("unknown_decision", decisionId);
    if (decision.targetAssessmentRevision !== this.assessmentRevision) return "historical";
    if (decision.requirementSetVersion !== (this.project.requirementSetVersion ?? 1)) {
      return "historical";
    }
    const now = this.now();
    for (const evidenceId of decision.evidenceIds) {
      const record = this.evidence.find((candidate) => candidate.id === evidenceId);
      if (!record || record.reviewDisposition !== "accepted") return "historical";
      if (flawedLegacySample(record) || isExpired(record, now)) return "historical";
    }
    return "current";
  }

  /** Currentness plus the reason code that explains a historical decision. */
  decisionStatus(decisionId: string): DecisionStatus {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new CommandError("unknown_decision", decisionId);
    if (this.currentness(decisionId) === "current") {
      return { id: decisionId, currentness: "current", residualReasonCodes: [] };
    }
    let code: string;
    if (decision.requirementSetVersion !== (this.project.requirementSetVersion ?? 1)) {
      code = "requirement_set_changed";
    } else if (decision.targetAssessmentRevision === this.assessmentRevision) {
      code = decision.evidenceIds.some((id) => { const record = this.evidence.find((item) => item.id === id); return record && flawedLegacySample(record); }) ? "source_excerpt_inconsistent" : "mandatory_evidence_expired";
    } else if (this.stateDigest() === decision.stateDigest) {
      code = "revision_lineage_changed";
    } else {
      code = "stale_decision";
    }
    return {
      id: decisionId,
      currentness: "historical",
      residualReasonCodes: [code],
      targetAssessmentRevision: decision.targetAssessmentRevision,
      currentResidualReasonCodes: this.assess().residualReasonCodes,
    };
  }

  /** Evidence a decision was based on, including withdrawn records. */
  decisionEvidence(decisionId: string): EvidenceRecord[] {
    const decision = this.decisions.get(decisionId);
    if (!decision) throw new CommandError("unknown_decision", decisionId);
    const archived = new Map(
      this.archivedEvidence.map((entry) => [entry.evidence.id, entry.evidence]),
    );
    return decision.evidenceIds.map((evidenceId) => {
      const record =
        this.evidence.find((candidate) => candidate.id === evidenceId) ?? archived.get(evidenceId);
      if (!record) throw new CommandError("unknown_evidence", evidenceId);
      return clone(record);
    });
  }

  eligibility(role: Role = "project_manager"): Eligibility {
    const assessment = this.assess();
    const reasons: string[] = [];
    if (role !== "project_manager") reasons.push("role_denied");
    if (assessment.requirements.some((result) => result.status !== "supported")) {
      reasons.push("mandatory_requirements_not_supported");
    }
    const now = this.now();
    if (
      this.evidence.some(
        (record) => record.reviewDisposition === "accepted" && isExpired(record, now),
      )
    ) {
      reasons.push("mandatory_evidence_expired");
    }
    // A closed dependency graph is already reported as an unmet requirement,
    // so integration_failed counts only the other five checks.
    if (assessment.integrated.checks.some((check) => check.id !== "dependency_closure")) {
      reasons.push("integration_failed");
    }

    const latest = this.latestDecision();
    if (latest) {
      if (latest.requirementSetVersion !== (this.project.requirementSetVersion ?? 1)) {
        reasons.push("requirement_set_changed");
      } else if (
        assessment.readiness === "ready_for_review" &&
        latest.targetAssessmentRevision !== this.assessmentRevision
      ) {
        reasons.push(this.stateDigest() === latest.stateDigest ? "revision_lineage_changed" : "stale_revision");
      }
    }
    return {
      eligible: reasons.length === 0,
      reasons,
      targetAssessmentRevision: this.assessmentRevision,
    };
  }

  stateDigest(): string {
    const assessed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.project)) {
      if (!key.startsWith("_")) assessed[key] = value;
    }
    return digest(assessed);
  }

  /* ---------------------------------------------------------------- writes */

  private replay(command: Command): CommandResult | null {
    if (!command.commandId) return null;
    return this.results.get(command.commandId) ?? null;
  }

  private checkRevision(command: Command): void {
    if (
      command.expectedAssessmentRevision !== undefined &&
      command.expectedAssessmentRevision !== this.assessmentRevision
    ) {
      throw new CommandError(
        "conflict",
        `expected assessment revision ${command.expectedAssessmentRevision}, current ${this.assessmentRevision}`,
      );
    }
  }

  private begin(command: Command, eventType: string): CommandResult | null {
    if (!ASSESSED_EVENTS.has(eventType) && !OPINION_EVENTS.has(eventType)) {
      throw new CommandError("unknown_event", eventType);
    }
    const replay = this.replay(command);
    if (replay) return replay;
    this.checkRevision(command);
    return null;
  }

  private commit(
    command: Command,
    eventType: string,
    payload: Record<string, unknown>,
    assessed?: boolean,
  ): CommandResult {
    const changesFacts = assessed ?? ASSESSED_EVENTS.has(eventType);
    if (changesFacts) this.assessmentRevision += 1;
    this.sequence += 1;

    const event: EventRecord = {
      id: `EVT-${this.sequence}`,
      sequence: this.sequence,
      commandId: command.commandId ?? null,
      eventType,
      actor: command.actor ?? null,
      expectedAssessmentRevision: command.expectedAssessmentRevision ?? null,
      resultingAssessmentRevision: this.assessmentRevision,
      assessedFactsChanged: changesFacts,
      payload,
    };
    this.events.push(event);

    const result: CommandResult = {
      sequence: this.sequence,
      assessmentRevision: this.assessmentRevision,
      assessedFactsChanged: changesFacts,
    };
    if (command.commandId) this.results.set(command.commandId, result);
    return result;
  }

  adoptBrief(command: Command, brief: Brief): CommandResult {
    if (command.role !== "project_manager") throw new CommandError("role_denied");
    const replayed = this.begin(command, "brief.adopted");
    if (replayed) return replayed;
    const problems = validateBrief(brief);
    if (problems.length) throw new CommandError("invalid_brief", problems[0]);
    this.project.brief = clone(brief);
    return this.commit(command, "brief.adopted", { brief });
  }

  attachEvidence(command: Command, evidence: EvidenceRecord): CommandResult {
    const replayed = this.begin(command, "evidence.attached");
    if (replayed) return replayed;
    if (
      this.evidence.some((record) => record.id === evidence.id) ||
      this.archivedEvidence.some((entry) => entry.evidence.id === evidence.id)
    ) {
      throw new CommandError("duplicate_evidence", evidence.id);
    }
    for (const [path, value] of Object.entries(evidence.boundFieldVersions ?? {})) {
      const spec = TYPED_PATHS[path];
      if (!spec) throw new CommandError("undeclared_path", path);
      if (spec.type !== "collection" && !valueMatches(path, value)) {
        throw new CommandError("type_mismatch", `${path}=${JSON.stringify(value)}`);
      }
    }
    const problems = validateEvidenceRecord(
      evidence,
      new Set(this.requirements.map((req) => req.id)),
    );
    if (problems.length) throw new CommandError("invalid_evidence", problems[0]);
    this.evidence.push(clone(evidence));
    return this.commit(command, "evidence.attached", { evidenceId: evidence.id });
  }

  /** Apply field changes, bumping the assessed revision exactly once. */
  adoptChange(command: Command, change: ChangeProposal): CommandResult {
    if (command.role !== "project_manager") throw new CommandError("role_denied");
    const replayed = this.begin(command, "change.adopted");
    if (replayed) return replayed;
    const fields = change.changedFields ?? {};
    for (const [path, delta] of Object.entries(fields)) {
      this.checkPath(path);
      const target = delta.to;
      const spec = FIELD_SCHEMA[path];
      if (spec.type === "collection") {
        if (!Array.isArray(target) && !isRecord(target)) {
          throw new CommandError("type_mismatch", `${path}=${JSON.stringify(target)}`);
        }
      } else if (!valueMatches(path, target)) {
        throw new CommandError("type_mismatch", `${path}=${JSON.stringify(target)}`);
      }
    }
    for (const [path, delta] of Object.entries(fields)) {
      setPath(this.project as unknown as Record<string, unknown>, path, delta.to);
    }
    return this.commit(command, "change.adopted", {
      changeId: change.id,
      changedPaths: Object.keys(fields).sort(),
      ...(change.title ? { title: change.title } : {}),
      ...(change.sourceRefIds?.length ? { sourceRefIds: change.sourceRefIds } : {}),
    });
  }

  reviewEvidence(command: Command, evidenceId: string, disposition: string): CommandResult {
    const replayed = this.replay(command);
    if (replayed) return replayed;
    if (command.role !== "project_manager" && command.role !== "contributor") {
      throw new CommandError("role_denied");
    }
    const record = this.evidence.find((candidate) => candidate.id === evidenceId);
    if (!record) throw new CommandError("unknown_evidence", evidenceId);
    if (!REVIEW_DISPOSITIONS.includes(disposition)) {
      throw new CommandError("invalid_disposition", disposition);
    }
    const inner = this.begin(command, "evidence.reviewed");
    if (inner) return inner;
    const previous = record.reviewDisposition;
    record.reviewDisposition = disposition as EvidenceRecord["reviewDisposition"];
    return this.commit(
      command,
      "evidence.reviewed",
      { evidenceId, disposition, previousDisposition: previous },
      disposition !== previous,
    );
  }

  /** Replace the requirement set, incrementing its version once. */
  changeRequirementSet(
    command: Command,
    requirements: Requirement[],
    evidence: EvidenceRecord[],
  ): CommandResult {
    const replayed = this.replay(command);
    if (replayed) return replayed;
    if (command.role !== "project_manager") throw new CommandError("role_denied");
    const inner = this.begin(command, "requirementSet.changed");
    if (inner) return inner;

    const requirementIds = new Set(requirements.map((req) => req.id));
    if (requirementIds.size !== requirements.length) {
      throw new CommandError("invalid_requirement", "requirements need unique string ids");
    }
    for (const req of requirements) {
      const problems = validateRequirement(req, requirementIds);
      if (problems.length) throw new CommandError("invalid_requirement", problems[0]);
    }

    const archivedIds = new Set(this.archivedEvidence.map((entry) => entry.evidence.id));
    const existing = new Map(this.evidence.map((record) => [record.id, record]));
    for (const record of evidence) {
      if (archivedIds.has(record.id)) throw new CommandError("duplicate_evidence", record.id);
      const previous = existing.get(record.id);
      if (previous && canon(previous) !== canon(record)) {
        throw new CommandError(
          "invalid_evidence",
          `${record.id}: records are immutable; withdraw and attach a new id`,
        );
      }
    }
    for (const record of evidence) {
      const problems = validateEvidenceRecord(record, requirementIds);
      if (problems.length) throw new CommandError("invalid_evidence", problems[0]);
    }

    const version = (this.project.requirementSetVersion ?? 1) + 1;
    const kept = new Set(evidence.map((record) => record.id));
    for (const record of this.evidence) {
      if (kept.has(record.id)) continue;
      this.archivedEvidence.push({
        evidence: clone(record),
        archivedAtSequence: this.sequence + 1,
        archiveReason: "requirement_set_changed",
        requirementSetVersion: version,
      });
    }
    this.requirements = clone(requirements);
    this.evidence = clone(evidence);
    this.project.requirementSetVersion = version;
    return this.commit(command, "requirementSet.changed", {
      requirementSetVersion: version,
      requirementIds: [...requirementIds].sort(),
      evidenceIds: evidence.map((record) => record.id),
    });
  }

  recordDecision(command: Command): CommandResult {
    // A repeated command returns the stored result before any other validation,
    // so a retried acceptance is idempotent rather than a duplicate.
    const replayed = this.replay(command);
    if (replayed) return replayed;
    if (command.role !== "project_manager") throw new CommandError("role_denied");
    const decisionId = command.decisionId;
    if (!decisionId) throw new CommandError("missing_decision_id");
    if (this.decisions.has(decisionId)) throw new CommandError("duplicate_decision", decisionId);
    this.checkRevision(command);

    const assessment = this.assess();
    if (assessment.readiness !== "ready_for_review") {
      throw new CommandError(
        "not_eligible",
        `readiness=${assessment.readiness}, reasons=${assessment.residualReasonCodes.join(", ")}`,
      );
    }

    const evidenceIds = this.evidence
      .filter((record) => record.reviewDisposition === "accepted")
      .map((record) => record.id);
    const decision: Decision = {
      id: decisionId,
      actor: command.actor ?? "",
      role: "project_manager",
      targetAssessmentRevision: this.assessmentRevision,
      requirementSetVersion: this.project.requirementSetVersion ?? 1,
      requirementSetDigest: digest(this.requirements.map((req) => req.id)),
      evidenceSetDigest: digest(evidenceIds),
      integrationReviewResult: assessment.integrated,
      disposition: "accepted",
      stateDigest: this.stateDigest(),
      evidenceIds,
    };
    const result = this.commit(command, "decision.recorded", { decisionId });
    this.decisions.set(decisionId, decision);
    return { ...result, decisionId };
  }

  /**
   * Move the review clock. This is not a command: it writes no event and does
   * not move the assessment revision, because expiry is a fact about the
   * evidence set rather than a change to the plan.
   */
  setClock(now: string): void {
    this.project._now = now;
  }

  /* ---------------------------------------------------------------- helpers */

  private checkPath(path: string): void {
    if (!TYPED_PATHS[path]) throw new CommandError("undeclared_path", path);
    if (IMMUTABLE_PATHS.has(path)) throw new CommandError("immutable_path", path);
    let cursor: unknown = this.project;
    for (const part of path.split(".").slice(0, -1)) {
      if (!isRecord(cursor) || !isRecord(cursor[part])) throw new CommandError("bad_path", path);
      cursor = cursor[part];
    }
  }

  /* ---------------------------------------------------------------- export */

  static fromExport(input: unknown): Store {
    const problems = validateExport(input);
    if (problems.length) throw new CommandError("invalid_export", problems[0]);
    const doc = input as ExportDoc;
    const store = new Store(doc.project, doc.requirements, doc.evidence);
    store.sequence = doc.counters.sequence;
    store.assessmentRevision = doc.counters.assessmentRevision;
    store.events = clone(doc.events);
    store.archivedEvidence = clone(doc.archivedEvidence);
    store.decisions = new Map(doc.decisions.map((decision) => [decision.id, clone(decision)]));
    for (const event of store.events) {
      if (!event.commandId) continue;
      const result: CommandResult = {
        sequence: event.sequence,
        assessmentRevision: event.resultingAssessmentRevision,
        assessedFactsChanged: Boolean(event.assessedFactsChanged),
      };
      if (event.eventType === "decision.recorded") {
        result.decisionId = event.payload?.decisionId as string | undefined;
      }
      store.results.set(event.commandId, result);
    }
    return store;
  }

  export(): ExportDoc {
    return {
      exportVersion: EXPORT_VERSION,
      project: this.snapshot(),
      requirements: clone(this.requirements),
      evidence: clone(this.evidence),
      archivedEvidence: clone(this.archivedEvidence),
      events: clone(this.events),
      decisions: clone(this.decisionsList()),
      counters: {
        sequence: this.sequence,
        assessmentRevision: this.assessmentRevision,
      },
    };
  }
}

export function describeCommandError(error: unknown): string {
  if (error instanceof CommandError) return `${error.code}${error.message !== error.code ? `: ${error.message}` : ""}`;
  if (error instanceof SchemaError) return `schema: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
