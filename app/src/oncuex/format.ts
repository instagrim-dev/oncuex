/** Formatting and plain-language labels for the operator screens. */

import { REQUIREMENTS } from "./scenario";
import type { Residual, RequirementStatus, Role } from "./types";

const FIELD_LABELS: Record<string, string> = {
  assessmentRevision: "Assessment revision",
  "brief.guestCount": "Guest count",
  "brief.approvedBudget.minorUnits": "Approved budget",
  "location.venueId": "Venue id",
  "location.venueName": "Venue name",
  "location.capacity": "Licensed occupancy",
  "location.roomPlan": "Room plan",
  "location.loadingWindow.start": "Loading window opens",
  "location.loadingWindow.end": "Loading window closes",
  "location.hardStop": "Hard stop",
  "location.fireAttestation": "Fire and occupancy attestation",
  "crew.arrivalTime": "Crew call",
  "production.runOfShowEnd": "Run of show ends",
  "budget.commitments": "Budget commitments",
  "budget.committedTotal.currency": "Committed total currency",
  "budget.committedTotal.minorUnits": "Committed total",
  "photographer.arrivalWindow.start": "Photographer arrival",
  "photographer.arrivalWindow.end": "Photographer departure",
  "photographer.deliverables.editedImages": "Edited images",
  "photographer.deliverables.deliveryDays": "Delivery days",
};

export const fieldLabel = (path: string): string => FIELD_LABELS[path] ?? path;

export const formatMoney = (minor: number, currency = "USD"): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`;
  }
};

export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(date).replace(",", "") + " UTC";
};

export const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

export const isoDay = (iso: string): string => iso.slice(0, 10);

export const shortDigest = (value: string, size = 12): string =>
  value.length > size + 8 ? `${value.slice(0, size)}…${value.slice(-4)}` : value;

export const formatFieldValue = (path: string, value: unknown): string => {
  if (value === undefined) return "not set";
  if (value === null) return "null";
  if (typeof value === "number" && path.endsWith("minorUnits")) {
    return formatMoney(value);
  }
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    return value.replace(/_/g, " ");
  }
  if (Array.isArray(value)) {
    return `${value.length} line${value.length === 1 ? "" : "s"}`;
  }
  return JSON.stringify(value);
};

export const statusLabel: Record<RequirementStatus, string> = {
  supported: "Confirmed",
  missing: "Not confirmed",
  outdated: "Needs an update",
  blocked: "Needs attention",
};

export const requirementLabel = (id: string): string =>
  REQUIREMENTS.find((requirement) => requirement.id === id)?.label ?? "Plan item";

export const readinessLabel = (readiness: string): string =>
  readiness === "ready_for_review" ? "Ready for review" : "Not ready";

export const humanCode = (code: string): string => code.replace(/_/g, " ");

export const residualText = (residual: Residual): string => {
  switch (residual.code) {
    case "mandatory_evidence_missing":
      return "No usable document has been received for this item yet.";
    case "evidence_expired":
      return "The document for this item has expired.";
    case "bound_field_changed":
      return "The plan changed after this document was received.";
    case "predicate_false":
      return "The current plan values do not meet this item.";
    case "prerequisite_not_supported": {
      const names = (residual.prerequisiteIds ?? []).map(requirementLabel);
      return `Waiting on ${names.join(", ")}.`;
    }
    case "prerequisite_cycle":
      return "The dependencies form a loop; this needs a decision.";
    case "prerequisite_conflict":
      return `Two dependencies disagree about ${fieldLabel(String(residual.field))}; this needs a decision.`;
    default:
      return "This item needs attention.";
  }
};

export const eligibilityText: Record<string, string> = {
  role_denied: "Only the event lead can sign off this plan.",
  mandatory_requirements_not_supported: "Some checklist items still need attention.",
  mandatory_evidence_expired: "A document this plan relies on has expired.",
  integration_failed: "A few details do not fit together yet.",
  requirement_set_changed: "The scope changed after the last sign-off.",
  revision_lineage_changed: "The plan has moved since the last sign-off.",
  stale_revision: "The plan changed after the last sign-off.",
};

export const decisionReasonText: Record<string, string> = {
  stale_decision: "The plan changed after this sign-off.",
  revision_lineage_changed: "The plan has moved since this sign-off.",
  requirement_set_changed: "The scope changed after this sign-off.",
  mandatory_evidence_expired: "A document this sign-off relied on has expired.",
};

export const roleLabel = (role: Role): string =>
  role === "project_manager" ? "Project manager" : "Contributor";

export const dispositionLabel: Record<string, string> = {
  accepted: "Accepted",
  pending: "Awaiting review",
  rejected: "Rejected",
};

export const signedMoney = (minor: number): string =>
  `${minor < 0 ? "−" : ""}${formatMoney(Math.abs(minor))}`;

export const actorName = (
  id: string,
  people: Record<string, string>,
): string => people[id] ?? id;

export const prettyPredicate: Record<string, string> = {
  evidence_present: "Evidence present",
  numeric_within: "Numeric threshold",
  time_within_window: "Time within window",
  set_equals: "Value equals",
  attestation_reviewed: "Attestation reviewed",
};
