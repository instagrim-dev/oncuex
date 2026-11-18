import { useCallback, useRef, useState } from "react";
import { emptyReview, importSource, isReviewData, reviewSuggestion, SAMPLE_SOURCES } from "@/oncuex/source-review";
import type { ReviewData, ReviewStatus, SourceItem, Suggestion } from "@/oncuex/source-review";
import { nextOutput } from "@/oncuex/retained-output";
import type { RetainedOutput } from "@/oncuex/retained-output";

const KEY = "oncuex.source-review.v1";
function read(): { data: ReviewData; damaged: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { data: emptyReview(), damaged: false };
    const value: unknown = JSON.parse(raw);
    if (isReviewData(value)) return { data: value, damaged: false };
  } catch { /* keep the original record untouched */ }
  return { data: emptyReview(), damaged: true };
}
export function useSourceReview() {
  const [boot] = useState(read);
  const [data, setData] = useState(boot.data);
  const currentRef = useRef(data);
  const blocked = useRef(boot.damaged);
  const [warning, setWarning] = useState<string | null>(boot.damaged ? "Saved source reviews could not be validated. The original was left untouched; restore a valid project export or deliberately start over." : null);
  const update = useCallback((fn: (current: ReviewData) => ReviewData, allowReplace = false) => {
    if (blocked.current && !allowReplace) return;
    const next = fn(currentRef.current);
    currentRef.current = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); blocked.current = false; setWarning(null); }
    catch { setWarning("Source review could not be saved on this device; changes are only in memory."); }
    setData(next);
  }, []);
  const add = useCallback((item: SourceItem) => update((current) => importSource(current, item)), [update]);
  const sync = useCallback(() => update((current) => SAMPLE_SOURCES.reduce(importSource, current)), [update]);
  const review = useCallback((id: string, status: ReviewStatus, reason?: string, date?: string, revision?: number) => update((current) => reviewSuggestion(current, id, status, reason, date, revision)), [update]);
  const assign = useCallback((id: string, projectId: string) => update((current) => ({ ...current, suggestions: current.suggestions.map((item) => item.id === id ? { ...item, projectId } : item), history: [`Project assigned to ${id}`, ...current.history] })), [update]);
  const addSuggestion = useCallback((item: Suggestion) => update((current) => current.suggestions.some((existing) => existing.id === item.id) ? current : { ...current, suggestions: [...current.suggestions, item], history: [`AI suggestion prepared for ${item.sourceIds.join(", ")}`, ...current.history] }), [update]);
  const saveComparison = useCallback((comparison: string) => update((current) => ({ ...current, comparison, history: ["Venue comparison updated", ...current.history] })), [update]);
  const saveOutput = useCallback((input: { projectId: string; title: string; body: string; sourceIds: string[]; concernIds: string[]; basis: string }): RetainedOutput => {
    let saved: RetainedOutput | null = null;
    update((current) => {
      saved = nextOutput(current.outputs ?? [], input);
      return { ...current, outputs: [...(current.outputs ?? []), saved], history: [`Client update version ${saved.version} saved for review`, ...current.history] };
    });
    if (!saved) throw new Error("The output could not be saved.");
    return saved;
  }, [update]);
  const replace = useCallback((next: ReviewData) => update(() => next, true), [update]);
  return { data, warning, add, sync, review, assign, addSuggestion, saveComparison, saveOutput, replace };
}
