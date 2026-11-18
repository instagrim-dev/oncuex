import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import type { Assessment } from "@/oncuex/types";
import { PEOPLE, sourceAttribution } from "@/oncuex/scenario";
import { bindingMatches } from "@/oncuex/schema";
import { formatDate, residualText } from "@/oncuex/format";
import { sourceState, sourceStateLabel } from "@/oncuex/presentation";
import { Note } from "./ui-bits";
import { IssuePlanEditor } from "./issue-plan-editor";
import { IssueSampleRecovery } from "./issue-sample-recovery";

export type IssueSelection = { kind: "exception" | "requirement" | "question"; id: string; title: string; detail?: string };
const EXCEPTION_REQUIREMENTS: Record<string, string[]> = {
  access: ["REQ-venue-loading-1", "REQ-crew-arrival-1"],
  capacity: ["REQ-venue-capacity-1"], runofshow: ["REQ-production-runofshow-1"],
  budget: ["REQ-budget-total-1"], attestation: ["REQ-fire-permit-1"],
};

export function IssueDialog({ issue, session, assessment, onClose }: { issue: IssueSelection | null; session: ReturnType<typeof useOperatorSession>; assessment: Assessment | null; onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const store = session.store;
  const snapshot = store.snapshot();
  const ids = issue?.kind === "requirement" ? [issue.id] : issue?.id === "documents" ? (assessment?.requirements.filter((r) => r.status !== "supported").map((r) => r.requirementId) ?? []) : EXCEPTION_REQUIREMENTS[issue?.id ?? ""] ?? [];
  const requirements = store.requirements.filter((req) => ids.includes(req.id));
  const records = store.evidence.filter((record) => ids.includes(record.requirementId));
  return <Dialog open={Boolean(issue)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{issue?.title ?? "Review issue"}</DialogTitle><DialogDescription>Review the finding and available next steps without leaving Overview. No messages are sent.</DialogDescription></DialogHeader>
    {issue?.detail && <Note tone="warning">Original finding: {issue.detail} Check the current results below after making a change.</Note>}
    {issue?.kind === "question" ? <div className="space-y-3"><p className="text-sm">{issue.title}</p><Note tone="neutral">This question remains open. Preparing a clarification does not send it or change the brief.</Note><label className="block text-xs font-medium">Unsent clarification<textarea className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a question to review" /></label><Button size="sm" variant="outline" disabled={!draft.trim()} onClick={() => { if (!navigator.clipboard) { setNotice("Copy unavailable; select and copy the text manually."); return; } void navigator.clipboard.writeText(draft).then(() => setNotice("Clarification copied. It has not been sent.")).catch(() => setNotice("Copy unavailable; select and copy the text manually.")); }}>Copy unsent draft</Button>{notice && <p className="text-xs text-muted-foreground">{notice}</p>}<p className="text-xs text-muted-foreground">Draft is temporary and is not sent.</p></div> : <>
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5"><p className="font-semibold">Current plan values</p><p className="mt-1 text-muted-foreground">Venue: {snapshot.location.venueName} · capacity {snapshot.location.capacity} · access {snapshot.location.loadingWindow.start}–{snapshot.location.loadingWindow.end} · crew {snapshot.crew.arrivalTime} · show ends {snapshot.production.runOfShowEnd} · hard stop {snapshot.location.hardStop} · attestation {snapshot.location.fireAttestation.replaceAll("_", " ")}</p></div>
      <div className="space-y-3">{requirements.map((req) => { const result = assessment?.requirements.find((r) => r.requirementId === req.id); return <div key={req.id} className="rounded-lg border border-border bg-card p-3"><p className="text-sm font-semibold">{req.label}</p><p className="mt-1 text-xs text-muted-foreground">Owner: {PEOPLE[req.owner] ?? req.owner} · {result?.status ?? "not assessed"}</p>{req.prerequisiteIds.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Depends on: {req.prerequisiteIds.map((id) => store.requirements.find((r) => r.id === id)?.label ?? id).join(", ")}</p>}<ul className="mt-2 space-y-1">{result?.residuals.map((residual, index) => <li key={`${residual.code}-${index}`} className="text-xs text-warning">{residualText(residual)}</li>)}</ul></div>; })}</div>
      <div className="space-y-2"><h3 className="text-sm font-semibold">Supporting records</h3>{records.length ? records.map((record) => <div key={record.id} className="rounded-lg border border-border p-3 text-xs"><p className="font-medium">{sourceAttribution(record)} · {record.id}</p><p className="mt-1 text-muted-foreground">{sourceStateLabel(sourceState(record, snapshot, store.now()))} · valid to {formatDate(record.expiresAt)}</p><p className="mt-2 leading-5">“{record.sourceExcerpt}”</p>{record.reviewDisposition === "pending" && sourceState(record, snapshot, store.now()) === "review" && Object.entries(record.boundFieldVersions).every(([path, value]) => bindingMatches(path, value, snapshot)) && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { const revision = store.assessmentRevision; const outcome = session.apply("Evidence reviewed", (current) => { current.reviewEvidence({ commandId: `review-${crypto.randomUUID()}`, role: session.role, actor: session.persona.id, expectedAssessmentRevision: revision }, record.id, "accepted"); return "Review recorded; the checks have been reassessed. This is not external confirmation."; }); setNotice(outcome.ok ? `${outcome.detail}${outcome.warning ? ` ${outcome.warning}` : ""}` : `Review not applied: ${outcome.detail}`); }}>Accept reviewed record</Button><Button size="sm" variant="outline" onClick={() => { const revision = store.assessmentRevision; const outcome = session.apply("Evidence reviewed", (current) => { current.reviewEvidence({ commandId: `review-${crypto.randomUUID()}`, role: session.role, actor: session.persona.id, expectedAssessmentRevision: revision }, record.id, "rejected"); return "The record was marked not used; the checks have been reassessed."; }); setNotice(outcome.ok ? `${outcome.detail}${outcome.warning ? ` ${outcome.warning}` : ""}` : `Review not applied: ${outcome.detail}`); }}>Mark not used</Button></div>}</div>) : <p className="text-xs text-muted-foreground">No supporting record is attached for this check.</p>}</div>
      {notice && <Note tone="neutral">{notice}</Note>}
      <Note tone="neutral">A review or plan change does not establish a real-world confirmation. Unsupported, expired or missing evidence requires a suitable source; only matching prepared sample documents can be attached here.</Note>
      {issue && <IssuePlanEditor key={issue.id} id={issue.id} session={session} />}
      <IssueSampleRecovery session={session} requirementIds={ids} />
    </>}
    <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
  </DialogContent></Dialog>;
}
