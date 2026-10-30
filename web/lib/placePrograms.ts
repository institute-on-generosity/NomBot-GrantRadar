// Programs that serve a place but aren't separate nonprofits (data/place-programs.json, researched by hand), for a
// topic they match. One source for the report's gap line (lib/reportBrief) and the search summary's preference line
// (lib/searchSummary), so the app and the report agree.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Scope } from "./place";

export type Program = { name: string; operator: string; kind: string; serves: "confirmed" | "not confirmed"; evidence: string; detail: string; schedule: string; url: string; read: string };
const PROGRAMS = (() => { try { return JSON.parse(readFileSync(join(process.cwd(), "data", "place-programs.json"), "utf8")) as { places: Record<string, Record<string, Program[]>> }; } catch { return { places: {} }; } })();
const TOPICS: [string, RegExp][] = [["dental", /\b(dental|dentist|teeth|oral health|dental bus|mobile dental)\b/i]];
export function programsFor(scope: Scope | null | undefined, question: string): Program[] {
  if (scope?.kind !== "city") return [];
  const key = `${scope.city.toLowerCase().replace(/\s+/g, "-")}-${scope.state.toLowerCase()}`;
  const byTopic = PROGRAMS.places[key] ?? {};
  return TOPICS.filter(([, re]) => re.test(question)).flatMap(([t]) => byTopic[t] ?? []);
}
