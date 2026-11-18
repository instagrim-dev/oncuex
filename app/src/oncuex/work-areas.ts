export interface WorkArea {
  id: "venue" | "crew" | "production" | "photography" | "budget";
  label: string;
  requirementIds: string[];
}

/** The plan's five work areas, mapped to the requirements that support them. */
export const WORK_AREAS: WorkArea[] = [
  {
    id: "venue",
    label: "Venue",
    requirementIds: [
      "REQ-venue-loading-1",
      "REQ-venue-capacity-1",
      "REQ-fire-permit-1",
    ],
  },
  {
    id: "crew",
    label: "Crew",
    requirementIds: ["REQ-crew-arrival-1"],
  },
  {
    id: "production",
    label: "Production",
    requirementIds: ["REQ-production-runofshow-1"],
  },
  {
    id: "photography",
    label: "Photography",
    requirementIds: ["REQ-photographer-deliverables-1"],
  },
  {
    id: "budget",
    label: "Budget",
    requirementIds: ["REQ-budget-total-1"],
  },
];

export const AREA_BY_REQUIREMENT = new Map<string, WorkArea>(
  WORK_AREAS.flatMap((area) =>
    area.requirementIds.map((requirementId) => [requirementId, area] as const),
  ),
);

export const areaLabelForRequirement = (requirementId: string): string =>
  AREA_BY_REQUIREMENT.get(requirementId)?.label ?? "Plan";
