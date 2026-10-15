// Insights feed: shared types and helpers (safe for client code; no database access here).
// Rows come from the `insights` table (see lib/insights.ts); only verified rows reach the app.

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
  if (i.org_eins?.length) return `/insights/orgs?${new URLSearchParams({ ein: i.org_eins.join(",") })}`;
  return null;
}

// "Go deeper": Research Buddy opens over the insight's search, with the headline ready to ask.
export function deeperHref(i: Pick<Insight, "explore_query" | "headline" | "cause">): string {
  return `/?${new URLSearchParams({ question: i.explore_query || i.cause || i.headline, buddy: "1", ask: `Go deeper on this finding: ${i.headline}` })}`;
}

// The saved report as one Markdown file: each card's headline, summary, method, caveats, sources and data.
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
    `# NomBot insights report`, ``, `${items.length} ${items.length === 1 ? "insight" : "insights"} · exported ${today} · ${origin}/insights`, ``,
    ...items.flatMap((i, n) => [
      `## ${n + 1}. ${i.headline}`, ``,
      `*${sectionLabel(i.section)}${i.state ? ` · ${i.state}` : ""}${updated(i) ? ` · updated ${updated(i)}` : ""}*`, ``,
      i.summary, ``,
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
