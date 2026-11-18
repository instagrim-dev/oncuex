import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { formatDateTime, shortDigest } from "@/oncuex/format";
import { Archive, Database, Download, RefreshCw } from "lucide-react";
import { Chip, Mono, Note, Panel } from "./ui-bits";
import { cn } from "@/lib/utils";

interface AuditViewProps {
  session: ReturnType<typeof useOperatorSession>;
  briefReady: boolean;
}

const eventTone = (type: string): "success" | "info" | "warning" | "neutral" => {
  if (type === "decision.recorded") return "warning";
  if (type === "change.adopted") return "info";
  if (type === "evidence.reviewed") return "neutral";
  return "success";
};

function payloadSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "brief.adopted":
      return "brief adopted";
    case "evidence.attached":
      return String(payload.evidenceId ?? "");
    case "evidence.reviewed":
      return `${String(payload.evidenceId ?? "")} → ${String(payload.disposition ?? "")}`;
    case "change.adopted": {
      const paths = Array.isArray(payload.changedPaths) ? payload.changedPaths.length : 0;
      return `${String(payload.changeId ?? "")} · ${paths} path${paths === 1 ? "" : "s"}`;
    }
    case "decision.recorded":
      return String(payload.decisionId ?? "");
    case "requirementSet.changed": {
      const requirements = Array.isArray(payload.requirementIds)
        ? payload.requirementIds.length
        : 0;
      const evidence = Array.isArray(payload.evidenceIds) ? payload.evidenceIds.length : 0;
      return `set v${String(payload.requirementSetVersion ?? "")} · ${requirements} requirements · ${evidence} records`;
    }
    default:
      return Object.keys(payload).join(", ");
  }
}

export function AuditView({ session, briefReady }: AuditViewProps) {
  const store = session.store;
  const exportDoc = store.export();

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Record"
        title={`Export contract v${exportDoc.exportVersion}`}
        description="The saved export is the whole record: project, requirement set, current and archived evidence, every event and every decision, with both counters."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              disabled={!briefReady}
              onClick={session.downloadExport}
            >
              <Download className="size-3.5" />
              Download JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              disabled={!briefReady}
              onClick={session.reloadFromExport}
            >
              <RefreshCw className="size-3.5" />
              Reload export
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Sequence
            </p>
            <p className="tnum text-xl font-semibold">{exportDoc.counters.sequence}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Assessment revision
            </p>
            <p className="tnum text-xl font-semibold">{exportDoc.counters.assessmentRevision}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Evidence
            </p>
            <p className="text-[13px] font-semibold">
              {exportDoc.evidence.length} current · {exportDoc.archivedEvidence.length} archived
            </p>
            <p className="text-[10.5px] text-muted-foreground">
              {exportDoc.decisions.length} decision{exportDoc.decisions.length === 1 ? "" : "s"} ·{" "}
              {exportDoc.events.length} events
            </p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Local save
            </p>
            <p className="text-[13px] font-semibold">
              {session.savedAt ? formatDateTime(session.savedAt) : "Not saved yet"}
            </p>
            <p className="text-[10.5px] text-muted-foreground">
              Written after each command; revalidated on load.
            </p>
          </div>
        </div>

        {session.reloadCheck && (
          <div className="mt-3">
            <Note tone={session.reloadCheck.ok ? "success" : "danger"} icon={Database}>
              {session.reloadCheck.detail}
            </Note>
          </div>
        )}

        <div className="mt-3">
          <Note tone="neutral" icon={Archive}>
            Import never trusts the file: the export version, snapshot, requirement shapes, evidence
            digests, decision bindings, event continuity and counters are validated before a store is
            built. A legacy or tampered document is rejected with{" "}
            <span className="font-mono text-[11px]">invalid_export</span>.
          </Note>
        </div>
      </Panel>

      <Panel
        eyebrow="Event log"
        title="Append-only commands and counter movement"
        description="decision.recorded advances the sequence only. Every other listed event changes assessed facts and advances the revision."
        actions={<Chip tone="neutral" mono>{store.events.length} events</Chip>}
      >
        {store.events.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No events. Loading the baseline appends the brief adoption and seven evidence attachments.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-border/60 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Seq</th>
                  <th className="py-2 pr-3 font-semibold">Event</th>
                  <th className="py-2 pr-3 font-semibold">Command</th>
                  <th className="py-2 pr-3 font-semibold">Actor</th>
                  <th className="py-2 pr-3 font-semibold">Payload</th>
                  <th className="py-2 pr-3 font-semibold">Revision</th>
                  <th className="py-2 font-semibold">Facts</th>
                </tr>
              </thead>
              <tbody>
                {[...store.events].reverse().map((event) => (
                  <tr key={event.id} className="border-b border-border/40 last:border-0">
                    <td className="tnum py-1.5 pr-3 font-mono text-muted-foreground">
                      {event.sequence}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge
                        variant={eventTone(event.eventType)}
                        className={cn("px-1.5 py-0 text-[9px] font-semibold uppercase")}
                      >
                        {event.eventType}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[10.5px]">
                      {event.commandId ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[10.5px] text-muted-foreground">
                      {event.actor ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-[11px]">
                      {payloadSummary(event.eventType, event.payload)}
                    </td>
                    <td className="tnum py-1.5 pr-3 font-mono">
                      {event.resultingAssessmentRevision}
                    </td>
                    <td className="py-1.5">
                      {event.assessedFactsChanged ? (
                        <span className="text-info">assessed</span>
                      ) : (
                        <span className="text-muted-foreground">opinion</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        eyebrow="Archive"
        title="Withdrawn evidence, preserved"
        description="An entry carries the record as it stood, the sequence that archived it, the reason and the requirement-set version that replaced it."
        actions={<Chip tone="neutral">{store.archivedEvidence.length} archived</Chip>}
      >
        {store.archivedEvidence.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nothing archived. Withdrawing the photographer scope on the Run tab exercises this path.
          </p>
        ) : (
          <ul className="space-y-2">
            {store.archivedEvidence.map((entry) => (
              <li key={entry.evidence.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Mono className="font-semibold">{entry.evidence.id}</Mono>
                  <Chip tone="neutral" mono>{entry.evidence.requirementId}</Chip>
                  <Chip tone="neutral">{entry.archiveReason}</Chip>
                  <Chip tone="neutral">sequence {entry.archivedAtSequence}</Chip>
                  <Chip tone="neutral">set v{entry.requirementSetVersion}</Chip>
                </div>
                <p className="mt-1.5 text-[12px] italic leading-5">“{entry.evidence.sourceExcerpt}”</p>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  {entry.evidence.issuer} · observed {formatDateTime(entry.evidence.observedAt)} ·
                  disposition {entry.evidence.reviewDisposition} · digest{" "}
                  {shortDigest(entry.evidence.contentDigest, 20)} · artifact{" "}
                  <span className="font-mono">{entry.evidence.artifactRef}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        eyebrow="Determinism"
        title="Why the demo cannot drift from the record"
        description="The operator screens read the store. The statuses, impact sets and eligibility are evaluated on each render from the current snapshot and event log."
      >
        <ul className="space-y-1.5 text-[12px] leading-5 text-muted-foreground">
          <li>— A repeated command id returns the stored result and appends no event.</li>
          <li>— A command with a stale expected revision is rejected before any write.</li>
          <li>— A rejected action leaves the counters and authoritative records unchanged.</li>
          <li>— The self-check reruns the canonical path through the same public commands.</li>
        </ul>
      </Panel>
    </div>
  );
}
