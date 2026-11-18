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

const PROPOSAL_FIELDS = ["client", "project", "eventDate", "guestCount", "approvedBudget", "timezone"];

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
  const [briefText, setBriefText] = useState(SAMPLE_BRIEF_TEXT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNewEvent, setConfirmNewEvent] = useState(false);

  const missingSpans = useMemo(() => {
    if (!proposal || mode !== "ai") return [];
    const present = new Set(proposal.sourceSpans.filter((span) => span.quote.trim().length > 0 && briefText.includes(span.quote)).map((span) => span.field));
    return PROPOSAL_FIELDS.filter((field) => {
      const value = proposal[field as keyof BriefProposal];
      return value !== null && !present.has(field);
    });
  }, [proposal, mode, briefText]);

  const missing = [
    !form.client.trim() && "client",
    !form.project.trim() && "project",
    !form.eventDate && "date",
    !form.guestCount && "guest count",
    !form.budget && "budget",
    !form.timezone.trim() && "timezone",
  ].filter(Boolean) as string[];

  const matchesPreparedBinder = form.client.trim() === BRIEF.client && form.project.trim() === BRIEF.project && form.eventDate === BRIEF.eventDate && Number(form.guestCount) === BRIEF.guestCount && Math.round(Number(form.budget) * 100) === BRIEF.approvedBudget.minorUnits;
  const isPreparedSample = matchesPreparedBinder && briefText.trim() === SAMPLE_BRIEF_TEXT.trim();
  const canAdopt = Boolean(proposal) && missing.length === 0 && (mode === "manual" || missingSpans.length === 0) && (isPreparedSample || (briefText.trim().length >= 40 && briefText.trim() !== SAMPLE_BRIEF_TEXT.trim() && confirmNewEvent));

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const extract = async () => {
    if (briefText.trim().length < 40) { setError("Paste at least a short paragraph of the original brief before reading it."); return; }
    setLoading(true);
    setError(null);
    setConfirmNewEvent(false);
    const result = await callOncuexAI<BriefProposal>("extract_brief", {
      briefText,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const valid = validateBriefProposal(result.data);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setProposal(valid.proposal);
    setForm(fromProposal(valid.proposal));
    setMode("ai");
  };

  const enterManually = () => {
    const manual: BriefProposal = {
      client: "", project: "", eventDate: "", guestCount: null, approvedBudget: null,
      timezone: "", openQuestions: [], sourceSpans: [], uncertainties: ["Typed by you from the original brief."], questions: [],
    };
    if (briefText.trim() === SAMPLE_BRIEF_TEXT.trim()) setBriefText("");
    setProposal(manual); setForm(emptyForm); setMode("manual"); setError(null); setConfirmNewEvent(false);
  };

  const useManualSample = () => {
    setBriefText(SAMPLE_BRIEF_TEXT);
    setConfirmNewEvent(false);
    const manual: BriefProposal = {
      client: BRIEF.client,
      project: BRIEF.project,
      eventDate: BRIEF.eventDate,
      guestCount: BRIEF.guestCount,
      approvedBudget: BRIEF.approvedBudget,
      timezone: BRIEF.timezone,
      openQuestions: BRIEF.openQuestions,
      sourceSpans: [],
      uncertainties: ["These are the prepared sample details, typed by you."],
      questions: [],
    };
    setProposal(manual);
    setForm(fromProposal(manual));
    setMode("manual");
    setError(null);
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
    if (isPreparedSample) {
      session.apply("Brief adopted", (current) => {
        adoptReviewedBrief(current, brief);
        attachBaselineEvidence(current);
        return "The brief is adopted and the prepared sample documents are attached.";
      });
      onOpenChange(false);
      return;
    }
    const result = session.startNewEvent(brief, briefText);
    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.detail);
    }
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
            Here is what we read from the brief. Check the details against the source before they
            go into the plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="brief-source">Original client brief</Label>
            <Textarea id="brief-source" rows={5} value={briefText} onChange={(event) => { setBriefText(event.target.value); setConfirmNewEvent(false); }} placeholder="Paste the client’s original brief. It is retained as the source for this event." className="text-[12px] leading-5" />
            <p className="text-[10px] text-muted-foreground">The original stays with the event. Edit the reviewed fields below; do not rewrite the source.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={extract} disabled={loading}>
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {mode === "ai" ? "Read it again" : "Read the brief"}
            </Button>
            {mode === "ai" && <Chip tone="success">Read from the brief</Chip>}
            {mode === "manual" && <Chip tone="neutral">Reviewed by you</Chip>}
            <Button size="sm" variant="outline" onClick={useManualSample} disabled={loading}>
              Use prepared sample
            </Button>
            <Button size="sm" variant="ghost" onClick={enterManually} disabled={loading}>
              Enter manually
            </Button>
          </div>

          {error && (
            <Note tone="danger" icon={FileText}>
              <span className="font-medium">We couldn’t read the brief automatically.</span>{" "}
              {error} You can enter the reviewed fields manually. No values are adopted without review.
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
                    Used for the new event’s source time and clock.
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
                  <p className="text-[10px] text-muted-foreground">
                    A planning assumption; change it if the client specified otherwise.
                  </p>
                </div>
                <p className="self-end text-[10.5px] text-muted-foreground">
                  {BRIEF.owner.name} is the simulated event lead for this prototype.
                </p>
              </div>

              {proposal.uncertainties.length > 0 && (
                <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                    Still unclear
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
                    Worth checking with the client
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
                    Where this came from
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
                <p className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-5">The AI response did not provide source quotes for {missingSpans.join(", ")}. Read again or use the prepared manual sample; unsupported AI values cannot be adopted.</p>
              )}

              {missing.length > 0 && (
                <p className="text-[11px] text-warning">
                  Complete the missing fields before adopting: {missing.join(", ")}.
                </p>
              )}

              {!isPreparedSample && <div className="space-y-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2">
                <p className="text-[11px] leading-5">This will start a new event with the reviewed fields above. The current plan and its history will be preserved on this device first. No sample venue, documents, commitments or confirmations will be attached; they remain unrecorded until you add suitable sources.</p>
                <label className="flex items-start gap-2 text-[11px] leading-5">
                  <input type="checkbox" className="mt-0.5" checked={confirmNewEvent} onChange={(event) => setConfirmNewEvent(event.target.checked)} />
                  <span>Start a new event and keep this original brief as its source.</span>
                </label>
              </div>}
              <Note tone="neutral" icon={CheckCircle2}>
                {isPreparedSample ? "This matching sample brief reopens the prepared fictional binder and its paperwork. It is not a live partner confirmation." : "Reviewed fields are adopted into a new event record. The original brief and the new event stay on this device; no external action is taken."}
              </Note>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1.5" disabled={!proposal || !canAdopt} onClick={adopt}>
            {isPreparedSample ? "Use this brief and add the sample paperwork" : "Start a new event from this brief"}
            <ArrowRight className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
