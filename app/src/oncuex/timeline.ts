import { changeTitle } from "@/oncuex/demo";
import { PEOPLE, sourceAttribution } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import type { EvidenceRecord, EventRecord } from "@/oncuex/types";
import type { Store } from "@/oncuex/store";

export interface TimelineEntry {
  key: string;
  title: string;
  detail: string;
  scope?: string[];
  currentness?: "current" | "historical";
}

export function timelineEntries(store: Store): TimelineEntry[] {
  const findSource = (id: string): EvidenceRecord | undefined =>
    store.evidence.find((record) => record.id === id) ??
    store.archivedEvidence.find((entry) => entry.evidence.id === id)?.evidence;

  return [...store.events].reverse().map((event: EventRecord) => {
    const actor = PEOPLE[event.actor ?? ""] ?? "The event team";
    switch (event.eventType) {
      case "brief.adopted":
        return {
          key: event.id,
          title: "Plan started from the adopted brief",
          detail: `${actor} adopted the launch brief and approved budget.`,
        };
      case "evidence.attached": {
        const source = findSource(String(event.payload.evidenceId ?? ""));
        return {
          key: event.id,
          title: source ? `Paperwork added: ${sourceAttribution(source)}` : "New paperwork",
          detail: source
            ? `${actor} · received ${formatDate(source.observedAt)} · For check: ${store.requirements.find((requirement) => requirement.id === source.requirementId)?.label ?? source.requirementId} (${source.id})`
            : `${actor} added paperwork to the plan.`,
        };
      }
      case "evidence.reviewed": {
        const source = findSource(String(event.payload.evidenceId ?? ""));
        const disposition = String(event.payload.disposition ?? "");
        const name = source ? sourceAttribution(source) : "some paperwork";
        return {
          key: event.id,
          title:
            disposition === "accepted"
              ? `Paperwork reviewed: ${name}`
              : disposition === "rejected"
                ? `Paperwork marked for a new version: ${name}`
                : `Paperwork sent back for a look: ${name}`,
          detail:
            `${actor} · For check: ${source ? store.requirements.find((requirement) => requirement.id === source.requirementId)?.label ?? source.requirementId : "not recorded"}${source ? ` (${source.id})` : ""} · ${disposition === "accepted" ? "reviewed as current at the time" : disposition === "rejected" ? "marked for a new version" : "review pending"}.`,
        };
      }
      case "change.adopted": {
        const id = String(event.payload.changeId ?? "");
        return {
          key: event.id,
          title: typeof event.payload.title === "string" ? event.payload.title : changeTitle(id),
          detail: `${actor} · some checklist items may need an update; the rest stayed valid.`,
        };
      }
      case "decision.recorded": {
        const decisionId = String(event.payload.decisionId ?? "");
        const decision = store.decisionsList().find((candidate) => candidate.id === decisionId);
        const sources = decision
          ? store.decisionEvidence(decision.id).map((record) => sourceAttribution(record))
          : [];
        return {
          key: event.id,
          title: "Plan signed off",
          detail: `${actor} signed off the plan.`,
          scope: sources,
          currentness: decision ? store.currentness(decision.id) : undefined,
        };
      }
      case "requirementSet.changed":
        return {
          key: event.id,
          title: "The plan’s scope changed",
          detail: `${actor} · the previous sign-off no longer applies.`,
        };
      default:
        return {
          key: event.id,
          title: "The plan was updated",
          detail: actor,
        };
    }
  });
}
