import type { useOperatorSession } from "@/hooks/use-operator-session";
import { timelineEntries } from "@/oncuex/timeline";
import { sourceAttribution } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Chip } from "./ui-bits";

interface TimelineSheetProps {
  session: ReturnType<typeof useOperatorSession>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TimelineSheet({ session, open, onOpenChange }: TimelineSheetProps) {
  const store = session.store;
  const entries = timelineEntries(store);
  const removed = store.archivedEvidence;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden />
            Timeline
          </SheetTitle>
          <SheetDescription>
            Changes, decisions, paperwork reviews and sign-offs, in order.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {entries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Nothing has happened yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-border/70 pl-4">
              {entries.map((entry) => (
                <li key={entry.key} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary"
                    aria-hidden
                  />
                  <p className="text-[12px] font-medium leading-5">{entry.title}</p>
                  <p className="text-[10.5px] leading-5 text-muted-foreground">{entry.detail}</p>
                  {entry.scope && entry.scope.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Recorded scope
                      </p>
                      <p className="text-[10px] leading-4 text-muted-foreground">
                        {entry.scope.join(" · ")}
                      </p>
                      <Chip tone={entry.currentness === "current" ? "success" : "neutral"}>
                        {entry.currentness === "current" ? "Still applies" : "Earlier sign-off"}
                      </Chip>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          {removed.length > 0 && (
            <section className="border-t border-border/60 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Removed from the plan
              </p>
              <ul className="mt-1.5 space-y-2">
                {removed.map((entry) => (
                  <li key={entry.evidence.id} className="rounded-md border border-border/60 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[11.5px] font-medium">
                        {sourceAttribution(entry.evidence)}
                      </p>
                      <Chip tone="neutral">kept for reference</Chip>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] italic leading-4 text-muted-foreground">
                      “{entry.evidence.sourceExcerpt}”
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                      Received {formatDate(entry.evidence.observedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
