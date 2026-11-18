import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { isExpired, resolve } from "@/oncuex/schema";
import {
  attemptAcceptance,
  hasDecision,
  adoptedChangeIds,
  attachPendingEvidence,
  loadBaseline,
  nextDecisionId,
  recoveryEvidenceAttached,
  revertToBaseline,
  withdrawPhotographer,
  photographerWithdrawn,
  adoptVenueChange,
  adoptRecovery,
  attachRecoveryEvidence,
} from "@/oncuex/demo";
import {
  BRIEF,
  CHANGE_META,
  CHANGE_PROVENANCE,
  CLOCK_PRESETS,
  CONTRIBUTORS,
  MILESTONES,
  PEOPLE,
  REQUIREMENTS,
  SOURCE_BY_ID,
} from "@/oncuex/scenario";
import {
  decisionReasonText,
  eligibilityText,
  fieldLabel,
  formatDate,
  formatFieldValue,
  formatMoney,
  humanCode,
  readinessLabel,
  residualText,
} from "@/oncuex/format";
import type {
  Assessment,
  Brief,
  Eligibility,
  RequirementStatus,
} from "@/oncuex/types";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileWarning,
  Gauge,
  History,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Upload,
} from "lucide-react";
import { Chip, Note, Panel, StatusBadge } from "./ui-bits";
import { cn } from "@/lib/utils";

const CHECK_LABELS: [string, string][] = [
  ["access_vs_arrival", "Access vs crew arrival"],
  ["occupancy_vs_headcount", "Occupancy vs headcount"],
  ["runofshow_vs_hardstop", "Run of show vs hard stop"],
  ["total_cost", "Committed total vs approved budget"],
  ["attestation_current", "Fire and occupancy attestation"],
  ["dependency_closure", "Dependency closure"],
];

interface RunViewProps {
  session: ReturnType<typeof useOperatorSession>;
  briefReady: boolean;
  assessment: Assessment | null;
  eligibility: Eligibility | null;
  onOpenTab: (tab: string) => void;
}

function GuideStep({
  index,
  title,
  description,
  done,
  enabled,
  disabledReason,
  actionLabel,
  onRun,
  spotlight = false,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  enabled: boolean;
  disabledReason?: string;
  actionLabel: string;
  onRun: () => void;
  spotlight?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex gap-3 rounded-lg border p-3 transition-colors",
        done
          ? "border-success/30 bg-success/5"
          : spotlight
            ? "border-primary/30 bg-primary/5"
            : "border-border/70 bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
          done
            ? "border-success/40 bg-success/15 text-success"
            : enabled
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {done ? <CheckCircle2 className="size-4" /> : index}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold leading-5">{title}</p>
          {done && (
            <Badge variant="success" className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
              done
            </Badge>
          )}
        </div>
        <p className="text-[12px] leading-5 text-muted-foreground">{description}</p>
        {!done && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={enabled ? "default" : "outline"}
              className="h-8 text-[12px]"
              disabled={!enabled}
              onClick={onRun}
            >
              {actionLabel}
              {enabled && <ArrowRight className="size-3.5" />}
            </Button>
            {!enabled && disabledReason && (
              <span className="text-[11px] text-muted-foreground">{disabledReason}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function RunView({ session, briefReady, assessment, eligibility, onOpenTab }: RunViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const brief = briefReady ? (snapshot.brief as Brief) : BRIEF;

  const decision1 = hasDecision(store, "DEC-1");
  const decision2 = hasDecision(store, "DEC-2");
  const changes = adoptedChangeIds(store);
  const venueDone = changes.includes("CHG-1");
  const recoveryDone = changes.includes("CHG-2");
  const recoveryEvidence = recoveryEvidenceAttached(store);
  const baselineDone =
    store.evidence.length >= 7 && typeof (snapshot.brief as Brief).client === "string";
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const ready = assessment?.readiness === "ready_for_review";
  const pending = store.evidence.filter((record) => record.reviewDisposition === "pending");
  const expired = store.evidence.filter(
    (record) => record.reviewDisposition === "accepted" && isExpired(record, store.now()),
  );
  const failing = new Map(
    (assessment?.integrated.checks ?? []).map((check) => [check.id, check.reason]),
  );

  const steps = [
    {
      title: "Load the reviewed baseline",
      description:
        "Adopt the brief and attach the seven baseline records. Eight commands take the record from revision 0 to 8.",
      done: baselineDone,
      enabled: !baselineDone,
      reason: baselineDone ? undefined : "The record is already started.",
      label: "Load baseline",
      run: () => session.apply("Baseline loaded", (current) => loadBaseline(current)),
    },
    {
      title: "Record baseline acceptance",
      description:
        "DEC-1 binds to revision 8. The event sequence advances; the assessment revision does not.",
      done: decision1,
      enabled: Boolean(baselineDone && ready && !decision1 && !latestCurrent),
      reason: !baselineDone
        ? "Load the baseline first."
        : !ready
          ? "Readiness must be ready_for_review."
          : latestCurrent
            ? "A current acceptance already exists."
            : undefined,
      label: "Record DEC-1",
      run: () =>
        session.apply("Acceptance recorded", (current) => {
          const result = attemptAcceptance(
            current,
            nextDecisionId(current),
            session.persona.role,
            session.persona.id,
          );
          return `${result.decisionId} at revision ${result.assessmentRevision}, sequence ${result.sequence}.`;
        }),
    },
    {
      title: "Adopt the venue change",
      description:
        "One command across eleven fields. The impact set is computed from declared bindings and the prerequisite closure.",
      done: venueDone,
      enabled: Boolean(decision1 && !venueDone),
      reason: decision1 ? undefined : "Record the baseline acceptance first.",
      label: "Adopt CHG-1",
      run: () => session.apply("Venue change adopted", (current) => adoptVenueChange(current)),
    },
    {
      title: "Adopt the sourced recovery",
      description:
        "Annex access and occupancy, rescoped catering and production, revised crew call and run of show.",
      done: recoveryDone,
      enabled: Boolean(venueDone && !recoveryDone),
      reason: venueDone ? undefined : "Adopt the venue change first.",
      label: "Adopt CHG-2",
      run: () => session.apply("Recovery adopted", (current) => adoptRecovery(current)),
    },
    {
      title: "Attach the recovery evidence",
      description:
        "Six records, each stating the values it is bound to and the source span it was read from. They arrive accepted from the reviewed fixture; the Evidence tab lets you change a disposition and watch the revision and currentness respond.",
      done: recoveryEvidence,
      enabled: Boolean(recoveryDone && !recoveryEvidence),
      reason: recoveryDone ? undefined : "Adopt the recovery change first.",
      label: "Attach six records",
      run: () =>
        session.apply("Recovery evidence attached", (current) => attachRecoveryEvidence(current)),
    },
    {
      title: "Renew acceptance",
      description:
        "DEC-2 binds to revision 16. The prior acceptance is kept in history and is no longer current.",
      done: decision2,
      enabled: Boolean(recoveryEvidence && ready && !decision2 && !latestCurrent),
      reason: !recoveryEvidence
        ? "Attach the recovery records first."
        : !ready
          ? "Readiness must be ready_for_review."
          : latestCurrent
            ? "A current acceptance already exists."
            : undefined,
      label: "Record DEC-2",
      run: () =>
        session.apply("Acceptance renewed", (current) => {
          const result = attemptAcceptance(
            current,
            nextDecisionId(current),
            session.persona.role,
            session.persona.id,
          );
          return `${result.decisionId} at revision ${result.assessmentRevision}, sequence ${result.sequence}.`;
        }),
    },
    {
      title: "Reload from the saved export",
      description:
        "Validate, rehydrate and compare. Both decisions keep the currentness they were recorded with, and the counters survive.",
      done: Boolean(session.reloadCheck?.ok),
      enabled: Boolean(decision2),
      reason: decision2 ? undefined : "Record the renewed acceptance first.",
      label: "Reload and compare",
      run: () => session.reloadFromExport(),
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  const milestone = MILESTONES[0];

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border/70 bg-hero shadow-panel">
        <div className="grid gap-5 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Layers3 className="size-3.5" aria-hidden />
              Decision state
              <span aria-hidden>·</span>
              <span>{milestone.label}</span>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-lg font-semibold",
                  ready
                    ? "border-success/35 bg-success/10 text-success"
                    : "border-warning/40 bg-warning/10 text-warning",
                )}
              >
                {ready ? (
                  <ShieldCheck className="size-5" aria-hidden />
                ) : (
                  <ShieldAlert className="size-5" aria-hidden />
                )}
                {briefReady ? readinessLabel(assessment?.readiness ?? "not_ready") : "No brief adopted"}
              </div>
              <div className="tnum flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
                <span className="text-2xl font-semibold text-foreground">
                  {store.assessmentRevision}
                </span>
                assessed revision
              </div>
            </div>

            <p className="max-w-2xl text-[13px] leading-6 text-muted-foreground">
              {!briefReady
                ? "The record holds plan defaults only. Loading the reviewed baseline adopts the brief and attaches the seven baseline records, all through commands."
                : ready
                  ? "Every blocking requirement is supported and all six integrated checks pass. Acceptance is available to a project manager; the store refuses any other role."
                  : `${(assessment?.requirements ?? []).filter((result) => result.status !== "supported").length} requirement(s) are not supported and ${assessment?.integrated.checks.length ?? 0} integrated check(s) fail.`}
            </p>

            {briefReady && (
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="success">{assessment?.requirements.filter((r) => r.status === "supported").length ?? 0} supported</Chip>
                <Chip tone="info">{assessment?.requirements.filter((r) => r.status === "outdated").length ?? 0} outdated</Chip>
                <Chip tone="warning">{assessment?.requirements.filter((r) => r.status === "blocked").length ?? 0} blocked</Chip>
                <Chip tone="danger">{assessment?.requirements.filter((r) => r.status === "missing").length ?? 0} missing</Chip>
                <Chip tone={pending.length ? "warning" : "neutral"}>
                  {pending.length} unresolved record{pending.length === 1 ? "" : "s"}
                </Chip>
                <Chip tone={expired.length ? "warning" : "neutral"}>
                  {expired.length} expired
                </Chip>
              </div>
            )}

            {briefReady && (pending.length > 0 || expired.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {pending.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-warning/40 bg-card/70 text-[11.5px]"
                    onClick={() => onOpenTab("evidence")}
                  >
                    Review {pending.length} unresolved
                    <ArrowRight className="size-3.5" />
                  </Button>
                )}
                {expired.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 bg-card/70 text-[11.5px]"
                    onClick={() => onOpenTab("impact")}
                  >
                    Inspect expiry impact
                    <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </div>
            )}

            {briefReady && (assessment?.residualReasonCodes.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(assessment?.residualReasonCodes ?? []).map((code) => (
                  <Chip key={code} tone="danger" mono>
                    {code}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 bg-card/90 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Acceptance
              </p>
              {latest && (
                <Badge variant={latestCurrent ? "success" : "warning"} className="text-[10px]">
                  {latest.id} {latestCurrent ? "current" : "historical"}
                </Badge>
              )}
            </div>

            {!briefReady ? (
              <div className="mt-3 space-y-3">
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  No acceptance can be recorded until the brief is adopted and requirements are
                  evaluated.
                </p>
                <Button
                  className="w-full gap-2"
                  onClick={() => session.apply("Baseline loaded", (current) => loadBaseline(current))}
                >
                  Load reviewed baseline
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {latest ? (
                  <p className="text-[12.5px] leading-5 text-muted-foreground">
                    Last acceptance <span className="font-mono">{latest.id}</span> targets revision{" "}
                    <span className="tnum">{latest.targetAssessmentRevision}</span>.
                    {latestCurrent
                      ? " It is current until an assessed fact changes."
                      : ` ${
                          decisionReasonText[
                            store.decisionStatus(latest.id).residualReasonCodes[0] ?? ""
                          ] ?? "It is no longer current."
                        }`}
                  </p>
                ) : (
                  <p className="text-[12.5px] leading-5 text-muted-foreground">
                    No acceptance recorded. The button passes the selected simulated role to the
                    store; a contributor is refused with{" "}
                    <span className="font-mono text-[11px]">role_denied</span>.
                  </p>
                )}

                {eligibility && !eligibility.eligible && (
                  <div className="space-y-1.5">
                    {eligibility.reasons.map((reason) => (
                      <div key={reason} className="flex items-start gap-1.5 text-[11.5px] leading-5 text-warning">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                          <span className="font-mono text-[10.5px]">{reason}</span> —{" "}
                          {eligibilityText[reason] ?? humanCode(reason)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full gap-2"
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
                  <ShieldCheck className="size-4" />
                  Accept as {session.persona.name.split(" ")[0]}
                </Button>
                <p className="text-[10.5px] leading-4 text-muted-foreground">
                  Target revision <span className="tnum">{store.assessmentRevision}</span> · requirement
                  set <span className="tnum">v{store.project.requirementSetVersion ?? 1}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {assessment?.impact && (
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onOpenTab("impact")}
            className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-left transition-colors hover:bg-warning/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Computed impact — work to revisit
              </p>
              <Chip tone="warning">
                {assessment.impact.impacted.requirementIds.length} requirements ·{" "}
                {assessment.impact.impacted.evidenceIds.length} records
              </Chip>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold leading-5">
              {assessment.impact.impacted.requirementIds
                .map(
                  (id) => REQUIREMENTS.find((requirement) => requirement.id === id)?.label ?? id,
                )
                .slice(0, 2)
                .join(" · ")}
              {assessment.impact.impacted.requirementIds.length > 2 ? " · …" : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Seeded by changed paths and evidence expiry, closed over dependents. Open the impact set.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onOpenTab("impact")}
            className="rounded-xl border border-success/30 bg-success/5 p-4 text-left transition-colors hover:bg-success/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Unaffected — keep as it is
              </p>
              <Chip tone="success">
                {assessment.impact.unaffected.requirementIds.length} requirements ·{" "}
                {assessment.impact.unaffected.evidenceIds.length} records
              </Chip>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold leading-5">
              {assessment.impact.unaffected.requirementIds
                .map(
                  (id) => REQUIREMENTS.find((requirement) => requirement.id === id)?.label ?? id,
                )
                .slice(0, 2)
                .join(" · ") || "None — every requirement is touched."}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              No blanket reset: untouched requirements keep their status and their evidence.
            </p>
          </button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Panel
          eyebrow="Guided walkthrough"
          title="Baseline to renewed acceptance"
          description="Each step is a command. Counters and statuses below are read back from the record, never precomputed for the demo."
          actions={
            <Badge variant={completed === steps.length ? "success" : "info"} className="tnum">
              {completed} / {steps.length}
            </Badge>
          }
        >
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <GuideStep
                key={step.title}
                index={index + 1}
                title={step.title}
                description={step.description}
                done={step.done}
                enabled={step.enabled}
                disabledReason={step.reason}
                actionLabel={step.label}
                onRun={step.run}
                spotlight={!step.done && index === steps.findIndex((candidate) => !candidate.done)}
              />
            ))}
          </ol>
          {venueDone && (
            <div className="mt-3">
              <Note tone="warning" icon={FileWarning}>
                <span className="font-medium">CHG-1 is sourced for the venue pack figures.</span> Its
                crew call is a planning draft and its attestation state is not stated by a source, so
                neither is presented as evidence. Both are replaced by sourced values in CHG-2.
              </Note>
            </div>
          )}
          {briefReady && (
            <div className="mt-3 flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]" onClick={() => onOpenTab("evidence")}>
                Open evidence review
                <ArrowRight className="size-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]" onClick={() => onOpenTab("impact")}>
                Inspect impact sets
                <ArrowRight className="size-3" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11.5px]" onClick={() => onOpenTab("decisions")}>
                Decision history
                <ArrowRight className="size-3" />
              </Button>
            </div>
          )}
          {session.reloadCheck && (
            <div className="mt-3">
              <Note tone={session.reloadCheck.ok ? "success" : "danger"} icon={History}>
                {session.reloadCheck.detail}
              </Note>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="Brief" title={briefReady ? brief.project : "Not adopted"} description={briefReady ? brief.client : "The document exists as plan defaults only."}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Event date</dt>
                <dd className="text-[13px]">{formatDate(brief.eventDate)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Guests</dt>
                <dd className="text-[13px] tnum">
                  {brief.guestCount}
                  {brief.guestCountIsFixed && <span className="ml-1 text-[11px] text-muted-foreground">fixed</span>}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approved budget</dt>
                <dd className="text-[13px] tnum">{formatMoney(brief.approvedBudget.minorUnits, brief.approvedBudget.currency)}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Circulation buffer</dt>
                <dd className="text-[13px] tnum">{brief.circulationBuffer} people</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Owner</dt>
                <dd className="text-[13px]">{brief.owner.name}</dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Timezone</dt>
                <dd className="text-[13px]">{brief.timezone}</dd>
              </div>
            </dl>

            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Open questions
              </p>
              <ul className="space-y-1">
                {brief.openQuestions.map((question) => (
                  <li key={question} className="flex items-start gap-2 text-[12px] leading-5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                    {question}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Simulated identities
              </span>
              {CONTRIBUTORS.map((contributor) => (
                <Chip key={contributor.id} tone="neutral">
                  {contributor.name}
                  <span className="font-mono text-[9px] uppercase">sim</span>
                </Chip>
              ))}
              <Chip tone="neutral">
                {PEOPLE[brief.owner.id] ?? brief.owner.name}
                <span className="font-mono text-[9px] uppercase">sim</span>
              </Chip>
            </div>
          </Panel>

          <Panel
            eyebrow="Review clock"
            title={formatDate(store.now())}
            description="Expiry is evaluated against this clock. Moving it writes no event and leaves the assessment revision unchanged."
          >
            <div className="flex flex-wrap gap-1.5">
              {CLOCK_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={store.now() === preset.value ? "default" : "outline"}
                  className="h-8 text-[11.5px]"
                  onClick={() => session.setClock(preset.value)}
                >
                  <Clock3 className="size-3.5" />
                  {preset.label.split(" — ")[0]}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">
              {CLOCK_PRESETS.find((preset) => preset.value === store.now())?.note ??
                "A custom review clock is active."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone={expired.length ? "warning" : "success"}>
                {expired.length} expired accepted record{expired.length === 1 ? "" : "s"}
              </Chip>
              <Chip tone="neutral">{store.evidence.length} current records</Chip>
              <Chip tone="neutral">{store.archivedEvidence.length} archived</Chip>
            </div>
          </Panel>
        </div>
      </div>

      {recoveryDone && !changes.includes("CHG-3") && (
        <Panel
          eyebrow="Sourced recovery"
          title={CHANGE_META.recovery.title}
          description="Each recovered value is shown with the source span that states it. A field with no source would be marked as an assumption rather than dressed up as evidence."
        >
          <p className="mb-3 max-w-3xl text-[12.5px] leading-5 text-muted-foreground">
            {CHANGE_META.recovery.claim}
          </p>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {Object.entries(CHANGE_PROVENANCE.recovery).map(([path, sourceIds]) => (
              <li
                key={path}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[11.5px] font-medium leading-5">{fieldLabel(path)}</p>
                  <p className="font-mono text-[10.5px] text-muted-foreground">
                    {formatFieldValue(path, resolve(store.snapshot(), path).value)}
                  </p>
                </div>
                <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
                  {sourceIds.length === 0 ? (
                    <Chip tone="warning">planning assumption</Chip>
                  ) : (
                    sourceIds.map((id) => {
                      const source = SOURCE_BY_ID.get(id);
                      return (
                        <Chip
                          key={id}
                          tone="success"
                          mono
                          className="max-w-full"
                        >
                          <span title={source?.excerpt}>{id}</span>
                        </Chip>
                      );
                    })
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1">
            {[...new Set(CHANGE_META.recovery.sourceRefIds)].map((id) => {
              const source = SOURCE_BY_ID.get(id);
              if (!source) return null;
              return (
                <p key={id} className="text-[10.5px] leading-4 text-muted-foreground">
                  <span className="font-mono text-foreground/70">{id}</span> · {source.attribution} —{" "}
                  <span className="italic">“{source.excerpt.length > 190 ? `${source.excerpt.slice(0, 190)}…` : source.excerpt}”</span>
                </p>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel
        eyebrow="Integrated checks"
        title="Six checks against current state, independent of evidence currency"
        description="The set is always six. A failure names the values that disagree, so a reviewer can see why readiness is withheld."
      >
        {!assessment ? (
          <p className="text-[12px] leading-5 text-muted-foreground">
            Not evaluated. The six checks run only against a complete snapshot with an adopted brief,
            so no check is reported as passing before that exists.
          </p>
        ) : (
        <ul className="grid gap-1.5 md:grid-cols-2">
          {CHECK_LABELS.map(([id, label]) => {
            const reason = failing.get(id);
            return (
              <li
                key={id}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2",
                  reason ? "border-destructive/25 bg-destructive/5" : "border-border/70 bg-muted/30",
                )}
              >
                {reason ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium leading-5">{label}</p>
                  <p className="text-[11.5px] leading-5 text-muted-foreground">
                    {reason ?? "Passes against the current plan values."}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        )}
      </Panel>

      <Panel
        eyebrow="Scenario cases"
        title="Expiry, withdrawal and unresolved records"
        description="Cases run through the same commands. Except for the review clock, nothing here writes a field directly."
      >
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <Upload className="size-4 text-info" aria-hidden />
              Unresolved contributor record
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
              Attach a record authored by a simulated contributor, left <span className="font-mono">pending</span>. It cannot support a requirement until someone reviews it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px]"
                disabled={!briefReady}
                onClick={() => session.apply("Contributor upload", (current) => attachPendingEvidence(current))}
              >
                Upload pending record
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => onOpenTab("evidence")}>
                Review queue
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 p-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <FileWarning className="size-4 text-warning" aria-hidden />
              Withdrawn scope
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
              Remove the photographer requirement. Its record is archived with the sequence and set version, not deleted, so the decision that relied on it can still be read back.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-8 text-[12px]"
              disabled={!briefReady || photographerWithdrawn(store) || session.persona.role !== "project_manager"}
              onClick={() => session.apply("Scope withdrawn", (current) => withdrawPhotographer(current))}
            >
              {photographerWithdrawn(store)
                ? "Already withdrawn"
                : session.persona.role !== "project_manager"
                  ? "Project manager only"
                  : "Withdraw photographer scope"}
            </Button>
          </div>

          <div className="rounded-lg border border-border/70 p-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <Undo2 className="size-4 text-info" aria-hidden />
              Reverted values
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
              Revert every plan value to the baseline. Readiness can return, but the older acceptance is not revived by a matching field value.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-8 text-[12px]"
              disabled={
                !briefReady ||
                session.persona.role !== "project_manager" ||
                !(venueDone || recoveryDone)
              }
              onClick={() => session.apply("Plan reverted", (current) => revertToBaseline(current))}
            >
              Revert to baseline values
            </Button>
          </div>

          <div className="rounded-lg border border-border/70 p-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <Clock3 className="size-4 text-warning" aria-hidden />
              Expiry case
            </p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
              Move the clock past 7 March. Accepted records lapse without an event, the revision stays where it is, and any acceptance that relied on them becomes historical.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px]"
                disabled={!briefReady || store.now() === "2027-03-08T00:00:00Z"}
                onClick={() => session.setClock("2027-03-08T00:00:00Z")}
              >
                Set clock to 8 Mar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-[12px]" onClick={() => onOpenTab("impact")}>
                Expiry impact
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Note tone="neutral" icon={Gauge}>
            <span className="font-medium">Simulated roles, no authentication.</span> The role selector
            changes which identity the commands claim. The store enforces{" "}
            <span className="font-mono text-[11px]">project_manager</span> for adoption, requirement-set
            changes and acceptance; contributors may review evidence. This is a workflow gate for the
            demonstration, not a security control.
          </Note>
        </div>
      </Panel>

      <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
        <div className="flex items-center gap-2">
          <RequirementStatusLegend status="supported" />
          Supported: current accepted evidence satisfies the predicate and prerequisites.
        </div>
        <div className="flex items-center gap-2">
          <RequirementStatusLegend status="outdated" />
          Outdated: records exist but bind values the plan has changed, or have expired.
        </div>
        <div className="flex items-center gap-2">
          <RequirementStatusLegend status="blocked" />
          Blocked: current values fail the predicate or an upstream requirement is unsupported.
        </div>
      </div>
    </div>
  );
}

function RequirementStatusLegend({ status }: { status: RequirementStatus }) {
  return <StatusBadge status={status} />;
}
