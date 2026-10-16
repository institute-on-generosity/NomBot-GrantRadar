// Shared Claude client (NomBot search parsing now; Research Buddy and /grants later).
// LLM_MODEL switches the Claude model with one env var. Returns null when no
// ANTHROPIC_API_KEY is set, so callers can fall back.
import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = process.env.LLM_MODEL || "claude-opus-5-5";

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
