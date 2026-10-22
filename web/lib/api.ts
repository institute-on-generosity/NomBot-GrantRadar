// Data for the partner API (/api/v1/*) and the remote MCP server (/mcp): one function per endpoint, shared
// by both, with stable JSON shapes (documented at /api/docs and /api/openapi.json).
// No Claude API calls anywhere here: search uses the local embedding model and Postgres only.
import { db } from "./db";
import { search } from "./search";
import { getOrg, LATEST_RETURN_NOTE } from "./org";
import { orgFinancialHealth, healthJson } from "./financialHealth";
import { partialYears } from "./answer";
import { orgNews, ORG_NEWS_NOTE } from "./orgNews";
import { TAX_STATUS_NOTE } from "./taxStatus";
import { orgFunding, FUNDING_NOTES } from "./orgFunding";
import { LABEL_SUBTYPES, isLabel } from "./labels";
import { getInsight } from "./insights";
import { sectionLabel, SECTIONS } from "./insightMeta";
import { similarOrgs, SIMILAR_NOTE } from "./similar";

export const API_VERSION = "1";

type Link = { url: string };
const abs = <T extends Link>(base: string, s: T): T => (s.url.startsWith("/") ? { ...s, url: base + s.url } : s);
const plainEin = (e: string) => e.replace(/\D/g, "");

// ---------- search ----------
export type SearchParams = { q?: string; state?: string | string[]; city?: string | string[]; max_revenue?: number | string; ntee?: string; label?: string; label_tier?: string; label_subtype?: string; limit?: number | string };
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter(Boolean);

export function parseSearch(p: SearchParams) {
  const q = String(p.q ?? "").slice(0, 300);
  const state = list(p.state).map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  const city = list(p.city).slice(0, 10);
  const maxRaw = p.max_revenue == null ? "" : String(p.max_revenue);
  const max_revenue = /^\d+$/.test(maxRaw) ? Number(maxRaw) : null;
  const ntee = p.ntee && /^[A-Z][0-9A-Z]{0,4}$/.test(p.ntee.toUpperCase()) ? p.ntee.toUpperCase() : null;
  const limit = Math.min(Math.max(Number(p.limit) || 10, 1), 50);
  // Graded cause label (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity, animal_welfare): primary tier only unless label_tier=all.
  const label = isLabel(p.label) ? p.label : null;
  const label_tier = label ? (p.label_tier === "all" ? "all" : "primary") : null;
  // A label with sub-types (immigrants_refugees): services (default), policy or all.
  const st = label ? LABEL_SUBTYPES[label] : undefined;
  const label_subtype = st ? (p.label_subtype === "policy" || p.label_subtype === "all" || p.label_subtype === "services" ? p.label_subtype : st.default) : null;
  return { q, state, city, max_revenue, ntee, label, label_tier, label_subtype, limit };
}

export async function apiSearch(p: SearchParams, base: string) {
  const query = parseSearch(p);
  const res = await search({ q: query.q, states: query.state, cities: query.city, maxRevenue: query.max_revenue ?? undefined, ntee: query.ntee ?? undefined,
    label: query.label ?? undefined, labelPartial: query.label_tier === "all", labelSub: query.label_subtype ?? undefined, limit: query.limit });
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
  const newsP = orgNews(ein, 5).catch(() => null); // generosity-data 071 (lib/orgNews), awaited below; never fails the org

  const [{ rows: leaders }, { rows: [rec] }, { rows: topFunders }, { rows: [given] }, { rows: topRecipients }, { rows: [fdn] }, fund] = await Promise.all([
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
    // Schedule I grants received and given, federal awards (lib/orgFunding)
    orgFunding(ein),
  ]);
  const similar = await similarOrgs(ein, { limit: 10 }); // generosity-data 070 (lib/similar)
  // Financial indicators over the full filing years (lib/financialHealth), the same as the org page and the research answer
  const fh = await partialYears("f990").then((p) => orgFinancialHealth(ein, p.latestFull)).catch(() => null);
  const top10 = <T,>(xs: T[]) => xs.slice(0, 10);

  const latest = o.years[0] ?? null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  const news = await newsP;
  return {
    org: {
      ein: o.ein,
      name: o.name,
      address: { street: o.street, city: o.city, state: o.state, zip: o.zip },
      ntee: o.ntee,
      // Corrected NTEE major group when the IRS code doesn't fit the org's own 990 text (generosity-data 072), else null
      ntee_suggested: o.nteeSuggested,
      // Graded cause labels: primary (the cause is the main work) or partial (one named goal among others), with why
      labels: o.labels.map((l) => ({ label: l.label, name: l.name, tier: l.tier, why: l.why, ...(l.subtypes ? { subtypes: l.subtypes } : {}) })),
      status: o.status,
      // IRS Pub 78 eligibility and automatic revocation, same shape as /api/v1/orgs/{ein}/status
      tax_status: o.tax ? { status: o.tax.status, pub78: o.tax.pub78, revocation: o.tax.revocation, note: TAX_STATUS_NOTE } : null,
      subsection: o.subsection,
      ruling_year: o.ruling ? Number(o.ruling) : null,
      years_tax_exempt: o.age,
      website: o.website,
      mission: o.mission,
      programs: o.programs,
      team: o.team,
      latest_filing: o.filing ? { year: o.filing.year, form: o.filing.form, url: o.filing.url ?? null } : null,
      // Newest return of any form (990, 990-EZ, 990-PF). irs_processed_year = the year in its IRS e-file object ID (no filed date in the data)
      latest_990: o.latest990 ? { tax_year: o.latest990.year, form: o.latest990.form, irs_processed_year: o.latest990.processed, note: LATEST_RETURN_NOTE } : null,
      financials: {
        latest: latest ? { year: latest.year, revenue: latest.revenue, expenses: latest.expenses, assets: latest.assets, source: latest.source } : null,
        history: o.years.map((y) => ({ year: y.year, revenue: y.revenue, expenses: y.expenses, assets: y.assets, source: y.source })),
        income: o.income,
      },
      // Indicators by full tax year (revenue, expenses, surplus, months of cash, program ratio, revenue mix, liabilities to
      // assets), consecutive deficits, plain flags and peer medians. Indicators, not a rating. Null with no e-filed 990s
      financial_health: fh && fh.years.length ? healthJson(fh) : null,
      health: o.flag
        ? {
            year: o.flag.year, form: o.flag.form, rating: o.flag.rating.level,
            signals: o.flag.rating.signals.map((s) => ({ key: s.key, label: s.label, level: s.level, note: s.note, ask: s.ask ?? null })),
            cash_months: o.flag.cashMonths, program_share: o.flag.programShare, debt_share: o.flag.debtShare,
            spending: o.flag.spending, board: o.flag.board,
          }
        : null,
      // Newest headlines that name this org (generosity-data 071); every one: /api/v1/news?ein=
      news: news ? { total: news.total, results: news.results, all_url: `${base}/api/v1/news?ein=${ein}`, note: ORG_NEWS_NOTE } : null,
      leaders: leaders.map((l) => ({ name: l.name as string, title: l.title as string | null, role: l.role as string | null, hours: num(l.hours), pay: num(l.pay), year: l.tax_year as number })),
      grants_received: {
        count: rec.n, total: Number(rec.total), funders: rec.funders, first_year: rec.first, latest_year: rec.latest,
        top_funders: topFunders.map((f) => ({ ein: f.ein as string, name: f.name as string, grants: f.grants as number, total: Number(f.total), latest_year: f.latest as number })),
        note: "Only grants from private foundations' 990-PF filings that we linked to this EIN (about 66% of grants and 58% of grant dollars are linked).",
      },
      grants_given: {
        count: given.n, total: Number(given.total), first_year: given.first, latest_year: given.latest,
        top_recipients: topRecipients.map((r) => ({ ein: r.ein as string | null, name: r.name as string, city: r.city as string | null, state: r.state as string | null, grants: r.grants as number, total: Number(r.total), latest_year: r.latest as number })),
        // Who received these 990-PF grants (generosity-data 079): nonprofits, governments, public universities, international
        // bodies, companies, foreign addresses, unidentified. Null when none went to the four non-nonprofit types.
        by_recipient_type: fund.given.foundation?.byType.length
          ? { types: fund.given.foundation.byType.map((t) => ({ type: t.type, label: t.label, grants: t.n, total: t.total, share: t.share, top_recipients: t.top })), note: FUNDING_NOTES.types }
          : null,
      },
      // Grants public charities (DAF sponsors, community foundations, United Ways, others) list on Form 990 Schedule I
      charity_grants_received: fund.charities
        ? {
            count: fund.charities.n, total: fund.charities.total,
            by_year: fund.charities.years.map((y) => ({ tax_year: y.year, count: y.n, total: y.total })),
            by_funder_type: fund.charities.byKind.map((k) => ({ type: k.kind, label: k.label, funders: k.funders, count: k.n, total: k.total })),
            top_funders: top10(fund.charities.top).map((f) => ({ ein: f.ein, name: f.name, type: f.kind, grants: f.n, total: f.total, latest_year: f.latest })),
            note: FUNDING_NOTES.charities,
          }
        : null,
      // Direct federal grants and cooperative agreements (USAspending), by federal fiscal year
      federal_awards: fund.federal
        ? {
            awards: fund.federal.awards, total: fund.federal.total,
            by_fiscal_year: fund.federal.years.map((y) => ({ fiscal_year: y.year, award_years: y.n, total: y.total })),
            by_agency: fund.federal.agencies.map((a) => ({ agency: a.name, awards: a.n, total: a.total })),
            top_programs: top10(fund.federal.programs).map((p) => ({ assistance_listing: p.cfda, title: p.title, agency: p.agency, awards: p.n, total: p.total })),
            place_of_performance: fund.federal.places.map((p) => ({ place: p.place, total: p.total })),
            note: FUNDING_NOTES.federal,
          }
        : null,
      // Grants this organization listed on its own Schedule I by recipient, what it reported but didn't itemize
      // (Part IX line 1 minus named lines, "SEE ATTACHED" lines inside it) and its Part IX line 1 total per year
      charity_grants_given: fund.given.scheduleI
        ? {
            count: fund.given.scheduleI.n, total: fund.given.scheduleI.total,
            not_itemized: fund.given.scheduleI.notItemized,
            transfers: fund.given.scheduleI.transfers,
            by_year: fund.given.scheduleI.years.map((y) => ({ tax_year: y.year, count: y.n, total: y.total, not_itemized: y.notItemized, transfers: y.transfers, part_ix_line1: y.line1 })),
            top_recipients: top10(fund.given.scheduleI.top).map((r) => ({ ein: r.ein, name: r.name, city: r.city, state: r.state, grants: r.n, total: r.total, latest_year: r.latest })),
            note: FUNDING_NOTES.given,
          }
        : null,
      // Schedule I transfers between related organizations (restructurings, mergers, transfers of assets) and clear
      // reporting errors: left out of the totals above and of every NomBot total (generosity-data 067)
      schedule_i_transfers: fund.transfers
        ? {
            received: fund.transfers.received.map((x) => ({ id: x.id, tax_year: x.year, from: { ein: x.ein, name: x.name }, amount: x.amount, cash: x.cash, noncash: x.noncash, kind: x.kind, reason: x.reason })),
            given: fund.transfers.given.map((x) => ({ id: x.id, tax_year: x.year, to: { ein: x.ein, name: x.name }, amount: x.amount, cash: x.cash, noncash: x.noncash, kind: x.kind, reason: x.reason })),
            note: FUNDING_NOTES.transfers,
          }
        : null,
      funding_overlap_note: FUNDING_NOTES.overlap,
      foundation: fdn
        ? { tax_year: fdn.tax_year, assets: num(fdn.assets), grants_paid: num(fdn.grants_paid), grant_count: fdn.grant_count, invite_only: fdn.invite_only,
            website: fdn.website, apply: { contact: fdn.apply_contact, form: fdn.apply_form, deadlines: fdn.apply_deadlines, restrictions: fdn.apply_restrictions } }
        : null,
      // Nearest orgs by 990 mission and program text (generosity-data 070). Less-funded peers: /api/v1/orgs/{ein}/similar?underfunded=true
      similar: similar
        ? { results: similar.map((x) => ({ ...x, url: `${base}/org/${x.ein}` })), underfunded_url: `${base}/api/v1/orgs/${ein}/similar?underfunded=true`, note: SIMILAR_NOTE }
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
