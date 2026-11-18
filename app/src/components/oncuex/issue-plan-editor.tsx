import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { issueEditor, previewIssueChange, proposedFields } from "@/oncuex/issue-resolution";
import { formatMoney } from "@/oncuex/format";
import { Note } from "./ui-bits";

export function IssuePlanEditor({ id, session }: { id: string; session: ReturnType<typeof useOperatorSession> }) {
  const kind = issueEditor(id);
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const snapshot = session.store.snapshot();
  const revision = session.store.assessmentRevision;
  const sources = session.review.data.sources.filter((source) => session.review.data.suggestions.some((item) => item.status === "concern" && item.projectId === snapshot.id && item.sourceIds.includes(source.id)));
  if (!kind) return null;
  let preview: ReturnType<typeof previewIssueChange> | null = null;
  let validation = "";
  if (value) { try { preview = previewIssueChange(session.store, proposedFields(session.store, kind, value, category)); } catch (error) { validation = error instanceof Error ? error.message : "The proposed change is invalid."; } }
  const oldValue = kind === "access" ? snapshot.crew.arrivalTime : kind === "runofshow" ? snapshot.production.runOfShowEnd : kind === "capacity" ? String(snapshot.location.capacity) : category ? formatMoney(snapshot.budget.commitments.find((item) => item.category === category)?.amount.minorUnits ?? 0, snapshot.budget.committedTotal.currency) : "Select a commitment";
  const label = kind === "access" ? "Crew call" : kind === "runofshow" ? "Run of show ends" : kind === "capacity" ? "Recorded venue capacity" : "Commitment amount";
  const apply = () => {
    const expectedRevision = revision;
    const outcome = session.apply("Plan change applied", (store) => {
      const fields = proposedFields(store, kind, value, category);
      store.adoptChange({ commandId: `issue-${crypto.randomUUID()}`, role: session.role, actor: session.persona.id, expectedAssessmentRevision: expectedRevision }, { id: `issue-${crypto.randomUUID()}`, title: `${label} changed after issue review`, ...(sourceId ? { sourceRefIds: [sourceId] } : {}), changedFields: fields });
      const after = store.assess();
      return `${after.requirements.filter((item) => item.status !== "supported").length} checks still need attention; ${after.readiness === "ready_for_review" ? "ready for review" : "not ready for review"}.`;
    });
    setResult(outcome.ok ? `${outcome.detail}${outcome.warning ? ` ${outcome.warning}` : ""}` : `Change not applied: ${outcome.detail}`);
    if (outcome.ok) setValue("");
  };
  return <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4"><h3 className="text-sm font-semibold">Review a plan change</h3><p className="text-xs leading-5 text-muted-foreground">Enter a planning value, not a partner confirmation. Changing the plan can invalidate supporting documents and an existing sign-off. No message is sent.</p>
    {kind === "budget" && <label className="block text-xs font-medium">Commitment<select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Choose a commitment</option>{snapshot.budget.commitments.map((item) => <option key={item.category} value={item.category}>{item.vendor} · {item.category}</option>)}</select></label>}
    <label className="block text-xs font-medium">{label} · current: {oldValue}<Input className="mt-1" type={kind === "access" || kind === "runofshow" ? "time" : "number"} min={kind === "capacity" ? 1 : 0} step={kind === "budget" ? "0.01" : "1"} value={value} onChange={(event) => { setValue(event.target.value); setResult(null); }} /></label>
    <label className="block text-xs font-medium">Related reviewed concern source (optional)<select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Manual planning assumption · no source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.channel} · {source.title}</option>)}</select></label>
    {sourceId && <p className="text-xs leading-5 text-muted-foreground">Source context, not verification: “{sources.find((source) => source.id === sourceId)?.rawText}”</p>}
    {validation && <p className="text-xs text-destructive">{validation}</p>}
    {preview && <div className="rounded-md border border-border bg-card p-3 text-xs leading-5"><p className="font-semibold">Before applying</p><p className="mt-1">{preview.impact?.impacted.requirementIds.length ?? 0} checks and {preview.impact?.impacted.evidenceIds.length ?? 0} documents may need review. {preview.assessment.requirements.filter((item) => item.status !== "supported").length} checks would remain unsupported.</p><ul className="mt-1 list-disc pl-4">{(preview.impact?.impacted.requirementIds ?? []).map((id) => <li key={id}>{session.store.requirements.find((req) => req.id === id)?.label ?? id}</li>)}</ul><p className="mt-1 text-muted-foreground">{session.store.latestDecision() ? "The current sign-off may become historical." : "This does not sign off the plan."} Source support is assessed separately.</p></div>}
    {session.role !== "project_manager" && <p className="text-xs text-warning">Only the simulated project manager can apply plan changes.</p>}
    <Button size="sm" disabled={!preview || session.role !== "project_manager"} onClick={apply}>Apply reviewed plan change</Button>
    {result && <Note tone="neutral">{result}</Note>}
  </div>;
}
