// The one-page summary at the top of a search report (Oct 29, advisor format for Keith's Inglewood reports): 3 to 5
// picks with a one-line reason, a verified badge, the data year and 2 questions to ask; who funds this cause in the
// place; the gaps; method and caveats in 3 lines. Facts and fixed rules only: the reasons are the relevance scorer's
// own lines, cut to their first sentence. The full lists follow as the appendix (app/report).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { orgTitle } from "../components/text";
import { db } from "./db";
import { getOrg } from "./org";
import { GRANT_YEARS } from "./placeReport";
import type { Scope } from "./place";
import type { Ranked } from "./rerank";
import { vetting } from "./vetting";
import { webProfiles } from "./webProfile";

export type Badge = "Active filer" | "Website live" | "Name only";
export type Pick = { ein: string; name: string; where: string; reason: string; badge: Badge; year: number | null; questions: string[]; website: string | null };
export type PlaceFunder = { ein: string; name: string; usd: number; grants: number; orgs: number };
export type Program = { name: string; operator: string; kind: string; serves: "confirmed" | "not confirmed"; evidence: string; detail: string; schedule: string; url: string; read: string };
export type Brief = { picks: Pick[]; funders: PlaceFunder[]; gaps: string[]; programs: Program[]; method: string[] };

const firstSentence = (t: string) => (t.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? t).replace(/\s*;\s*/g, ", ").trim();
const year = new Date().getFullYear();
// Active filer: a return in the last 3 years. Website live: no recent return, but its own site was read and confirmed.
export function badgeOf(r: Pick0, hasWeb: boolean): Badge {
  const newest = Math.max(r.filing?.year ?? 0, r.health?.year ?? 0, r.financials?.tax_year ?? 0, r.revenue?.year ?? 0);
  if (newest >= year - 3 && (r.filing?.year ?? 0) >= year - 3) return "Active filer";
  if (hasWeb) return "Website live";
  return newest >= year - 3 ? "Active filer" : "Name only";
}
type Pick0 = { filing: Ranked["filing"]; health: Ranked["health"]; financials: Ranked["financials"]; revenue: Ranked["revenue"] };

// Order for picks: in the place first, then serving it, then nearby; strongest score within each
const TIER_RANK: Record<string, number> = { in: 0, county: 0, serves: 1, nearby: 2, wider: 3 };
export function choosePicks(rows: Ranked[], k = 5): Ranked[] {
  const strong = rows.filter((r) => (r.relevance?.score ?? 0) >= 70);
  return [...strong].sort((a, b) => (TIER_RANK[a.place?.tier ?? "in"] - TIER_RANK[b.place?.tier ?? "in"]) || ((b.relevance?.score ?? 0) - (a.relevance?.score ?? 0))).slice(0, k);
}

// Programs that serve the place but aren't separate nonprofits (data/place-programs.json), for a topic they match
const PROGRAMS = (() => { try { return JSON.parse(readFileSync(join(process.cwd(), "data", "place-programs.json"), "utf8")) as { places: Record<string, Record<string, Program[]>> }; } catch { return { places: {} }; } })();
const TOPICS: [string, RegExp][] = [["dental", /\b(dental|dentist|teeth|oral health|dental bus|mobile dental)\b/i]];
export function programsFor(scope: Scope | null, question: string): Program[] {
  if (scope?.kind !== "city") return [];
  const key = `${scope.city.toLowerCase().replace(/\s+/g, "-")}-${scope.state.toLowerCase()}`;
  const byTopic = PROGRAMS.places[key] ?? {};
  return TOPICS.filter(([, re]) => re.test(question)).flatMap(([t]) => byTopic[t] ?? []);
}

// Foundations that paid orgs in the place (the report's strong matches based there) for this cause, 2022–24
async function placeFunders(eins: string[], k = 5): Promise<PlaceFunder[]> {
  if (!eins.length) return [];
  const { rows } = await db.query(`SELECT g.funder_ein AS ein, max(f.name) AS name, sum(g.amount)::float8 AS usd, count(*)::int AS grants, count(DISTINCT g.recipient_ein)::int AS orgs
      FROM grant_clean g LEFT JOIN funders f ON f.ein = g.funder_ein WHERE g.recipient_ein = ANY($1::char(9)[]) AND g.tax_year BETWEEN $2 AND $3
      GROUP BY 1 ORDER BY 3 DESC LIMIT $4`, [eins.map((e) => e.replace(/\D/g, "")), ...GRANT_YEARS, k]);
  return rows.map((r) => ({ ein: String(r.ein), name: orgTitle(String(r.name ?? r.ein)), usd: Number(r.usd), grants: Number(r.grants), orgs: Number(r.orgs) }));
}

export async function reportBrief(question: string, rows: Ranked[], scope: Scope | null, topic: string, funded: Set<string>, prefer: string | null): Promise<Brief> {
  const picked = choosePicks(rows);
  const web = await webProfiles(rows.map((r) => r.ein));
  const place = scope?.kind === "city" ? scope.city.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : scope?.label ?? "the place";
  const picks: Pick[] = await Promise.all(picked.map(async (r) => {
    const o = await getOrg(r.ein).catch(() => null);
    const v = o ? await vetting(o).catch(() => null) : null;
    const w = web.get(r.ein.replace(/\D/g, ""));
    return {
      ein: r.ein, name: orgTitle(r.name),
      where: r.place?.tier === "in" ? `In ${place}` : r.place?.tier === "serves" ? `Serves ${place}, based in ${orgTitle(r.city ?? "")}` : `${orgTitle(r.city ?? "")}, nearby`,
      reason: firstSentence(r.relevance?.why ?? (w?.description ?? "")),
      badge: badgeOf(r, !!w), year: Math.max(r.filing?.year ?? 0, r.revenue?.year ?? 0) || null,
      questions: (v?.questions ?? []).slice(0, 2).map((q) => q.q),
      website: w?.url ?? (r.website ? (/^https?:/.test(r.website) ? r.website : `https://${r.website}`) : null),
    };
  }));
  const inPlace = rows.filter((r) => (r.place?.tier === "in" || r.place?.tier === "county") && (r.relevance?.score ?? 0) >= 70);
  const funders = await placeFunders(inPlace.map((r) => r.ein));
  const programs = programsFor(scope, question);
  return { picks, funders, gaps: gapsOf(rows, inPlace, programs, place, topic, funded, prefer), programs, method: [] };
}

// What's missing or thin, by fixed rules over the report's own rows and the place programs
export function gapsOf(rows: Ranked[], inPlace: Ranked[], programs: Program[], place: string, topic: string, funded: Set<string> = new Set(), prefer: string | null = null): string[] {
  const out: string[] = [];
  const t = topic || "this cause";
  if (programs.length) {
    const confirmed = programs.filter((p) => p.serves === "confirmed");
    const mobile = confirmed.filter((p) => /mobile|van|bus/i.test(`${p.kind} ${p.name}`));
    const what = programs[0] && /dental/i.test(`${programs[0].kind} ${programs[0].name} ${t}`) ? "mobile or school-based dental service (dental bus)" : "mobile or school-based service";
    if (!mobile.length) out.push(`No confirmed ${what} in ${place}.${confirmed.length ? ` Confirmed fixed-site option${confirmed.length > 1 ? "s" : ""}: ${confirmed.map((p) => `${p.name} (${p.operator})`).join(", ")}.` : ""} ${programs.length - confirmed.length} other programs checked, none confirmed for ${place}.`);
  }
  const active = inPlace.filter((r) => (r.filing?.year ?? 0) >= year - 3);
  if (inPlace.length < 3) out.push(`Only ${inPlace.length} strong ${inPlace.length === 1 ? "match is" : "matches are"} based in ${place}.`);
  else if (active.length < inPlace.length) out.push(`${inPlace.length - active.length} of ${inPlace.length} strong matches based in ${place} have no Form 990 since ${year - 3} (small groups that file the 990-N postcard, or inactive).`);
  const unfunded = inPlace.filter((r) => !funded.has(r.ein.replace(/\D/g, "")));
  if (inPlace.length && unfunded.length / inPlace.length >= 0.5) out.push(`${unfunded.length} of ${inPlace.length} strong matches based in ${place} got no foundation grants, ${GRANT_YEARS[0]}–${String(GRANT_YEARS[1]).slice(2)}.`);
  if (prefer) {
    const focused = inPlace.filter((r) => (r.prefer ?? []).length > 0 || (r.topicLabels ?? []).length > 0);
    if (focused.length < 3) out.push(`Few groups based in ${place} match "${prefer}": ${focused.length ? focused.map((r) => orgTitle(r.name)).join(", ") : "none confirmed"}. Others that fit are listed too.`);
  }
  const leads = rows.filter((r) => !r.filing && !r.web && (r.place?.tier === "in") && (r.relevance?.score ?? 0) >= 40);
  if (leads.length) out.push(`${leads.length} possible ${place} ${leads.length === 1 ? "group is" : "groups are"} known only by name and cause code (no filing text, no website found). Call before relying on them.`);
  return out.slice(0, 4);
}
