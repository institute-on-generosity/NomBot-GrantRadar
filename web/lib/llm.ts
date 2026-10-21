// Shared Claude client (NomBot search parsing now; Research Buddy and /grants later).
// LLM_MODEL switches the Claude model with one env var. Returns null when no
// ANTHROPIC_API_KEY is set, so callers can fall back.
import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = process.env.LLM_MODEL || "claude-opus-5-5";
// Faster model for the calls people wait on after every search (relevance scores, AI overview).
export const FAST_MODEL = process.env.FAST_MODEL || "claude-sonnet-5-5";
// Per-step overrides (benchmark knobs; defaults keep the models above): the question parse and the relevance scores.
export const PARSE_MODEL = process.env.PARSE_MODEL || LLM_MODEL;
export const SCORE_MODEL = process.env.SCORE_MODEL || FAST_MODEL;
// Server-side refusal fallback ("default" routing) where the model offers it; Haiku 5.5 has none (the request would fail).
export const fallback = (model: string) =>
  model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

const clients = new Map<string, Anthropic | null>();

// Every Messages API call is logged to llm_usage (generosity-data migration 074) with the exact token counts the
// API returns: from the JSON body, or for a stream from message_start and the last message_delta. The feature
// travels as an x-nombot-feature header that this fetch strips before the request leaves. Logging never blocks
// or breaks the call. No prompt or answer text is stored.
const SOURCE = process.env.NEXT_RUNTIME ? "app" : (process.argv[1] ?? "script").split("/").slice(-2).join("/");
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
function logUsage(model: string, feature: string, status: number, stream: boolean, u: Usage) {
  import("./db").then(({ db }) => db.query(
    `INSERT INTO llm_usage (model, feature, source, input_tokens, output_tokens, cache_read, cache_write, status, stream) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [model, feature, SOURCE, u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, status, stream],
  )).catch((err) => console.error("llm_usage log failed", err?.message));
}
async function readStream(res: Response, model: string, feature: string) {
  const u: Usage = {};
  let m = model, buf = "";
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const e = JSON.parse(line.slice(5));
        if (e.type === "message_start") { m = e.message?.model ?? m; Object.assign(u, e.message?.usage); }
        else if (e.type === "message_delta" && e.usage) Object.assign(u, Object.fromEntries(Object.entries(e.usage).filter(([, v]) => v != null)));
      } catch { /* partial or non-JSON line */ }
    }
  }
  logUsage(m, feature, res.status, true, u);
}
const loggingFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const feature = headers.get("x-nombot-feature") ?? "other";
  headers.delete("x-nombot-feature");
  const res = await fetch(input, { ...init, headers });
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/v1/messages") || url.includes("count_tokens")) return res;
  let model = "?";
  try { model = JSON.parse(String(init?.body ?? "{}")).model ?? "?"; } catch { /* not JSON */ }
  const copy = res.clone();
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) readStream(copy, model, feature).catch(() => {});
  else copy.json().then((j) => logUsage(j.model ?? model, feature, res.status, false, j.usage ?? {})).catch(() => {});
  return res;
};

// feature: the calling module, for the /admin token usage table.
export function claude(feature = "other"): Anthropic | null {
  // A user-level key (sk-ant-usr-…) isn't tied to a workspace, so each request names one.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  if (!clients.has(feature))
    clients.set(feature, process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ fetch: loggingFetch, defaultHeaders: { "x-nombot-feature": feature, ...(workspace ? { "anthropic-workspace-id": workspace } : {}) } })
      : null);
  return clients.get(feature)!;
}
