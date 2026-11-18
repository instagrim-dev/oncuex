import { useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  Settings2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { aiRuns, callOncuexAI } from "@/lib/ai-client";
import { photographerWithdrawn, withdrawPhotographer } from "@/oncuex/demo";
import { formatDateTime } from "@/oncuex/format";
import { Note } from "./ui-bits";

interface SettingsDialogProps {
  session: ReturnType<typeof useOperatorSession>;
  onReloadSample: () => void;
}

export function SettingsDialog({ session, onReloadSample }: SettingsDialogProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);

  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const exportDoc = store.export();
  const runs = aiRuns().slice(0, 5);
  void aiVersion;

  const testAiFailure = async () => {
    setDiagnosticMessage(null);
    const result = await callOncuexAI("extract_brief", { briefText: "Too short." });
    setAiVersion((current) => current + 1);
    setDiagnosticMessage(
      result.ok ? "Unexpectedly accepted a short brief." : `Rejected as expected: ${result.error}`,
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Event settings">
          <Settings2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event settings</DialogTitle>
          <DialogDescription>
            Sample controls, project data and technical diagnostics for this prototype.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {session.flash && <Note tone="success">{session.flash}</Note>}
          {session.error && <Note tone="danger">{session.error}</Note>}

          <section className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Sample plan
            </h3>
            <p className="text-[12.5px] leading-5 text-muted-foreground">
              This is a fictional launch used to show how OnCueX keeps a complex plan tied to the
              documents behind it. Reloading restores the prepared venue, documents and sign-offs.
            </p>
            <div className="flex flex-wrap gap-2">
              <DialogClose asChild>
                <Button size="sm" onClick={onReloadSample}>
                  Reload sample plan
                </Button>
              </DialogClose>
              {confirmReset ? (
                <div className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1">
                  <span className="text-[11px] text-muted-foreground">Clear this device’s plan and source reviews?</span>
                  <DialogClose asChild>
                    <Button size="sm" variant="outline" onClick={session.reset}>
                      Yes, start over
                    </Button>
                  </DialogClose>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                    Keep it
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)}>
                  Start with a blank event
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-2 border-t border-border/60 pt-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Project data
            </h3>
            <p className="text-[12px] leading-5 text-muted-foreground">
              A copy of the plan, paperwork, sign-off history and source reviews. Restoring checks the file before replacing what is open. Older plan-only exports leave source reviews unchanged.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-[11.5px]"
                disabled={!briefReady}
                onClick={session.downloadExport}
              >
                <Download className="size-3.5" />
                Download project data
              </Button>
              <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-[11.5px]">
                <label className="cursor-pointer">
                  <Upload className="size-3.5" />
                  Restore project data
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void session.restoreFromFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
            <p className="text-[10.5px] text-muted-foreground">
              Export v{exportDoc.exportVersion} · {exportDoc.evidence.length} documents ·{" "}
              {exportDoc.archivedEvidence.length} kept for reference ·{" "}
              {exportDoc.decisions.length} sign-off{exportDoc.decisions.length === 1 ? "" : "s"} ·{" "}
              {exportDoc.events.length} timeline entries
            </p>
          </section>

          <section className="space-y-1.5 border-t border-border/60 pt-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              About this sample
            </h3>
            <p className="text-[12px] leading-5 text-muted-foreground">
              All partners, people and prices are fictional. The event lead role is simulated; there
              is no authentication or shared storage. Your changes are saved only on this device and
              are not sent to a live vendor system.
            </p>
          </section>

          <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <summary className="cursor-pointer text-[11.5px] font-medium">
              Technical diagnostics
            </summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  AI calls
                </p>
                {runs.length === 0 ? (
                  <p className="text-[10.5px] text-muted-foreground">No AI calls recorded yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {runs.map((run) => (
                      <li key={run.id} className="text-[10px] leading-4 text-muted-foreground">
                        <span className={run.status === "ok" ? "text-success" : "text-destructive"}>
                          {run.status}
                        </span>{" "}
                        {run.action} · {run.model} · {run.durationMs} ms ·{" "}
                        {formatDateTime(run.at)}
                        {run.responseId ? ` · ${run.responseId}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Sample failure states
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10.5px]"
                    onClick={() => {
                      session.setClock("2027-03-08T00:00:00Z");
                      setDiagnosticMessage("Sample date moved past document expiry.");
                    }}
                  >
                    <RefreshCw className="size-3" />
                    Expire sample documents
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10.5px]"
                    disabled={!briefReady || photographerWithdrawn(store)}
                    onClick={() => {
                      session.apply("Photography scope removed", (current) =>
                        withdrawPhotographer(current),
                      );
                      setDiagnosticMessage("Photography scope withdrawn; its document is kept for reference.");
                    }}
                  >
                    <AlertTriangle className="size-3" />
                    Withdraw photography
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10.5px]"
                    onClick={() => void testAiFailure()}
                  >
                    <Loader2 className="size-3" />
                    Test AI rejection
                  </Button>
                </div>
                {diagnosticMessage && (
                  <Note tone="neutral">{diagnosticMessage}</Note>
                )}
                <p className="text-[10px] leading-4 text-muted-foreground">
                  These are sample failure states for review; full verification runs outside the
                  product. Reload the sample plan to undo them.
                </p>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Record: {exportDoc.counters.sequence} timeline entries · sign-off scope is preserved
                in the Timeline. The fixed Rowan role is simulated, not authenticated.
              </p>
            </div>
          </details>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
