import { minutes } from "@/oncuex/engine";
import { bindingMatches } from "@/oncuex/schema";
import { flawedLegacySample } from "@/oncuex/evidence-trust";
import { REQUIREMENTS } from "@/oncuex/scenario";
import { formatMoney, residualText } from "@/oncuex/format";
import type {
  Assessment,
  Brief,
  EvidenceRecord,
  ProjectState,
  RequirementStatus,
  RequirementResult,
} from "@/oncuex/types";

export const STATUS_RANK: Record<RequirementStatus, number> = {
  missing: 0,
  blocked: 1,
  outdated: 2,
  supported: 3,
};

export type SourceState = "confirmed" | "review" | "update" | "unused";

export function areaStatus(
  ids: string[],
  results: Map<string, RequirementResult>,
): RequirementStatus | null {
  const statuses = ids
    .map((id) => results.get(id)?.status)
    .filter((status): status is RequirementStatus => Boolean(status));
  if (!statuses.length) return null;
  return statuses.reduce((worst, status) =>
    STATUS_RANK[status] < STATUS_RANK[worst] ? status : worst,
  );
}

export function sourceState(
  record: EvidenceRecord,
  snapshot: ProjectState,
  now: string,
): SourceState {
  if (record.reviewDisposition === "rejected") return "unused";
  if (flawedLegacySample(record)) return "update";
  if (record.expiresAt && record.expiresAt <= now) return "update";
  if (record.reviewDisposition === "pending") return "review";
  const changed = Object.entries(record.boundFieldVersions).some(
    ([path, bound]) => !bindingMatches(path, bound, snapshot),
  );
  return changed ? "update" : "confirmed";
}

export function isSuperseded(
  record: EvidenceRecord,
  siblings: EvidenceRecord[],
  snapshot: ProjectState,
  now: string,
): boolean {
  if (sourceState(record, snapshot, now) !== "update") return false;
  return siblings.some(
    (other) =>
      other.id !== record.id &&
      other.requirementId === record.requirementId &&
      sourceState(other, snapshot, now) === "confirmed",
  );
}

export function sourceStateLabel(state: SourceState): string {
  switch (state) {
    case "confirmed":
      return "Reviewed and current";
    case "review":
      return "Needs review";
    case "update":
      return "Needs an update";
    default:
      return "Not used";
  }
}

export function checklistState(result: RequirementResult | undefined): {
  label: string;
  detail: string;
  tone: "done" | "waiting" | "needs" | "idle";
} {
  if (!result) return { label: "Not checked yet", detail: "", tone: "idle" };
  if (result.status === "supported") {
    return { label: "Checks pass", detail: "", tone: "done" };
  }
  if (result.status === "missing") {
    return { label: "No paperwork yet", detail: "", tone: "idle" };
  }
  const residual = result.residuals[0];
  const detail = residual ? residualText(residual) : "";
  if (result.status === "outdated") {
    return { label: "Needs an update", detail, tone: "needs" };
  }
  return { label: "Needs a look", detail, tone: "waiting" };
}

export interface PlanException {
  id: string;
  title: string;
  detail: string;
  tab: "checklist" | "itinerary" | "budget" | "partners";
  anchor: string;
}

export function planExceptions(
  snapshot: ProjectState,
  brief: Brief,
  assessment: Assessment | null,
): PlanException[] {
  const exceptions: PlanException[] = [];
  const committed = snapshot.budget.committedTotal.minorUnits;
  const approved = brief.approvedBudget.minorUnits;
  const currency = snapshot.budget.committedTotal.currency || brief.approvedBudget.currency;
  if (committed > approved) {
    exceptions.push({
      id: "budget",
      title: "The committed total is over budget",
      detail: `${formatMoney(committed, currency)} committed is ${formatMoney(
        committed - approved,
        currency,
      )} over the ${formatMoney(approved, currency)} approved.`,
      tab: "budget",
      anchor: "budget-overage",
    });
  }

  const accessEnd = minutes(snapshot.location.loadingWindow.end);
  const setup =
    requirementsNumber("REQ-venue-loading-1", "setupMinutes", 45);
  const crewReach = minutes(snapshot.crew.arrivalTime) + setup;
  if (crewReach > accessEnd) {
    exceptions.push({
      id: "access",
      title: "Setup runs past the access window",
      detail: `The ${snapshot.crew.arrivalTime} crew call plus ${setup} minutes setup reaches ${formatTime(
        crewReach,
      )}; access closes at ${snapshot.location.loadingWindow.end}.`,
      tab: "itinerary",
      anchor: "timeline-setup",
    });
  }

  const buffer = brief.circulationBuffer ?? 10;
  const needed = brief.guestCount + buffer;
  if (snapshot.location.capacity < needed) {
    exceptions.push({
      id: "capacity",
      title: "The room is short on capacity",
      detail: `Licensed occupancy is ${snapshot.location.capacity}; ${brief.guestCount} guests plus ${buffer} circulation needs ${needed}.`,
      tab: "partners",
      anchor: "partner-venue",
    });
  }

  const margin = requirementsNumber("REQ-production-runofshow-1", "marginMinutes", 30);
  const showEnd = minutes(snapshot.production.runOfShowEnd);
  const hardStop = minutes(snapshot.location.hardStop);
  if (showEnd + margin > hardStop) {
    exceptions.push({
      id: "runofshow",
      title: "The run of show is too close to the hard stop",
      detail: `Run of show ends at ${snapshot.production.runOfShowEnd}; with a ${margin} minute margin the room is needed until ${formatTime(
        showEnd + margin,
      )}, but the hard stop is ${snapshot.location.hardStop}.`,
      tab: "itinerary",
      anchor: "timeline-runofshow",
    });
  }

  if (snapshot.location.fireAttestation !== "reviewed") {
    exceptions.push({
      id: "attestation",
      title: "The fire attestation is not reviewed",
      detail: `The attestation on file for ${snapshot.location.venueName} has not been reviewed.`,
      tab: "partners",
      anchor: "partner-venue",
    });
  }

  if (assessment) {
    const stale = assessment.requirements.filter(
      (result) => result.status === "outdated",
    ).length;
    if (stale > 0) {
      exceptions.push({
        id: "documents",
        title: `${stale} checklist item${stale === 1 ? "" : "s"} need an update`,
        detail: "The plan moved after the documents behind them were received.",
        tab: "checklist",
        anchor: "checklist-support",
      });
    }
  }

  return exceptions;
}

function requirementsNumber(id: string, key: string, fallback: number): number {
  const requirement = REQUIREMENTS.find((candidate) => candidate.id === id);
  const value = requirement?.expectedValues?.[key];
  return typeof value === "number" ? value : fallback;
}

function formatTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function requirementNote(
  requirementId: string,
  snapshot: ProjectState,
  brief: Brief,
): string | null {
  const currency = snapshot.budget.committedTotal.currency || brief.approvedBudget.currency;
  const buffer = brief.circulationBuffer ?? 10;
  const needed = brief.guestCount + buffer;
  const setup = requirementsNumber("REQ-venue-loading-1", "setupMinutes", 45);
  const margin = requirementsNumber("REQ-production-runofshow-1", "marginMinutes", 30);

  switch (requirementId) {
    case "REQ-venue-capacity-1":
      return snapshot.location.capacity < needed
        ? `${snapshot.location.capacity} capacity is ${needed - snapshot.location.capacity} short for ${brief.guestCount} guests plus ${buffer} circulation.`
        : null;
    case "REQ-venue-loading-1": {
      const reach = minutes(snapshot.crew.arrivalTime) + setup;
      return reach > minutes(snapshot.location.loadingWindow.end)
        ? `The ${snapshot.crew.arrivalTime} crew call plus ${setup} minutes setup runs past the ${snapshot.location.loadingWindow.end} access close.`
        : null;
    }
    case "REQ-crew-arrival-1":
      return minutes(snapshot.crew.arrivalTime) < minutes(snapshot.location.loadingWindow.start)
        ? `The ${snapshot.crew.arrivalTime} crew call is before access opens at ${snapshot.location.loadingWindow.start}.`
        : null;
    case "REQ-production-runofshow-1": {
      const reach = minutes(snapshot.production.runOfShowEnd) + margin;
      return reach > minutes(snapshot.location.hardStop)
        ? `The ${snapshot.production.runOfShowEnd} run of show plus a ${margin} minute margin runs past the ${snapshot.location.hardStop} hard stop.`
        : null;
    }
    case "REQ-budget-total-1":
      return snapshot.budget.committedTotal.minorUnits > brief.approvedBudget.minorUnits
        ? `Committed ${formatMoney(
            snapshot.budget.committedTotal.minorUnits,
            currency,
          )} is ${formatMoney(
            snapshot.budget.committedTotal.minorUnits - brief.approvedBudget.minorUnits,
            currency,
          )} over the ${formatMoney(brief.approvedBudget.minorUnits, currency)} approved budget.`
        : null;
    case "REQ-fire-permit-1":
      return snapshot.location.fireAttestation !== "reviewed"
        ? `The fire and occupancy attestation for ${snapshot.location.venueName} has not been reviewed.`
        : null;
    default:
      return null;
  }
}

export function daysToEvent(now: string, eventDate: string): number {
  const start = new Date(now.slice(0, 10) + "T00:00:00Z").getTime();
  const end = new Date(eventDate + "T00:00:00Z").getTime();
  return Math.round((end - start) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `${days} days to go`;
  if (days === -1) return "Yesterday";
  return `${Math.abs(days)} days ago`;
}
