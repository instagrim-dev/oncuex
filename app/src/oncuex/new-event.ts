import { DEFAULT_NOW, REQUIREMENT_SET_VERSION } from "./scenario";
import type { Brief, ProjectState } from "./types";

/** A new event starts with unknowns, not the prepared sample's venue or commitments. */
export function newEventProject(brief: Brief): ProjectState {
  return {
    id: `PRJ-event-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    assessmentRevision: 0,
    requirementSetVersion: REQUIREMENT_SET_VERSION,
    brief,
    circulationBuffer: brief.circulationBuffer,
    location: {
      venueId: "UNASSIGNED",
      venueName: "Venue not yet selected",
      capacity: 0,
      roomPlan: "unassigned",
      loadingWindow: { start: "00:00", end: "00:00" },
      hardStop: "00:00",
      fireAttestation: "missing",
    },
    crew: { arrivalTime: "00:00" },
    production: { runOfShowEnd: "00:00" },
    photographer: {
      arrivalWindow: { start: "00:00", end: "00:00" },
      deliverables: { editedImages: 0, deliveryDays: 0 },
    },
    budget: {
      commitments: [],
      committedTotal: { currency: brief.approvedBudget.currency, minorUnits: 0 },
    },
    _now: DEFAULT_NOW,
  };
}

export function isVenueUnassigned(snapshot: ProjectState): boolean {
  return snapshot.location.venueId === "UNASSIGNED";
}
