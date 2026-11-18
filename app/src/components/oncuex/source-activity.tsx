import { useState } from "react";
import { ArrowRight, FileText, Inbox, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { useSourceReview } from "@/hooks/use-source-review";
import { SAMPLE_SOURCES, validAiSuggestion } from "@/oncuex/source-review";
import type { Channel, SourceItem, Suggestion } from "@/oncuex/source-review";
import { formatDateTime } from "@/oncuex/format";
import { callOncuexAI } from "@/lib/ai-client";

type Review = ReturnType<typeof useSourceReview>;
const CHANNELS: (Channel | "All")[] = ["All", "Gmail", "Slack", "iMessage", "Zoom", "Research", "Manual"];

export function SourcesDialog({ review, open, onOpenChange, onActivity }: { review: Review; open: boolean; onOpenChange: (value: boolean) => void; onActivity: () => void }) {
  const [filter, setFilter] = useState<Channel | "All">("All");
  const [selected, setSelected] = useState<SourceItem | null>(null);
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const all = [...SAMPLE_SOURCES, ...review.data.sources.filter((item) => item.origin === "manual")];
  const shown = all.filter((item) => filter === "All" || item.channel === filter);
  const imported = new Set(review.data.sources.map((item) => item.id));
  const suggestWithAI = async (item: SourceItem) => {
    if (item.origin !== "simulated") return;
    setAiBusy(true); setAiMessage(null);
    const result = await callOncuexAI<{ title: string; kind: Suggestion["kind"]; excerpt: string; consequence: string }>("suggest_source", { sourceText: item.rawText });
    setAiBusy(false);
    if (!result.ok) { setAiMessage(`AI suggestion unavailable: ${result.error}. Prepared suggestions remain available for review.`); return; }
    const value = result.data;
    if (!validAiSuggestion(value, item.rawText)) { setAiMessage("AI returned an invalid or unsupported suggestion; the plan is unchanged."); return; }
    review.addSuggestion({ id: `ai-${item.id}`, title: value.title, kind: value.kind, excerpt: value.excerpt, consequence: value.consequence, sourceIds: [item.id], status: "needs_review", projectId: item.projectId, workArea: "Review association", suggestedBy: "ai" });
    setAiMessage(`AI suggestion added to Activity · ${result.run.model}. It is not a verified fact.`);
  };
  const addManual = () => {
    if (!description.trim() || !text.trim()) return;
    const id = crypto.randomUUID();
    review.add({ id, channel: "Manual", origin: "manual", externalId: id, threadId: id, author: "Manually entered", timestamp: new Date().toISOString(), timezone: "UTC", projectId: null, title: description.trim(), rawText: text.trim(), attachments: [], locator: "Manual entry" });
    setDescription(""); setText(""); setFilter("Manual");
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Sources</DialogTitle><DialogDescription>Inspect the original context before bringing it into the review queue.</DialogDescription></DialogHeader>
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-foreground">Simulated source browser · No accounts connected; no messages sent. All examples are fictional.</div>
    {review.warning && <p className="text-xs text-destructive">{review.warning}</p>}
    <div className="flex flex-wrap gap-1.5">{CHANNELS.map((channel) => <Button key={channel} size="sm" variant={filter === channel ? "default" : "outline"} onClick={() => { setFilter(channel); setSelected(null); }}>{channel}</Button>)}</div>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={review.sync}><RefreshCw className="size-3.5" /> Simulate sync</Button><Button size="sm" variant="ghost" onClick={onActivity}>Open Activity <ArrowRight className="size-3.5" /></Button></div>
    <div className="grid gap-3 md:grid-cols-[1fr_1.1fr]"><div className="space-y-2">{shown.map((item) => <button type="button" key={item.id} onClick={() => setSelected(item)} className="w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50"><div className="flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary"><span>{item.channel} · {item.origin === "manual" ? "Manual" : "Simulated source"}</span><span>{imported.has(item.id) ? item.origin === "manual" ? "Saved" : "Imported" : "Not imported"}</span></div><p className="mt-1 text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.author} · {formatDateTime(item.timestamp)}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.rawText}</p></button>)}</div>
      <div className="rounded-lg border border-border bg-muted/20 p-4">{selected ? <div className="space-y-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{selected.channel} · {selected.origin === "manual" ? "Manually entered" : "Simulated source"}</div><h3 className="font-serif text-xl">{selected.title}</h3><p className="text-xs text-muted-foreground">{selected.author} · {formatDateTime(selected.timestamp)} · {selected.timezone}</p><p className="text-xs text-muted-foreground">{selected.projectId ? "Sample project association" : "Project association uncertain"}{selected.supersedes ? ` · Corrects ${selected.supersedes}` : ""}</p><p className="whitespace-pre-wrap text-sm leading-6">{selected.rawText}</p>{selected.attachments.map((attachment) => <p key={attachment} className="rounded-md border border-border p-2 text-xs text-muted-foreground"><FileText className="mr-1 inline size-3.5" />{attachment}</p>)}<Button size="sm" onClick={() => review.add(selected)} disabled={imported.has(selected.id)}>{imported.has(selected.id) ? "Already imported" : "Import for review"}</Button> {selected.origin === "simulated" && imported.has(selected.id) && <Button size="sm" variant="outline" disabled={aiBusy || review.data.suggestions.some((s) => s.id === `ai-${selected.id}`)} onClick={() => void suggestWithAI(selected)}>{aiBusy ? "Requesting…" : "Suggest with AI"}</Button>}{aiMessage && <p className="text-xs text-muted-foreground">{aiMessage}</p>}<p className="text-xs text-muted-foreground">{review.data.suggestions.filter((s) => s.sourceIds.includes(selected.id)).length} linked Activity items · AI requests use fictional sources only</p></div> : <p className="text-sm text-muted-foreground">Choose a source to inspect its original text, participant and context.</p>}</div></div>
    <div className="space-y-2 border-t border-border pt-4"><h3 className="text-sm font-semibold">Add a manual note</h3><p className="text-xs text-muted-foreground">The original text is retained and marked manual, not imported from an account.</p><Input aria-label="Source description" placeholder="Source description" value={description} onChange={(e) => setDescription(e.target.value)} /><Textarea aria-label="Original note" placeholder="Paste the original text" value={text} onChange={(e) => setText(e.target.value)} /><Button size="sm" variant="outline" disabled={!description.trim() || !text.trim()} onClick={addManual}>Save manual source</Button></div>
  </DialogContent></Dialog>;
}

function ReviewCard({ item, review, projectId, revision }: { item: Suggestion; review: Review; projectId: string; revision: number }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const sources = item.sourceIds.map((id) => review.data.sources.find((source) => source.id === id)).filter((source): source is SourceItem => Boolean(source));
  return <article className="rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-accent px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">{item.kind}</span><span className="text-[11px] text-muted-foreground">{item.workArea} · {item.status.replaceAll("_", " ")} · {item.suggestedBy === "ai" ? "AI suggestion" : item.suggestedBy === "manual" ? "Manual note" : "Prepared sample suggestion"}</span></div><h3 className="mt-2 font-medium">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.consequence}</p><blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-xs leading-5">“{item.excerpt}”</blockquote><div className="mt-2 space-y-1">{sources.map((source) => <div key={source.id} className="rounded border border-border/60 p-2"><p className="text-[11px] text-muted-foreground">{source.channel} · {source.author} · {formatDateTime(source.timestamp)} · {source.origin === "simulated" ? "simulated" : "manual"}</p><p className="mt-1 text-xs leading-5">“{source.rawText}”</p></div>)}</div>{item.sourceIds.filter((id) => !sources.some((source) => source.id === id)).map((id) => <p key={id} className="mt-1 text-xs text-warning">Related source {id} has not been imported yet.</p>)}{item.reason && <p className="mt-2 text-xs text-muted-foreground">Review note: {item.reason}</p>}
    {!item.projectId ? <div className="mt-3"><p className="text-xs text-warning">Project match is uncertain. Assign it before taking action.</p><Button className="mt-2" size="sm" variant="outline" onClick={() => review.assign(item.id, projectId)}>Assign to current project</Button></div> : item.status === "needs_review" || item.status === "deferred" || item.status === "clarification" ? <div className="mt-3 space-y-2"><Input aria-label={`Review note for ${item.title}`} placeholder="Reason or clarification (required for dismissal)" value={reason} onChange={(e) => setReason(e.target.value)} /><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => review.review(item.id, "concern", reason)}>Accept as concern</Button><Button size="sm" variant="outline" disabled={!reason.trim()} onClick={() => review.review(item.id, "dismissed", reason)}>Dismiss</Button><Button size="sm" variant="outline" onClick={() => review.review(item.id, "deferred", reason, date)}>Defer</Button><Button size="sm" variant="outline" onClick={() => review.review(item.id, "clarification", reason || `Clarify: ${item.title}`)}>Ask for clarification</Button></div><label className="text-[11px] text-muted-foreground">Optional revisit date <input className="ml-2 rounded border border-input bg-background px-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div> : item.status === "concern" ? <div className="mt-3 space-y-2"><Input aria-label={`Resolution for ${item.title}`} placeholder="Resolution rationale and supporting material" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="outline" disabled={!reason.trim()} onClick={() => review.review(item.id, "resolved", reason, "", revision)}>Resolve concern</Button></div> : null}</article>;
}

export function ActivityDialog({ review, open, onOpenChange, projectId, revision, history, onSources, onWork }: { review: Review; open: boolean; onOpenChange: (value: boolean) => void; projectId: string; revision: number; history: string[]; onSources: () => void; onWork: () => void }) {
  const needs = review.data.suggestions.filter((item) => ["needs_review", "deferred", "clarification"].includes(item.status));
  const concerns = review.data.suggestions.filter((item) => item.status === "concern");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Activity</DialogTitle><DialogDescription>One place to review suggestions and follow open concerns. Review does not verify a claim or change the plan.</DialogDescription></DialogHeader>
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-5">Prepared examples and AI suggestions are labeled separately. Every suggestion requires human review. Clarifications are internal and unsent; no external messages are sent.</div>
    {review.warning && <p className="text-xs text-destructive">{review.warning}</p>}
    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={onSources}><Inbox className="size-3.5" /> Browse sources</Button><Button size="sm" variant="ghost" onClick={onWork}><ArrowRight className="size-3.5" /> Open checklist</Button></div>
    <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-serif text-xl">Needs review</h2><span className="text-xs text-muted-foreground">{needs.length} items</span></div>{needs.length ? needs.map((item) => <ReviewCard key={item.id} item={item} review={review} projectId={projectId} revision={revision} />) : <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No suggestions to review. Import a simulated source to begin.</p>}</section>
    <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-serif text-xl">Open concerns</h2><span className="text-xs text-muted-foreground">{concerns.length} concerns</span></div>{concerns.length ? concerns.map((item) => <ReviewCard key={item.id} item={item} review={review} projectId={projectId} revision={revision} />) : <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No accepted concerns yet.</p>}</section>
    {review.data.suggestions.filter((item) => item.status === "resolved" && ((item.resolvedRevision !== undefined && item.resolvedRevision !== revision) || review.data.sources.some((source) => source.supersedes && item.sourceIds.includes(source.supersedes)))).map((item) => <p key={item.id} className="rounded border border-warning/30 bg-warning/5 p-3 text-xs">The plan or a related source changed since “{item.title}” was resolved. Review the earlier resolution; it has not been changed automatically.</p>)}
    <section className="space-y-2"><h2 className="font-serif text-xl">Recent activity</h2>{review.data.history.length || history.length ? <ul className="space-y-2">{[...review.data.history, ...history].slice(0, 30).map((entry, index) => <li key={`${index}-${entry}`} className="flex gap-2 text-xs text-muted-foreground"><MessageSquare className="size-3.5 shrink-0" />{entry}</li>)}</ul> : <p className="text-xs text-muted-foreground">Imports and reviews will appear here.</p>}</section>
  </DialogContent></Dialog>;
}
