/**
 * Reference scenario for the operator walkthrough.
 *
 * The document is the reviewed fixture: field values, requirements, sources and
 * evidence records. It contains no expected outcome; every status the UI shows
 * is computed by the evaluator. Source-to-field provenance and change labels
 * below are presentation metadata for the review screens.
 */

import raw from "./scenario.json";
import { digest, leaves } from "./schema";
import type {
  Brief,
  ChangedField,
  EvidenceRecord,
  ProjectState,
  Requirement,
  Role,
  SourceReference,
} from "./types";

interface Contributor {
  id: string;
  name: string;
  role: Role;
  simulated: boolean;
}

interface ScenarioDocument {
  scenario: {
    id: string;
    milestoneIds: string[];
    requirementSetVersion: number;
    brief: Brief;
    contributors: Contributor[];
  };
  milestones: { id: string; label: string; projectManagerId: string }[];
  requirements: Requirement[];
  sourceReferences: SourceReference[];
  evidence: EvidenceRecord[];
  state: {
    baseline: ProjectState;
    venueChange: ProjectState;
    recovered: ProjectState;
  };
}

export const SCENARIO = raw as unknown as ScenarioDocument;

export const PROJECT_ID = SCENARIO.scenario.id;
export const MILESTONES = SCENARIO.milestones;
export const REQUIREMENTS: Requirement[] = SCENARIO.requirements;
export const SOURCES: SourceReference[] = SCENARIO.sourceReferences;
export const EVIDENCE: EvidenceRecord[] = SCENARIO.evidence;
export const BRIEF: Brief = SCENARIO.scenario.brief;
export const CONTRIBUTORS: Contributor[] = SCENARIO.scenario.contributors;
export const REQUIREMENT_SET_VERSION = SCENARIO.scenario.requirementSetVersion;

export const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

export const DEFAULT_NOW = "2027-02-25T00:00:00Z";

export const SAMPLE_BRIEF_TEXT = `Northwind Provisions is planning a spring product launch reception for 120 guests on 14 March 2027. The approved budget ceiling is $30,000. The date is fixed. The venue is not yet final. The client asks for 120 edited photographs delivered within 10 days. Open questions: does the venue provide a freight lift for the 1.2 m scenic panels, and is the photograph delivery date a hard requirement or a preference?`;

export const CLOCK_PRESETS = [
  {
    id: "planning",
    label: "25 Feb 2027 — planning window",
    value: DEFAULT_NOW,
    note: "Before every recorded expiry date.",
  },
  {
    id: "expiry",
    label: "8 Mar 2027 — after evidence expiry",
    value: "2027-03-08T00:00:00Z",
    note: "The March 7 loading and capacity records have lapsed; the attestation still holds.",
  },
  {
    id: "event",
    label: "14 Mar 2027 — event day",
    value: "2027-03-14T00:00:00Z",
    note: "Only the photographer record is still inside its window.",
  },
];

export interface Persona {
  id: string;
  role: Role;
  name: string;
  title: string;
  simulated: true;
}

export const PERSONAS: Persona[] = [
  {
    id: BRIEF.owner.id,
    role: "project_manager",
    name: BRIEF.owner.name,
    title: "Project manager — adopts changes and records acceptance",
    simulated: true,
  },
  ...CONTRIBUTORS.map<Persona>((contributor) => ({
    id: contributor.id,
    role: "contributor",
    name: contributor.name,
    title: "Contributor — reviews evidence, cannot accept",
    simulated: true,
  })),
];

export const PEOPLE: Record<string, string> = Object.fromEntries([
  [BRIEF.owner.id, BRIEF.owner.name],
  ...CONTRIBUTORS.map((contributor) => [contributor.id, contributor.name]),
  ...SCENARIO.milestones.map((milestone) => [milestone.projectManagerId, BRIEF.owner.name]),
]);

/** Initial record: plan values exist, but no brief, evidence or events yet. */
export function initialProject(): ProjectState {
  const baseline = structuredClone(SCENARIO.state.baseline);
  delete (baseline as Partial<ProjectState>).assessmentRevision;
  return {
    ...baseline,
    id: PROJECT_ID,
    brief: {},
    circulationBuffer: BRIEF.circulationBuffer,
    requirementSetVersion: REQUIREMENT_SET_VERSION,
    assessmentRevision: 0,
    _now: DEFAULT_NOW,
  };
}

type TargetState = Omit<ProjectState, "assessmentRevision">;

function targetState(name: "baseline" | "venueChange" | "recovered"): TargetState {
  const target = structuredClone(SCENARIO.state[name]) as Partial<ProjectState>;
  delete target.assessmentRevision;
  return target as TargetState;
}

function flatten(value: unknown): Record<string, unknown> {
  return leaves(value);
}

/** Field-level diff in the shape the change command expects. */
export function diffState(
  current: ProjectState,
  target: TargetState,
): Record<string, ChangedField> {
  const now = flatten(current);
  const wanted = flatten(target);
  const changed: Record<string, ChangedField> = {};
  for (const [path, value] of Object.entries(wanted)) {
    if (path in now && JSON.stringify(now[path]) === JSON.stringify(value)) continue;
    changed[path] = { from: now[path], to: value };
  }
  return changed;
}

export const CHANGE_META = {
  venue: {
    id: "CHG-1",
    title: "Venue moved to Pier 9 Loft",
    claim:
      "The client selected Pier 9 Loft. Freight access, licensed occupancy and the hard stop are taken from the venue pack; the budget line switches to the loft fee.",
    sourceRefIds: ["SRC-3", "SRC-12"],
  },
  recovery: {
    id: "CHG-2",
    title: "Recovered plan: annex, rescoped spend, revised schedule",
    claim:
      "The adjoining annex raises occupancy and extends freight access. Catering and production are rescoped to recover the budget, and the crew call and run of show move to fit the annex access window.",
    sourceRefIds: ["SRC-3", "SRC-6", "SRC-7", "SRC-8", "SRC-9", "SRC-10", "SRC-12"],
  },
};

export function baselineTarget(): TargetState {
  return targetState("baseline");
}

export function venueChange(current: ProjectState) {
  return {
    ...CHANGE_META.venue,
    changedFields: diffState(current, targetState("venueChange")),
  };
}

export function recoveryChange(current: ProjectState) {
  return {
    ...CHANGE_META.recovery,
    changedFields: diffState(current, targetState("recovered")),
  };
}

/**
 * Which sources state each changed value. A field listed with an empty array is
 * a planning assumption and is shown as unsourced, not as evidenced.
 */
export const CHANGE_PROVENANCE: Record<"venue" | "recovery", Record<string, string[]>> = {
  venue: {
    "location.venueId": ["SRC-3"],
    "location.venueName": ["SRC-3"],
    "location.capacity": ["SRC-3"],
    "location.loadingWindow.start": ["SRC-3"],
    "location.loadingWindow.end": ["SRC-3"],
    "location.hardStop": ["SRC-3"],
    "location.fireAttestation": [],
    "location.roomPlan": ["SRC-3"],
    "crew.arrivalTime": [],
    "budget.commitments": ["SRC-3", "SRC-12"],
    "budget.committedTotal.minorUnits": ["SRC-12"],
  },
  recovery: {
    "location.capacity": ["SRC-3", "SRC-8"],
    "location.roomPlan": ["SRC-3"],
    "location.loadingWindow.start": ["SRC-9"],
    "location.loadingWindow.end": ["SRC-3", "SRC-8"],
    "location.hardStop": ["SRC-10"],
    "location.fireAttestation": ["SRC-8"],
    "crew.arrivalTime": ["SRC-9"],
    "production.runOfShowEnd": ["SRC-10"],
    "budget.commitments": ["SRC-3", "SRC-6", "SRC-7", "SRC-12"],
    "budget.committedTotal.minorUnits": ["SRC-12"],
  },
};

export const UNSOURCED_NOTES: Record<string, string> = {
  "location.fireAttestation":
    "No source states the attestation state at the moment of the move. Recorded as not reviewed until the annex attestation is supplied.",
  "crew.arrivalTime":
    "The revised crew call in this first move is a planning draft. SRC-9 states the recovered call time, not this one.",
};

export const RECOVERY_EVIDENCE_IDS = ["EV-8", "EV-9", "EV-10", "EV-11", "EV-12", "EV-13"];
export const BASELINE_EVIDENCE_IDS = ["EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6", "EV-7"];

export function sourceAttribution(record: EvidenceRecord): string {
  const sources = record.sourceRefIds
    .map((id) => SOURCE_BY_ID.get(id))
    .filter((source): source is SourceReference => Boolean(source));
  if (!sources.length) return "Source";
  return sources.map((source) => source.attribution).join(" · ");
}

export function evidenceById(id: string): EvidenceRecord {
  const record = EVIDENCE.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`unknown fixture evidence ${id}`);
  return record;
}

/**
 * A record handed over by a contributor and still awaiting review, bound to the
 * values currently in the plan. Content digest is computed, not pasted.
 */
export function pendingEvidence(store: {
  snapshot: () => ProjectState;
  evidence: EvidenceRecord[];
  archivedEvidence: { evidence: EvidenceRecord }[];
  requirements: Requirement[];
}): EvidenceRecord {
  const snapshot = store.snapshot();
  const requirement =
    store.requirements.find((req) => req.id === "REQ-venue-capacity-1") ??
    store.requirements.find((req) => req.requiredEvidenceType === "document");
  if (!requirement) throw new Error("no requirement accepts a document");
  const used = new Set([
    ...store.evidence.map((record) => record.id),
    ...store.archivedEvidence.map((entry) => entry.evidence.id),
  ]);
  let number = 1;
  while (used.has(`EV-${number}`)) number += 1;
  const sourceId = snapshot.location.venueId === "VEN-A" ? "SRC-2" : "SRC-3";
  const source = SOURCE_BY_ID.get(sourceId)!;
  const boundFieldVersions: Record<string, unknown> = {
    "location.venueId": snapshot.location.venueId,
    "location.capacity": snapshot.location.capacity,
    "brief.guestCount": (snapshot.brief as Brief).guestCount,
  };
  return {
    id: `EV-${number}`,
    requirementId: requirement.id,
    type: "document",
    sourceRefIds: [sourceId],
    sourceExcerpt: source.excerpt,
    contentDigest: digest({ sourceRefIds: [sourceId], sourceExcerpt: source.excerpt }),
    artifactRef: `synthetic://${requirement.id}/EV-${number}.pdf`,
    issuer: snapshot.location.venueId,
    observedAt: "2027-02-26T09:00:00Z",
    expiresAt: "2027-03-07T00:00:00Z",
    boundFieldVersions,
    reviewDisposition: "pending",
  };
}
