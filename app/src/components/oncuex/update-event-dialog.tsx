import { useState } from "react";
import { CheckCircle2, Pencil, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const store = session.store;
  const briefReady = Boolean((store.snapshot().brief as { client?: string }).client);
  const changes = adoptedChangeIds(store);
  const venueDone = changes.includes("CHG-1");
  const recoveryDone = changes.includes("CHG-2");
  const confirmationsDone = recoveryEvidenceAttached(store);

  if (!briefReady) return null;

  const next = !venueDone
    ? {
        title: "Move the venue to Pier 9 Loft",
        detail:
          "Use the Pier 9 Loft details from the venue pack. The checklist, timeline, budget and partners update in place.",
        action: () => session.apply("Venue updated", (current) => adoptVenueChange(current)),
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
    { label: "Recovered documents added", done: confirmationsDone },
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
            They update the checklist, timeline, budget and partners in place.
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
              The checklist, timeline, budget and partners reflect the annex and the revised plan.
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
