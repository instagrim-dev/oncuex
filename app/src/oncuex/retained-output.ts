import type { Decision } from "./types";
import type { ReviewData, SourceItem, Suggestion } from "./source-review";

export interface RetainedOutput {
  id: string;
  projectId: string;
  kind: "client_update";
  version: number;
  supersedes?: string;
  title: string;
  body: string;
  sourceIds: string[];
  concernIds: string[];
  basis: string;
  savedAt: string;
}

export interface OutputBasisInput {
  revision: number;
  now: string;
  decisions: Decision[];
  sources: SourceItem[];
  suggestions: Suggestion[];
}

/** Basis excludes retained outputs and review history so saving a version does not make it stale. */
export function outputBasis(input: OutputBasisInput): string {
  return JSON.stringify({
    revision: input.revision,
    now: input.now,
    decisions: input.decisions.map((item) => [item.id, item.targetAssessmentRevision, item.requirementSetVersion]),
    sources: input.sources.map((item) => [item.id, item.contentDigest ?? ""]),
    suggestions: input.suggestions.map((item) => [item.id, item.status, item.reason ?? "", item.reviewedAt ?? ""]),
  });
}

export function isOutputStale(output: RetainedOutput, basis: string): boolean {
  return output.basis !== basis;
}

export function outputVersion(outputs: RetainedOutput[], projectId: string): number {
  return Math.max(0, ...outputs.filter((item) => item.projectId === projectId && item.kind === "client_update").map((item) => item.version)) + 1;
}

export function nextOutput(outputs: RetainedOutput[], input: { projectId: string; title: string; body: string; sourceIds: string[]; concernIds: string[]; basis: string }): RetainedOutput {
  if (!input.body.trim()) throw new Error("The output is empty.");
  if (!input.basis) throw new Error("The output needs a recorded basis.");
  const version = outputVersion(outputs, input.projectId);
  const previous = outputs
    .filter((item) => item.projectId === input.projectId && item.kind === "client_update")
    .sort((a, b) => b.version - a.version)[0];
  return {
    id: `OUT-${crypto.randomUUID()}`,
    projectId: input.projectId,
    kind: "client_update",
    version,
    ...(previous ? { supersedes: previous.id } : {}),
    title: input.title,
    body: input.body,
    sourceIds: [...new Set(input.sourceIds)],
    concernIds: [...new Set(input.concernIds)],
    basis: input.basis,
    savedAt: new Date().toISOString(),
  };
}

export function validateOutputs(value: unknown, review: ReviewData): RetainedOutput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const sourceIds = new Set(review.sources.map((item) => item.id));
  const suggestionIds = new Set(review.suggestions.map((item) => item.id));
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const output = entry as RetainedOutput;
    if (typeof output.id !== "string" || seen.has(output.id)) return null;
    if (typeof output.projectId !== "string" || output.kind !== "client_update") return null;
    if (!Number.isInteger(output.version) || output.version < 1) return null;
    if (typeof output.title !== "string" || typeof output.body !== "string" || typeof output.basis !== "string" || typeof output.savedAt !== "string") return null;
    if (!Array.isArray(output.sourceIds) || !output.sourceIds.every((id) => typeof id === "string" && sourceIds.has(id))) return null;
    if (!Array.isArray(output.concernIds) || !output.concernIds.every((id) => typeof id === "string" && suggestionIds.has(id))) return null;
    seen.add(output.id);
  }
  return value as RetainedOutput[];
}
