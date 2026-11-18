import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { activityEntries } from "@/oncuex/activity";
import { changeTitle } from "@/oncuex/demo";
import { BRIEF, CONTRIBUTORS, PEOPLE, REQUIREMENTS } from "@/oncuex/scenario";
import {
  checklistState,
  countdownLabel,
  daysToEvent,
  planExceptions,
} from "@/oncuex/presentation";
import { formatDate, formatMoney } from "@/oncuex/format";
import type { Assessment, Brief } from "@/oncuex/types";
import { UpdateEventDialog } from "./update-event-dialog";
import { Chip, Panel } from "./ui-bits";

interface EventViewProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  onOpenTab: (tab: string) => void;
  onStartSample: () => void;
  onOpenActivity: () => void;
  onOpenSignOff: () => void;
  onReviewBrief: () => void;
  onOpenClientUpdate: () => void;
  onOpenTarget: (tab: string, anchor: string) => void;
}

export function EventView({
  session,
  assessment,
  onOpenTab,
  onStartSample,
  onOpenActivity,
  onOpenSignOff,
  onReviewBrief,
  onOpenClientUpdate,
  onOpenTarget,
}: EventViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const results = new Map(
    (assessment?.requirements ?? []).map((result) => [result.requirementId, result]),
  );
  const open = (assessment?.requirements ?? []).filter(
    (result) => result.status !== "supported",
  );
  const exceptions = briefReady && assessment
    ? planExceptions(snapshot, brief, assessment)
    : [];
  const activity = activityEntries(store).slice(0, 3);
  const days = daysToEvent(store.now(), brief.eventDate);

  const approved = brief.approvedBudget.minorUnits;
  const committed = snapshot.budget.committedTotal.minorUnits;
  const currency = snapshot.budget.committedTotal.currency || brief.approvedBudget.currency;
  const delta = committed - approved;
  const budgetProgress = approved ? Math.min(100, Math.round((committed / approved) * 100)) : 0;

  const lastChange = [...store.events]
    .reverse()
    .find((event) => event.eventType === "change.adopted");
  const lastChangeId = String(lastChange?.payload?.changeId ?? "");

  const openQuestions = brief.openQuestions ?? [];
  const nextTasks = open.slice(0, 3).map((result) => {
    const requirement = REQUIREMENTS.find(
      (candidate) => candidate.id === result.requirementId,
    );
    return {
      key: result.requirementId,
      title: requirement?.label ?? "Checklist item",
      owner: requirement ? PEOPLE[requirement.owner] ?? requirement.owner : "The event team",
      state: checklistState(result),
    };
  });

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border/70 bg-hero shadow-panel">
        <div className="space-y-3 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {brief.client} · Spring 2027
              </p>
              <h1 className="mt-1 max-w-2xl font-serif text-[34px] font-medium leading-tight tracking-tight md:text-[44px]">
                {brief.project}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {formatDate(brief.eventDate)}
                  <span className="text-foreground/70">· {countdownLabel(days)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden />
                  {brief.guestCount} guests
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden />
                  {snapshot.location.venueName}
                </span>
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-3.5" aria-hidden />
                  {formatMoney(approved, brief.approvedBudget.currency)} approved
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5 text-[11.5px]"
                onClick={() => onOpenTab("checklist")}
              >
                Open the checklist
                <ArrowRight className="size-3.5" />
              </Button>
              <UpdateEventDialog session={session} onOpenTab={onOpenTab} />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11.5px]"
                onClick={onOpenClientUpdate}
              >
                Client update
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Event lead {PEOPLE[brief.owner.id] ?? brief.owner.name} ·{" "}
            {CONTRIBUTORS.map((person) => PEOPLE[person.id] ?? person.name).join(" and ")} producing
          </p>
          <p className="text-[10px] text-muted-foreground">
            Sample event · simulated role · saved on this device · no authentication
          </p>
          <p className="text-[10px] text-muted-foreground">
            {!briefReady || !assessment
              ? "Plan not assessed"
              : `${counts.confirmed} of ${assessment.requirements.length} supporting checks pass · ${
                  latestCurrent ? "signed off" : "not signed off"
                }`}
          </p>

          {lastChange && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11.5px] leading-5 text-warning">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              <span>
                {changeTitle(lastChangeId)}
                {open.length > 0
                  ? ` · ${open.length} checklist item${open.length === 1 ? "" : "s"} need an update.`
                  : " · the supporting checks reflect the change."}
              </span>
              <button
                type="button"
                onClick={() => onOpenTab("checklist")}
                className="underline underline-offset-4"
              >
                Open the checklist
              </button>
            </div>
          )}

          {!latestCurrent && latest && open.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Earlier sign-off saved; this version needs review. Sign off is available in the header.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel
            eyebrow="Next up"
            title={open.length ? "The work that needs you" : "The plan, right now"}
            description={
              !briefReady
                ? "Start the sample event to open the launch and its checklist."
                : open.length
                  ? "The first few checklist items that are not yet settled."
                  : "The checklist is clear. These are the open questions from the brief before sign-off."
            }
            actions={
              open.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onOpenTab("checklist")}
                >
                  Full checklist
                  <ArrowRight className="size-3" />
                </Button>
              ) : undefined
            }
          >
            {!briefReady ? (
              <div className="space-y-3">
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  Review the client brief, check the extracted facts against their source text, then
                  adopt the brief and add the prepared documents. The documents are sample files,
                  not live partner confirmations.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={onReviewBrief} className="gap-1.5">
                    Review the brief with AI
                    <ArrowRight className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={onStartSample}>
                    Use the prepared sample
                  </Button>
                </div>
              </div>
            ) : !assessment ? (
              <p className="text-[12.5px] leading-5 text-muted-foreground">
                The plan could not be read. Reload the sample plan from Settings.
              </p>
            ) : nextTasks.length > 0 ? (
              <ul className="space-y-1.5">
                {nextTasks.map((task) => (
                  <li
                    key={task.key}
                    className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {task.state.tone === "done" ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <Clock3 className="size-4 text-warning" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium leading-5">{task.title}</p>
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        {task.owner}
                        {task.state.detail ? ` · ${task.state.detail}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : openQuestions.length > 0 ? (
              <ul className="space-y-1.5">
                {openQuestions.slice(0, 3).map((question) => (
                  <li
                    key={question}
                    className="rounded-lg border border-border/60 px-3 py-2 text-[12px] leading-5"
                  >
                    {question}
                    <span className="ml-1 text-[10.5px] text-muted-foreground">
                      Open with {PEOPLE[brief.owner.id] ?? brief.owner.name}
                    </span>
                  </li>
                ))}
              </ul>
            ) : latestCurrent ? (
              <div className="space-y-2">
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  The plan is signed off. The details are in Activity.
                </p>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenActivity}>
                  See activity
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  The supporting checks pass and the open questions are settled. Next: sign off the plan.
                </p>
                <Button size="sm" className="gap-1.5" onClick={onOpenSignOff}>
                  Sign off the plan
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
          </Panel>

          {briefReady && assessment && exceptions.length > 0 && (
            <Panel
              eyebrow="On your radar"
              title="A few things need a look"
              description="Only the exceptions. Everything else on the plan is holding."
            >
              <ul className="space-y-1.5">
                {exceptions.slice(0, 3).map((exception) => (
                  <li
                    key={exception.id}
                    className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium">{exception.title}</p>
                        <p className="text-[11px] leading-5 text-muted-foreground">
                          {exception.detail}
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenTarget(exception.tab, exception.anchor)}
                          className="mt-0.5 text-[10.5px] underline underline-offset-4 text-muted-foreground hover:text-foreground"
                        >
                          Fix this
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel eyebrow="The team" title="Who is on it">
            <div className="space-y-2">
              <p className="text-[12px]">
                <span className="font-medium">{PEOPLE[brief.owner.id] ?? brief.owner.name}</span>
                <span className="text-muted-foreground"> · Event lead</span>
              </p>
              {CONTRIBUTORS.map((person) => (
                <p key={person.id} className="text-[12px]">
                  <span className="font-medium">{PEOPLE[person.id] ?? person.name}</span>
                  <span className="text-muted-foreground"> · Producer</span>
                </p>
              ))}
            </div>
          </Panel>

          <Panel eyebrow="Budget" title={formatMoney(approved, brief.approvedBudget.currency)}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11.5px] text-muted-foreground">Committed</p>
              <p className="tnum text-[13px] font-semibold">{formatMoney(committed, currency)}</p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${delta > 0 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${budgetProgress}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {delta > 0
                ? `${formatMoney(delta, currency)} over the approved budget`
                : `${formatMoney(Math.abs(delta), currency)} remaining`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 gap-1 px-1 text-[11px]"
              onClick={() => onOpenTab("budget")}
            >
              Open budget
              <ArrowRight className="size-3" />
            </Button>
          </Panel>

          <Panel
            eyebrow="Activity"
            title="What just happened"
            actions={
              <button
                type="button"
                onClick={onOpenActivity}
                className="text-[10.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                See all
              </button>
            }
          >
            {activity.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-2">
                {activity.map((entry) => (
                  <li key={entry.key}>
                    <p className="text-[11.5px] font-medium leading-5">{entry.title}</p>
                    <p className="text-[10px] text-muted-foreground">{entry.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
