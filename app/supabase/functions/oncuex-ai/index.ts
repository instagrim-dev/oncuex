const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-id",
};

const MODEL = "openai/gpt-5.6-terra";
const API_URL = "https://api.enter.pro/code/api/v1/ai/responses";
const PROJECT_ID = "d606ece3407d419a80272571af62bfd2";
const TOKEN_NAME = "AI_API_TOKEN_d606ece3407d";

const EXTRACT_SYSTEM = `You extract facts from a client event brief for a producer.
Return ONLY valid JSON with this shape:
{
  "client": string|null,
  "project": string|null,
  "eventDate": "YYYY-MM-DD"|null,
  "guestCount": number|null,
  "approvedBudget": {"currency": string, "minorUnits": number}|null,
  "timezone": string|null,
  "openQuestions": string[],
  "sourceSpans": [{"field": string, "quote": string}],
  "uncertainties": string[],
  "questions": string[]
}
Rules:
- Never invent a value. Use null when the brief does not state it.
- Every non-null fact must have a sourceSpans entry whose quote is copied exactly from the brief.
- Do not infer a city, venue, owner, date, guest count or budget.
- minorUnits must be an integer number of cents (for example 3000000 for $30,000).
- Put missing or ambiguous information in uncertainties, and questions for the producer in questions.
- openQuestions are questions the client or brief explicitly leaves open.
- Return no prose outside the JSON.`;

const DRAFT_SYSTEM = `You write a short client update for an event producer to review.
Use ONLY the supplied project facts. Return ONLY JSON: {"draft": string}.
Rules:
- Do not claim a partner confirmed, accepted, booked or is available unless the supplied state explicitly says so.
- Do not claim the plan is approved or signed off unless the supplied state says it is current.
- Distinguish what is reviewed and current, what needs a new document, and what is still open.
- Do not invent dates, amounts, people, venues or tasks.
- Mention the open questions if any.
- Keep it to 120-180 words, plain professional prose, no tables or markdown headings.
- This is an unsent draft; do not say it has been sent.`;

function textFromResponse(payload: unknown): string {
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validateExtraction(
  raw: Record<string, unknown>,
  briefText: string,
): Record<string, unknown> {
  const nullableString = (value: unknown) => value === null || typeof value === "string";
  if (!nullableString(raw.client) || !nullableString(raw.project)) {
    throw new Error("Extraction returned an invalid client or project.");
  }
  if (raw.eventDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.eventDate))) {
    throw new Error("Extraction returned an invalid date.");
  }
  if (raw.guestCount !== null && !Number.isInteger(raw.guestCount)) {
    throw new Error("Extraction returned an invalid guest count.");
  }
  if (raw.approvedBudget !== null) {
    const budget = raw.approvedBudget as { currency?: unknown; minorUnits?: unknown };
    if (
      typeof budget !== "object" ||
      budget === null ||
      typeof budget.currency !== "string" ||
      !Number.isInteger(budget.minorUnits)
    ) {
      throw new Error("Extraction returned an invalid budget.");
    }
  }
  if (raw.timezone !== null && typeof raw.timezone !== "string") {
    throw new Error("Extraction returned an invalid timezone.");
  }
  if (!isStringArray(raw.openQuestions) || !isStringArray(raw.uncertainties) || !isStringArray(raw.questions)) {
    throw new Error("Extraction returned invalid question or uncertainty lists.");
  }
  if (!Array.isArray(raw.sourceSpans)) {
    throw new Error("Extraction returned no source spans.");
  }
  for (const span of raw.sourceSpans) {
    if (
      typeof span !== "object" ||
      span === null ||
      typeof (span as { field?: unknown }).field !== "string" ||
      typeof (span as { quote?: unknown }).quote !== "string" ||
      !briefText.includes((span as { quote: string }).quote)
    ) {
      throw new Error("An extracted source span does not appear in the brief.");
    }
  }
  return {
    client: raw.client,
    project: raw.project,
    eventDate: raw.eventDate,
    guestCount: raw.guestCount,
    approvedBudget: raw.approvedBudget,
    timezone: raw.timezone,
    openQuestions: raw.openQuestions,
    sourceSpans: raw.sourceSpans,
    uncertainties: raw.uncertainties,
    questions: raw.questions,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const started = Date.now();
  let action = "unknown";
  try {
    const token = Deno.env.get(TOKEN_NAME);
    if (!token) {
      return new Response(
        JSON.stringify({ error: { message: "The AI token is not configured.", type: "config_error" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json() as {
      action?: string;
      briefText?: string;
      project?: unknown;
    };
    action = body.action ?? "unknown";
    if (action !== "extract_brief" && action !== "draft_update") {
      return new Response(
        JSON.stringify({ error: { message: "Unknown action.", type: "invalid_request_error" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let userContent = "";
    if (action === "extract_brief") {
      const briefText = typeof body.briefText === "string" ? body.briefText.trim() : "";
      if (briefText.length < 40) {
        return new Response(
          JSON.stringify({ error: { message: "The brief is too short to extract.", type: "invalid_request_error" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userContent = briefText;
    } else {
      if (typeof body.project !== "object" || body.project === null) {
        return new Response(
          JSON.stringify({ error: { message: "Project state is required.", type: "invalid_request_error" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userContent = JSON.stringify(body.project);
    }

    const sessionId = req.headers.get("X-Session-ID")?.trim() || crypto.randomUUID();
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Session-ID": sessionId,
        "X-Enter-Project-ID": PROJECT_ID,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: action === "extract_brief" ? EXTRACT_SYSTEM : DRAFT_SYSTEM },
          { role: "user", content: userContent },
        ],
        stream: false,
        max_output_tokens: 1600,
      }),
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      let message = `AI request failed (${upstream.status}).`;
      try {
        const parsed = JSON.parse(rawText) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Keep the HTTP fallback.
      }
      console.error("oncuex-ai upstream failure", { action, status: upstream.status, ms: Date.now() - started });
      return new Response(
        JSON.stringify({ error: { message, type: "upstream_error" } }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.parse(rawText) as {
      output?: unknown;
      output_text?: unknown;
      id?: string;
      model?: string;
      usage?: unknown;
    };
    const text = textFromResponse(payload);
    if (!text) throw new Error("The model returned an empty response.");

    let data: Record<string, unknown>;
    if (action === "extract_brief") {
      data = validateExtraction(parseJsonObject(text), body.briefText ?? "");
    } else {
      const parsed = parseJsonObject(text);
      if (typeof parsed.draft !== "string" || parsed.draft.trim().length < 40) {
        throw new Error("The model did not return a usable draft.");
      }
      data = { draft: parsed.draft.trim() };
    }

    console.log("oncuex-ai ok", { action, ms: Date.now() - started });
    return new Response(
      JSON.stringify({
        ok: true,
        data,
        model: payload.model ?? MODEL,
        responseId: payload.id ?? null,
        usage: payload.usage ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The AI request failed.";
    console.error("oncuex-ai error", { action, ms: Date.now() - started, message });
    return new Response(
      JSON.stringify({ error: { message, type: "ai_error" } }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
