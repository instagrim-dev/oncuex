import { supabase } from "@/integrations/supabase/client";

export interface BriefProposal {
  client: string | null;
  project: string | null;
  eventDate: string | null;
  guestCount: number | null;
  approvedBudget: { currency: string; minorUnits: number } | null;
  timezone: string | null;
  openQuestions: string[];
  sourceSpans: { field: string; quote: string }[];
  uncertainties: string[];
  questions: string[];
}

export interface AiRun {
  id: string;
  action: "extract_brief" | "draft_update";
  at: string;
  durationMs: number;
  status: "ok" | "error";
  model: string;
  responseId: string | null;
  detail: string;
}

export interface AiSuccess<T> {
  ok: true;
  data: T;
  run: AiRun;
}

export interface AiFailure {
  ok: false;
  error: string;
  run: AiRun;
}

const RUNS_KEY = "oncuex.ai.runs.v1";
const SESSION_KEY = "oncuex.ai.session.v1";
const MODEL_LABEL = "GPT 5.6 Terra";

function sessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function aiRuns(): AiRun[] {
  try {
    const raw = window.localStorage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AiRun[]) : [];
  } catch {
    return [];
  }
}

function recordRun(run: AiRun): void {
  try {
    const runs = [run, ...aiRuns()].slice(0, 20);
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // Diagnostics are best-effort and never block the proposal.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateBriefProposal(value: unknown): { ok: true; proposal: BriefProposal } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "The proposal is not an object." };
  const strings = (input: unknown) =>
    Array.isArray(input) && input.every((entry) => typeof entry === "string");
  if (typeof value.client !== "string" && value.client !== null) {
    return { ok: false, error: "Client is invalid." };
  }
  if (typeof value.project !== "string" && value.project !== null) {
    return { ok: false, error: "Project is invalid." };
  }
  if (
    value.eventDate !== null &&
    (typeof value.eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate))
  ) {
    return { ok: false, error: "Date is invalid." };
  }
  if (value.guestCount !== null && !Number.isInteger(value.guestCount)) {
    return { ok: false, error: "Guest count is invalid." };
  }
  if (value.approvedBudget !== null) {
    if (
      !isRecord(value.approvedBudget) ||
      typeof value.approvedBudget.currency !== "string" ||
      !Number.isInteger(value.approvedBudget.minorUnits)
    ) {
      return { ok: false, error: "Budget is invalid." };
    }
  }
  if (value.timezone !== null && typeof value.timezone !== "string") {
    return { ok: false, error: "Timezone is invalid." };
  }
  if (!strings(value.openQuestions) || !strings(value.uncertainties) || !strings(value.questions)) {
    return { ok: false, error: "Question or uncertainty fields are invalid." };
  }
  if (!Array.isArray(value.sourceSpans)) {
    return { ok: false, error: "Source spans are missing." };
  }
  for (const span of value.sourceSpans) {
    if (!isRecord(span) || typeof span.field !== "string" || typeof span.quote !== "string") {
      return { ok: false, error: "A source span is invalid." };
    }
  }
  return { ok: true, proposal: value as unknown as BriefProposal };
}

export async function callOncuexAI<T>(
  action: "extract_brief" | "draft_update",
  payload: { briefText?: string; project?: unknown },
): Promise<AiSuccess<T> | AiFailure> {
  const started = performance.now();
  const at = new Date().toISOString();
  try {
    const { data, error } = await supabase.functions.invoke("oncuex-ai", {
      body: { action, ...payload },
      headers: { "X-Session-ID": sessionId() },
    });

    if (error) {
      let detail = error.message || "The AI request failed.";
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.clone().json() as { error?: { message?: string } };
          if (body.error?.message) detail = body.error.message;
        } catch {
          // Keep the Functions error message.
        }
      }
      const run: AiRun = {
        id: crypto.randomUUID(),
        action,
        at,
        durationMs: Math.round(performance.now() - started),
        status: "error",
        model: MODEL_LABEL,
        responseId: null,
        detail,
      };
      recordRun(run);
      return { ok: false, error: detail, run };
    }

    const envelope = data as {
      ok?: boolean;
      data?: T;
      error?: { message?: string };
      model?: string;
      responseId?: string | null;
    };
    if (!envelope?.ok || envelope.data === undefined) {
      const detail = envelope?.error?.message || "The AI response was not usable.";
      const run: AiRun = {
        id: crypto.randomUUID(),
        action,
        at,
        durationMs: Math.round(performance.now() - started),
        status: "error",
        model: envelope?.model ?? MODEL_LABEL,
        responseId: envelope?.responseId ?? null,
        detail,
      };
      recordRun(run);
      return { ok: false, error: detail, run };
    }

    const run: AiRun = {
      id: crypto.randomUUID(),
      action,
      at,
      durationMs: Math.round(performance.now() - started),
      status: "ok",
      model: envelope.model ?? MODEL_LABEL,
      responseId: envelope.responseId ?? null,
      detail: envelope.responseId ? `Response ${envelope.responseId}` : "Response received",
    };
    recordRun(run);
    return { ok: true, data: envelope.data, run };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The AI request failed.";
    const run: AiRun = {
      id: crypto.randomUUID(),
      action,
      at,
      durationMs: Math.round(performance.now() - started),
      status: "error",
      model: MODEL_LABEL,
      responseId: null,
      detail,
    };
    recordRun(run);
    return { ok: false, error: detail, run };
  }
}
