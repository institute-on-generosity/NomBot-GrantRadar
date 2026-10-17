// Data for the partner API (/api/v1/*) and the remote MCP server (/mcp): one function per endpoint, shared
// by both, with stable JSON shapes (documented at /api/docs and /api/openapi.json).
// No Claude API calls anywhere here: search uses the local embedding model and Postgres only.
import { db } from "./db";
import { search } from "./search";
import { getOrg } from "./org";
import { isLabel } from "./labels";
import { getInsight } from "./insights";
import { sectionLabel, SECTIONS } from "./insightMeta";

export const API_VERSION = "1";

type Link = { url: string };
const abs = <T extends Link>(base: string, s: T): T => (s.url.startsWith("/") ? { ...s, url: base + s.url } : s);
const plainEin = (e: string) => e.replace(/\D/g, "");

// ---------- search ----------
export type SearchParams = { q?: string; state?: string | string[]; city?: string | string[]; max_revenue?: number | string; ntee?: string; label?: string; label_tier?: string; limit?: number | string };
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter(Boolean);

export function parseSearch(p: SearchParams) {
  const q = String(p.q ?? "").slice(0, 300);
  const state = list(p.state).map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  const city = list(p.city).slice(0, 10);
  const maxRaw = p.max_revenue == null ? "" : String(p.max_revenue);
  const max_revenue = /^\d+$/.test(maxRaw) ? Number(maxRaw) : null;
  const ntee = p.ntee && /^[A-Z][0-9A-Z]{0,4}$/.test(p.ntee.toUpperCase()) ? p.ntee.toUpperCase() : null;
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 50);
  // Graded cause label (climate, women_girls): primary tier only unless label_tier=all.
  const label = isLabel(p.label) ? p.label : null;
  const label_tier = label ? (p.label_tier === "all" ? "all" : "primary") : null;
  return { q, state, city, max_revenue, ntee, label, label_tier, limit };
}

export async function apiSearch(p: SearchParams, base: string) {
  const query = parseSearch(p);
  const res = await search({ q: query.q, states: query.state, cities: query.city, maxRevenue: query.max_revenue ?? undefined, ntee: query.ntee ?? undefined,
    label: query.label ?? undefined, labelPartial: query.label_tier === "all", limit: query.limit });
  return {
    query,
    ...res,
    results: res.results.map((r) => ({ ...r, sources: r.sources.map((s) => abs(base, s)), url: `${base}/org/${plainEin(r.ein)}` })),
  };
}

// ---------- organization ----------
export async function apiOrg(einRaw: string, base: string) {
  const ein = plainEin(einRaw);
  if (ein.length !== 9) return { error: "bad_ein" as const };
  const o = await getOrg(ein);
  if (!o) return { error: "not_found" as const };

  const [{ rows: leaders }, { rows: [rec] }, { rows: topFunders }, { rows: [given] }, { rows: topRecipients }, { rows: [fdn] }] = await Promise.all([
    // Leaders from the newest filing that lists any (990 Part VII / 990-PF officers)
    db.query(
      `SELECT name, title, role, hours, pay, tax_year FROM board_members
        WHERE ein = $1 AND tax_year = (SELECT max(tax_year) FROM board_members WHERE ein = $1)
        ORDER BY pay DESC NULLS LAST, name LIMIT 25`, [ein]),
    db.query(
      `SELECT count(*)::int AS n, coalesce(sum(amount), 0)::bigint AS total, count(DISTINCT funder_ein)::int AS funders,
              min(tax_year) AS first, max(tax_year) AS latest
         FROM grants WHERE recipient_ein = $1`, [ein]),
    db.query(
      `SELECT g.funder_ein AS ein, f.name, count(*)::int AS grants, sum(g.amount)::bigint AS total, max(g.tax_year) AS latest
         FROM grants g JOIN funders f ON f.ein = g.funder_ein
        WHERE g.recipient_ein = $1 GROUP BY g.funder_ein, f.name ORDER BY total DESC NULLS LAST LIMIT 10`, [ein]),
    db.query(
      `SELECT count(*)::int AS n, coalesce(sum(amount), 0)::bigint AS total, min(tax_year) AS first, max(tax_year) AS latest
         FROM grants WHERE funder_ein = $1`, [ein]),
    db.query(
      `SELECT recipient_ein AS ein, min(recipient_name) AS name, min(recipient_city) AS city, min(recipient_state) AS state,
              count(*)::int AS grants, sum(amount)::bigint AS total, max(tax_year) AS latest
         FROM grants WHERE funder_ein = $1
        GROUP BY recipient_ein, CASE WHEN recipient_ein IS NULL THEN upper(recipient_name) END
        ORDER BY total DESC NULLS LAST LIMIT 10`, [ein]),
    db.query(
      `SELECT tax_year, assets, grants_paid, grant_count, invite_only, website, apply_contact, apply_form, apply_deadlines, apply_restrictions
         FROM funders WHERE ein = $1`, [ein]),
  ]);

  const latest = o.years[0] ?? null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    org: {
      ein: o.ein,
      name: o.name,
      address: { street: o.street, city: o.city, state: o.state, zip: o.zip },
      ntee: o.ntee,
      // Graded cause labels: primary (the cause is the main work) or partial (one named goal among others), with why
      labels: o.labels.map((l) => ({ label: l.label, name: l.name, tier: l.tier, why: l.why })),
      status: o.status,
      subsection: o.subsection,
      ruling_year: o.ruling ? Number(o.ruling) : null,
      years_tax_exempt: o.age,
      website: o.website,
      mission: o.mission,
      programs: o.programs,
      team: o.team,
      latest_filing: o.filing ? { year: o.filing.year, form: o.filing.form, url: o.filing.url ?? null } : null,
      financials: {
        latest: latest ? { year: latest.year, revenue: latest.revenue, expenses: latest.expenses, assets: latest.assets, source: latest.source } : null,
        history: o.years.map((y) => ({ year: y.year, revenue: y.revenue, expenses: y.expenses, assets: y.assets, source: y.source })),
        income: o.income,
      },
      health: o.flag
        ? {
            year: o.flag.year, form: o.flag.form, rating: o.flag.rating.level,
            signals: o.flag.rating.signals.map((s) => ({ key: s.key, label: s.label, level: s.level, note: s.note, ask: s.ask ?? null })),
            cash_months: o.flag.cashMonths, program_share: o.flag.programShare, debt_share: o.flag.debtShare,
            spending: o.flag.spending, board: o.flag.board,
          }
        : null,
      leaders: leaders.map((l) => ({ name: l.name as string, title: l.title as string | null, role: l.role as string | null, hours: num(l.hours), pay: num(l.pay), year: l.tax_year as number })),
      grants_received: {
        count: rec.n, total: Number(rec.total), funders: rec.funders, first_year: rec.first, latest_year: rec.latest,
        top_funders: topFunders.map((f) => ({ ein: f.ein as string, name: f.name as string, grants: f.grants as number, total: Number(f.total), latest_year: f.latest as number })),
        note: "Only grants from private foundations' 990-PF filings that we linked to this EIN (about 64% of grant dollars are linked).",
      },
      grants_given: {
        count: given.n, total: Number(given.total), first_year: given.first, latest_year: given.latest,
        top_recipients: topRecipients.map((r) => ({ ein: r.ein as string | null, name: r.name as string, city: r.city as string | null, state: r.state as string | null, grants: r.grants as number, total: Number(r.total), latest_year: r.latest as number })),
      },
      foundation: fdn
        ? { tax_year: fdn.tax_year, assets: num(fdn.assets), grants_paid: num(fdn.grants_paid), grant_count: fdn.grant_count, invite_only: fdn.invite_only,
            website: fdn.website, apply: { contact: fdn.apply_contact, form: fdn.apply_form, deadlines: fdn.apply_deadlines, restrictions: fdn.apply_restrictions } }
        : null,
      sources: o.sources.map((s) => abs(base, { label: s.label, detail: s.detail, url: s.url })),
      url: `${base}/org/${ein}`,
    },
  };
}

// ---------- research ----------
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as string[];
export type ResearchFilter = { section?: string; state?: string; cause?: string; limit?: number | string };

export async function apiResearchList(f: ResearchFilter, base: string) {
  const section = f.section && SECTION_KEYS.includes(f.section) ? f.section : null;
  const state = f.state && /^[A-Za-z]{2}$/.test(f.state) ? f.state.toUpperCase() : null;
  const cause = f.cause?.trim().slice(0, 80) || null;
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 300);
  try {
    const { rows } = await db.query(
      `SELECT slug, section, headline, summary, points, stats, cause, state, score, cardinality(coalesce(org_eins, '{}')) AS org_count,
              coalesce(jsonb_array_length(data), 0) AS row_count, refreshed_at, created_at
         FROM insights
        WHERE verified AND ($1::text IS NULL OR section = $1) AND ($2::text IS NULL OR state = $2) AND ($3::text IS NULL OR cause ILIKE '%' || $3 || '%')
        ORDER BY score DESC NULLS LAST, refreshed_at DESC NULLS LAST LIMIT $4`, [section, state, cause, limit]);
    return {
      filters: { section, state, cause, limit },
      sections: SECTIONS.map((s) => ({ key: s.key, label: s.label })),
      count: rows.length,
      research: rows.map((r) => ({
        slug: r.slug as string, section: r.section as string, section_label: sectionLabel(r.section),
        headline: r.headline as string, summary: r.summary as string, points: r.points ?? null, stats: r.stats ?? null,
        cause: r.cause, state: r.state, score: r.score, org_count: Number(r.org_count), row_count: Number(r.row_count),
        updated: iso(r.refreshed_at ?? r.created_at),
        url: `${base}/research/${r.slug}`, api_url: `${base}/api/v1/research/${r.slug}`,
      })),
    };
  } catch (e) {
    if (["42P01", "42703"].includes((e as { code?: string }).code ?? "")) return { filters: { section, state, cause, limit }, sections: [], count: 0, research: [] };
    throw e;
  }
}

export async function apiResearch(slug: string, base: string, maxRows = 5000) {
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  const i = await getInsight(slug);
  if (!i) return null;
  return {
    research: {
      slug: i.slug, section: i.section, section_label: sectionLabel(i.section), headline: i.headline, summary: i.summary,
      points: i.points, stats: i.stats, cause: i.cause, state: i.state, score: i.score,
      method: i.method, caveats: i.caveats, sql: i.query, sources: i.sources,
      chart: i.chart, // Vega-Lite spec with inline data
      data: i.data.slice(0, maxRows), row_count: i.data.length, data_truncated: i.data.length > maxRows,
      org_eins: i.org_eins,
      updated: i.refreshed_at ?? i.created_at,
      url: `${base}/research/${i.slug}`,
      cite: `Institute on Generosity, NomBot Research: "${i.headline}" (${base}/research/${i.slug}), updated ${(i.refreshed_at ?? i.created_at ?? "").slice(0, 10)}.`,
    },
  };
}
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : (d as string | null));
