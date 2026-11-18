/** Record shapes shared by the schema, engine and store. */

export type Role = "project_manager" | "contributor";

export type FieldType = "integer" | "string" | "time" | "enum" | "collection";

export interface FieldSpec {
  type: FieldType;
  values?: string[];
  compare?: "digest";
}

export interface BriefOwner {
  id: string;
  name: string;
  role: Role;
}

export interface Brief {
  client: string;
  project: string;
  guestCount: number;
  guestCountIsFixed: boolean;
  eventDate: string;
  timezone: string;
  approvedBudget: { currency: string; minorUnits: number };
  owner: BriefOwner;
  openQuestions: string[];
  circulationBuffer: number;
}

export type PredicateType =
  | "evidence_present"
  | "numeric_within"
  | "time_within_window"
  | "set_equals"
  | "attestation_reviewed";

export interface Requirement {
  id: string;
  version: number;
  milestoneId: string;
  owner: string;
  label: string;
  predicateType: PredicateType;
  expectedValues: Record<string, unknown>;
  prerequisiteIds: string[];
  requiredEvidenceType: string;
  expiryPolicy: { mode: "absolute" | "relative"; value: string };
  blocking: boolean;
  fieldBindings: string[];
}

export type Disposition = "pending" | "accepted" | "rejected";
export type EvidenceType = "confirmation" | "document" | "measurement" | "quote";

export interface EvidenceRecord {
  id: string;
  requirementId: string;
  type: EvidenceType | string;
  sourceRefIds: string[];
  sourceExcerpt: string;
  contentDigest: string;
  artifactRef: string;
  issuer: string;
  observedAt: string;
  expiresAt: string;
  boundFieldVersions: Record<string, unknown>;
  reviewDisposition: Disposition;
}

export interface SourceReference {
  id: string;
  kind: string;
  excerpt: string;
  attribution: string;
  trust: string;
}

export interface Money {
  currency: string;
  minorUnits: number;
}

export interface Commitment {
  vendor: string;
  category: string;
  amount: Money;
}

export interface ProjectState {
  id: string;
  assessmentRevision: number;
  requirementSetVersion: number;
  brief: Brief | Record<string, never>;
  circulationBuffer: number;
  location: {
    venueId: string;
    venueName: string;
    capacity: number;
    roomPlan: string;
    loadingWindow: { start: string; end: string };
    hardStop: string;
    fireAttestation: "reviewed" | "not_reviewed" | "missing";
  };
  crew: { arrivalTime: string };
  production: { runOfShowEnd: string };
  photographer: {
    arrivalWindow: { start: string; end: string };
    deliverables: { editedImages: number; deliveryDays: number };
  };
  budget: {
    commitments: Commitment[];
    committedTotal: Money;
  };
  _now?: string;
  [key: string]: unknown;
}

export type Residual = {
  code: string;
  evidenceId?: string;
  field?: string;
  path?: string[];
  prerequisiteIds?: string[];
  constraints?: unknown[];
};

export type RequirementStatus = "missing" | "blocked" | "outdated" | "supported";

export interface RequirementResult {
  requirementId: string;
  status: RequirementStatus;
  blocking: boolean;
  residuals: Residual[];
}

export interface IntegratedCheck {
  id: string;
  status: "fail";
  reason: string;
}

export interface IntegratedResult {
  status: "pass" | "fail";
  checks: IntegratedCheck[];
}

export interface ImpactSet {
  requirementIds: string[];
  evidenceIds: string[];
}

export interface ImpactBlock {
  impacted: ImpactSet;
  unaffected: ImpactSet;
}

export interface ReadinessCounts {
  blocking: number;
  supported: number;
  blocked: number;
  outdated: number;
  missing: number;
}

export interface Assessment {
  assessmentRevision: number;
  requirements: RequirementResult[];
  integrated: IntegratedResult;
  readiness: "ready_for_review" | "not_ready";
  counts: ReadinessCounts;
  residualReasonCodes: string[];
  impact?: ImpactBlock;
}

export interface Decision {
  id: string;
  actor: string;
  role: Role;
  targetAssessmentRevision: number;
  requirementSetVersion: number;
  requirementSetDigest: string;
  evidenceSetDigest: string;
  integrationReviewResult: IntegratedResult;
  disposition: "accepted";
  stateDigest: string;
  evidenceIds: string[];
}

export interface EventRecord {
  id: string;
  sequence: number;
  commandId: string | null;
  eventType: string;
  actor: string | null;
  expectedAssessmentRevision: number | null;
  resultingAssessmentRevision: number;
  assessedFactsChanged: boolean;
  payload: Record<string, unknown>;
}

export interface ArchiveEntry {
  evidence: EvidenceRecord;
  archivedAtSequence: number;
  archiveReason: string;
  requirementSetVersion: number;
}

export interface Command {
  commandId?: string;
  role?: Role;
  actor?: string;
  expectedAssessmentRevision?: number;
  decisionId?: string;
}

export interface ChangedField {
  from?: unknown;
  to: unknown;
}

export interface ChangeProposal {
  id: string;
  title?: string;
  claim?: string;
  sourceRefIds?: string[];
  changedFields: Record<string, ChangedField>;
}

export interface CommandResult {
  sequence: number;
  assessmentRevision: number;
  assessedFactsChanged: boolean;
  decisionId?: string;
}

export interface ExportDoc {
  exportVersion: string;
  project: ProjectState;
  requirements: Requirement[];
  evidence: EvidenceRecord[];
  archivedEvidence: ArchiveEntry[];
  events: EventRecord[];
  decisions: Decision[];
  counters: { sequence: number; assessmentRevision: number };
}

export interface DecisionStatus {
  id: string;
  currentness: "current" | "historical";
  residualReasonCodes: string[];
  targetAssessmentRevision?: number;
  currentResidualReasonCodes?: string[];
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  targetAssessmentRevision: number;
}
