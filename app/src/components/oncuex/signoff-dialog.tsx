import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { nextDecisionId, recordAcceptance } from "@/oncuex/demo";
import { BRIEF, PEOPLE } from "@/oncuex/scenario";
import { WORK_AREAS } from "@/oncuex/work-areas";
import { eligibilityText, formatDate, formatMoney } from "@/oncuex/format";
import type { Assessment, Eligibility } from "@/oncuex/types";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Note } from "./ui-bits";

interface SignOffDialogProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  eligibility: Eligibility | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTab: (tab: string) => void;
}

export function SignOffDialog({
  session,
  assessment,
  eligibility,
  open,
  onOpenChange,
  onOpenTab,
}: SignOffDialogProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const brief = (snapshot.brief as typeof BRIEF)?.project
    ? (snapshot.brief as typeof BRIEF)
    : BRIEF;
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const ready = assessment?.readiness === "ready_for_review";
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);

  const go = (tab: string) => {
    onOpenTab(tab);
    onOpenChange(false);
  };

  const signOff = () => {
    session.apply("Plan signed off", (current) => {
      recordAcceptance(current, nextDecisionId(current));
      return "The plan is signed off. The details are in Activity.";
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {!briefReady
              ? "No plan to sign off yet"
              : latestCurrent
                ? "This plan is signed off"
                : "Sign off the plan"}
          </DialogTitle>
          <DialogDescription>
            {!briefReady
              ? "Review the client brief and open the plan first. Sign off will stay available here."
              : latestCurrent
                ? "The sign-off is recorded in Activity and still applies to this plan."
                : "A sign-off says the event lead is ready to stand behind this plan with the client."}
          </DialogDescription>
        </DialogHeader>

        {latest && !latestCurrent && (
          <Note tone="warning" icon={ShieldCheck}>
            Earlier sign-off saved; this version needs review.
          </Note>
        )}

        {!briefReady ? (
          <Note tone="neutral">
            There is no adopted brief yet. Start with the client brief in Overview, then come back
            to sign off.
          </Note>
        ) : !assessment ? (
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            The plan could not be read. Reload the sample plan from Settings before signing off.
          </p>
        ) : latestCurrent ? (
          <div className="space-y-3">
            <Note tone="success" icon={CheckCircle2}>
              Signed off by {PEOPLE[latest?.actor ?? ""] ?? latest?.actor}. The plan has not changed
              since.
            </Note>
            <div className="space-y-1 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">{brief.project}</p>
              <p>
                {brief.client} · {formatDate(brief.eventDate)} · {snapshot.location.venueName}
              </p>
              <p>
                {formatMoney(brief.approvedBudget.minorUnits, brief.approvedBudget.currency)} approved ·{" "}
                {formatMoney(
                  snapshot.budget.committedTotal.minorUnits,
                  snapshot.budget.committedTotal.currency,
                )}{" "}
                committed
              </p>
            </div>
          </div>
        ) : ready ? (
          <div className="space-y-3">
            <Note tone="neutral" icon={ShieldCheck}>
              Required checks pass; not yet signed off. Sign off this plan when you are ready to
              share it with the client.
            </Note>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {WORK_AREAS.map((area) => (
                <div
                  key={area.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-[11.5px]"
                >
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                  {area.label}
                </div>
              ))}
            </div>
            {brief.openQuestions.length > 0 && (
              <div className="rounded-md border border-border/60 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Still open with the client
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {brief.openQuestions.map((question) => (
                    <li key={question} className="text-[10.5px] leading-4 text-muted-foreground">
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              {brief.project} · {formatDate(brief.eventDate)} · {snapshot.location.venueName}
              {latest && " · earlier sign-off saved; this version needs review. Signing replaces it, and the earlier sign-off stays in Activity."}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Note tone="warning" icon={ShieldCheck}>
              A few things still need a look before sign-off.
            </Note>
            <ul className="space-y-1">
              {(eligibility?.reasons ?? []).map((reason) => (
                <li key={reason} className="text-[11.5px] leading-5 text-muted-foreground">
                  {eligibilityText[reason] ?? "The plan still needs attention."}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-[11.5px]" onClick={() => go("checklist")}>
                Open the checklist
                <ArrowRight className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-[11.5px]" onClick={() => go("budget")}>
                Check the budget
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {ready && !latestCurrent && assessment && (
            <Button size="sm" className="gap-1.5" onClick={signOff}>
              <ShieldCheck className="size-3.5" />
              Sign off plan
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
