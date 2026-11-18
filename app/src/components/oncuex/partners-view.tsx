import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Building2, Camera, Clapperboard, FileText, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { PM_ACTOR, reviewEvidence } from "@/oncuex/demo";
import { sourceAttribution } from "@/oncuex/scenario";
import { formatDate, formatMoney } from "@/oncuex/format";
import {
  isSuperseded,
  requirementNote,
  sourceState,
  sourceStateLabel,
} from "@/oncuex/presentation";
import type { Brief, EvidenceRecord } from "@/oncuex/types";
import { ArrowRight, FileSearch } from "lucide-react";
import { Chip, EmptyState, Panel } from "./ui-bits";
import { cn } from "@/lib/utils";
import { VenueComparison } from "./venue-comparison";
import { DocumentSummary } from "./document-summary";

interface PartnersViewProps {
  session: ReturnType<typeof useOperatorSession>;
  onStartSample: () => void;
  onOpenTab: (tab: string) => void;
}

interface Partner {
  id: string;
  name: string;
  role: string;
  category: string;
  description: string;
  requirementIds: string[];
  icon: LucideIcon;
}

export function PartnersView({ session, onStartSample, onOpenTab }: PartnersViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);

  if (!briefReady) {
    return (
      <Panel eyebrow="Partners" title="The partners arrive with the plan">
        <EmptyState
          icon={FileSearch}
          title="No partners yet"
          description="Start the sample event to bring in the venue, caterer, production partner and photographer, with the documents behind their work."
          action={
            <Button size="sm" onClick={onStartSample}>
              Start with the sample event
            </Button>
          }
        />
      </Panel>
    );
  }

  const brief = snapshot.brief as Brief;

  const partners: Partner[] = [
    {
      id: "venue",
      name: snapshot.location.venueName,
      role: "Venue",
      category: "venue",
      description: `${snapshot.location.capacity} capacity · access ${snapshot.location.loadingWindow.start}–${snapshot.location.loadingWindow.end} · hard stop ${snapshot.location.hardStop}`,
      requirementIds: [
        "REQ-venue-loading-1",
        "REQ-venue-capacity-1",
        "REQ-fire-permit-1",
      ],
      icon: Building2,
    },
    {
      id: "catering",
      name: snapshot.budget.commitments.find((item) => item.category === "catering")?.vendor ?? "Catering partner not recorded",
      role: "Catering",
      category: "catering",
      description: "Menu, covers and service for the reception.",
      requirementIds: [],
      icon: Utensils,
    },
    {
      id: "production",
      name: snapshot.budget.commitments.find((item) => item.category === "production")?.vendor ?? "Production partner not recorded",
      role: "Production",
      category: "production",
      description: "Scenic build, lighting and the run of show.",
      requirementIds: [],
      icon: Clapperboard,
    },
    {
      id: "photography",
      name: snapshot.budget.commitments.find((item) => item.category === "photography")?.vendor ?? "Photographer not recorded",
      role: "Photography",
      category: "photography",
      description: `${snapshot.photographer.deliverables.editedImages} edited images within ${snapshot.photographer.deliverables.deliveryDays} days.`,
      requirementIds: ["REQ-photographer-deliverables-1"],
      icon: Camera,
    },
  ];

  const review = (record: EvidenceRecord, disposition: "accepted" | "rejected") => {
    session.apply(sourceAttribution(record), (current) => {
      reviewEvidence(current, record.id, disposition, "project_manager", PM_ACTOR);
      return disposition === "accepted"
        ? "Marked as current. The checklist and any sign-off will update."
        : "Marked for a new version. Nothing was sent.";
    });
  };

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Partners"
        title="The people making the launch happen"
        description="The people making the launch happen, and the paperwork behind their work. It stays current only while it still matches the plan."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {partners.map((partner) => {
            const commitment = snapshot.budget.commitments.find(
              (candidate) => candidate.category === partner.category,
            );
            const documents = store.evidence.filter((record) =>
              partner.requirementIds.includes(record.requirementId),
            );
            const Icon = partner.icon;

            return (
              <section
                id={partner.id === "venue" ? "partner-venue" : undefined}
                key={partner.id}
                className="rounded-xl border border-border/70 bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold leading-5">{partner.name}</p>
                      <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                        {partner.role}
                      </p>
                    </div>
                  </div>
                  {commitment && (
                    <p className="tnum text-[12px] font-medium">
                      {formatMoney(commitment.amount.minorUnits, commitment.amount.currency)}
                    </p>
                  )}
                </div>

                <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">
                  {partner.description}
                </p>

                {partner.id === "venue" && (
                  <div className="mt-1 space-y-1">
                    {[
                      requirementNote("REQ-venue-capacity-1", snapshot, brief),
                      requirementNote("REQ-fire-permit-1", snapshot, brief),
                    ]
                      .filter((note): note is string => Boolean(note))
                      .map((note) => (
                        <p
                          key={note}
                          className="flex items-start gap-1.5 text-[10.5px] leading-4 text-warning"
                        >
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          {note}
                        </p>
                      ))}
                  </div>
                )}

                <div className="mt-2 space-y-1.5">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <FileText className="size-3" aria-hidden />
                    Documents
                  </p>

                  {documents.length === 0 ? (
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      {partner.id === "catering" || partner.id === "production" ? (
                        <>
                          Pricing is covered by the{" "}
                          <button
                            type="button"
                            onClick={() => onOpenTab("budget")}
                            className="underline underline-offset-4 hover:text-foreground"
                          >
                            budget reconciliation
                          </button>
                          .
                        </>
                      ) : (
                        "No document attached."
                      )}
                    </p>
                  ) : (
                    documents.map((record) => {
                      const state = sourceState(record, snapshot, store.now());
                      const superseded = isSuperseded(record, documents, snapshot, store.now());
                      const expired = record.expiresAt <= store.now();
                      return (
                        <div
                          key={record.id}
                          className={cn(
                            "rounded-md border px-2.5 py-2",
                            state === "confirmed"
                              ? "border-border/60"
                              : "border-warning/25 bg-warning/5",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <p className="text-[11.5px] font-medium">
                              {sourceAttribution(record)}
                            </p>
                            <Chip
                              tone={
                                state === "confirmed"
                                  ? "success"
                                  : state === "unused" || superseded
                                    ? "neutral"
                                    : "warning"
                              }
                            >
                              {superseded
                                ? "Replaced"
                                : expired
                                  ? `Expired ${formatDate(record.expiresAt)}`
                                  : sourceStateLabel(state)}
                            </Chip>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10.5px] italic leading-4 text-muted-foreground">
                            “{record.sourceExcerpt}”
                          </p>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                            <p className="text-[9.5px] text-muted-foreground">
                              Received {formatDate(record.observedAt)} · valid to{" "}
                              {formatDate(record.expiresAt)}
                            </p>
                            <div className="flex gap-1">
                              {superseded && (
                                <span className="self-center text-[9.5px] text-muted-foreground">
                                  Kept for reference
                                </span>
                              )}
                              {!superseded && state === "review" && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => review(record, "accepted")}
                                  >
                                    Looks right
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => review(record, "rejected")}
                                  >
                                    Not used
                                  </Button>
                                </>
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
                              {!superseded && state === "unused" && !expired && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => review(record, "accepted")}
                                >
                                  Use document
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 gap-1 px-1 text-[10.5px]"
                  onClick={() => onOpenTab("checklist")}
                >
                  See the checklist
                  <ArrowRight className="size-3" />
                </Button>
              </section>
            );
          })}
        </div>
      </Panel>
      <DocumentSummary session={session} />
      <VenueComparison session={session} />
    </div>
  );
}
