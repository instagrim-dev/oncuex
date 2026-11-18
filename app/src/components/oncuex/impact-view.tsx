import type { useOperatorSession } from "@/hooks/use-operator-session";
import { bindingDiff } from "@/oncuex/engine";
import { isExpired, resolve } from "@/oncuex/schema";
import { REQUIREMENTS } from "@/oncuex/scenario";
import { fieldLabel, formatDateTime, formatFieldValue } from "@/oncuex/format";
import type { Assessment } from "@/oncuex/types";
import { GitCompareArrows, MoveRight, ShieldCheck } from "lucide-react";
import { Chip, EmptyState, Mono, Note, Panel, StatusBadge } from "./ui-bits";

interface ImpactViewProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  onOpenTab: (tab: string) => void;
}

export function ImpactView({ session, assessment, onOpenTab }: ImpactViewProps) {
  const store = session.store;
  const impact = assessment?.impact ?? null;
  const changed = store.lastChangedPaths();
  const snapshot = store.snapshot();
  const statusResults = new Map(
    (assessment?.requirements ?? []).map((result) => [result.requirementId, result]),
  );
  const expiredRecords = store.evidence.filter(
    (record) => record.reviewDisposition === "accepted" && isExpired(record, store.now()),
  );
  const impactedRequirements = new Set(impact?.impacted.requirementIds ?? []);
  const impactedEvidence = new Set(impact?.impacted.evidenceIds ?? []);
  const photographerRecord =
    store.evidence.find((record) => record.id === "EV-7") ??
    store.archivedEvidence.find((entry) => entry.evidence.id === "EV-7")?.evidence;

  if (!assessment) {
    return (
      <Panel eyebrow="Impact" title="Nothing assessed yet">
        <EmptyState
          icon={GitCompareArrows}
          title="Load the baseline first"
          description="Impact is computed against a complete snapshot and a record of changed paths."
          action={
            <button
              type="button"
              onClick={() => onOpenTab("run")}
              className="text-[12px] font-medium text-primary underline underline-offset-4"
            >
              Go to the walkthrough
            </button>
          }
        />
      </Panel>
    );
  }

  if (!impact) {
    return (
      <Panel
        eyebrow="Impact"
        title="No impact trigger on the record"
        description="No change has been adopted and no accepted record has expired at the review clock. The sets become non-trivial after a change or an expiry."
        actions={
          <Chip tone="neutral" mono>
            changed paths: 0
          </Chip>
        }
      >
        <EmptyState
          icon={ShieldCheck}
          title="Everything is untouched"
          description="Adopt the venue change from the Run tab, or move the review clock past an expiry date, to compute affected and unaffected work."
          action={
            <button
              type="button"
              onClick={() => onOpenTab("run")}
              className="text-[12px] font-medium text-primary underline underline-offset-4"
            >
              Open the walkthrough
            </button>
          }
        />
      </Panel>
    );
  }

  const requirementTriggers = (id: string): string[] => {
    const requirement = REQUIREMENTS.find((candidate) => candidate.id === id);
    if (!requirement) return [];
    const reasons: string[] = [];
    const direct = requirement.fieldBindings.filter((path) => changed.has(path));
    if (direct.length) {
      reasons.push(`Declared binding changed: ${direct.map(fieldLabel).join(", ")}.`);
    }
    const recordPaths = new Set(
      store.evidence
        .filter((record) => record.requirementId === id)
        .flatMap((record) =>
          Object.keys(record.boundFieldVersions).filter((path) => changed.has(path)),
        ),
    );
    if (recordPaths.size) {
      reasons.push(
        `A supporting record bound ${[...recordPaths].map(fieldLabel).join(", ")}.`,
      );
    }
    const parents = requirement.prerequisiteIds.filter((parent) =>
      impactedRequirements.has(parent),
    );
    if (parents.length) {
      reasons.push(`In the closure of affected prerequisite ${parents.join(", ")}.`);
    }
    const expiry = expiredRecords.filter(
      (record) => record.requirementId === id && impactedEvidence.has(record.id),
    );
    if (expiry.length) {
      reasons.push(`Expired record ${expiry.map((record) => record.id).join(", ")}.`);
    }
    return reasons;
  };

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Computed impact"
        title="Affected and unaffected work"
        description="Seeded by changed paths against declared bindings and current expiry, closed over prerequisite dependents. Read back from the last change.adopted event, so a reload reproduces it."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="warning">{impact.impacted.requirementIds.length} requirements affected</Chip>
            <Chip tone="neutral">{impact.unaffected.requirementIds.length} unaffected</Chip>
            <Chip tone="neutral">{expiredRecords.length} expired records</Chip>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <MoveRight className="size-3" aria-hidden />
            Changed paths
          </span>
          {changed.size === 0 ? (
            <span className="text-[11.5px] text-muted-foreground">
              None from a change; the trigger is expiry.
            </span>
          ) : (
            [...changed].sort().map((path) => (
              <Chip key={path} tone="primary">
                {fieldLabel(path)}
              </Chip>
            ))
          )}
        </div>

        {expiredRecords.length > 0 && (
          <div className="mt-3">
            <Note tone="warning" icon={GitCompareArrows}>
              <span className="font-medium">Expiry seeds an impact without an event.</span>{" "}
              {expiredRecords.map((record) => record.id).join(", ")} lapsed at the review clock (
              {formatDateTime(store.now())}); the assessment revision did not move.
            </Note>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Impacted"
          title="Work that must be revisited"
          description="Every requirement whose declared bindings, evidence bindings or prerequisite closure meet a trigger."
        >
          <ul className="space-y-2">
            {impact.impacted.requirementIds.map((id) => {
              const requirement = REQUIREMENTS.find((candidate) => candidate.id === id);
              const result = statusResults.get(id);
              return (
                <li key={id} className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={result?.status ?? "missing"} />
                    <Mono className="text-muted-foreground">{id}</Mono>
                  </div>
                  <p className="mt-1 text-[12.5px] font-medium leading-5">{requirement?.label}</p>
                  <ul className="mt-1 space-y-0.5 text-[11.5px] leading-5 text-muted-foreground">
                    {requirementTriggers(id).map((reason) => (
                      <li key={reason}>— {reason}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Evidence in the affected set
            </p>
            <div className="flex flex-wrap gap-1">
              {impact.impacted.evidenceIds.map((id) => {
                const record = store.evidence.find((candidate) => candidate.id === id);
                const moved = record
                  ? bindingDiff(record, snapshot).filter((entry) => !entry.matches).length
                  : 0;
                return (
                  <Chip key={id} tone="warning" mono>
                    {id}
                    {moved ? ` · ${moved} moved` : ""}
                  </Chip>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Unaffected"
          title="Work the change does not touch"
          description="No blanket reset: a requirement outside the bindings and closure keeps its status and evidence."
        >
          <ul className="space-y-2">
            {impact.unaffected.requirementIds.map((id) => {
              const requirement = REQUIREMENTS.find((candidate) => candidate.id === id);
              const result = statusResults.get(id);
              return (
                <li key={id} className="rounded-lg border border-success/25 bg-success/5 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={result?.status ?? "missing"} />
                    <Mono className="text-muted-foreground">{id}</Mono>
                  </div>
                  <p className="mt-1 text-[12.5px] font-medium leading-5">{requirement?.label}</p>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">
                    No changed path intersects its bindings, and no affected prerequisite sits above it.
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Evidence outside the affected set
            </p>
            <div className="flex flex-wrap gap-1">
              {impact.unaffected.evidenceIds.map((id) => (
                <Chip key={id} tone="success" mono>
                  {id}
                </Chip>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Bindings"
        title="Why the photographer scope stays outside the venue change"
        description="The photographer requirement binds deliverables and arrival window only. The venue change moves venue, loading, crew call and budget paths."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Photographer bindings
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(REQUIREMENTS.find((req) => req.id === "REQ-photographer-deliverables-1")?.fieldBindings ?? []).map(
                (path) => (
                  <Chip
                    key={path}
                    tone={changed.has(path) ? "warning" : "success"}
                    className="flex-col items-start py-1"
                  >
                    <span>{fieldLabel(path)}</span>
                    <span className="font-mono text-[9.5px] text-muted-foreground">
                      {formatFieldValue(path, resolve(snapshot, path).value)}
                    </span>
                  </Chip>
                ),
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              EV-7 bindings{photographerRecord ? "" : " — withdrawn"}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(photographerRecord?.boundFieldVersions ?? {}).map(([path, value]) => (
                <Chip
                  key={path}
                  tone={changed.has(path) ? "warning" : "success"}
                  className="flex-col items-start py-1"
                >
                  <span>{fieldLabel(path)}</span>
                  <span className="font-mono text-[9.5px] text-muted-foreground">
                    {formatFieldValue(path, value)}
                  </span>
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
