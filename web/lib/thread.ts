// A research thread from its URL (/research/ask?q=first&f=follow1&f=follow2): the first question routed as
// usual, each follow-up resolved against the specs before it (lib/followUp). Every step is cached, so
// adding a follow-up recomputes only the new turn. Shared by the page and the text follow-up API.
import { answer, type Answer } from "./answer";
import { routeQuestion } from "./answerRoute";
import { normalizeSpec, type Spec } from "./answerSpec";
import { resolveFollowUp, type Turn } from "./followUp";

export const MAX_FOLLOW_UPS = 8;

export type ThreadTurn =
  | { kind: "answer"; text: string; standalone: string; spec: Spec; answer: Answer }
  | { kind: "text"; text: string; standalone: string }
  | { kind: "search"; text: string; standalone: string };

// null: the first question isn't a research question.
// mods: in-place settings for the latest answer (corrected categories, a start year), from the URL (?corr=1&since=2021)
export type Mods = { corr?: boolean; since?: number };
// onStage (Oct 27): "routed" once the latest question's spec is known, "queried" once every answer is computed. The
// loading steps follow these (app/api/research/stages streams them; the page's own render shares the same cached work).
export type Stage = "routed" | "queried";
export async function resolveThread(q: string, fs: string[], mods: Mods = {}, onStage?: (s: Stage) => void): Promise<ThreadTurn[] | null> {
  const n = Math.min(fs.length, MAX_FOLLOW_UPS);
  const r = await routeQuestion(q);
  if (!r.research) return null;
  if (!n) onStage?.("routed");
  const first = await answer(q, r.spec);
  const turns: ThreadTurn[] = [{ kind: "answer", text: q, standalone: q, spec: r.spec, answer: first }];
  const history: Turn[] = [{ question: q, spec: r.spec }];
  for (const [k, f] of fs.slice(0, MAX_FOLLOW_UPS).entries()) {
    const res = await resolveFollowUp(f, history).catch((err) => {
      console.error("follow-up routing failed", err);
      return { kind: "text" as const, standalone: f };
    });
    if (k === n - 1) onStage?.("routed");
    if (res.kind === "answer") {
      const a = await answer(res.standalone, res.spec);
      turns.push({ kind: "answer", text: f, standalone: res.standalone, spec: res.spec, answer: a });
      history.push({ question: res.standalone, spec: res.spec });
    } else turns.push({ kind: res.kind, text: f, standalone: res.standalone });
  }
  // Settings apply to the latest answer only, in place (no new turn)
  const last = turns.at(-1);
  if (last?.kind === "answer" && (mods.corr || mods.since)) {
    const spec = normalizeSpec({ ...last.spec, ...(mods.corr ? { ntee: "corrected" as const } : {}), ...(mods.since ? { yearFrom: mods.since } : {}) });
    turns[turns.length - 1] = { ...last, spec, answer: await answer(last.standalone, spec) };
  }
  onStage?.("queried");
  return turns;
}

export const threadHref = (q: string, fs: string[]) => {
  const p = new URLSearchParams({ q });
  for (const f of fs) p.append("f", f);
  return `/research/ask?${p}`;
};
