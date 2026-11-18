import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { bindingDiff, hasBrief } from "@/oncuex/engine";
import { isExpired } from "@/oncuex/schema";
import { attachPendingEvidence, reviewEvidence } from "@/oncuex/demo";
import { PEOPLE, REQUIREMENTS, SOURCE_BY_ID } from "@/oncuex/scenario";
import {
  dispositionLabel,
  fieldLabel,
  formatDateTime,
  formatFieldValue,
  shortDigest,
} from "@/oncuex/format";
import { Archive, FileSearch, Inbox, ShieldCheck } from "lucide-react";
import { Chip, DispositionBadge, EmptyState, Mono, Note, Panel } from "./ui-bits";
import { cn } from "@/lib/utils";

interface EvidenceViewProps {
  session: ReturnType<typeof useOperatorSession>;
  onOpenTab: (tab: string) => void;
}

type Filter = "all" | "pending" | "accepted" | "rejected" | "stale";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Awaiting review" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "stale", label: "Stale bindings or expired" },
];

export function EvidenceView({ session, onOpenTab }: EvidenceViewProps) {
  const store = session.store;
  const [filter, setFilter] = useState<Filter>("all");
  const snapshot = store.snapshot();
  const briefReady = hasBrief(snapshot);
  const requirementLabel = useMemo(
    () => new Map(REQUIREMENTS.map((requirement) => [requirement.id, requirement.label])),
    [],
  );

  const order = { pending: 0, rejected: 1, accepted: 2 } as Record<string, number>;
  const records = [...store.evidence].sort((left, right) => {
    const byState = (order[left.reviewDisposition] ?? 3) - (order[right.reviewDisposition] ?? 3);
    if (byState !== 0) return byState;
    return Number(left.id.replace("EV-", "")) - Number(right.id.replace("EV-", ""));
  });

  const pending = store.evidence.filter((record) => record.reviewDisposition === "pending");
  const stale = (record: (typeof store.evidence)[number]) =>
    isExpired(record, store.now()) || bindingDiff(record, snapshot).some((entry) => !entry.matches);

  const visible = records.filter((record) => {
    if (filter === "all") return true;
    if (filter === "stale") return stale(record);
    return record.reviewDisposition === filter;
  });

  const review = (id: string, disposition: "accepted" | "rejected" | "pending") => {
    session.apply(`Evidence ${id}`, (current) => {
      const result = reviewEvidence(
        current,
        id,
        disposition,
        session.persona.role,
        session.persona.id,
      );
      return `${id} set to ${disposition}. Revision ${result.assessmentRevision}${
        result.assessedFactsChanged ? "" : " (disposition unchanged, no assessed fact)"
      }.`;
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Evidence review"
        title="Every record, its source span and its bindings"
        description="A record only supports a requirement while it is accepted, unexpired, and its bound values still match the plan."
        actions={
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={!briefReady}
              onClick={() =>
                session.apply("Contributor upload", (current) => attachPendingEvidence(current))
              }
            >
              Attach pending record
            </Button>
            {FILTERS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={filter === option.id ? "default" : "outline"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="neutral">{store.evidence.length} current records</Chip>
          <Chip tone={pending.length ? "warning" : "success"}>{pending.length} awaiting review</Chip>
          <Chip tone="neutral">{store.archivedEvidence.length} archived</Chip>
          <Chip tone="neutral" mono>
            {session.persona.name} · {session.persona.role}
          </Chip>
        </div>

        {pending.length === 0 && (
          <div className="mt-3">
            <Note tone="neutral" icon={Inbox}>
              No unresolved records right now. A contributor upload arrives as{" "}
              <span className="font-mono text-[11px]">pending</span> and stays out of readiness until
              someone reviews it.
            </Note>
          </div>
        )}

        {pending.length > 0 && (
          <div className="mt-3">
            <Note tone="warning" icon={Inbox}>
              <span className="font-medium">{pending.length} record(s) are unresolved.</span> They were
              authored and attached through a command but no reviewer has accepted them, so they
              cannot support a requirement yet. Reviewing is available to both simulated roles.
            </Note>
          </div>
        )}

        <div className="mt-3">
          <Note tone="neutral" icon={ShieldCheck}>
            A changed disposition is an assessed fact: the revision moves and an acceptance that relied
            on the record becomes historical. Setting the disposition it already holds appends an event
            without moving the revision.
          </Note>
        </div>
      </Panel>

      {visible.length === 0 ? (
        <Panel title="No records in this filter">
          <EmptyState
            icon={FileSearch}
            title="Nothing to review here"
            description="Change the filter, or attach a pending contributor record from the Run tab."
          />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {visible.map((record) => {
            const diff = bindingDiff(record, snapshot);
            const changed = diff.filter((entry) => !entry.matches);
            const lapsed = isExpired(record, store.now());
            const archived = store.archivedEvidence.some(
              (entry) => entry.evidence.id === record.id,
            );
            return (
              <li key={record.id}>
                <Panel
                  className={cn(
                    changed.length || lapsed ? "border-info/30" : undefined,
                    record.reviewDisposition === "pending" && "border-warning/40",
                  )}
                  contentClassName="space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Mono className="text-[12px] font-semibold">{record.id}</Mono>
                        <DispositionBadge disposition={record.reviewDisposition} />
                        <Chip tone="neutral" mono>
                          {record.type}
                        </Chip>
                        {lapsed && <Chip tone="warning">expired</Chip>}
                        {!lapsed && changed.length > 0 && (
                          <Chip tone="info">
                            {changed.length} binding{changed.length === 1 ? "" : "s"} moved
                          </Chip>
                        )}
                        {archived && <Chip tone="neutral">archived copy</Chip>}
                      </div>
                      <p className="text-[12.5px] leading-5">
                        <span className="font-medium">{requirementLabel.get(record.requirementId) ?? record.requirementId}</span>{" "}
                        <Mono className="text-muted-foreground">{record.requirementId}</Mono>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Issuer {record.issuer} · observed {formatDateTime(record.observedAt)} · expires{" "}
                        {formatDateTime(record.expiresAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(["accepted", "rejected", "pending"] as const).map((disposition) => (
                        <Button
                          key={disposition}
                          size="sm"
                          variant={
                            record.reviewDisposition === disposition
                              ? disposition === "accepted"
                                ? "default"
                                : "secondary"
                              : "outline"
                          }
                          className="h-7 px-2 text-[11px]"
                          disabled={record.reviewDisposition === disposition}
                          onClick={() => review(record.id, disposition)}
                        >
                          {dispositionLabel[disposition]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Source span
                    </p>
                    <p className="mt-1 text-[12px] italic leading-5">“{record.sourceExcerpt}”</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {record.sourceRefIds.map((id) => {
                        const source = SOURCE_BY_ID.get(id);
                        return (
                          <Chip key={id} tone="neutral" mono>
                            {id}
                            {source ? ` · ${source.attribution}` : ""}
                          </Chip>
                        );
                      })}
                    </div>
                    <p className="mt-1 break-all text-[10.5px] text-muted-foreground">
                      Artifact <span className="font-mono">{record.artifactRef}</span> · content digest{" "}
                      <span className="font-mono">{shortDigest(record.contentDigest, 16)}</span>
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-[11.5px]">
                      <thead>
                        <tr className="border-b border-border/60 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                          <th className="py-1.5 pr-3 font-semibold">Bound field</th>
                          <th className="py-1.5 pr-3 font-semibold">Value at observation</th>
                          <th className="py-1.5 pr-3 font-semibold">Current plan</th>
                          <th className="py-1.5 font-semibold">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map((entry) => (
                          <tr key={entry.path} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 pr-3 text-muted-foreground">
                              {fieldLabel(entry.path)}
                            </td>
                            <td className="py-1.5 pr-3 font-mono text-[11px]">
                              {entry.path === "budget.commitments"
                                ? shortDigest(String(entry.bound), 20)
                                : formatFieldValue(entry.path, entry.bound)}
                            </td>
                            <td className="py-1.5 pr-3 font-mono text-[11px]">
                              {entry.path === "budget.commitments" && Array.isArray(entry.current)
                                ? `${entry.current.length} lines`
                                : formatFieldValue(entry.path, entry.current)}
                            </td>
                            <td className="py-1.5">
                              {entry.matches ? (
                                <Badge variant="success" className="px-1.5 py-0 text-[9px] uppercase">
                                  matches
                                </Badge>
                              ) : (
                                <Badge variant="info" className="px-1.5 py-0 text-[9px] uppercase">
                                  moved
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                    <span>
                      Requirement owner {PEOPLE[REQUIREMENTS.find((req) => req.id === record.requirementId)?.owner ?? ""] ?? "—"}
                    </span>
                    <span>
                      {record.reviewDisposition === "accepted"
                        ? "Accepted records count toward readiness."
                        : record.reviewDisposition === "pending"
                          ? "Pending records never count toward readiness."
                          : "Rejected records remain history and never count."}
                    </span>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <Panel
        eyebrow="Archive"
        title="Withdrawn records stay readable"
        description="Withdrawal happens through a requirement-set change. The record is archived with the sequence and set version that retired it."
        actions={
          <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => onOpenTab("audit")}>
            <Archive className="size-3.5" />
            Audit trail
          </Button>
        }
      >
        {store.archivedEvidence.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No records withdrawn. Use the withdrawn-scope case on the Run tab to exercise the archive.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {store.archivedEvidence.map((entry) => (
              <li
                key={entry.evidence.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-[11.5px]"
              >
                <Mono>{entry.evidence.id}</Mono>
                <Chip tone="neutral">archived</Chip>
                <span className="text-muted-foreground">
                  {entry.archiveReason} · sequence {entry.archivedAtSequence} · requirement set v
                  {entry.requirementSetVersion}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
