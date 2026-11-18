import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { BRIEF, CLOCK_PRESETS, PERSONAS } from "@/oncuex/scenario";
import { formatDate, formatDateTime } from "@/oncuex/format";
import { Clock3, Layers3, Moon, RotateCcw, Sun } from "lucide-react";

interface HeaderProps {
  session: ReturnType<typeof useOperatorSession>;
  briefReady: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-[64px] flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="tnum text-base font-semibold leading-5">{value}</span>
    </div>
  );
}

export function Header({ session, briefReady, theme, onToggleTheme }: HeaderProps) {
  const { store, personaId, setPersonaId, now, savedAt } = {
    ...session,
    now: session.store.now(),
  };
  const brief = briefReady ? store.snapshot().brief : BRIEF;
  const title = briefReady
    ? `${(brief as typeof BRIEF).client} — ${(brief as typeof BRIEF).project}`
    : "Northwind Provisions — spring launch (brief not adopted)";

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-3 md:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Layers3 className="size-5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight">
                OnCueX
                <span className="ml-2 rounded border border-border/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  operator
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">Readiness and acceptance ledger</p>
            </div>
          </div>

          <div className="hidden items-center gap-5 border-l border-border/70 pl-4 lg:flex">
            <Counter label="Revision" value={store.assessmentRevision} />
            <Counter label="Events" value={store.sequence} />
            <Counter label="Req set" value={`v${store.project.requirementSetVersion ?? 1}`} />
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card p-1 pl-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Acting as
              </span>
              <Select value={personaId} onValueChange={setPersonaId}>
                <SelectTrigger className="h-8 w-[190px] border-0 bg-transparent px-2 text-[12px] shadow-none focus:ring-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {PERSONAS.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id} className="text-[12px]">
                      {candidate.name} ·{" "}
                      {candidate.role === "project_manager" ? "PM" : "Contributor"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="warning" className="mr-1 px-1.5 py-0 text-[9px] font-bold tracking-wide">
                SIM
              </Badge>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-1">
              <Clock3 className="size-3.5 text-muted-foreground" aria-hidden />
              <Select value={now} onValueChange={session.setClock}>
                <SelectTrigger className="h-8 w-[186px] border-0 bg-transparent px-1 text-[12px] shadow-none focus:ring-1">
                  <SelectValue>{formatDateTime(now)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {CLOCK_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.value} className="text-[12px]">
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-[12px]">
                  <RotateCcw className="size-3.5" />
                  Clean reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Open a clean record?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears the locally saved record on this device and reopens revision 0 with
                    no brief, no evidence and no events. The walkthrough starts from the reviewed
                    baseline afterwards. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep record</AlertDialogCancel>
                  <AlertDialogAction onClick={session.reset}>Clear and reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{title}</span>
          <span aria-hidden>·</span>
          <span>{formatDate((brief as typeof BRIEF).eventDate)}</span>
          <span aria-hidden>·</span>
          <span>{(brief as typeof BRIEF).guestCount} guests</span>
          <span aria-hidden>·</span>
          <span className="tnum">
            {formatDate(now)} review clock
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${savedAt ? "bg-success" : "bg-muted-foreground/50"}`}
              aria-hidden
            />
            {savedAt ? "Saved locally" : "Not saved yet"}
          </span>
        </div>
      </div>
    </header>
  );
}
