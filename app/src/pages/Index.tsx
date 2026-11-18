import { useEffect, useState } from "react";
import {
  Archive,
  FileCheck2,
  FileSearch,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  ListChecks,
  ShieldAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditView } from "@/components/oncuex/audit-view";
import { ChecksView } from "@/components/oncuex/checks-view";
import { DecisionsView } from "@/components/oncuex/decisions-view";
import { EvidenceView } from "@/components/oncuex/evidence-view";
import { Header } from "@/components/oncuex/header";
import { ImpactView } from "@/components/oncuex/impact-view";
import { RequirementsView } from "@/components/oncuex/requirements-view";
import { RunView } from "@/components/oncuex/run-view";
import { Note } from "@/components/oncuex/ui-bits";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { hasBrief as isBriefAdopted } from "@/oncuex/engine";
import { describeCommandError } from "@/oncuex/store";
import type { Assessment, Eligibility } from "@/oncuex/types";

const TABS = [
  { id: "run", label: "Run", icon: Gauge },
  { id: "requirements", label: "Requirements", icon: ListChecks },
  { id: "evidence", label: "Evidence", icon: FileSearch },
  { id: "impact", label: "Impact", icon: GitCompareArrows },
  { id: "decisions", label: "Decisions", icon: FileCheck2 },
  { id: "audit", label: "Audit & archive", icon: Archive },
  { id: "checks", label: "Self-check", icon: FlaskConical },
];

const Index = () => {
  const session = useOperatorSession();
  const [tab, setTab] = useState("run");
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
  let assessmentError: string | null = null;
  if (briefReady) {
    try {
      assessment = store.assess();
      eligibility = store.eligibility(session.persona.role);
    } catch (error) {
      assessmentError = describeCommandError(error);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        session={session}
        briefReady={briefReady}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 md:px-8 md:py-6">
        <div className="mb-3 flex flex-col gap-2">
          <Note tone="warning" icon={ShieldAlert}>
            <span className="font-medium">Simulated roles, no authentication.</span>{" "}
            {session.persona.name} ({session.persona.role}) is a fictional identity for this
            milestone. The store refuses commands the role may not issue; that is a workflow gate, not
            a security control. Private records live in this browser only.
          </Note>

          {assessmentError && (
            <Note tone="danger" icon={ShieldAlert}>
              The snapshot could not be evaluated: <span className="font-mono">{assessmentError}</span>
            </Note>
          )}

          {session.error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] leading-5 text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">
                  {/^The record could not be saved/.test(session.error)
                    ? "Local save failed."
                    : /^A saved record could not be validated/.test(session.error)
                      ? "Saved record rejected."
                      : "Command rejected."}
                </span>{" "}
                <span className="font-mono text-[11.5px]">{session.error}</span>{" "}
                <span className="text-destructive/80">
                  {/^The record could not be saved/.test(session.error)
                    ? "Work continues in memory; download the export from Audit before closing."
                    : /^A saved record could not be validated/.test(session.error)
                      ? "The rejected export was not loaded. A clean record was opened instead."
                      : "The record was not advanced; the last saved state was restored where a sequence had started."}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 text-destructive hover:bg-destructive/10"
                onClick={session.clearMessages}
                aria-label="Dismiss rejection"
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
                aria-label="Dismiss message"
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
                  {item.id === "evidence" &&
                    store.evidence.some((record) => record.reviewDisposition === "pending") && (
                      <span className="ml-0.5 size-1.5 rounded-full bg-warning" aria-hidden />
                    )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="run" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <RunView
              session={session}
              briefReady={briefReady}
              assessment={assessment}
              eligibility={eligibility}
              onOpenTab={setTab}
            />
          </TabsContent>

          <TabsContent value="requirements" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <RequirementsView session={session} assessment={assessment} onOpenTab={setTab} />
          </TabsContent>

          <TabsContent value="evidence" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <EvidenceView session={session} onOpenTab={setTab} />
          </TabsContent>

          <TabsContent value="impact" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <ImpactView session={session} assessment={assessment} onOpenTab={setTab} />
          </TabsContent>

          <TabsContent value="decisions" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <DecisionsView
              session={session}
              assessment={assessment}
              eligibility={eligibility}
              onOpenTab={setTab}
            />
          </TabsContent>

          <TabsContent value="audit" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <AuditView session={session} briefReady={briefReady} />
          </TabsContent>

          <TabsContent value="checks" className="mt-4 animate-fade-rise focus-visible:outline-none">
            <ChecksView />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-5 pt-2 text-[10.5px] text-muted-foreground md:px-8">
        <span className="font-medium text-foreground/70">OnCueX readiness ledger</span>
        <span aria-hidden>·</span>
        <span>Deterministic core ported from the Python reference</span>
        <span aria-hidden>·</span>
        <span>Synthetic scenario, simulated identities</span>
        <span aria-hidden>·</span>
        <span>No backend or AI in this milestone: the record is saved in this browser</span>
        <span aria-hidden>·</span>
        <span className="tnum">
          revision {store.assessmentRevision} / sequence {store.sequence} / set v
          {store.project.requirementSetVersion ?? 1}
        </span>
      </footer>
    </div>
  );
};

export default Index;
