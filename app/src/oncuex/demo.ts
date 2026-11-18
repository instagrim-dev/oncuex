/**
 * Demo layer: the reviewed command sequence an operator follows.
 *
 * Every state change goes through the public store commands. Nothing here
 * writes project fields directly, and nothing here decides a status.
 */

import { CommandError, Store } from "./store";
import {
  BASELINE_EVIDENCE_IDS,
  BRIEF,
  CHANGE_META,
  baselineTarget,
  EVIDENCE,
  RECOVERY_EVIDENCE_IDS,
  RECOVERY_EVIDENCE_IDS as RECOVERY_IDS,
  diffState,
  evidenceById,
  pendingEvidence,
  recoveryChange,
  venueChange,
} from "./scenario";
import type { Command, CommandResult, Role } from "./types";

export const PM_ACTOR = BRIEF.owner.id;
export const CONTRIBUTOR_ACTOR = "CON-ana";

export const WITHDRAWN_REQUIREMENT_ID = "REQ-photographer-deliverables-1";

function commandFor(
  store: Store,
  role: Role,
  actor: string,
  decisionId?: string,
): Command {
  return {
    commandId: `CMD-${store.sequence + 1}`,
    role,
    actor,
    expectedAssessmentRevision: store.assessmentRevision,
    ...(decisionId ? { decisionId } : {}),
  };
}

export function adoptReviewedBrief(
  store: Store,
  brief: typeof BRIEF,
): CommandResult {
  return store.adoptBrief(commandFor(store, "project_manager", PM_ACTOR), brief);
}

export function attachBaselineEvidence(store: Store): string {
  for (const id of BASELINE_EVIDENCE_IDS) {
    store.attachEvidence(
      commandFor(store, "project_manager", PM_ACTOR),
      structuredClone(evidenceById(id)),
    );
  }
  return `${BASELINE_EVIDENCE_IDS.length} prepared documents added.`;
}

export function loadBaseline(store: Store): string {
  store.adoptBrief(commandFor(store, "project_manager", PM_ACTOR), structuredClone(BRIEF));
  for (const id of BASELINE_EVIDENCE_IDS) {
    store.attachEvidence(
      commandFor(store, "project_manager", PM_ACTOR),
      structuredClone(evidenceById(id)),
    );
  }
  return `The Northwind brief is adopted and ${BASELINE_EVIDENCE_IDS.length} sources are attached.`;
}

export function recordAcceptance(store: Store, decisionId: string): CommandResult {
  return store.recordDecision(
    commandFor(store, "project_manager", PM_ACTOR, decisionId),
  );
}

/** Acceptance attempt as whoever is selected; the store enforces the role. */
export function attemptAcceptance(
  store: Store,
  decisionId: string,
  role: Role,
  actor: string,
): CommandResult {
  return store.recordDecision(commandFor(store, role, actor, decisionId));
}

export function nextDecisionId(store: Store): string {
  const numbers = store
    .decisionsList()
    .map((decision) => Number(decision.id.replace(/^DEC-/, "")))
    .filter((value) => Number.isFinite(value));
  return `DEC-${Math.max(0, ...numbers) + 1}`;
}

export function adoptVenueChange(store: Store): string {
  const change = venueChange(store.snapshot());
  const count = Object.keys(change.changedFields).length;
  store.adoptChange(commandFor(store, "project_manager", PM_ACTOR), change);
  return `The venue moved to Pier 9 Loft across ${count} plan values. Review what needs updating.`;
}

export function adoptRecovery(store: Store): string {
  const change = recoveryChange(store.snapshot());
  const count = Object.keys(change.changedFields).length;
  store.adoptChange(commandFor(store, "project_manager", PM_ACTOR), change);
  return `The recovered plan is in place across ${count} plan values.`;
}

export function attachRecoveryEvidence(store: Store): string {
  for (const id of RECOVERY_EVIDENCE_IDS) {
    store.attachEvidence(
      commandFor(store, "project_manager", PM_ACTOR),
      structuredClone(evidenceById(id)),
    );
  }
  return `${RECOVERY_EVIDENCE_IDS.length} recovered documents added.`;
}

export function reviewEvidence(
  store: Store,
  evidenceId: string,
  disposition: "accepted" | "rejected" | "pending",
  role: Role = "project_manager",
  actor: string = PM_ACTOR,
): CommandResult {
  return store.reviewEvidence(
    commandFor(store, role, actor),
    evidenceId,
    disposition,
  );
}

export function attachPendingEvidence(store: Store): string {
  const record = pendingEvidence(store);
  store.attachEvidence(
    commandFor(store, "contributor", CONTRIBUTOR_ACTOR),
    record,
  );
  return "A new source was added and needs your review.";
}

/** O7: removing a scope archives its records instead of deleting them. */
export function withdrawPhotographer(store: Store): string {
  if (!store.requirements.some((req) => req.id === WITHDRAWN_REQUIREMENT_ID)) {
    throw new CommandError("already_withdrawn", WITHDRAWN_REQUIREMENT_ID);
  }
  const requirements = store.requirements.filter(
    (req) => req.id !== WITHDRAWN_REQUIREMENT_ID,
  );
  const evidence = store.evidence.filter(
    (record) => record.requirementId !== WITHDRAWN_REQUIREMENT_ID,
  );
  store.changeRequirementSet(
    commandFor(store, "project_manager", PM_ACTOR),
    requirements,
    evidence,
  );
  return "Photography has been removed from the plan; its source is kept for history.";
}

export function revertToBaseline(store: Store): string {
  const change = {
    id: "CHG-3",
    title: "Revert every plan value to the baseline",
    changedFields: diffState(store.snapshot(), baselineTarget()),
  };
  store.adoptChange(commandFor(store, "project_manager", PM_ACTOR), change);
  return "The plan values are back to the original launch plan. The earlier approval does not return.";
}

/* ---------------------------------------------------------------- state probes */

export function hasDecision(store: Store, id: string): boolean {
  return Boolean(store.decisionById(id));
}

export function adoptedChangeIds(store: Store): string[] {
  return store.events
    .filter((event) => event.eventType === "change.adopted")
    .map((event) => String(event.payload?.changeId ?? ""));
}

export function attachedEvidenceIds(store: Store): string[] {
  return store.evidence.map((record) => record.id);
}

export function recoveryEvidenceAttached(store: Store): boolean {
  const ids = new Set(attachedEvidenceIds(store));
  return RECOVERY_IDS.every((id) => ids.has(id));
}

export function photographerWithdrawn(store: Store): boolean {
  return !store.requirements.some((req) => req.id === WITHDRAWN_REQUIREMENT_ID);
}

export const FIXTURE_EVIDENCE_COUNT = EVIDENCE.length;

export function changeTitle(id: string): string {
  if (id === CHANGE_META.venue.id) return CHANGE_META.venue.title;
  if (id === CHANGE_META.recovery.id) return CHANGE_META.recovery.title;
  if (id === "CHG-3") return "Plan values reverted to the original launch plan";
  return "The plan changed";
}
