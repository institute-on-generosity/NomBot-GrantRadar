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

let client: Anthropic | null | undefined;

export function claude(): Anthropic | null {
  // A user-level key (sk-ant-usr-…) isn't tied to a workspace, so each request names one.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  if (client === undefined)
    client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {})
      : null;
  return client;
}
