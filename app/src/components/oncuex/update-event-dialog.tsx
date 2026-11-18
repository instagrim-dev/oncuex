import { useState } from "react";
import { CheckCircle2, Pencil, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "./ui-bits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import {
  adoptedChangeIds,
  adoptRecovery,
  adoptVenueChange,
  attachRecoveryEvidence,
  recoveryEvidenceAttached,
} from "@/oncuex/demo";

interface UpdateEventDialogProps {
  session: ReturnType<typeof useOperatorSession>;
  onOpenTab: (tab: string) => void;
}

export function UpdateEventDialog({ session, onOpenTab }: UpdateEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [proposedTime, setProposedTime] = useState("");
  const [sourceId, setSourceId] = useState("");
  const store = session.store;
  const briefReady = Boolean((store.snapshot().brief as { client?: string }).client);
  const changes = adoptedChangeIds(store);
  const venueDone = changes.includes("CHG-1");
  const recoveryDone = changes.includes("CHG-2");
  const confirmationsDone = recoveryEvidenceAttached(store);
  const acceptedSources = session.review.data.sources.filter((source) => session.review.data.suggestions.some((item) => item.status === "concern" && item.projectId === store.snapshot().id && item.sourceIds.includes(source.id)));
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(proposedTime);

  if (!briefReady) return null;

  const next = !venueDone
    ? {
        title: "Move the venue to Pier 9 Loft",
        detail:
          "Use the Pier 9 Loft details from the venue pack. The checklist, itinerary, budget and partners update in place.",
        action: () => session.apply("Venue updated", (current) => adoptVenueChange(current, acceptedSources.filter((source) => source.id === "mail-venue").map((source) => source.id))),
      }
    : !recoveryDone
      ? {
          title: "Use the annex and revised budget",
          detail:
            "Bring in the annex occupancy and access, the rescoped catering and production, and the revised run of show.",
          action: () => session.apply("Recovered plan applied", (current) => adoptRecovery(current)),
        }
      : !confirmationsDone
        ? {
            title: "Add the recovered documents",
            detail:
              "Attach the annex attestation, venue pack, crew note and revised budget so the recovered plan can be checked.",
            action: () =>
              session.apply("Recovery documents added", (current) => attachRecoveryEvidence(current)),
          }
        : null;

  const applied = [
    { label: "Venue moved to Pier 9 Loft", done: venueDone },
    { label: "Annex and revised budget applied", done: recoveryDone },
    { label: "Recovery paperwork added", done: confirmationsDone },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11.5px]">
          <Pencil className="size-3.5" />
          Update event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update event</DialogTitle>
          <DialogDescription>
            Sample updates for this fictional launch. They do not contact the venue or any partner.
            They update the checklist, itinerary, budget and partners in place.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Chip tone="warning">Sample updates only · no partner messages are sent</Chip>
          {applied.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 text-[11.5px] text-muted-foreground"
            >
              <CheckCircle2
                className={`size-3.5 ${item.done ? "text-success" : "text-muted-foreground/40"}`}
                aria-hidden
              />
              {item.label}
            </div>
          ))}
        </div>

        {next ? (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.03] px-3 py-2.5">
            <p className="text-[12.5px] font-semibold">{next.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">{next.detail}</p>
            <Button
              size="sm"
              className="mt-2 h-8 gap-1.5 text-[11.5px]"
              onClick={() => {
                next.action();
                setOpen(false);
              }}
            >
              {next.title}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-success/25 bg-success/5 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold">The recovered plan is in place.</p>
            <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">
              The checklist, itinerary, budget and partners reflect the annex and the revised plan.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-8 text-[11.5px]"
              onClick={() => {
                onOpenTab("checklist");
                setOpen(false);
              }}
            >
              Open the checklist
            </Button>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-[12.5px] font-semibold">Review a crew-call change</p>
          <p className="text-xs leading-5 text-muted-foreground">A separate, deliberate plan change. Choose an accepted concern’s source and review the current and proposed times. This does not contact anyone or approve a budget.</p>
          <label className="block text-xs">Supporting source<select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Select a reviewed concern source</option>{acceptedSources.map((source) => <option value={source.id} key={source.id}>{source.channel} · {source.title}</option>)}</select></label>
          <label className="block text-xs">Proposed crew call (current: {store.snapshot().crew.arrivalTime})<Input className="mt-1" type="time" value={proposedTime} onChange={(event) => setProposedTime(event.target.value)} /></label>
          {sourceId && <p className="text-xs text-muted-foreground">Source: “{acceptedSources.find((source) => source.id === sourceId)?.rawText}”</p>}
          <Button size="sm" variant="outline" disabled={!sourceId || !validTime || proposedTime === store.snapshot().crew.arrivalTime} onClick={() => { session.apply("Reviewed change adopted", (current) => { current.adoptChange({ commandId: `manual-${crypto.randomUUID()}`, role: session.role, actor: session.persona.id, expectedAssessmentRevision: current.assessmentRevision }, { id: `reviewed-${crypto.randomUUID()}`, title: "Crew call changed after source review", sourceRefIds: [sourceId], changedFields: { "crew.arrivalTime": { from: current.snapshot().crew.arrivalTime, to: proposedTime } } }); return "The crew call changed. Check affected work and sign-off; no message was sent."; }); setOpen(false); }}>Adopt reviewed change</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
