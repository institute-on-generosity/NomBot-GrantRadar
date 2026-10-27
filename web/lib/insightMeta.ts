// Insights feed: shared types and helpers (safe for client code; no database access here).
// Rows come from the `insights` table (see lib/insights.ts); only verified rows reach the app.
import type { SlideData } from "./slide";

export const SECTIONS = [
  { key: "funding-gaps", label: "Funding gaps" },
  { key: "rising-fading", label: "Rising and fading" },
  { key: "money-flows", label: "Money flows" },
  { key: "track-record", label: "Track record" },
  { key: "affiliations", label: "Affiliations" },
  { key: "financial-stress", label: "Financial stress" },
] as const;

export type Section = (typeof SECTIONS)[number]["key"];
export const sectionLabel = (k: string) => SECTIONS.find((s) => s.key === k)?.label ?? k;

export type Source = { label: string; url: string };
export type Row = Record<string, string | number | boolean | null>;
export type Stat = { label: string; value: string };

export type Insight = {
  id: number;
  slug: string;
  section: Section;
  headline: string;
  summary: string;
  chart: Record<string, unknown> | null; // Vega-Lite v5 spec, inline data, width "container"
  method: string | null;
  caveats: string | null;
  sources: Source[];
  query: string | null;
  data: Row[];
  org_eins: string[];
  explore_query: string | null;
  cause: string | null;
  state: string | null;
  score: number | null;
  stats: Stat[] | null; // key numbers for the detail page (same as the headline's); null until the miner fills them
  points: string[] | null; // 2-3 short bullets, key numbers in **bold**, last one "Why it matters"; null until filled (then show summary)
  refreshed_at: string | null;
  created_at: string | null;
};

export const updated = (i: Pick<Insight, "refreshed_at" | "created_at">) => {
  const d = i.refreshed_at ?? i.created_at;
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
};

// Flat rows → CSV (RFC 4180 quoting); columns are the union of every row's keys, in first-seen order.
export function toCsv(rows: Row[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

// Where "Explore" goes: the saved search, else the list of the organizations behind the insight.
export function exploreHref(i: Pick<Insight, "explore_query" | "org_eins">): string | null {
  if (i.explore_query) return `/?${new URLSearchParams({ question: i.explore_query })}`;
  if (i.org_eins?.length) return `/research/orgs?${new URLSearchParams({ ein: i.org_eins.join(",") })}`;
  return null;
}

// The organizations behind a finding: its org_eins, else any EINs in its data rows (funders and recipients), max 60.
export function findingEins(i: Pick<Insight, "org_eins" | "data">): string[] {
  if (i.org_eins?.length) return i.org_eins;
  const out = new Set<string>();
  for (const r of i.data ?? []) for (const k of ["ein", "recipient_ein", "funder_ein"]) {
    const v = r[k];
    if (typeof v === "string" && /^\d{9}$/.test(v.trim())) out.add(v.trim());
  }
  return [...out].slice(0, 60);
}

// The finding's own research page.
export const researchHref = (slug: string) => `/research/${slug}`;

// A citation to paste into a memo: title, publisher, date, link, data sources.
export function citation(i: Pick<Insight, "headline" | "sources" | "refreshed_at" | "created_at" | "slug">, origin: string): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const src = [...new Set((i.sources ?? []).map((s) => s.label))];
  return [`"${i.headline}." NomBot Research${updated(i) ? `, updated ${updated(i)}` : ""}.`, `${origin}${researchHref(i.slug)} (accessed ${today}).`,
    src.length ? `Data: ${src.join(". ")}.` : ""].filter(Boolean).join(" ");
}

// A finding as one conference slide (lib/slide): headline, up to 3 key numbers, its chart, and the
// first point plus "Why it matters" (the slide keeps what fits its word budget).
export function findingSlide(i: Insight, origin: string): SlideData {
  const pts = (i.points ?? []).filter((p) => typeof p === "string" && p.trim());
  const why = pts.find((p) => p.startsWith("**Why it matters:**"));
  const first = pts.find((p) => p !== why);
  return {
    kicker: [sectionLabel(i.section), i.state, "NomBot research"].filter(Boolean).join(" · "),
    headline: i.headline,
    numbers: (i.stats ?? []).slice(0, 3),
    chart: i.chart && { spec: i.chart },
    bullets: [first ?? (pts.length ? null : i.summary), why?.replace(/^\*\*Why it matters:\*\*\s*/, "")].filter((b): b is string => Boolean(b)).map((b) => b.charAt(0).toUpperCase() + b.slice(1)),
    link: `${origin}${researchHref(i.slug)}`,
    file: `${i.slug}-slide`,
  };
}

// Starter questions for "Ask about this finding", by section.
const ASK: Record<string, string[]> = {
  "funding-gaps": ["Where is the gap largest, and by how much?", "What besides need could explain this gap?"],
  "rising-fading": ["Which rows changed the most?", "Is this a lasting trend or a one-time jump?"],
  "money-flows": ["Where does most of the money end up?", "Which rows are outliers?"],
  "track-record": ["How do big and small funders differ here?", "What should an advisor ask a funder about this?"],
  "affiliations": ["Which groups stand out most?", "When is a board tie a concern, and when is it normal?"],
  "financial-stress": ["Which groups are most exposed?", "What would help these organizations most?"],
};
export const askSuggestions = (section: string) => [...(ASK[section] ?? ["Which rows stand out most?"]), "What can this data not tell me?"];

// The saved report as one Markdown file: each card's headline, points (else summary), method, caveats, sources and data.
export function reportMarkdown(items: Insight[], origin: string): string {
  const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const table = (rows: Row[]) => {
    if (!rows.length) return "";
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return [`| ${cols.map(md).join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`,
      ...rows.map((r) => `| ${cols.map((c) => md(r[c] == null ? "" : String(r[c]))).join(" | ")} |`)].join("\n");
  };
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return [
    `# NomBot research report`, ``, `${items.length} ${items.length === 1 ? "finding" : "findings"} · exported ${today} · ${origin}/research`, ``,
    ...items.flatMap((i, n) => [
      `## ${n + 1}. ${i.headline}`, ``,
      `*${sectionLabel(i.section)}${i.state ? ` · ${i.state}` : ""}${updated(i) ? ` · updated ${updated(i)}` : ""}*`, ``,
      ...(i.points?.length ? [...i.points.map((p) => `- ${p}`), ``] : [i.summary, ``]),
      ...(i.stats?.length ? [i.stats.map((s) => `**${s.value}** ${s.label}`).join(" · "), ``] : []),
      ...(i.method ? [`**Method.** ${i.method}`, ``] : []),
      ...(i.caveats ? [`**Caveats.** ${i.caveats}`, ``] : []),
      ...(i.sources?.length ? [`**Sources**`, ``, ...i.sources.map((s) => `- [${s.label}](${s.url})`), ``] : []),
      ...(i.data?.length ? [`**Data** (${i.data.length} rows)`, ``, table(i.data), ``] : []),
      ...(i.query ? [`<details><summary>SQL</summary>`, ``, "```sql", i.query.trim(), "```", ``, `</details>`, ``] : []),
    ]),
  ].join("\n");
}

export function download(name: string, body: string | Blob, type = "text/plain") {
  const blob = typeof body === "string" ? new Blob([body], { type: `${type};charset=utf-8` }) : body;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Reports (article view): the one-line dek (the summary's first sentence) and an estimated read time.
export const dek = (i: Pick<Insight, "summary">) => (i.summary.match(/^.+?[.!?](\s|$)/)?.[0] ?? i.summary).trim();
export const readTime = (i: Pick<Insight, "summary" | "points" | "method" | "caveats">) =>
  Math.max(1, Math.round([i.summary, ...(i.points ?? []), i.method ?? "", i.caveats ?? ""].join(" ").split(/\s+/).length / 200));
