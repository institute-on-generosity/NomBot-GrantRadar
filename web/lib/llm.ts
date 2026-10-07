// Shared LLM provider setup (NomBot search parsing now; Research Buddy and /grants later).
// LLM_MODEL="provider:model", e.g. "openai:gpt-4o-mini" or "anthropic:claude-haiku-4-5".
// Returns null when no provider key is configured, so callers can fall back.
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

export function languageModel() {
  const spec = process.env.LLM_MODEL || (process.env.OPENAI_API_KEY ? "openai:gpt-4o-mini" : process.env.ANTHROPIC_API_KEY ? "anthropic:claude-haiku-4-5" : "");
  const [provider, model] = spec.split(":");
  if (provider === "openai" && process.env.OPENAI_API_KEY) return openai(model);
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) return anthropic(model);
  return null;
}
