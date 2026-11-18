import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { attemptAcceptance, nextDecisionId } from "@/oncuex/demo";
import { isExpired } from "@/oncuex/schema";
import { PEOPLE } from "@/oncuex/scenario";
import {
  decisionReasonText,
  eligibilityText,
  humanCode,
  shortDigest,
} from "@/oncuex/format";
import type { Assessment, Eligibility } from "@/oncuex/types";
import {
  AlertTriangle,
  Archive,
  FileCheck2,
  History,
  ShieldCheck,
} from "lucide-react";
import { Chip, CurrentnessBadge, DispositionBadge, EmptyState, Mono, Note, Panel } from "./ui-bits";

interface DecisionsViewProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  eligibility: Eligibility | null;
  onOpenTab: (tab: string) => void;
}

export function DecisionsView({ session, assessment, eligibility, onOpenTab }: DecisionsViewProps) {
  const store = session.store;
  const decisions = store.decisionsList();
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const ready = assessment?.readiness === "ready_for_review";

  if (!assessment) {
    return (
      <Panel eyebrow="Decision history" title="No record to accept">
        <EmptyState
          icon={FileCheck2}
          title="The brief has not been adopted"
          description="Load the reviewed baseline, then acceptance becomes available to the project manager."
          action={
            <Button variant="outline" size="sm" onClick={() => onOpenTab("run")}>
              Open the walkthrough
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Eligibility"
        title="Whether an acceptance may be written now"
        description="Eligibility is computed from readiness, evidence currency, the requirement set and the last acceptance. The store repeats the check before it writes."
        actions={
          <Button
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            disabled={!ready || latestCurrent}
            onClick={() =>
              session.apply("Acceptance recorded", (current) => {
                const result = attemptAcceptance(
                  current,
                  nextDecisionId(current),
                  session.persona.role,
                  session.persona.id,
                );
                return `${result.decisionId} at revision ${result.assessmentRevision}, sequence ${result.sequence}.`;
              })
            }
          >
            <ShieldCheck className="size-3.5" />
            Accept as {session.persona.name.split(" ")[0]}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Target revision
            </p>
            <p className="tnum text-xl font-semibold">{store.assessmentRevision}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Requirement set
            </p>
            <p className="tnum text-xl font-semibold">v{store.project.requirementSetVersion ?? 1}</p>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Acting role
            </p>
            <p className="text-[13px] font-semibold">{session.persona.name}</p>
            <p className="font-mono text-[10.5px] text-muted-foreground">{session.persona.role}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {eligibility?.eligible ? (
            <Note tone="success" icon={ShieldCheck}>
              Eligible at revision {eligibility.targetAssessmentRevision}. Recording writes a decision
              bound to this revision; the assessment revision does not move.
            </Note>
          ) : (
            (eligibility?.reasons ?? []).map((reason) => (
              <div key={reason} className="flex items-start gap-1.5 text-[11.5px] leading-5 text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-mono text-[10.5px]">{reason}</span> —{" "}
                  {eligibilityText[reason] ?? humanCode(reason)}
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>

      {decisions.length === 0 ? (
        <Panel title="No decisions recorded">
          <EmptyState
            icon={History}
            title="The history is empty"
            description="Record the baseline acceptance from the walkthrough. The first decision binds to revision 8 and leaves the revision untouched."
          />
        </Panel>
      ) : (
        <ul className="space-y-3">
          {[...decisions].reverse().map((decision) => {
            const status = store.decisionStatus(decision.id);
            const evidence = store.decisionEvidence(decision.id);
            const archivedIds = new Set(
              store.archivedEvidence.map((entry) => entry.evidence.id),
            );
            const event = store.events.find(
              (candidate) =>
                candidate.eventType === "decision.recorded" &&
                candidate.payload?.decisionId === decision.id,
            );
            return (
              <li key={decision.id}>
                <Panel
                  className={
                    latest?.id === decision.id
                      ? "border-primary/30"
                      : undefined
                  }
                  contentClassName="space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Mono className="text-[12.5px] font-semibold">{decision.id}</Mono>
                        <CurrentnessBadge currentness={status.currentness} />
                        <Chip tone="success">disposition: accepted</Chip>
                        {latest?.id === decision.id && <Chip tone="primary">latest</Chip>}
                      </div>
                      <p className="text-[12px] text-muted-foreground">
                        Recorded by {PEOPLE[decision.actor] ?? decision.actor} at sequence{" "}
                        <span className="tnum">{event?.sequence ?? "—"}</span>, targeting revision{" "}
                        <span className="tnum">{decision.targetAssessmentRevision}</span>.
                      </p>
                    </div>
                    {status.currentness === "historical" && (
                      <div className="max-w-sm rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                        <p className="font-mono text-[10.5px] text-warning">
                          {status.residualReasonCodes[0]}
                        </p>
                        <p className="text-[11.5px] leading-5 text-muted-foreground">
                          {decisionReasonText[status.residualReasonCodes[0] ?? ""] ??
                            "The acceptance is no longer current."}
                        </p>
                      </div>
                    )}
                  </div>

                  <dl className="grid gap-x-4 gap-y-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Requirement set
                      </dt>
                      <dd className="tnum">
                        v{decision.requirementSetVersion} · {shortDigest(decision.requirementSetDigest, 10)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Evidence digest
                      </dt>
                      <dd className="font-mono">{shortDigest(decision.evidenceSetDigest, 10)}</dd>
                    </div>
                    <div>
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        State digest
                      </dt>
                      <dd className="font-mono">{shortDigest(decision.stateDigest, 10)}</dd>
                    </div>
                    <div>
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Integrated review
                      </dt>
                      <dd>
                        <Badge
                          variant={
                            decision.integrationReviewResult.status === "pass" ? "success" : "destructive"
                          }
                          className="px-1.5 py-0 text-[9px] uppercase"
                        >
                          {decision.integrationReviewResult.status}
                        </Badge>{" "}
                        <span className="text-muted-foreground">
                          {decision.integrationReviewResult.checks.length} failing at the time
                        </span>
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Evidence readback ({evidence.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {evidence.map((record) => {
                        const withdrawn = archivedIds.has(record.id);
                        const lapsed = isExpired(record, store.now());
                        return (
                          <div
                            key={record.id}
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10.5px]"
                          >
                            <span className="font-mono">{record.id}</span>
                            <DispositionBadge disposition={record.reviewDisposition} />
                            {withdrawn && (
                              <span className="flex items-center gap-0.5 text-muted-foreground">
                                <Archive className="size-3" aria-hidden />
                                archived
                              </span>
                            )}
                            {!withdrawn && lapsed && (
                              <span className="text-warning">expired</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] leading-4 text-muted-foreground">
                      Readback resolves withdrawn records from the archive, so the evidence a decision
                      relied on remains inspectable after the requirement set changes.
                    </p>
                  </div>

                  {status.currentness === "historical" && status.currentResidualReasonCodes?.length ? (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Current residual codes
                      </span>
                      {status.currentResidualReasonCodes.map((code) => (
                        <Chip key={code} tone="danger" mono>
                          {code}
                        </Chip>
                      ))}
                    </div>
                  ) : null}

                  <p className="text-[10.5px] text-muted-foreground">
                    Actor {decision.actor} · role {decision.role} · decision event{" "}
                    <span className="font-mono">{event?.id ?? "—"}</span> at sequence{" "}
                    <span className="tnum">{event?.sequence ?? "—"}</span>
                  </p>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {latest && !latestCurrent && (
        <Note tone="warning" icon={AlertTriangle}>
          There is no current acceptance. Renewing requires a ready plan at the current revision; the
          old record is retained, not overwritten.
        </Note>
      )}
    </div>
  );
}
