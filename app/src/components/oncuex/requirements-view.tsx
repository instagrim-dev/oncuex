import { Badge } from "@/components/ui/badge";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { bindingDiff } from "@/oncuex/engine";
import { isExpired } from "@/oncuex/schema";
import {
  PEOPLE,
  REQUIREMENTS,
} from "@/oncuex/scenario";
import {
  fieldLabel,
  formatDateTime,
  formatFieldValue,
  prettyPredicate,
  residualText,
  statusLabel,
} from "@/oncuex/format";
import type { Assessment } from "@/oncuex/types";
import { GitBranch, ListChecks, Link2, ShieldQuestion } from "lucide-react";
import { Chip, EmptyState, Mono, Panel, StatusBadge } from "./ui-bits";
import { cn } from "@/lib/utils";

interface RequirementsViewProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  onOpenTab: (tab: string) => void;
}

export function RequirementsView({ session, assessment, onOpenTab }: RequirementsViewProps) {
  const store = session.store;
  if (!assessment) {
    return (
      <Panel eyebrow="Requirements" title="Nothing assessed yet">
        <EmptyState
          icon={ListChecks}
          title="The brief has not been adopted"
          description="Load the reviewed baseline from the Run tab. Requirements are only evaluated against an adopted brief and a complete snapshot."
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

  const results = new Map(assessment.requirements.map((result) => [result.requirementId, result]));
  const impacted = new Set(assessment.impact?.impacted.requirementIds ?? []);

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Requirement hierarchy"
        title={`${REQUIREMENTS.length} requirements, prerequisite closure`}
        description="An unsupported prerequisite blocks its dependents even when the dependent's own evidence is current. Field bindings decide what a change touches."
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="success">
              {assessment.requirements.filter((r) => r.status === "supported").length} supported
            </Chip>
            <Chip tone="info">
              {assessment.requirements.filter((r) => r.status === "outdated").length} outdated
            </Chip>
            <Chip tone="warning">
              {assessment.requirements.filter((r) => r.status === "blocked").length} blocked
            </Chip>
            <Chip tone="danger">
              {assessment.requirements.filter((r) => r.status === "missing").length} missing
            </Chip>
          </div>
        }
      >
        <ul className="space-y-3">
          {REQUIREMENTS.map((requirement) => {
            const result = results.get(requirement.id);
            const evidence = store.evidence.filter(
              (record) => record.requirementId === requirement.id,
            );
            const archived = store.archivedEvidence.filter(
              (entry) => entry.evidence.requirementId === requirement.id,
            );
            const isImpacted = impacted.has(requirement.id);
            return (
              <li
                key={requirement.id}
                className={cn(
                  "rounded-xl border p-4",
                  isImpacted ? "border-primary/30 bg-primary/[0.03]" : "border-border/70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={result?.status ?? "missing"} />
                      <Mono className="text-muted-foreground">{requirement.id}</Mono>
                      {isImpacted && <Chip tone="primary">in the impact set</Chip>}
                      {requirement.blocking && <Chip tone="neutral">blocking</Chip>}
                    </div>
                    <p className="text-[13.5px] font-semibold leading-5">{requirement.label}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      Owner {PEOPLE[requirement.owner] ?? requirement.owner} ·{" "}
                      {prettyPredicate[requirement.predicateType] ?? requirement.predicateType} · requires{" "}
                      <span className="font-mono">{requirement.requiredEvidenceType}</span>
                    </p>
                  </div>
                  <Chip tone="neutral" mono>
                    v{requirement.version}
                  </Chip>
                </div>

                {result && result.residuals.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2">
                    {result.residuals.map((residual, index) => (
                      <li
                        key={`${residual.code}-${index}`}
                        className="flex items-start gap-2 text-[11.5px] leading-5"
                      >
                        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                        <span>
                          <span className="font-mono text-[10.5px] text-muted-foreground">
                            {residual.code}
                          </span>{" "}
                          — {residualText(residual)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <GitBranch className="size-3" aria-hidden />
                      Prerequisites
                    </p>
                    {requirement.prerequisiteIds.length === 0 ? (
                      <p className="text-[11.5px] text-muted-foreground">None declared.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {requirement.prerequisiteIds.map((id) => {
                          const parent = results.get(id);
                          return (
                            <Chip
                              key={id}
                              tone={parent?.status === "supported" ? "success" : "warning"}
                              mono
                            >
                              {id}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Link2 className="size-3" aria-hidden />
                      Field bindings
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {requirement.fieldBindings.map((binding) => (
                        <Chip key={binding} tone="neutral">
                          {fieldLabel(binding)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Evidence ({evidence.length} current, {archived.length} archived)
                  </p>
                  {evidence.length === 0 && archived.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      No record of the required type. The requirement cannot be supported.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {evidence.map((record) => {
                        const diff = bindingDiff(record, store.snapshot());
                        const changed = diff.filter((entry) => !entry.matches);
                        const lapsed = isExpired(record, store.now());
                        return (
                          <li
                            key={record.id}
                            className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-[11.5px]"
                          >
                            <Mono>{record.id}</Mono>
                            <Badge
                              variant={
                                record.reviewDisposition === "accepted"
                                  ? "success"
                                  : record.reviewDisposition === "rejected"
                                    ? "destructive"
                                    : "warning"
                              }
                              className="px-1.5 py-0 text-[9px] uppercase"
                            >
                              {record.reviewDisposition}
                            </Badge>
                            {lapsed && <Chip tone="warning">expired</Chip>}
                            {!lapsed && changed.length > 0 && (
                              <Chip tone="info">
                                {changed.length} changed binding{changed.length === 1 ? "" : "s"}
                              </Chip>
                            )}
                            {!lapsed && changed.length === 0 && record.reviewDisposition === "accepted" && (
                              <Chip tone="success">current</Chip>
                            )}
                            <span className="text-muted-foreground">
                              expires {formatDateTime(record.expiresAt)}
                            </span>
                          </li>
                        );
                      })}
                      {archived.map((entry) => (
                        <li key={entry.evidence.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border/70 px-2 py-1 text-[11.5px]">
                          <Mono>{entry.evidence.id}</Mono>
                          <Chip tone="neutral">archived</Chip>
                          <span className="text-muted-foreground">
                            withdrawn at sequence {entry.archivedAtSequence}, set v
                            {entry.requirementSetVersion}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-semibold uppercase tracking-[0.12em]">Expiry policy</span>{" "}
                    <span className="font-mono">
                      {requirement.expiryPolicy.mode} · {requirement.expiryPolicy.value}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold uppercase tracking-[0.12em]">Expected values</span>{" "}
                    <span className="font-mono">
                      {Object.entries(requirement.expectedValues)
                        .map(([key, value]) => {
                          const field = typeof value === "string" && value.includes(".")
                            ? fieldLabel(value)
                            : String(value);
                          return `${key}=${field}`;
                        })
                        .join(" · ")}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-[11px] leading-5 text-muted-foreground">
          Legend:{" "}
          {(["supported", "outdated", "blocked", "missing"] as const)
            .map((status) => statusLabel[status])
            .join(" · ")}
          . A requirement's status is computed by the evaluator from current evidence and declared
          predicates; nothing on this page supplies an outcome.
        </div>
      </Panel>

      <Panel
        eyebrow="Plan values"
        title="Current snapshot"
        description="The values the evaluator reads. Changes are written only through change commands."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["location.venueName", store.snapshot().location.venueName],
            ["location.capacity", store.snapshot().location.capacity],
            ["location.roomPlan", store.snapshot().location.roomPlan],
            ["location.loadingWindow.start", store.snapshot().location.loadingWindow.start],
            ["location.loadingWindow.end", store.snapshot().location.loadingWindow.end],
            ["location.hardStop", store.snapshot().location.hardStop],
            ["crew.arrivalTime", store.snapshot().crew.arrivalTime],
            ["production.runOfShowEnd", store.snapshot().production.runOfShowEnd],
            ["location.fireAttestation", store.snapshot().location.fireAttestation],
            ["budget.committedTotal.minorUnits", store.snapshot().budget.committedTotal.minorUnits],
          ].map(([path, value]) => (
            <div key={String(path)} className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5">
              <dt className="text-[11.5px] text-muted-foreground">{fieldLabel(String(path))}</dt>
              <dd className="tnum text-[12px] font-medium">
                {formatFieldValue(String(path), value)}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
