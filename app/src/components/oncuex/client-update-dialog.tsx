import { useMemo, useState } from "react";
import { Copy, Download, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { type AiRun, callOncuexAI } from "@/lib/ai-client";
import { BRIEF, PEOPLE, REQUIREMENTS } from "@/oncuex/scenario";
import { WORK_AREAS } from "@/oncuex/work-areas";
import { formatDate, formatMoney, residualText } from "@/oncuex/format";
import { checklistState, planExceptions, sourceState } from "@/oncuex/presentation";
import type { Assessment, Brief } from "@/oncuex/types";
import { Chip, Note } from "./ui-bits";

interface ClientUpdateDialogProps {
  session: ReturnType<typeof useOperatorSession>;
  assessment: Assessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientUpdateDialog({
  session,
  assessment,
  open,
  onOpenChange,
}: ClientUpdateDialogProps) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"ai" | "manual" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AiRun | null>(null);
  const [copied, setCopied] = useState(false);

  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const exceptions = briefReady && assessment
    ? planExceptions(snapshot, brief, assessment)
    : [];
  const documentsNeedingUpdate = store.evidence.filter(
    (record) => sourceState(record, snapshot, store.now()) === "update",
  ).length;

  const draftWarnings = useMemo(() => {
    const warnings: string[] = [];
    const lower = draft.toLowerCase();
    if (
      !latestCurrent &&
      (/\b(is|has been|remains|was)\s+(signed off|approved)\b/.test(lower) ||
        /\bapproval\s+(is|remains)\b/.test(lower))
    ) {
      warnings.push("The draft claims a sign-off or approval that is not current.");
    }
    if (
      /\b(confirmed by|has confirmed|partner confirmed|vendor confirmed|venue confirmed|confirmed the venue|confirmed the partner)\b/.test(
        lower,
      )
    ) {
      warnings.push("The draft claims a partner confirmation.");
    }
    if (/\b(booked|reserved|held for you|available|availability)\b/.test(lower)) {
      warnings.push("The draft claims availability or a booking.");
    }
    return warnings;
  }, [draft, latestCurrent]);

  const projectState = {
    event: {
      client: brief.client,
      project: brief.project,
      date: brief.eventDate,
      timezone: brief.timezone,
      guests: brief.guestCount,
      venue: snapshot.location.venueName,
      approvedBudget: formatMoney(brief.approvedBudget.minorUnits, brief.approvedBudget.currency),
      committed: formatMoney(
        snapshot.budget.committedTotal.minorUnits,
        snapshot.budget.committedTotal.currency,
      ),
    },
    checklist: WORK_AREAS.map((area) => ({
      area: area.label,
      items: area.requirementIds
        .map((id) => REQUIREMENTS.find((requirement) => requirement.id === id))
        .filter(Boolean)
        .map((requirement) => {
          const result = assessment?.requirements.find(
            (candidate) => candidate.requirementId === requirement?.id,
          );
          const support = result ? checklistState(result) : null;
          return {
            task: requirement?.label,
            owner: requirement ? PEOPLE[requirement.owner] ?? "Unassigned" : "Unassigned",
            state: support
              ? {
                  status: support.label,
                  finding: support.detail,
                }
              : { status: "Not assessed", finding: "" },
          };
        }),
    })),
    exceptions: exceptions.map((exception) => `${exception.title}: ${exception.detail}`),
    openQuestions: brief.openQuestions,
    signOff: latest
      ? {
          status: latestCurrent
            ? "signed off and still applies"
            : "an earlier sign-off no longer applies to this version",
          by: PEOPLE[latest.actor] ?? "the event lead",
        }
      : "not signed off",
    documentsNeedingUpdate,
  };

  const generate = async () => {
    if (!briefReady) return;
    setLoading(true);
    setError(null);
    const result = await callOncuexAI<{ draft: string }>("draft_update", {
      project: projectState,
    });
    setLoading(false);
    setRun(result.run);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(result.data.draft);
    setMode("ai");
  };

  const download = () => {
    if (!draft.trim() || draftWarnings.length > 0) return;
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "northwind-client-update.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    if (draftWarnings.length > 0) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The draft could not be copied. Select the text and copy it manually.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client update</DialogTitle>
          <DialogDescription>
            A draft for the event lead to review and edit. It is not sent from OnCueX, and it is
            not authoritative until you share it yourself.
          </DialogDescription>
        </DialogHeader>

        {!briefReady || !assessment ? (
          <Note tone="warning">
            Review the client brief and assess the plan before drafting an update.
          </Note>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={generate} disabled={loading || !assessment}>
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {mode === "ai" ? "Draft again" : "Draft with AI"}
              </Button>
              {mode === "ai" && <Chip tone="success">AI draft</Chip>}
              {mode === "manual" && <Chip tone="neutral">Manual draft</Chip>}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode("manual");
                  setDraft("");
                  setError(null);
                }}
              >
                Write manually
              </Button>
            </div>

            {run && (
              <p className="text-[10.5px] text-muted-foreground">
                AI response · {run.durationMs} ms ·{" "}
                {run.responseId ? `reference ${run.responseId}` : run.detail}
              </p>
            )}

            {error && (
              <Note tone="danger">
                <span className="font-medium">The draft could not be generated.</span> {error} You
                can write the update manually; no message will be sent.
              </Note>
            )}

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[11.5px] leading-5">
              <p className="font-medium">Before you share</p>
              <p className="text-muted-foreground">
                Sign-off: {projectState.signOff.status}. Open questions:{" "}
                {brief.openQuestions.length}. Documents needing an update:{" "}
                {documentsNeedingUpdate}. The draft must not claim a partner confirmed a document,
                or that the plan is signed off, unless that is true above.
              </p>
            </div>

            <Textarea
              rows={14}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                mode === "manual"
                  ? "Write the client update here. Use only what is recorded in the plan."
                  : "Draft with AI, then edit every sentence before sharing."
              }
              className="font-sans text-[12.5px] leading-6"
            />

            {draftWarnings.length > 0 && (
              <Note tone="warning">
                <span className="font-medium">Review before sharing.</span>
                <ul className="mt-1 list-disc pl-4">
                  {draftWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Note>
            )}

            <Note tone="neutral">
              This draft is unsent. Downloading or copying it is a manual handoff to your own email
              or client channel; OnCueX does not send it.
            </Note>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!draft.trim() || draftWarnings.length > 0}
            onClick={copy}
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy draft"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!draft.trim() || draftWarnings.length > 0}
            onClick={download}
          >
            <Download className="size-3.5" />
            Download draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
