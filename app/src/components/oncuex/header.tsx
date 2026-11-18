import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/oncuex/settings-dialog";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { BRIEF } from "@/oncuex/scenario";
import { formatDate } from "@/oncuex/format";
import { CheckCircle2, History, Layers3, Moon, Sun } from "lucide-react";

interface HeaderProps {
  session: ReturnType<typeof useOperatorSession>;
  onOpenSignOff: () => void;
  onOpenActivity: () => void;
  onReloadSample: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Header({
  session,
  onOpenSignOff,
  onOpenActivity,
  onReloadSample,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const store = session.store;
  const latest = store.latestDecision();
  const signedOff = latest ? store.currentness(latest.id) === "current" : false;
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2.5 md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Layers3 className="size-4" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold tracking-tight">OnCueX</p>
            <p className="text-[10.5px] text-muted-foreground">Event planning</p>
          </div>
        </div>

        <div className="hidden h-7 w-px bg-border sm:block" aria-hidden />

        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-[12.5px] font-medium leading-5">{BRIEF.project}</p>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {BRIEF.client} · {formatDate(BRIEF.eventDate)}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={signedOff ? "ghost" : "default"}
            size="sm"
            className="h-8 gap-1.5 text-[11.5px]"
            onClick={onOpenSignOff}
          >
            {signedOff && <CheckCircle2 className="size-3.5 text-success" />}
            {signedOff ? "Signed off" : "Sign off"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[11.5px]"
            onClick={onOpenActivity}
          >
            <History className="size-3.5" />
            <span className="hidden sm:inline">Activity</span>
          </Button>
          <SettingsDialog session={session} onReloadSample={onReloadSample} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
