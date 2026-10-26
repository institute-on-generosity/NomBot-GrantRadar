// Turn a plain-language question into search filters.
// Uses Claude (structured outputs) when ANTHROPIC_API_KEY is set (see lib/llm.ts);
// otherwise, or if the call fails, a small rule-based parser (POC fallback).
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, fallback, PARSE_MODEL } from "./llm";
import { memo } from "./memo";
import type { Requirement } from "./search";
import { LOADED_STATES } from "./filters";
import { LABEL_SLUGS, labelFromText, namesLabel, subtypeFromText, type LabelSlug, type LabelSubPick } from "./labels";
import { topicHints } from "./topicHints";
import { z } from "zod";

export type Filters = {
  q: string; semantic: string; states: string[]; cities: string[]; maxRevenue?: number; minRevenue?: number;
  ntee?: string;      // cause the user picked: a hard filter
  nteeHint?: string;  // cause NomBot guessed from the question: a ranking boost only (orgs are often coded elsewhere)
  requirements: Requirement[]; parser: "llm" | "rules";
  topic: string;        // what the organizations do, for display
  placeLabel?: string;  // the place as the user said it ("Appalachia"), for display
  appalachia?: boolean; // only orgs in the ARC region (by ZIP -> county), not whole states
  label?: LabelSlug;     // graded cause label (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity, animal_welfare, youth_development): a hard filter on org_labels
  labelPartial?: boolean; // also orgs where the cause is one named goal among others (default: primary only)
  labelSub?: LabelSubPick; // sub-type of a label that has them (immigrants_refugees: services, policy or all), read from the question
  county?: string;        // "Los Angeles County": the place is the county (lib/place.ts countyScope), with its state in states
  near?: boolean;         // "near Inglewood": the city, then a labeled nearby tier (every city search shows it; this says it was asked)
  prefer?: Requirement[]; // soft preferences ("ideally focused on girls", "especially mobile dental"): ranking boosts, never filters
  preferLabel?: LabelSlug; // a graded cause label named only as a preference: a boost, not the hard label filter
  nteeBoost?: string[];   // NTEE prefixes the topic points to (lib/topicHints: youth sports N6, N4): a boost only
  boostLabels?: LabelSlug[]; // graded labels the topic points to (youth development, women and girls): a boost, and candidates in a small place
};

// State names, longest first so "west virginia" is read before "virginia".
const STATES: Record<string, string> = Object.fromEntries(LOADED_STATES.map(([code, name]) => [name.toLowerCase(), code]).sort((a, b) => b[0].length - a[0].length));
// The Appalachian Regional Commission's 13 states (the search then keeps only ARC counties, by ZIP).
const ARC = ["AL", "GA", "KY", "MD", "MS", "NY", "NC", "OH", "PA", "SC", "TN", "VA", "WV"];
const REGIONS: Record<string, string[]> = { appalachia: ARC, appalachian: ARC };
const NTEE: [RegExp, string, string][] = [[/\bfood (banks?|pantr(y|ies))\b|\bpantr(y|ies)\b|\bsoup kitchens?\b/i, "K3", "Food banks"]];
const REQS: [RegExp, string, string[]][] = [
  [/\b(workforce|job (training|skills|readiness)|employment training|vocational)\b/i, "workforce training",
    ["workforce", "job training", "job skills", "job readiness", "employment training", "vocational", "career training"]],
];

const SYSTEM = `You turn a plain-language US nonprofit search into database filters.
- topic: what the organizations do (the main cause), as search words, without places, budget or preferences.
- states: two-letter codes; expand named regions (e.g. Appalachia). When the user names a city, include its state.
- cities: city names exactly as the user wrote them (e.g. "Louisville"), only for an actual city or town, also after "near" or "around"; empty for states, regions or counties.
- county: the county when the user names one ("Los Angeles County", "Cook County"), else null. Put its state in states.
- near: true when the user asks for organizations near, around or close to a place, else false.
- placeLabel: the place as the user said it ("Appalachia", "Kentucky"), or null.
- appalachia: true only when the user names Appalachia or Appalachian (the region), else false.
- ntee: an NTEE prefix ONLY when the main cause clearly maps: food banks/pantries K3, animals D, arts A, education B, environment C, health E, mental health F, employment J, housing L, youth development O, human services P. Otherwise null.
- label: "climate" when the user asks for organizations working on climate change or clean energy; "women_girls" when they ask for organizations serving women and/or girls (not co-ed groups like Boys & Girls Clubs); "substance_use" when they ask for organizations working on addiction, alcohol or drug use, opioids, overdose, sober living or recovery from addiction. "housing_homelessness" when they ask for organizations working on homelessness or housing people: shelters for homeless people, affordable or supportive housing, rental assistance, eviction prevention, Habitat for Humanity (not animal shelters, domestic violence shelters alone or sober living). "ai_tech_learning_work" when they ask for organizations teaching technology or AI skills: computer science or coding education, digital literacy or digital inclusion, AI literacy, tech job training, tech capacity-building for nonprofits (not general STEM, medical coding or broadband alone). "racial_equity" when they ask for organizations working on racial equity or racial justice: fighting racism or racial discrimination, civil rights of people of color, racial gaps, racial healing (not cultural heritage groups, or DEI, civil rights or equity without race named). "immigrants_refugees" when they ask for organizations serving or advocating for immigrants, refugees or asylum seekers: resettlement, immigration legal services, citizenship classes, ESL for immigrants (not wildlife refuges, "Refuge" shelters or bird migration). "mental_health" when they ask for organizations working on mental health or mental illness: counseling and therapy, psychiatric care, crisis lines, suicide prevention, PTSD, eating disorders, peer support (not addiction alone, autism or dementia alone, or career and financial counseling). "education" when they ask for organizations working on education and learning: schools, colleges and universities, early childhood education, tutoring, literacy, scholarships, adult education, libraries, STEM education, teacher training (not financial, health or environmental education, job training alone, or coding and digital skills, which are ai_tech_learning_work). "health_equity" when they ask for organizations working on health equity: reducing health disparities or inequities by race, income, place, gender, disability or immigration status, minority health, community health workers and promotoras, social determinants of health framed around equity (not health or health care in general, which is ntee E with no label). "youth_development" when they name youth development, youth leadership or youth empowerment itself (not youth programs in general, mentoring alone, after-school care, Boys & Girls Clubs, scouting or youth sports). "animal_welfare" when they name animal welfare itself: animal welfare, animal protection or animal rights, anti-cruelty work, spay and neuter, trap-neuter-return, wildlife rehabilitation, animal or farm sanctuaries, pet food pantries, SPCAs (not plain animal shelters, humane societies or rescues, which are ntee D20 with no label, and not wildlife conservation, zoos, hunting or breed clubs, or service and therapy animals). Only when the question clearly names that cause, else null.
- requirements: specific activities the organization MUST do beyond its main cause, only when the user makes it a condition (e.g. "that do workforce training", "must offer meals"). Never the main cause restated ("youth leadership programs" has none), and never something the user only prefers. Each gets 4-8 lowercase words or short phrases likely to appear in IRS mission text. Empty if none.
- preferences: what the user would like but doesn't require: after "ideally", "especially", "preferably", "particularly", "bonus if" (e.g. "ideally focused on girls", "especially mobile dental care"). Same format as requirements. A cause named only as a preference is not a label. Empty if none.`;

const schema = z.object({
  topic: z.string(),
  states: z.array(z.string()),
  cities: z.array(z.string()),
  placeLabel: z.string().nullable(),
  appalachia: z.boolean(),
  maxRevenue: z.number().nullable().describe("Upper revenue/budget limit in dollars, or null"),
  minRevenue: z.number().nullable().describe("Lower revenue/budget limit in dollars (\"over $1M\", \"large\" orgs), or null"),
  ntee: z.string().nullable(),
  label: z.enum(LABEL_SLUGS as [LabelSlug, ...LabelSlug[]]).nullable(),
  requirements: z.array(z.object({ label: z.string(), synonyms: z.array(z.string()) })),
  county: z.string().nullable(),
  near: z.boolean(),
  preferences: z.array(z.object({ label: z.string(), synonyms: z.array(z.string()) })),
});

const esc = (s: string) => s.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toReq = (label: string, terms: string[]): Requirement => ({ label, pattern: [label, ...terms].filter(Boolean).map(esc).join("|") });

// Same question -> same filters: sorting, "Show more", going back and CSV export reuse
// Claude's reading instead of asking again (faster, and the CSV matches the screen).
const cached = memo<Filters>("parse:v18", 1000, 24 * 3600_000); // bump the name when Filters changes shape (v18: youth_development label, girls and youth development as boosts (boostLabels); v17: county, near, soft preferences, NTEE boost; v16: animal_welfare label; v15: health_equity label; v14: education label; v13: labelSub, immigrants_refugees sub-types; v11: racial_equity, immigrants_refugees, mental_health, education labels)
export function parseQuestion(question: string): Promise<Filters> {
  return cached(question.toLowerCase().replace(/\s+/g, " ").trim(), () => parseFresh(question).then((f) => soften(question, f)));
}

// Soft preferences, checked on every parse (Claude's or the rules'): a "must mention" needs a condition in the question
// ("that do", "must", "only"), and anything named after "ideally", "especially", "preferably" is a boost, not a filter.
// A cause label named only there becomes a preferred label. The topic's NTEE codes and labels (lib/topicHints) ride along
// as a boost. Two labels never filter a search from the question alone (Oct 26, Keith's Inglewood test):
//   youth_development  the label finds about 54% of youth orgs (generosity-data c9f28ce), so a filter would hide half.
//   women_girls        when the question names girls (not women): "girls mentoring and leadership programs" ranks
//                      girls' programs first but keeps co-ed youth programs, unless it says "only girls" or "girls-only".
// The label chip (filter edits) still filters by either label.
const SOFT = /\b(ideally|especially|preferably|particularly|if possible|bonus if|even better|most of all)\b/i;
const HARD = /\b(that|which|who)\s+(also\s+)?(do|does|run|runs|offer|offers|provide|provides|operate|operates|have|has|serve|serves|focus|focuses)\b|\bmust\b|\bonly\b|\brequired?\b|\bwith an? \b/i;
const GIRLS = /\bgirls?'?\b/i, WOMEN = /\b(wom[ae]n|womens|female)\b/i;
const ONLY_GIRLS = /\b(only|just|exclusively|solely) (for |serving |serve )?girls\b|\bgirls?[- ]only\b|\bonly serv(e|es|ing) girls\b|\ball[- ]girls?\b/i;
const tokens = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]+/g) ?? []);
export function soften(question: string, f: Filters): Filters {
  const m = SOFT.exec(question);
  const hardText = m ? question.slice(0, m.index) : question, softText = m ? question.slice(m.index) : "";
  const hardWords = tokens(hardText), softWords = tokens(softText), topicWords = tokens(`${f.topic} ${f.q}`);
  const prefer = [...(f.prefer ?? [])], requirements: Requirement[] = [];
  for (const r of f.requirements) {
    const w = [...tokens(r.label)].filter((x) => x.length > 2);
    const onlySoft = w.length > 0 && w.some((x) => softWords.has(x)) && !w.every((x) => hardWords.has(x));
    const restated = w.length > 0 && w.every((x) => topicWords.has(x)); // "dental van programs": the topic itself, not a condition
    (onlySoft || restated || !HARD.test(hardText) ? prefer : requirements).push(r);
  }
  let { label, preferLabel } = f;
  if (label && softText && namesLabel(softText, label) && !namesLabel(hardText, label)) { preferLabel = label; label = undefined; }
  else if (!label && !preferLabel && softText && namesLabel(softText, "women_girls") && !namesLabel(hardText, "women_girls")) preferLabel = "women_girls";
  if (ONLY_GIRLS.test(question)) { if (!label) label = "women_girls"; else if (label !== "women_girls") preferLabel = "women_girls"; }
  else if (GIRLS.test(question) && !WOMEN.test(question) && namesLabel(question, "women_girls")) { if (label === "women_girls") label = undefined; preferLabel = "women_girls"; }
  if (label === "youth_development") label = undefined;
  const hints = topicHints(`${f.topic} ${f.semantic} ${question.replace(m ? softText : "", " ")}`);
  const boostLabels = [...new Set([...hints.labels, ...(f.label === "youth_development" ? ["youth_development"] : [])])].filter((l): l is LabelSlug => l !== label && l !== preferLabel && LABEL_SLUGS.includes(l as LabelSlug));
  const semantic0 = prefer.length && !prefer.every((p) => f.semantic.toLowerCase().includes(p.label.toLowerCase())) ? `${f.semantic} ${prefer.map((p) => p.label).join(" ")}` : f.semantic;
  const semantic = hints.expand.length && !semantic0.includes(hints.expand[0]) ? `${semantic0}: ${hints.expand.join(", ")}` : semantic0;
  return { ...f, semantic, requirements, prefer: prefer.length ? prefer : undefined, label, labelPartial: label ? f.labelPartial : undefined, labelSub: label ? f.labelSub : undefined, preferLabel, nteeBoost: hints.ntee.length ? hints.ntee : undefined, boostLabels: boostLabels.length ? boostLabels : undefined };
}

async function parseFresh(question: string): Promise<Filters> {
  const client = claude("parse");
  if (client) {
    try {
      const res = await client.beta.messages.parse({
        model: PARSE_MODEL,
        max_tokens: 2048,
        ...fallback(PARSE_MODEL),
        output_config: { effort: "low", format: betaZodOutputFormat(schema) },
        system: SYSTEM,
        messages: [{ role: "user", content: question }],
      });
      const o = res.stop_reason === "refusal" ? null : res.parsed_output;
      if (o) {
        const states = o.states.map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
        const requirements = o.requirements.filter((r) => r.label.trim()).map((r) => toReq(r.label, r.synonyms));
        const cities = o.cities.map((c) => c.trim().toUpperCase()).filter(Boolean);
        const label = o.label && namesLabel(question, o.label) ? o.label : undefined; // the question must name it
        const prefer = o.preferences.filter((r) => r.label.trim()).map((r) => toReq(r.label, r.synonyms));
        const county = o.county?.trim() && states.length === 1 ? o.county.trim() : undefined;
        return { label, labelSub: subtypeFromText(question, label), q: o.topic, semantic: o.topic, states, cities, maxRevenue: o.maxRevenue ?? undefined, minRevenue: o.minRevenue ?? undefined, nteeHint: o.ntee ?? undefined, requirements, parser: "llm", topic: o.topic, placeLabel: o.placeLabel || undefined, appalachia: o.appalachia || undefined,
          county, near: o.near || undefined, prefer: prefer.length ? prefer : undefined };
      }
    } catch (err) {
      console.error("Claude parse failed; using rule-based parser", err);
    }
  }
  let rest = ` ${question.toLowerCase()} `;
  let topic = rest; // keeps cause words (e.g. "food banks") for semantic search
  const places: string[] = [];
  let ntee: string | undefined;
  for (const [re, code] of NTEE) if (re.test(rest)) { ntee = code; rest = rest.replace(re, " "); }
  const states = new Set<string>();
  const cap = (w: string) => w.replace(/\b\w/g, (c) => c.toUpperCase());
  let appalachia = false;
  for (const [name, codes] of Object.entries(REGIONS)) if (rest.includes(name)) { appalachia = true; codes.forEach((c) => states.add(c)); places.push(cap(name.slice(0, 10))); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  for (const [name, code] of Object.entries(STATES)) if (rest.includes(` ${name} `)) { states.add(code); places.push(cap(name)); rest = rest.replace(name, " "); topic = topic.replace(name, " "); }
  let maxRevenue: number | undefined;
  const m = rest.match(/(?:under|below|less than|<)\s*\$?\s*([\d.,]+)\s*(k|m|thousand|million)?/);
  if (m) {
    maxRevenue = parseFloat(m[1].replace(/,/g, "")) * ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 }[m[2] as "k"] ?? 1);
    rest = rest.replace(m[0], " "); topic = topic.replace(m[0], " ");
  }
  let minRevenue: number | undefined;
  const mn = rest.match(/(?:over|above|more than|at least|>)\s*\$?\s*([\d.,]+)\s*(k|m|thousand|million)?/);
  if (mn) {
    minRevenue = parseFloat(mn[1].replace(/,/g, "")) * ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 }[mn[2] as "k"] ?? 1);
    rest = rest.replace(mn[0], " "); topic = topic.replace(mn[0], " ");
  }
  // "in Inglewood, CA", "near Inglewood, CA", "in Los Angeles County, CA" (two-letter state after a comma)
  const cities: string[] = [];
  let county: string | undefined, near: boolean | undefined;
  const pm = rest.match(/\b(in|near|around|close to)\s+([a-z][a-z .'-]*?),\s*([a-z]{2})\b/);
  if (pm && LOADED_STATES.some(([c]) => c === pm[3].toUpperCase())) {
    states.add(pm[3].toUpperCase());
    const name = pm[2].trim();
    if (/\s(county|parish)$/.test(name)) county = cap(name); else cities.push(name.toUpperCase());
    near = pm[1] !== "in" || undefined;
    places.push(`${cap(name)}, ${pm[3].toUpperCase()}`);
    rest = rest.replace(pm[0], " "); topic = topic.replace(pm[0], " ");
  }
  const label = labelFromText(question);
  const requirements: Requirement[] = [];
  for (const [re, name, terms] of REQS) if (re.test(rest)) requirements.push(toReq(name, terms));
  const stop = new Set("a an and also are budget do does for in of on or rural that the their them they to with who which".split(" "));
  const words = (t: string) => t.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w && !stop.has(w)).join(" ");
  const q = words(rest);
  const semantic = words(topic);
  return { q, semantic, states: [...states], cities, county, near, maxRevenue, minRevenue, nteeHint: ntee, requirements, label, labelSub: subtypeFromText(question, label), parser: "rules", topic: semantic, placeLabel: places.join(", ") || undefined, appalachia: appalachia || undefined };
}
