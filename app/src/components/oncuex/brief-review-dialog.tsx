import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileText, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import {
  type AiRun,
  type BriefProposal,
  callOncuexAI,
  validateBriefProposal,
} from "@/lib/ai-client";
import { BRIEF, SAMPLE_BRIEF_TEXT } from "@/oncuex/scenario";
import { adoptReviewedBrief, attachBaselineEvidence } from "@/oncuex/demo";
import type { Brief } from "@/oncuex/types";
import { Chip, Note } from "./ui-bits";

interface BriefReviewDialogProps {
  session: ReturnType<typeof useOperatorSession>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROPOSAL_FIELDS = ["client", "project", "eventDate", "guestCount", "approvedBudget"];

interface FormState {
  client: string;
  project: string;
  eventDate: string;
  guestCount: string;
  budget: string;
  timezone: string;
  openQuestions: string;
  circulationBuffer: string;
  guestCountFixed: boolean;
}

const emptyForm: FormState = {
  client: "",
  project: "",
  eventDate: "",
  guestCount: "",
  budget: "",
  timezone: "America/Los_Angeles",
  openQuestions: "",
  circulationBuffer: "10",
  guestCountFixed: true,
};

function fromProposal(proposal: BriefProposal): FormState {
  return {
    client: proposal.client ?? "",
    project: proposal.project ?? "",
    eventDate: proposal.eventDate ?? "",
    guestCount: proposal.guestCount === null ? "" : String(proposal.guestCount),
    budget:
      proposal.approvedBudget === null
        ? ""
        : String(proposal.approvedBudget.minorUnits / 100),
    timezone: proposal.timezone ?? "America/Los_Angeles",
    openQuestions: proposal.openQuestions.join("\n"),
    circulationBuffer: "10",
    guestCountFixed: true,
  };
}

export function BriefReviewDialog({
  session,
  open,
  onOpenChange,
}: BriefReviewDialogProps) {
  const [proposal, setProposal] = useState<BriefProposal | null>(null);
  const [mode, setMode] = useState<"ai" | "manual" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AiRun | null>(null);
  const [reviewedWithoutSpans, setReviewedWithoutSpans] = useState(false);

  const missingSpans = useMemo(() => {
    if (!proposal || mode !== "ai") return [];
    const present = new Set(proposal.sourceSpans.map((span) => span.field));
    return PROPOSAL_FIELDS.filter((field) => {
      const value = proposal[field as keyof BriefProposal];
      return value !== null && !present.has(field);
    });
  }, [proposal, mode]);

  const missing = [
    !form.client.trim() && "client",
    !form.project.trim() && "project",
    !form.eventDate && "date",
    !form.guestCount && "guest count",
    !form.budget && "budget",
    !form.timezone.trim() && "timezone",
  ].filter(Boolean) as string[];

  const canAdopt =
    missing.length === 0 &&
    (mode === "manual" || missingSpans.length === 0 || reviewedWithoutSpans);

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const extract = async () => {
    setLoading(true);
    setError(null);
    const result = await callOncuexAI<BriefProposal>("extract_brief", {
      briefText: SAMPLE_BRIEF_TEXT,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setRun(result.run);
      return;
    }
    const valid = validateBriefProposal(result.data);
    if (!valid.ok) {
      setError(valid.error);
      setRun(result.run);
      return;
    }
    setProposal(valid.proposal);
    setForm(fromProposal(valid.proposal));
    setMode("ai");
    setRun(result.run);
    setReviewedWithoutSpans(false);
  };

  const useManualSample = () => {
    const manual: BriefProposal = {
      client: BRIEF.client,
      project: BRIEF.project,
      eventDate: BRIEF.eventDate,
      guestCount: BRIEF.guestCount,
      approvedBudget: BRIEF.approvedBudget,
      timezone: BRIEF.timezone,
      openQuestions: BRIEF.openQuestions,
      sourceSpans: [],
      uncertainties: ["Manual sample values, not a model extraction."],
      questions: [],
    };
    setProposal(manual);
    setForm(fromProposal(manual));
    setMode("manual");
    setRun(null);
    setError(null);
    setReviewedWithoutSpans(true);
  };

  const adopt = () => {
    const budget = Number(form.budget);
    const guests = Number(form.guestCount);
    const buffer = Number(form.circulationBuffer);
    const brief: Brief = {
      client: form.client.trim(),
      project: form.project.trim(),
      guestCount: guests,
      guestCountIsFixed: form.guestCountFixed,
      eventDate: form.eventDate,
      timezone: form.timezone.trim(),
      approvedBudget: {
        currency: proposal?.approvedBudget?.currency ?? BRIEF.approvedBudget.currency,
        minorUnits: Math.round(budget * 100),
      },
      owner: BRIEF.owner,
      openQuestions: form.openQuestions
        .split("\n")
        .map((question) => question.trim())
        .filter(Boolean),
      circulationBuffer: Number.isFinite(buffer) ? buffer : 10,
    };
    session.apply("Brief adopted", (current) => {
      adoptReviewedBrief(current, brief);
      attachBaselineEvidence(current);
      return "The brief is adopted and the prepared sample documents are attached.";
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" aria-hidden />
            Review the client brief
          </DialogTitle>
          <DialogDescription>
            Extract the facts from the brief, check every value against its source, then adopt
            the brief. The proposal is not project data until you adopt it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[12px] leading-5">
            {SAMPLE_BRIEF_TEXT}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={extract} disabled={loading}>
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {mode === "ai" ? "Extract again" : "Extract with AI"}
            </Button>
            {mode === "ai" && <Chip tone="success">AI proposal</Chip>}
            {mode === "manual" && <Chip tone="neutral">Manual sample</Chip>}
            <Button size="sm" variant="ghost" onClick={useManualSample} disabled={loading}>
              Use the prepared sample manually
            </Button>
          </div>

          {run && (
            <p className="text-[10.5px] text-muted-foreground">
              AI response · {run.durationMs} ms ·{" "}
              {run.responseId ? `reference ${run.responseId}` : run.detail}
            </p>
          )}

          {error && (
            <Note tone="danger" icon={FileText}>
              <span className="font-medium">AI extraction unavailable.</span> {error} You can enter
              the brief manually or use the prepared sample, clearly labelled.
            </Note>
          )}

          {proposal && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="brief-client">Client</Label>
                  <Input
                    id="brief-client"
                    value={form.client}
                    onChange={(event) => update("client", event.target.value)}
                    placeholder="Not stated — enter manually"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brief-project">Event</Label>
                  <Input
                    id="brief-project"
                    value={form.project}
                    onChange={(event) => update("project", event.target.value)}
                    placeholder="Not stated — enter manually"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brief-date">Date</Label>
                  <Input
                    id="brief-date"
                    type="date"
                    value={form.eventDate}
                    onChange={(event) => update("eventDate", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brief-guests">Guests</Label>
                  <Input
                    id="brief-guests"
                    type="number"
                    min={1}
                    value={form.guestCount}
                    onChange={(event) => update("guestCount", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brief-budget">Approved budget (USD)</Label>
                  <Input
                    id="brief-budget"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.budget}
                    onChange={(event) => update("budget", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="brief-timezone">Timezone</Label>
                  <Input
                    id="brief-timezone"
                    value={form.timezone}
                    onChange={(event) => update("timezone", event.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Internal setting, not extracted from the brief.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="brief-questions">Open questions</Label>
                <Textarea
                  id="brief-questions"
                  rows={3}
                  value={form.openQuestions}
                  onChange={(event) => update("openQuestions", event.target.value)}
                  placeholder="One question per line"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 self-end text-[11px]">
                  <input
                    type="checkbox"
                    checked={form.guestCountFixed}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, guestCountFixed: event.target.checked }))
                    }
                  />
                  Guest count is fixed (internal assumption)
                </label>
                <div className="space-y-1">
                  <Label htmlFor="brief-buffer">Circulation buffer</Label>
                  <Input
                    id="brief-buffer"
                    type="number"
                    min={0}
                    value={form.circulationBuffer}
                    onChange={(event) => update("circulationBuffer", event.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">Internal planning setting.</p>
                </div>
                <p className="self-end text-[10.5px] text-muted-foreground">
                  Event lead {BRIEF.owner.name} · fixed sample role, not extracted.
                </p>
              </div>

              {proposal.uncertainties.length > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                    Uncertainties
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {proposal.uncertainties.map((entry) => (
                      <li key={entry} className="text-[11px] leading-5 text-muted-foreground">
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.questions.length > 0 && (
                <div className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Questions to confirm
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {proposal.questions.map((entry) => (
                      <li key={entry} className="text-[11px] leading-5 text-muted-foreground">
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {proposal.sourceSpans.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Source spans
                  </p>
                  <ul className="space-y-1">
                    {proposal.sourceSpans.map((span) => (
                      <li key={`${span.field}-${span.quote}`} className="text-[11px] leading-5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {span.field}
                        </span>{" "}
                        “{span.quote}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {missingSpans.length > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-5">
                  <input
                    type="checkbox"
                    checked={reviewedWithoutSpans}
                    onChange={(event) => setReviewedWithoutSpans(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I reviewed the values without a supporting quote ({missingSpans.join(", ")})
                    and corrected anything that was not stated.
                  </span>
                </label>
              )}

              {missing.length > 0 && (
                <p className="text-[11px] text-warning">
                  Complete the missing fields before adopting: {missing.join(", ")}.
                </p>
              )}

              <Note tone="neutral" icon={CheckCircle2}>
                Adopting the brief and adding the prepared sample documents uses the same commands
                as the rest of the binder. The documents are prepared sample files, not live
                partner confirmations.
              </Note>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!proposal || !canAdopt} onClick={adopt}>
            Adopt brief and add sample documents
            <ArrowRight className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
