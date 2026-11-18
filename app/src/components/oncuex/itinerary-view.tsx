import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { minutes } from "@/oncuex/engine";
import { BRIEF, REQUIREMENTS } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import type { Brief } from "@/oncuex/types";
import { AlertTriangle, CalendarDays, Clock3 } from "lucide-react";
import { EmptyState, Panel } from "./ui-bits";

interface ItineraryViewProps {
  session: ReturnType<typeof useOperatorSession>;
  onStartSample: () => void;
  onOpenTab: (tab: string) => void;
}

interface TimelineEntry {
  id: string;
  time: string;
  label: string;
  detail: string;
  note?: string;
}

const clock = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export function ItineraryView({ session, onStartSample, onOpenTab }: ItineraryViewProps) {
  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;

  if (!briefReady) {
    return (
      <Panel eyebrow="Itinerary" title="The itinerary starts with the event">
        <EmptyState
          icon={CalendarDays}
          title="No event day yet"
          description="Start the sample event to bring in the venue access, crew call, run of show and hard stop for the Northwind launch."
          action={
            <Button size="sm" onClick={onStartSample}>
              Start with the sample event
            </Button>
          }
        />
      </Panel>
    );
  }

  const setup =
    (REQUIREMENTS.find((requirement) => requirement.id === "REQ-venue-loading-1")
      ?.expectedValues?.setupMinutes as number | undefined) ?? 45;
  const margin =
    (REQUIREMENTS.find((requirement) => requirement.id === "REQ-production-runofshow-1")
      ?.expectedValues?.marginMinutes as number | undefined) ?? 30;

  const accessOpen = minutes(snapshot.location.loadingWindow.start);
  const accessClose = minutes(snapshot.location.loadingWindow.end);
  const crewCall = minutes(snapshot.crew.arrivalTime);
  const setupDone = crewCall + setup;
  const showEnd = minutes(snapshot.production.runOfShowEnd);
  const hardStop = minutes(snapshot.location.hardStop);

  const entries: TimelineEntry[] = [
    {
      id: "timeline-access-open",
      time: snapshot.location.loadingWindow.start,
      label: "Access opens",
      detail: `${snapshot.location.venueName} freight access begins.`,
      note:
        crewCall < accessOpen
          ? `The crew is due at ${snapshot.crew.arrivalTime}, before access opens.`
          : undefined,
    },
    {
      id: "timeline-access-close",
      time: snapshot.location.loadingWindow.end,
      label: "Access closes",
      detail: "Freight access ends for the venue.",
    },
    {
      id: "timeline-crew-call",
      time: snapshot.crew.arrivalTime,
      label: "Crew call",
      detail: "Crew arrives on site and starts the build.",
    },
    {
      id: "timeline-setup",
      time: clock(setupDone),
      label: "Setup complete",
      detail: `${setup} minutes after the crew call.`,
      note:
        setupDone > accessClose
          ? `Setup runs ${setupDone - accessClose} minutes past the ${snapshot.location.loadingWindow.end} access close.`
          : undefined,
    },
    {
      id: "timeline-photo-start",
      time: snapshot.photographer.arrivalWindow.start,
      label: "Photography begins",
      detail: `Coverage until ${snapshot.photographer.arrivalWindow.end}.`,
    },
    {
      id: "timeline-photo-end",
      time: snapshot.photographer.arrivalWindow.end,
      label: "Photography ends",
      detail: `${snapshot.photographer.deliverables.editedImages} edited images to follow within ${snapshot.photographer.deliverables.deliveryDays} days.`,
    },
    {
      id: "timeline-runofshow",
      time: snapshot.production.runOfShowEnd,
      label: "Run of show ends",
      detail: "The programme finishes for the evening.",
      note:
        showEnd + margin > hardStop
          ? `With a ${margin} minute margin the room is needed until ${clock(
              showEnd + margin,
            )}, after the ${snapshot.location.hardStop} hard stop.`
          : undefined,
    },
    {
      id: "timeline-hard-stop",
      time: snapshot.location.hardStop,
      label: "Hard stop",
      detail: "The venue must be clear.",
    },
  ]
    .filter((entry) => Number.isFinite(minutes(entry.time as string)))
    .sort((left, right) => minutes(left.time) - minutes(right.time));

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Itinerary"
        title={`${formatDate(brief.eventDate)} · ${snapshot.location.venueName}`}
        description="The current running order for the event day."
        actions={
          <Button size="sm" variant="ghost" onClick={() => onOpenTab("checklist")}>
            Open the checklist
          </Button>
        }
      >
        <ol className="relative space-y-4 border-l border-border/70 pl-5">
          {entries.map((entry) => (
            <li id={entry.id} key={`${entry.time}-${entry.label}`} className="relative">
              <span
                className={`absolute -left-[27px] top-1 flex size-3.5 items-center justify-center rounded-full border-2 border-background ${
                  entry.note ? "bg-warning" : "bg-primary"
                }`}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="tnum text-[12px] font-semibold">{entry.time}</span>
                <p className="text-[13px] font-medium">{entry.label}</p>
              </div>
              <p className="text-[11.5px] leading-5 text-muted-foreground">{entry.detail}</p>
              {entry.note && (
                <p className="mt-1 flex items-start gap-1.5 rounded-md border border-warning/25 bg-warning/5 px-2 py-1 text-[11px] leading-5 text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {entry.note}
                </p>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button size="sm" variant="outline" onClick={() => onOpenTab("partners")}>
            <Clock3 className="size-3.5" />
            See the partners
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenTab("budget")}>
            Check the budget
          </Button>
        </div>
      </Panel>
    </div>
  );
}
