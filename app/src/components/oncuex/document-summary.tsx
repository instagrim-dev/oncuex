import type { useOperatorSession } from "@/hooks/use-operator-session";
import { sourceAttribution } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import { sourceState, sourceStateLabel } from "@/oncuex/presentation";
import { Panel } from "./ui-bits";

export function DocumentSummary({ session }: { session: ReturnType<typeof useOperatorSession> }) {
  const store = session.store;
  const venueRecords = store.evidence.filter((record) => record.requirementId.startsWith("REQ-venue-") || record.requirementId === "REQ-fire-permit-1");
  const groups = new Map<string, typeof venueRecords>();
  for (const record of venueRecords) {
    const key = record.sourceRefIds.join("|");
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return <Panel eyebrow="Source coverage" title="Venue documents by source" description="Requirements listed here are the checks each retained record is associated with. Read the excerpts and validity before relying on them.">
    {groups.size ? <div className="space-y-2">{[...groups.entries()].map(([key, records]) => <div key={key} className="rounded-lg border border-border p-3"><p className="text-xs font-semibold">{sourceAttribution(records[0])}</p>{[...new Set(records.map((record) => record.sourceExcerpt))].map((excerpt) => <p key={excerpt} className="mt-1 text-xs leading-5 text-muted-foreground">“{excerpt}”</p>)}<ul className="mt-2 space-y-1">{records.map((record) => <li key={record.id} className="text-xs">{store.requirements.find((req) => req.id === record.requirementId)?.label ?? record.requirementId} · {sourceStateLabel(sourceState(record, store.snapshot(), store.now()))} · valid to {formatDate(record.expiresAt)}</li>)}</ul></div>)}</div> : <p className="text-xs text-muted-foreground">No venue documents are attached.</p>}
  </Panel>;
}
