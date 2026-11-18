import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Handshake,
  ListChecks,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivitySheet } from "@/components/oncuex/activity-sheet";
import { BriefReviewDialog } from "@/components/oncuex/brief-review-dialog";
import { ClientUpdateDialog } from "@/components/oncuex/client-update-dialog";
import { BudgetView } from "@/components/oncuex/budget-view";
import { ChecklistView } from "@/components/oncuex/checklist-view";
import { EventView } from "@/components/oncuex/event-view";
import { Header } from "@/components/oncuex/header";
import { PartnersView } from "@/components/oncuex/partners-view";
import { SignOffDialog } from "@/components/oncuex/signoff-dialog";
import { TimelineView } from "@/components/oncuex/timeline-view";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { loadBaseline } from "@/oncuex/demo";
import { hasBrief as isBriefAdopted } from "@/oncuex/engine";
import type { Assessment, Eligibility } from "@/oncuex/types";

const TABS = [
  { id: "overview", label: "Overview", icon: CalendarDays },
  { id: "checklist", label: "Checklist", icon: ListChecks },
  { id: "timeline", label: "Timeline", icon: Clock3 },
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "partners", label: "Partners", icon: Handshake },
];

const Index = () => {
  const session = useOperatorSession();
  const [tab, setTab] = useState("overview");
  const [activityOpen, setActivityOpen] = useState(false);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [briefReviewOpen, setBriefReviewOpen] = useState(false);
  const [clientUpdateOpen, setClientUpdateOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const stored = window.localStorage.getItem("oncuex.theme");
      if (stored === "dark" || stored === "light") return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem("oncuex.theme", theme);
    } catch {
      // Appearance persistence is optional.
    }
  }, [theme]);

  const store = session.store;
  const briefReady = isBriefAdopted(store.snapshot());

  let assessment: Assessment | null = null;
  let eligibility: Eligibility | null = null;
  let assessmentError = false;
  if (briefReady) {
    try {
      assessment = store.assess();
      eligibility = store.eligibility(session.persona.role);
    } catch {
      assessmentError = true;
    }
  }

  const openTarget = (nextTab: string, anchor: string) => {
    setTab(nextTab);
    window.setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  const startSample = () => {
    if (isBriefAdopted(store.snapshot())) {
      setTab("overview");
      return;
    }
    session.apply("Sample plan started", (current) => loadBaseline(current));
  };

  const storageError = session.error ? /^The record could not be saved/.test(session.error) : false;
  const savedRecordError = session.error
    ? /^A saved record could not be validated/.test(session.error)
    : false;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        session={session}
        onOpenSignOff={() => setSignOffOpen(true)}
        onOpenActivity={() => setActivityOpen(true)}
        onReloadSample={session.reloadSample}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="mb-3 flex flex-col gap-2">
          {assessmentError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] leading-5 text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                We couldn’t read this plan. Reload the sample plan from Settings, or start over with
                a blank event.
              </span>
            </div>
          )}

          {session.error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] leading-5 text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">
                  {storageError
                    ? "Your changes couldn’t be saved on this device."
                    : savedRecordError
                      ? "We couldn’t open the saved plan."
                      : "That change couldn’t be applied."}
                </span>{" "}
                <span className="text-destructive/80">
                  {storageError
                    ? "The plan is still open on this device; try again, or reload the sample plan from Settings."
                    : savedRecordError
                      ? "A blank event is ready. Reload the sample plan from Settings to start again."
                      : "Nothing in the plan was changed. Please try again."}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-destructive hover:bg-destructive/10"
                onClick={session.clearMessages}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {session.flash && (
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-[12.5px] leading-5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              <span className="min-w-0 flex-1 text-foreground/90">{session.flash}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={session.clearMessages}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/80 p-1.5 shadow-panel scrollbar-thin">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {item.label}
                  {item.id === "partners" &&
                    store.evidence.some((record) => record.reviewDisposition === "pending") && (
                      <span className="ml-0.5 size-1.5 rounded-full bg-warning" aria-hidden />
                    )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="overview" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <EventView
              session={session}
              assessment={assessment}
              onOpenTab={setTab}
              onStartSample={startSample}
              onOpenActivity={() => setActivityOpen(true)}
              onOpenSignOff={() => setSignOffOpen(true)}
              onReviewBrief={() => setBriefReviewOpen(true)}
              onOpenClientUpdate={() => setClientUpdateOpen(true)}
              onOpenTarget={openTarget}
            />
          </TabsContent>

          <TabsContent value="checklist" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <ChecklistView
              session={session}
              assessment={assessment}
              onStartSample={startSample}
              onOpenTab={setTab}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <TimelineView session={session} onStartSample={startSample} onOpenTab={setTab} />
          </TabsContent>

          <TabsContent value="budget" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <BudgetView session={session} onStartSample={startSample} onOpenTab={setTab} />
          </TabsContent>

          <TabsContent value="partners" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <PartnersView session={session} onStartSample={startSample} onOpenTab={setTab} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-5 pt-2 text-[10.5px] text-muted-foreground md:px-8">
        <span className="font-medium text-foreground/70">OnCueX</span>
        <span aria-hidden>·</span>
        <span>Northwind Provisions · Spring product launch</span>
        <span aria-hidden>·</span>
        <span>
          Sample event · simulated role · saved on this device · no authentication
        </span>
      </footer>

      <ActivitySheet
        session={session}
        open={activityOpen}
        onOpenChange={setActivityOpen}
      />
      <SignOffDialog
        session={session}
        assessment={assessment}
        eligibility={eligibility}
        open={signOffOpen}
        onOpenChange={setSignOffOpen}
        onOpenTab={setTab}
      />
      <BriefReviewDialog
        session={session}
        open={briefReviewOpen}
        onOpenChange={setBriefReviewOpen}
      />
      <ClientUpdateDialog
        session={session}
        assessment={assessment}
        open={clientUpdateOpen}
        onOpenChange={setClientUpdateOpen}
      />
    </div>
  );
};

export default Index;
