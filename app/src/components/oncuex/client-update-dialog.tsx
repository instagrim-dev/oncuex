import { useMemo, useState } from "react";
import { Copy, Download, History, Loader2, Save, Sparkles } from "lucide-react";

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
import { callOncuexAI } from "@/lib/ai-client";
import { changeTitle } from "@/oncuex/demo";
import { BRIEF, PEOPLE } from "@/oncuex/scenario";
import { formatDate, formatDateTime, formatMoney } from "@/oncuex/format";
import { planExceptions } from "@/oncuex/presentation";
import { isOutputStale, outputBasis } from "@/oncuex/retained-output";
import type { RetainedOutput } from "@/oncuex/retained-output";
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
  const [copied, setCopied] = useState(false);
  const [draftBasis, setDraftBasis] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const store = session.store;
  const snapshot = store.snapshot();
  const briefReady = Boolean((snapshot.brief as { client?: string }).client);
  const brief: Brief = briefReady ? (snapshot.brief as Brief) : BRIEF;
  const concerns = session.review.data.suggestions.filter((item) => item.status === "concern" && item.projectId === snapshot.id);
  const citedSources = session.review.data.sources.filter((source) => concerns.some((item) => item.sourceIds.includes(source.id)));
  const basis = outputBasis({ revision: store.assessmentRevision, now: store.now(), decisions: store.decisionsList(), sources: session.review.data.sources, suggestions: session.review.data.suggestions });
  const stale = Boolean(draft && draftBasis && draftBasis !== basis);
  const savedOutputs = [...(session.review.data.outputs ?? [])]
    .filter((output) => output.projectId === snapshot.id)
    .sort((a, b) => b.version - a.version);
  const loadOutput = (output: RetainedOutput) => {
    setDraft(output.body); setDraftBasis(output.basis); setMode("manual"); setError(null);
    setSaveNotice(isOutputStale(output, basis) ? "Loaded an earlier version. It is stale against the current record; prepare a new version before reuse." : "Loaded the saved version.");
  };
  const saveOutput = () => {
    if (!draft.trim() || stale || draftWarnings.length > 0) return;
    try {
      const saved = session.review.saveOutput({ projectId: snapshot.id, title: `Client update · ${brief.project}`, body: draft, sourceIds: citedSources.map((source) => source.id), concernIds: concerns.map((item) => item.id), basis });
      setSaveNotice(`Saved as version ${saved.version}. The saved copy is unchanged until you save another version.`);
    } catch (failure) {
      setSaveNotice(failure instanceof Error ? failure.message : "The output could not be saved.");
    }
  };
  const citations = citedSources.map((source) => `[${source.id}] ${source.channel} · ${source.author} · ${formatDateTime(source.timestamp)} · ${source.origin}: “${source.rawText}”`).join("\n");
  const latest = store.latestDecision();
  const latestCurrent = latest ? store.currentness(latest.id) === "current" : false;
  const exceptions = briefReady && assessment
    ? planExceptions(snapshot, brief, assessment)
    : [];
  const lastChange = [...store.events]
    .reverse()
    .find((event) => event.eventType === "change.adopted");
  const lastChangeId = String(lastChange?.payload?.changeId ?? "");

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
    if (
      /\b(booked|reserved|held for you|availability)\b/.test(lower) ||
      /\b(is|are|remains?|still)\s+available\b/.test(lower)
    ) {
      warnings.push("The draft claims availability or a booking.");
    }
    return warnings;
  }, [draft, latestCurrent]);

  const projectState = {
    event: {
      client: brief.client,
      project: brief.project,
      date: brief.eventDate,
      guests: brief.guestCount,
      venue: snapshot.location.venueName,
      approvedBudget: formatMoney(brief.approvedBudget.minorUnits, brief.approvedBudget.currency),
      committed: formatMoney(
        snapshot.budget.committedTotal.minorUnits,
        snapshot.budget.committedTotal.currency,
      ),
    },
    planSummary: !assessment
      ? "The plan has not been checked yet."
      : assessment.readiness === "ready_for_review"
        ? "Required supporting checks pass; open questions remain subject to review."
        : "A few things are still being confirmed.",
    signedOff: latestCurrent
      ? `${PEOPLE[latest?.actor ?? ""] ?? "The event lead"} has approved the current plan.`
      : latest
        ? "The last approval no longer applies; this version needs another look."
        : "The plan is not approved yet.",
    recentUpdate: lastChangeId ? changeTitle(lastChangeId) : null,
    stillToDo: exceptions.slice(0, 3).map((exception) => exception.title),
    openQuestions: brief.openQuestions,
    reviewedConcerns: concerns.map((item) => ({ title: item.title, consequence: item.consequence, sourceIds: item.sourceIds, excerpt: item.excerpt })),
    sources: citedSources.map((source) => ({ id: source.id, channel: source.channel, author: source.author, timestamp: source.timestamp, excerpt: source.rawText })),
  };

  const generate = async () => {
    if (!briefReady) return;
    setLoading(true);
    setError(null);
    const result = await callOncuexAI<{ draft: string }>("draft_update", {
      project: projectState,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!result.data || typeof result.data.draft !== "string" || !result.data.draft.trim()) {
      setError("The AI response did not contain a usable draft.");
      return;
    }
    setDraft(`${result.data.draft}${citations ? `\n\nSources for review:\n${citations}` : ""}`);
    setDraftBasis(basis);
    setMode("ai");
  };

  const prepareFromRecord = () => {
    const lines = [
      `Working update for ${brief.client} — ${brief.project}`, "",
      `The current plan records ${snapshot.location.venueId === "UNASSIGNED" ? "no venue yet" : snapshot.location.venueName} for ${formatDate(brief.eventDate)}. The approved ceiling is ${formatMoney(brief.approvedBudget.minorUnits, brief.approvedBudget.currency)}; recorded commitments total ${formatMoney(snapshot.budget.committedTotal.minorUnits, snapshot.budget.committedTotal.currency)}.`,
      latestCurrent ? "The current plan has a recorded sign-off." : "The current plan is not signed off.",
      concerns.length ? `Open concerns for follow-up: ${concerns.map((item) => `${item.title} [${item.sourceIds.join(", ")}]`).join("; ")}. These are concerns, not verified facts or adopted changes.` : "No source concerns have been accepted for follow-up.",
      brief.openQuestions.length ? `Open questions: ${brief.openQuestions.join("; ")}` : "No client questions are recorded in the brief.",
      exceptions.length ? `Affected work to review: ${exceptions.map((item) => item.title).join("; ")}.` : "No current plan exceptions are recorded by the displayed checks.",
      citations ? `\nSources for review:\n${citations}` : "",
    ];
    setDraft(lines.filter((line) => line !== undefined).join("\n"));
    setDraftBasis(basis); setMode("manual"); setError(null); setSaveNotice(null);
  };

  const download = () => {
    if (!draft.trim() || draftWarnings.length > 0 || stale) return;
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
    if (draftWarnings.length > 0 || stale) return;
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
                {mode === "ai" ? "Draft it again" : "Draft the update"}
              </Button>
              <Button size="sm" variant="outline" onClick={prepareFromRecord}>Prepare from reviewed record</Button>
              {mode === "ai" && <Chip tone="success">AI draft ready</Chip>}
              {mode === "manual" && <Chip tone="neutral">Written by you</Chip>}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode("manual");
                  setDraftBasis(basis);
                  setDraft("");
                  setError(null);
                }}
              >
                Write it myself
              </Button>
            </div>

            {error && (
              <Note tone="danger">
                <span className="font-medium">The draft could not be generated.</span> {error} You
                can write the update manually; no message will be sent.
              </Note>
            )}

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[11.5px] leading-5">
              <p className="font-medium">Before this goes out</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  {latestCurrent
                    ? "The current plan is approved."
                    : "The plan is not approved yet."}
                </li>
                {brief.openQuestions.length > 0 && (
                  <li>
                    {brief.openQuestions.length} client question
                    {brief.openQuestions.length === 1 ? " is" : "s are"} still open.
                  </li>
                )}
                <li>Nothing sends from here. You copy or download it.</li>
              </ul>
            </div>

            <Textarea
              rows={14}
              value={draft}
              onChange={(event) => { if (!draftBasis) setDraftBasis(basis); setDraft(event.target.value); }}
              placeholder={
                mode === "manual"
                  ? "Write the update in your own words. Stick to what the plan says."
                  : "Draft the update, then make it sound like you before you send it."
              }
              className="font-sans text-[12.5px] leading-6"
            />

            {stale && <Note tone="warning">The plan or source reviews changed after this draft was prepared. Regenerate it from the current record before copying or downloading.</Note>}
            {draftWarnings.length > 0 && (
              <Note tone="warning">
                <span className="font-medium">This may overstate what we know.</span> Edit these
                lines before sending:
                <ul className="mt-1 list-disc pl-4">
                  {draftWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Note>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="gap-1.5" disabled={!draft.trim() || draftWarnings.length > 0 || stale} onClick={saveOutput}>
                <Save className="size-3.5" />
                Save reviewed version
              </Button>
              <span className="text-[10.5px] text-muted-foreground">Saved on this device with the project; not sent.</span>
            </div>
            {saveNotice && <Note tone="neutral">{saveNotice}</Note>}
            <div className="rounded-lg border border-border/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold"><History className="size-3.5" aria-hidden />Retained updates · {savedOutputs.length}</p>
              {savedOutputs.length === 0 ? <p className="mt-1 text-[10.5px] text-muted-foreground">No saved version yet. Review the draft, then save it for reuse and export.</p> : <ul className="mt-2 space-y-1.5">{savedOutputs.map((output) => {
                const outputStale = isOutputStale(output, basis);
                return <li key={output.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2 text-[10.5px]"><div className="min-w-0"><p className="font-medium">Version {output.version} · {formatDate(output.savedAt)}</p><p className="text-muted-foreground">{outputStale ? "Stale: the plan or review record changed. Kept unchanged." : "Current basis"} · {output.sourceIds.length} cited source{output.sourceIds.length === 1 ? "" : "s"}</p></div><Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => loadOutput(output)}>Load</Button></li>;
              })}</ul>}
            </div>
            <p className="text-[10.5px] text-muted-foreground">
              This is a draft. Send it your own way when it sounds right.
            </p>
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
            disabled={!draft.trim() || draftWarnings.length > 0 || stale}
            onClick={copy}
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!draft.trim() || draftWarnings.length > 0 || stale}
            onClick={download}
          >
            <Download className="size-3.5" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
