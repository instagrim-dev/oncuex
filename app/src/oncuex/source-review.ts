import { digest } from "./schema";

export type Channel = "Gmail" | "Slack" | "iMessage" | "Zoom" | "Research" | "Manual";
export type ReviewStatus = "needs_review" | "concern" | "dismissed" | "deferred" | "clarification" | "resolved";

export interface SourceItem {
  id: string;
  channel: Channel;
  origin: "simulated" | "manual";
  externalId: string;
  threadId: string;
  author: string;
  timestamp: string;
  timezone: string;
  projectId: string | null;
  title: string;
  rawText: string;
  attachments: string[];
  locator: string;
  contentDigest?: string;
  supersedes?: string;
}

export interface Suggestion {
  id: string;
  sourceIds: string[];
  title: string;
  kind: "risk" | "question" | "action" | "decision" | "change" | "conflict";
  excerpt: string;
  consequence: string;
  status: ReviewStatus;
  projectId: string | null;
  workArea: string;
  reason?: string;
  revisitDate?: string;
  reviewedAt?: string;
  resolvedRevision?: number;
  suggestedBy?: "ai" | "sample" | "manual";
}

export interface ReviewData { sources: SourceItem[]; suggestions: Suggestion[]; history: string[]; comparison?: string }
export const emptyReview = (): ReviewData => ({ sources: [], suggestions: [], history: [] });
export function isReviewData(value: unknown): value is ReviewData {
  if (!value || typeof value !== "object") return false;
  const data = value as ReviewData;
  if (!Array.isArray(data.sources) || !Array.isArray(data.suggestions) || !Array.isArray(data.history) || !data.history.every((s) => typeof s === "string")) return false;
  const sourceIds = new Set(data.sources.map((s) => s?.id));
  if (sourceIds.size !== data.sources.length || new Set(data.suggestions.map((s) => s?.id)).size !== data.suggestions.length) return false;
  if (data.comparison !== undefined && typeof data.comparison !== "string") return false;
  return data.sources.every((s) => s && typeof s.id === "string" && typeof s.externalId === "string" && typeof s.threadId === "string" && typeof s.rawText === "string" && typeof s.author === "string" && typeof s.timestamp === "string" && typeof s.timezone === "string" && typeof s.title === "string" && typeof s.locator === "string" && (s.projectId === null || typeof s.projectId === "string") && ["Gmail", "Slack", "iMessage", "Zoom", "Research", "Manual"].includes(s.channel) && ["simulated", "manual"].includes(s.origin) && Array.isArray(s.attachments) && s.attachments.every((a) => typeof a === "string") && (!s.contentDigest || s.contentDigest === digest({ id: s.id, rawText: s.rawText }))) && data.suggestions.every((s) => s && typeof s.id === "string" && Array.isArray(s.sourceIds) && s.sourceIds.some((id) => sourceIds.has(id)) && s.sourceIds.every((id) => typeof id === "string") && typeof s.excerpt === "string" && typeof s.title === "string" && typeof s.consequence === "string" && typeof s.workArea === "string" && (s.projectId === null || typeof s.projectId === "string") && ["risk", "question", "action", "decision", "change", "conflict"].includes(s.kind) && ["needs_review", "concern", "dismissed", "deferred", "clarification", "resolved"].includes(s.status));
}
export const ADAPTER_CAPABILITIES: Record<Channel, { readOnly: boolean; attachments: boolean; sourceTypes: string[] }> = {
  Gmail: { readOnly: true, attachments: true, sourceTypes: ["email"] }, Slack: { readOnly: true, attachments: false, sourceTypes: ["thread"] },
  iMessage: { readOnly: true, attachments: false, sourceTypes: ["message"] }, Zoom: { readOnly: true, attachments: false, sourceTypes: ["transcript"] },
  Research: { readOnly: true, attachments: false, sourceTypes: ["web excerpt"] }, Manual: { readOnly: false, attachments: false, sourceTypes: ["note"] },
};
const projectId = "PRJ-oncuex-launch";
const source = (id: string, channel: Channel, title: string, author: string, timestamp: string, rawText: string, attachments: string[] = [], supersedes?: string, assigned = true): SourceItem => ({ id, channel, origin: "simulated", externalId: id, threadId: `thread-${id}`, author, timestamp, timezone: "America/Los_Angeles", projectId: assigned ? projectId : null, title, rawText, attachments, locator: `Fictional ${channel} record`, ...(supersedes ? { supersedes } : {}) });

export const SAMPLE_SOURCES: SourceItem[] = [
  source("mail-venue", "Gmail", "Northwind launch: a possible move", "Elena Park · client", "2027-02-24T17:00:00Z", "Could we move the Northwind launch from Foundry Hall to Pier 9 Loft? Please explore a budget ceiling of $32,000; this is a proposal, not an approval.", ["Pier 9 venue pack.pdf — unavailable for extraction"]),
  source("slack-loadin", "Slack", "#northwind-launch · load-in", "Ana Duarte · producer", "2027-02-24T18:00:00Z", "Pier 9 access is listed as 06:00–07:30. With a 07:00 crew call and 45 minutes to set the first panel, we may miss the access window. Can we confirm freight access?"),
  source("zoom-followup", "Zoom", "Northwind production discussion", "Rowan Iyer · producer", "2027-02-25T18:00:00Z", "00:12 Rowan: Please have Priya check whether the annex extends the loading window. We have not agreed to the venue move or the proposed budget. 00:19 Priya: I will follow up; the freight lift remains an open question."),
  source("imessage-photo", "iMessage", "Photography delivery", "Elena Park · client", "2027-02-25T19:30:00Z", "We would love the edited photos within a week if possible, but please tell us what is realistic."),
  source("research-pier", "Research", "Pier 9 Loft · fictional venue candidate", "Priya Nandakumar · research", "2027-02-25T20:00:00Z", "Fictional research excerpt: the loft lists a capacity of 110; an adjoining annex is described as increasing capacity to 140. Verify availability and the current licensed occupancy.", ["Fictional URL: https://example.invalid/pier-9 — not verified"]),
  source("mail-correction", "Gmail", "Correction: proposed budget", "Elena Park · client", "2027-02-26T18:00:00Z", "Correction: please explore a $31,500 ceiling rather than $32,000. Neither amount is approved.", [], "mail-venue"),
  source("slack-unmatched", "Slack", "#production · project unclear", "Ana Duarte · producer", "2027-02-26T19:00:00Z", "The scenic panel delivery might need an earlier loading slot. Which launch is this for?", [], undefined, false),
];

const sampleSuggestions: Record<string, Omit<Suggestion, "sourceIds" | "status" | "projectId">> = {
  "mail-venue": { id: "suggest-mail", title: "Client proposed a different venue and budget", kind: "change", excerpt: "Could we move the Northwind launch from Foundry Hall to Pier 9 Loft? Please explore a budget ceiling of $32,000; this is a proposal, not an approval.", consequence: "The venue, access and costs may need a reviewed change.", workArea: "Venue and budget" },
  "slack-loadin": { id: "suggest-loadin", title: "Proposed access may not cover setup", kind: "risk", excerpt: "With a 07:00 crew call and 45 minutes to set the first panel, we may miss the access window.", consequence: "Crew and venue work may need coordination if the proposal is adopted.", workArea: "Venue and crew" },
  "zoom-followup": { id: "suggest-zoom", title: "Check annex access and the freight lift", kind: "action", excerpt: "Please have Priya check whether the annex extends the loading window.", consequence: "A follow-up is proposed; the question remains open until reviewed.", workArea: "Venue and crew" },
  "imessage-photo": { id: "suggest-photo", title: "Client expressed a photography preference", kind: "question", excerpt: "We would love the edited photos within a week if possible, but please tell us what is realistic.", consequence: "Clarify whether the preference changes the agreed scope.", workArea: "Photography" },
  "research-pier": { id: "suggest-capacity", title: "Candidate capacity needs verification", kind: "risk", excerpt: "the loft lists a capacity of 110; an adjoining annex is described as increasing capacity to 140.", consequence: "Availability and licensed capacity remain unknown.", workArea: "Venue" },
  "mail-correction": { id: "suggest-correction", title: "Client corrected the proposed ceiling", kind: "conflict", excerpt: "please explore a $31,500 ceiling rather than $32,000. Neither amount is approved.", consequence: "The later proposal supersedes the earlier amount, but neither is approved.", workArea: "Budget" },
  "slack-unmatched": { id: "suggest-unmatched", title: "Project match needs review", kind: "question", excerpt: "The scenic panel delivery might need an earlier loading slot. Which launch is this for?", consequence: "Assign a project before using this suggestion.", workArea: "Crew" },
};

export function importSource(data: ReviewData, item: SourceItem): ReviewData {
  if (data.sources.some((existing) => existing.id === item.id || (existing.channel === item.channel && existing.externalId === item.externalId))) return data;
  const candidate = sampleSuggestions[item.id];
  const suggestion: Suggestion | null = candidate ? { ...candidate, sourceIds: item.supersedes ? [item.supersedes, item.id] : [item.id], status: "needs_review", projectId: item.projectId, suggestedBy: "sample" } : item.origin === "manual" ? { id: `suggest-${item.id}`, sourceIds: [item.id], title: `Review manual note: ${item.title}`, kind: "question", excerpt: item.rawText, consequence: "Review the note and assign it to a project before follow-through.", status: "needs_review", projectId: item.projectId, workArea: "Unassigned", suggestedBy: "manual" } : null;
  const retained = { ...item, contentDigest: digest({ id: item.id, rawText: item.rawText }) };
  return { ...data, sources: [...data.sources, retained], suggestions: suggestion ? [...data.suggestions, suggestion] : data.suggestions, history: [`Imported ${item.channel}: ${item.title}`, ...data.history] };
}

export function isDraftStale(draft: string, draftBasis: string | null, currentBasis: string): boolean {
  return Boolean(draft && draftBasis && draftBasis !== currentBasis);
}

export function validAiSuggestion(value: unknown, sourceText: string): value is { title: string; kind: Suggestion["kind"]; excerpt: string; consequence: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && item.title.trim().length > 0 && typeof item.consequence === "string" && item.consequence.trim().length > 0 && typeof item.excerpt === "string" && item.excerpt.length >= 8 && sourceText.includes(item.excerpt) && typeof item.kind === "string" && ["risk", "question", "action", "decision", "change", "conflict"].includes(item.kind);
}

export function reviewSuggestion(data: ReviewData, id: string, status: ReviewStatus, reason = "", revisitDate = "", revision?: number): ReviewData {
  const item = data.suggestions.find((entry) => entry.id === id);
  if (!item || (!item.projectId && status !== "needs_review") || (["dismissed", "resolved"].includes(status) && !reason.trim())) return data;
  return { ...data, suggestions: data.suggestions.map((entry) => entry.id === id ? { ...entry, status, reason, revisitDate, reviewedAt: new Date().toISOString(), ...(status === "resolved" ? { resolvedRevision: revision } : {}) } : entry), history: [`${item.title} · ${status.replaceAll("_", " ")}${reason ? `: ${reason}` : ""}`, ...data.history] };
}
