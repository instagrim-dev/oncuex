import { changeTitle } from "@/oncuex/demo";
import { PEOPLE, sourceAttribution } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import type { EvidenceRecord, EventRecord } from "@/oncuex/types";
import type { Store } from "@/oncuex/store";

export interface ActivityEntry {
  key: string;
  title: string;
  detail: string;
  scope?: string[];
  currentness?: "current" | "historical";
}

export function activityEntries(store: Store): ActivityEntry[] {
  const findSource = (id: string): EvidenceRecord | undefined =>
    store.evidence.find((record) => record.id === id) ??
    store.archivedEvidence.find((entry) => entry.evidence.id === id)?.evidence;

  return [...store.events].reverse().map((event: EventRecord) => {
    const actor = PEOPLE[event.actor ?? ""] ?? "The event team";
    switch (event.eventType) {
      case "brief.adopted":
        return {
          key: event.id,
          title: "Plan started from the Northwind brief",
          detail: `${actor} adopted the launch brief and approved budget.`,
        };
      case "evidence.attached": {
        const source = findSource(String(event.payload.evidenceId ?? ""));
        return {
          key: event.id,
          title: source ? `Document added: ${sourceAttribution(source)}` : "A document was added",
          detail: source
            ? `${actor} · received ${formatDate(source.observedAt)}`
            : `${actor} added a document to the plan.`,
        };
      }
      case "evidence.reviewed": {
        const source = findSource(String(event.payload.evidenceId ?? ""));
        const disposition = String(event.payload.disposition ?? "");
        const name = source ? sourceAttribution(source) : "a document";
        return {
          key: event.id,
          title:
            disposition === "accepted"
              ? `Document reviewed and current: ${name}`
              : disposition === "rejected"
                ? `Document marked not used or needing a new version: ${name}`
                : `Document returned for review: ${name}`,
          detail:
            disposition === "accepted"
              ? `${actor} reviewed it as current. No partner confirmation is implied.`
              : `${actor} · no message was sent.`,
        };
      }
      case "change.adopted": {
        const id = String(event.payload.changeId ?? "");
        return {
          key: event.id,
          title: changeTitle(id),
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
          title: "The scope of the plan changed",
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
