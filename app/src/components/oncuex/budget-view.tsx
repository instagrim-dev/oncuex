import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { PM_ACTOR, reviewEvidence } from "@/oncuex/demo";
import { BRIEF, sourceAttribution } from "@/oncuex/scenario";
import { formatDate, formatMoney } from "@/oncuex/format";
import {
  isSuperseded,
  sourceState,
  sourceStateLabel,
} from "@/oncuex/presentation";
import type { Brief, EvidenceRecord } from "@/oncuex/types";
import { AlertTriangle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, EmptyState, Panel } from "./ui-bits";

interface BudgetViewProps {
  session: ReturnType<typeof useOperatorSession>;
  onStartSample: () => void;
  onOpenTab: (tab: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  venue: "Venue",
  catering: "Catering",
  production: "Production",
  photography: "Photography",
};

export function BudgetView({ session, onStartSample, onOpenTab }: BudgetViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;

  if (!briefReady) {
    return (
      <Panel eyebrow="Budget" title="The budget comes with the brief">
        <EmptyState
          icon={Wallet}
          title="No budget yet"
          description="Start the sample event to bring in the approved Northwind budget and the partner commitments."
          action={
            <Button size="sm" onClick={onStartSample}>
              Start with the sample event
            </Button>
          }
        />
      </Panel>
    );
  }

  const currency = snapshot.budget.committedTotal.currency || brief.approvedBudget.currency;
  const approved = brief.approvedBudget.minorUnits;
  const committed = snapshot.budget.committedTotal.minorUnits;
  const delta = committed - approved;
  const progress = approved ? Math.min(100, Math.round((committed / approved) * 100)) : 0;
  const budgetDocuments = store.evidence.filter(
    (record) => record.requirementId === "REQ-budget-total-1",
  );

  const review = (record: EvidenceRecord, disposition: "accepted" | "rejected") => {
    session.apply(sourceAttribution(record), (current) => {
      reviewEvidence(current, record.id, disposition, "project_manager", PM_ACTOR);
      return disposition === "accepted"
        ? "Marked as current."
        : "Marked for a new version. Nothing was sent.";
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Budget"
        title={`${formatMoney(approved, currency)} approved`}
        description="Working cost sheet · derived from the saved plan and its supporting documents. If the plan moves, these amounts update."
        actions={
          <Chip tone={delta > 0 ? "warning" : "success"}>
            {delta > 0 ? "Over budget" : "Inside budget"}
          </Chip>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Approved
            </p>
            <p className="tnum mt-1 text-xl font-semibold">{formatMoney(approved, currency)}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Committed
            </p>
            <p className="tnum mt-1 text-xl font-semibold">{formatMoney(committed, currency)}</p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {delta > 0 ? "Over" : "Remaining"}
            </p>
            <p
              className={cn(
                "tnum mt-1 text-xl font-semibold",
                delta > 0 ? "text-warning" : "text-success",
              )}
            >
              {formatMoney(Math.abs(delta), currency)}
            </p>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", delta > 0 ? "bg-warning" : "bg-primary")}
            style={{ width: `${progress}%` }}
          />
        </div>

        {delta > 0 && (
          <p
            id="budget-overage"
            className="mt-2 flex items-start gap-1.5 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11.5px] leading-5 text-warning"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Committed {formatMoney(committed, currency)} is {formatMoney(delta, currency)} over the{" "}
            {formatMoney(approved, currency)} approved budget.
          </p>
        )}

        {session.review.data.suggestions.filter((item) => item.projectId === snapshot.id && item.workArea.includes("Budget") && item.status === "concern").map((item) => <div key={item.id} className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"><strong>Proposed, not approved:</strong> {item.title} · {item.excerpt}</div>)}
        <div className="mt-4 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Commitments
          </p>
          <ul className="space-y-1">
            {snapshot.budget.commitments.map((commitment) => (
              <li
                key={`${commitment.vendor}-${commitment.category}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-1.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">{commitment.vendor}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {CATEGORY_LABELS[commitment.category] ?? commitment.category}
                  </p>
                </div>
                <p className="tnum text-[12.5px] font-medium">
                  {formatMoney(commitment.amount.minorUnits, commitment.amount.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel
        eyebrow="Budget document"
        title="The sheet behind the numbers"
        description="The finance reconciliation behind the committed total."
      >
        {budgetDocuments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No budget document is attached. The brief's approved budget is shown above.
          </p>
        ) : (
          <ul className="space-y-2">
            {budgetDocuments.map((record) => {
              const state = sourceState(record, snapshot, store.now());
              const superseded = isSuperseded(record, budgetDocuments, snapshot, store.now());
              return (
                <li key={record.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] font-medium">{sourceAttribution(record)}</p>
                    <div className="flex items-center gap-1">
                      <Chip
                        tone={
                          state === "confirmed" ? "success" : superseded ? "neutral" : "warning"
                        }
                      >
                        {superseded ? "Replaced" : sourceStateLabel(state)}
                      </Chip>
                      {superseded && (
                        <span className="text-[10px] text-muted-foreground">Kept for reference</span>
                      )}
                      {!superseded && state === "review" && (
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => review(record, "accepted")}
                        >
                          Looks right
                        </Button>
                      )}
                      {!superseded && state === "update" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => review(record, "rejected")}
                        >
                          Needs a new version
                        </Button>
                      )}
                      {!superseded && state === "confirmed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => review(record, "rejected")}
                        >
                          Not used
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[11.5px] italic leading-5 text-muted-foreground">
                    “{record.sourceExcerpt}”
                  </p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    Received {formatDate(record.observedAt)} · valid to{" "}
                    {formatDate(record.expiresAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-8 px-2 text-[11.5px]"
          onClick={() => onOpenTab("partners")}
        >
          See the partner commitments
        </Button>
      </Panel>
    </div>
  );
}
