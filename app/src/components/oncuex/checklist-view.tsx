import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { BRIEF, PEOPLE, REQUIREMENTS, sourceAttribution } from "@/oncuex/scenario";
import { WORK_AREAS } from "@/oncuex/work-areas";
import { formatDate, residualText } from "@/oncuex/format";
import {
  checklistState,
  requirementNote,
  sourceState,
  sourceStateLabel,
} from "@/oncuex/presentation";
import type { Assessment, Brief } from "@/oncuex/types";
import {
  ArrowRight,
  Circle,
  Clock3,
  FileCheck2,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Panel } from "./ui-bits";

interface ChecklistViewProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  onStartSample: () => void;
  onOpenTab: (tab: string) => void;
}

export function ChecklistView({
  session,
  assessment,
  onStartSample,
  onOpenTab,
}: ChecklistViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;

  if (!briefReady) {
    return (
      <Panel eyebrow="Checklist" title="The checklist starts with the event">
        <EmptyState
          icon={ListChecks}
          title="No plan yet"
          description="Start the sample event to bring in the Northwind checklist, its partners and the documents behind each piece of work."
          action={
            <Button size="sm" onClick={onStartSample}>
              Start with the sample event
            </Button>
          }
        />
      </Panel>
    );
  }

  if (!assessment) {
    return (
      <Panel eyebrow="Checklist" title="The checklist could not be read">
        <p className="text-[12.5px] text-muted-foreground">
          Reload the sample plan from the Settings menu.
        </p>
      </Panel>
    );
  }

  const results = new Map(
    assessment.requirements.map((result) => [result.requirementId, result]),
  );
  const total = assessment.requirements.length;
  const done = assessment.requirements.filter((result) => result.status === "supported").length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Panel
        id="checklist-support"
        eyebrow="Checklist"
        title="The work behind the launch"
        description="The work the launch needs, grouped by work area. A row shows whether its supporting checks pass, not whether the real-world task is complete. Open a row for its documents and findings."
        actions={
          <span className="text-[11.5px] text-muted-foreground">
            {done} of {total} supporting checks pass
          </span>
        }
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress === 100 ? "bg-success" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 space-y-5">
          {WORK_AREAS.map((area) => {
            const areaRequirements = area.requirementIds
              .map((id) => REQUIREMENTS.find((requirement) => requirement.id === id))
              .filter((requirement): requirement is (typeof REQUIREMENTS)[number] => Boolean(requirement));
            const areaDone = areaRequirements.filter(
              (requirement) => results.get(requirement.id)?.status === "supported",
            ).length;

            return (
              <section key={area.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                  <h3 className="text-[14px] font-semibold">{area.label}</h3>
                  <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                    {areaDone}/{areaRequirements.length} supporting checks
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {areaRequirements.map((requirement) => {
                    const result = results.get(requirement.id);
                    const state = checklistState(result);
                    const contextNote = requirementNote(requirement.id, snapshot, brief);
                    const findings = (result?.residuals ?? [])
                      .map((residual) => residualText(residual))
                      .filter(
                        (finding) =>
                          finding !== contextNote &&
                          !(contextNote && finding.includes("current plan values")),
                      );
                    const allFindings = [contextNote, ...findings].filter(
                      (finding): finding is string => Boolean(finding),
                    );
                    const documents = store.evidence.filter(
                      (record) => record.requirementId === requirement.id,
                    );
                    const currentDocuments = documents.filter(
                      (record) => sourceState(record, snapshot, store.now()) !== "unused",
                    );
                    return (
                      <li
                        key={requirement.id}
                        className="flex gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5"
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          {state.tone === "done" ? (
                            <FileCheck2 className="size-4 text-success" />
                          ) : state.tone === "waiting" ? (
                            <Clock3 className="size-4 text-warning" />
                          ) : state.tone === "needs" ? (
                            <RefreshCw className="size-4 text-warning" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground/60" />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                            <p className="text-[12.5px] font-medium leading-5">
                              {requirement.label}
                            </p>
                            <span
                              className={cn(
                                "text-[10.5px] font-medium",
                                state.tone === "done"
                                  ? "text-success"
                                  : state.tone === "needs" || state.tone === "waiting"
                                    ? "text-warning"
                                    : "text-muted-foreground",
                              )}
                            >
                              {state.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {PEOPLE[requirement.owner] ?? "Unassigned"}
                          </p>
                          {allFindings.length > 0 && (
                            <ul className="mt-0.5 space-y-0.5">
                              {allFindings.map((finding) => (
                                <li
                                  key={finding}
                                  className="text-[11px] leading-5 text-muted-foreground"
                                >
                                  {finding}
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
                            {currentDocuments.length === 0 ? (
                              <span>No document yet</span>
                            ) : (
                              currentDocuments.map((record) => {
                                const source = sourceState(record, snapshot, store.now());
                                return (
                                  <span key={record.id}>
                                    {sourceAttribution(record)}
                                    {source === "confirmed"
                                      ? ` · reviewed and current · valid to ${formatDate(record.expiresAt)}`
                                      : ` · ${sourceStateLabel(source).toLowerCase()}`}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenTab("partners")}
                          className="mt-0.5 self-start text-[10.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Documents
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button size="sm" variant="outline" onClick={() => onOpenTab("partners")}>
            Open the partners
            <ArrowRight className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenTab("timeline")}>
            See the day timeline
          </Button>
        </div>
      </Panel>
    </div>
  );
}
