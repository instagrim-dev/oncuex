import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { useOperatorSession } from "@/hooks/use-operator-session";
import { formatDate } from "@/oncuex/format";
import { Panel } from "./ui-bits";

export function VenueComparison({ session }: { session: ReturnType<typeof useOperatorSession> }) {
  const snapshot = session.store.snapshot();
  const research = session.review.data.sources.find((source) => source.id === "research-pier");
  const [notes, setNotes] = useState(session.review.data.comparison ?? "");
  return <Panel eyebrow="Working comparison" title="Recorded venue and research candidate" description="A reusable comparison, not a booking or a recommendation. Availability and current terms are unverified.">
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current plan</p><p className="mt-1 font-medium">{snapshot.location.venueName}</p><p className="mt-1 text-xs text-muted-foreground">Recorded capacity {snapshot.location.capacity} · access {snapshot.location.loadingWindow.start}–{snapshot.location.loadingWindow.end}</p></div><div className="rounded-lg border border-border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fictional candidate · not selected</p>{research ? <><p className="mt-1 font-medium">{research.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{research.rawText}</p><p className="mt-1 text-xs text-muted-foreground">{research.author} · {formatDate(research.timestamp)} · {research.id} · quote and availability unknown</p></> : <p className="mt-1 text-xs text-muted-foreground">Import the fictional research source to compare its stated capacity and open questions.</p>}</div></div>
    <label className="mt-3 block text-xs font-medium">Selection rationale and open questions<Textarea className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record your comparison and what still needs checking" /></label><div className="mt-2 flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => session.review.saveComparison(notes)}>Save comparison</Button><span className="text-xs text-muted-foreground">Saved on this device with project data</span></div>
  </Panel>;
}
