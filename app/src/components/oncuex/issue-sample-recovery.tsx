import { Button } from "@/components/ui/button";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { adoptRecovery, adoptedChangeIds } from "@/oncuex/demo";
import { BRIEF, EVIDENCE, PROJECT_ID, RECOVERY_EVIDENCE_IDS, venueChange } from "@/oncuex/scenario";
import { bindingMatches } from "@/oncuex/schema";
import { Store } from "@/oncuex/store";
import { formatDate } from "@/oncuex/format";
import { Note } from "./ui-bits";
import { useState } from "react";

export function IssueSampleRecovery({ session, requirementIds }: { session: ReturnType<typeof useOperatorSession>; requirementIds: string[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const store = session.store;
  const snapshot = store.snapshot();
  const changes = adoptedChangeIds(store);
  const brief = snapshot.brief as { client?: string; project?: string; eventDate?: string };
  const isSample = snapshot.id === PROJECT_ID && brief.client === BRIEF.client && brief.project === BRIEF.project && brief.eventDate === BRIEF.eventDate;
  const sampleMove = isSample && changes.includes("CHG-1") && !changes.includes("CHG-2") && Object.keys(venueChange(snapshot).changedFields).length === 0;
  let preview: Store | null = null;
  if (sampleMove) { try { preview = Store.fromExport(store.export()); adoptRecovery(preview); } catch { preview = null; } }
  const used = new Set([...store.evidence.map((item) => item.id), ...store.archivedEvidence.map((item) => item.evidence.id)]);
  const candidates = EVIDENCE.filter((record) => isSample && RECOVERY_EVIDENCE_IDS.includes(record.id) && requirementIds.includes(record.requirementId) && !used.has(record.id) && record.observedAt <= store.now() && record.expiresAt > store.now() && Object.entries(record.boundFieldVersions).every(([path, value]) => bindingMatches(path, value, snapshot)));
  if (!preview && !candidates.length) return null;
  return <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4"><p className="text-sm font-semibold">Prepared sample options</p><p className="text-xs text-muted-foreground">Fictional documents and changes only; these do not contact or confirm a real partner.</p>
    {preview && <div className="space-y-2"><p className="text-xs leading-5">The prepared annex recovery changes venue access, capacity, schedule and commitments together. After the change, {preview.assess().requirements.filter((item) => item.status !== "supported").length} checks would still need attention; supporting documents must be reviewed separately. Any current sign-off becomes historical.</p><Button size="sm" variant="outline" disabled={session.role !== "project_manager"} onClick={() => { const expected = store.assessmentRevision; const outcome = session.apply("Sample recovery applied", (current) => { if (current.assessmentRevision !== expected || Object.keys(venueChange(current.snapshot()).changedFields).length) throw new Error("The plan changed; review the recovery again."); if (session.role !== "project_manager") throw new Error("Only the project manager can apply this change."); adoptRecovery(current); return `${current.assess().requirements.filter((item) => item.status !== "supported").length} checks still need attention.`; }); setNotice(outcome.ok ? `${outcome.detail}${outcome.warning ? ` ${outcome.warning}` : ""}` : `Recovery not applied: ${outcome.detail}`); }}>Apply prepared sample recovery</Button></div>}
    {candidates.map((record) => <div key={record.id} className="rounded-md border border-border bg-card p-3"><p className="text-xs font-medium">Sample document for {store.requirements.find((req) => req.id === record.requirementId)?.label ?? record.requirementId}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">“{record.sourceExcerpt}” · valid to {formatDate(record.expiresAt)}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => { const expected = store.assessmentRevision; const outcome = session.apply("Sample document attached", (current) => { if (session.role !== "project_manager" && session.role !== "contributor") throw new Error("A review role is required."); if (record.observedAt > current.now() || record.expiresAt <= current.now() || !Object.entries(record.boundFieldVersions).every(([path, value]) => bindingMatches(path, value, current.snapshot()))) throw new Error("The sample document no longer matches this plan or review clock."); current.attachEvidence({ commandId: `sample-evidence-${crypto.randomUUID()}`, role: session.role, actor: session.persona.id, expectedAssessmentRevision: expected }, structuredClone(record)); return `${current.assess().requirements.filter((item) => item.status !== "supported").length} checks still need attention. This is fictional evidence.`; }); setNotice(outcome.ok ? `${outcome.detail}${outcome.warning ? ` ${outcome.warning}` : ""}` : `Document not attached: ${outcome.detail}`); }}>Attach this sample document</Button></div>)}
    {notice && <Note tone="neutral">{notice}</Note>}
  </div>;
}
