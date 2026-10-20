// Row-level data for the partner API (/api/v1/grants, federal-awards, finances, household-giving, labels,
// congress/bills, federal-register, news) and the matching MCP tools. Read-only, LLM-free, one function per
// endpoint shared by REST and MCP. Lists page with an opaque keyset cursor (no OFFSET), so page 1,000 is as
// fast as page 1. Grant lists read generosity-data migration 058's (tax_year, id) and (state, tax_year, id)
// indexes; the rest use the tables' own indexes. Shapes are documented in lib/apiDocs.ts.
import { db } from "./db";
import { keyed, apiError } from "./apiAuth";
import { countRows, withRows } from "./apiLog";
import { FUNDER_CLASS } from "./orgFunding";
import { LABEL_SLUGS, isLabel } from "./labels";
import { embedQuery, MODEL_ID, toSql } from "./embedder";

// ---------- input ----------
// A bad parameter: REST answers 400 bad_param, MCP a tool error with the message.
export class BadParam extends Error {
  constructor(public param: string, message: string) { super(message); }
}
type In = Record<string, unknown>;
const str = (p: In, k: string) => {
  const v = p[k];
  if (v == null || v === "") return null;
  return String(Array.isArray(v) ? v[0] : v).trim() || null;
};
const ein = (p: In, k: string) => {
  const s = str(p, k);
  if (s == null) return null;
  const d = s.replace(/-/g, "");
  if (!/^\d{9}$/.test(d)) throw new BadParam(k, `${k} must be a 9-digit EIN.`);
  return d;
};
const int = (p: In, k: string, min: number, max: number) => {
  const s = str(p, k);
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadParam(k, `${k} must be a whole number from ${min} to ${max}.`);
  return n;
};
const oneOf = <T extends string>(p: In, k: string, values: readonly T[]) => {
  const s = str(p, k);
  if (s == null) return null;
  if (!values.includes(s as T)) throw new BadParam(k, `${k} must be one of: ${values.join(", ")}.`);
  return s as T;
};
const state = (p: In, k = "state") => {
  const s = str(p, k);
  if (s == null) return null;
  if (!/^[A-Za-z]{2}$/.test(s)) throw new BadParam(k, `${k} must be a two-letter state code.`);
  return s.toUpperCase();
};
const fips = (p: In, k = "county") => {
  const s = str(p, k);
  if (s == null) return null;
  if (!/^\d{5}$/.test(s)) throw new BadParam(k, `${k} must be a 5-digit county FIPS code, e.g. 54011.`);
  return s;
};
const day = (p: In, k: string) => {
  const s = str(p, k);
  if (s == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new BadParam(k, `${k} must be a date, YYYY-MM-DD.`);
  return s;
};
const bool = (p: In, k: string) => {
  const v = p[k];
  if (v == null || v === "") return null;
  if (v === true || v === "true" || v === "1") return true;
  if (v === false || v === "false" || v === "0") return false;
  throw new BadParam(k, `${k} must be true or false.`);
};
const text = (p: In, k: string, max = 200) => str(p, k)?.slice(0, max) ?? null;
const pageSize = (p: In, def: number, max: number) => int(p, "limit", 1, max) ?? def;
function yearRange(p: In, from: string, to: string, min: number, max: number) {
  const a = int(p, from, min, max) ?? min, b = int(p, to, min, max) ?? max;
  if (a > b) throw new BadParam(from, `${from} must not be after ${to}.`);
  return [a, b] as const;
}

// Cursor: base64url JSON of the last row's sort key. Opaque to callers; next_cursor comes back with each page.
type Key = (string | number)[];
const encode = (k: Key) => Buffer.from(JSON.stringify(k)).toString("base64url");
function cursor(p: In, shape: ("n" | "s")[]): Key | null {
  const s = str(p, "cursor");
  if (s == null) return null;
  try {
    const k = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (Array.isArray(k) && k.length === shape.length && k.every((v, i) => typeof v === (shape[i] === "n" ? "number" : "string"))) return k;
  } catch { /* falls through */ }
  throw new BadParam("cursor", "cursor is not valid. Pass next_cursor from the previous page unchanged.");
}

// WHERE builder with numbered parameters.
class Sql {
  params: unknown[] = [];
  where: string[] = [];
  v(x: unknown) { this.params.push(x); return `$${this.params.length}`; }
  and(cond: string) { this.where.push(cond); }
  get clause() { return this.where.length ? `WHERE ${this.where.join(" AND ")}` : ""; }
}

function page<T>(rows: T[], limit: number, key: (r: T) => Key) {
  const more = rows.length > limit;
  const out = more ? rows.slice(0, limit) : rows;
  return { results: out, count: out.length, has_more: more, next_cursor: more ? encode(key(out[out.length - 1])) : null };
}

const num = (v: unknown) => (v == null ? null : Number(v));
const isoDay = (d: unknown) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : (d as string | null));
const filing = (ein: string, objectId: string | null) => (objectId ? `https://projects.propublica.org/nonprofits/organizations/${ein}/${objectId}/full` : null);

// Count and total for the same filters, when asked (totals=true). Capped at 8 s so a huge filter can't hold a connection.
async function totals(from: string, q: Sql, amount: string) {
  const [clause, params] = [q.clause, [...q.params]]; // snapshot: the caller adds the cursor and limit next
  const c = await db.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL statement_timeout = 8000");
    const { rows: [r] } = await c.query(`SELECT count(*)::float8 AS n, coalesce(sum(${amount}), 0)::float8 AS usd FROM ${from} ${clause}`, params);
    await c.query("COMMIT");
    return { count: r.n as number, amount: r.usd as number };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    if ((e as { code?: string }).code === "57014") return { count: null, amount: null, note: "Too many rows to total within 8 seconds. Narrow the filters." };
    throw e;
  } finally {
    c.release();
  }
}

// County FIPS -> its state, so a county filter can use the state index.
async function countyState(county: string) {
  const { rows: [r] } = await db.query("SELECT state, county_name FROM zip_regions WHERE county_fips = $1 LIMIT 1", [county]);
  if (!r) throw new BadParam("county", `No ZIP codes map to county ${county}.`);
  return r.state as string;
}

// ---------- grants ----------
export const GRANT_YEARS = [2012, 2025] as const;
export const FUNDER_TYPES = ["daf_sponsor", "community_foundation", "united_way", "other"] as const;
export const GRANT_NOTES = {
  foundation: "Grants private foundations list on Form 990-PF Part XV, tax years 2012-2025. recipient.ein is NomBot's link to a recipient (by reported EIN, name and address). About 64% of grants (59% of dollars) are linked. The place is the recipient's mailing address (usually headquarters), not where the money is spent. Grants to individuals keep amount and place but withhold the person's name and ZIP.",
  charity: "Grants public charities list on Form 990 Schedule I (over $5,000 per recipient), tax years 2012-2025. Lines that name no recipient (\"SEE ATTACHED\", \"VARIOUS\") are left out. About 93% of Schedule I dollars are itemized by recipient (2022-24). funder_type: daf_sponsor, community_foundation, united_way, other.",
  years: "Tax years before 2020 cover e-filed returns only (e-filing became mandatory for tax years from mid-2019), so earlier years hold fewer grants. Tax year 2025 is partial.",
};

export async function apiGrants(p: In) {
  const source = oneOf(p, "source", ["foundation", "charity"] as const) ?? "foundation";
  const [yearFrom, yearTo] = yearRange(p, "year_from", "year_to", ...GRANT_YEARS);
  const f = {
    source, funder_ein: ein(p, "funder_ein"), recipient_ein: ein(p, "recipient_ein"), year_from: yearFrom, year_to: yearTo,
    state: state(p), county: fips(p), label: null as string | null, label_tier: null as string | null,
    amount_min: int(p, "amount_min", 0, 1e13), funder_type: oneOf(p, "funder_type", FUNDER_TYPES), limit: pageSize(p, 50, 500),
  };
  const labelRaw = str(p, "label");
  if (labelRaw != null) {
    if (!isLabel(labelRaw)) throw new BadParam("label", `label must be one of: ${LABEL_SLUGS.join(", ")}.`);
    f.label = labelRaw;
    f.label_tier = oneOf(p, "label_tier", ["primary", "all"] as const) ?? "primary";
  }
  if (f.funder_type && source !== "charity") throw new BadParam("funder_type", "funder_type needs source=charity.");
  const after = cursor(p, ["n", "n"]);
  const wantTotals = bool(p, "totals") === true;

  const t = source === "charity" ? "c" : "g";
  const q = new Sql();
  q.and(`${t}.tax_year BETWEEN ${q.v(yearFrom)} AND ${q.v(yearTo)}`);
  if (source === "charity") q.and("NOT is_placeholder_recipient(c.recipient_name)");
  if (f.funder_ein) q.and(`${t}.funder_ein = ${q.v(f.funder_ein)}`);
  if (f.recipient_ein) q.and(`${t}.recipient_ein = ${q.v(f.recipient_ein)}`);
  const st = f.county ? await countyState(f.county) : f.state;
  if (f.state && st !== f.state) throw new BadParam("county", `County ${f.county} is not in ${f.state}.`);
  if (st) q.and(`${t}.recipient_state = ${q.v(st)}`);
  if (f.county) q.and(`left(${t}.recipient_zip, 5)::char(5) IN (SELECT zip5 FROM zip_regions WHERE county_fips = ${q.v(f.county)})`);
  if (f.amount_min != null) q.and(`${t}.amount >= ${q.v(f.amount_min)}`);
  if (f.label) q.and(`${t}.recipient_ein IN (SELECT ein FROM org_labels WHERE label = ${q.v(f.label)} AND tier = ANY(${q.v(f.label_tier === "all" ? ["primary", "partial"] : ["primary"])}))`);
  if (f.funder_type === "other") q.and(`NOT EXISTS (SELECT 1 FROM charity_funder_profile x WHERE x.ein = c.funder_ein AND x.funder_class <> 'other')`);
  else if (f.funder_type) q.and(`c.funder_ein IN (SELECT ein FROM charity_funder_profile WHERE funder_class = ${q.v(f.funder_type)})`);
  const sumFrom = source === "charity" ? "charity_grants c" : "grants g";
  const sum = wantTotals ? totals(sumFrom, q, `${t}.amount`) : null;

  if (after) q.and(`(${t}.tax_year, ${t}.id) < (${q.v(after[0])}, ${q.v(after[1])})`);
  const lim = q.v(f.limit + 1);
  const sql = source === "charity"
    ? `SELECT c.id, c.tax_year, c.funder_ein, coalesce(o.name, fp.name) AS funder_name, coalesce(fp.funder_class, 'other') AS funder_type,
              c.recipient_ein, c.recipient_name, c.recipient_city, c.recipient_state, c.recipient_zip, c.recipient_country,
              z.county_fips, z.county_name, c.amount, c.cash, c.noncash, c.noncash_desc, c.purpose, c.irc_section, c.reported_ein,
              c.match_method, c.match_score, c.object_id
         FROM (SELECT c.* FROM charity_grants c ${q.clause} ORDER BY c.tax_year DESC, c.id DESC LIMIT ${lim}) c
         LEFT JOIN charity_funder_profile fp ON fp.ein = c.funder_ein LEFT JOIN orgs o ON o.ein = c.funder_ein
         LEFT JOIN zip_regions z ON z.zip5 = left(c.recipient_zip, 5)::char(5)
        ORDER BY c.tax_year DESC, c.id DESC`
    : `SELECT g.id, g.tax_year, g.funder_ein, f.name AS funder_name, g.recipient_ein, g.recipient_name, g.recipient_city, g.recipient_state,
              g.recipient_zip, z.county_fips, z.county_name, g.amount, g.purpose, g.recipient_status, g.relationship,
              g.match_method, g.match_score, g.object_id,
              (g.recipient_kind = 'individual' OR (g.recipient_ein IS NULL AND upper(trim(g.recipient_status)) IN ('I', 'IND', 'INDIV', 'INDIVIDUAL'))) AS person
         FROM (SELECT g.* FROM grants g ${q.clause} ORDER BY g.tax_year DESC, g.id DESC LIMIT ${lim}) g
         JOIN funders f ON f.ein = g.funder_ein
         LEFT JOIN zip_regions z ON z.zip5 = left(g.recipient_zip, 5)::char(5)
        ORDER BY g.tax_year DESC, g.id DESC`;
  const { rows } = await db.query(sql, q.params);
  const pg = page(rows, f.limit, (r) => [r.tax_year, Number(r.id)]);
  return {
    filters: f,
    ...(sum ? { totals: await sum } : {}),
    ...pg,
    results: pg.results.map((r) => ({
      id: Number(r.id), source, tax_year: r.tax_year,
      funder: { ein: r.funder_ein, name: r.funder_name, ...(source === "charity" ? { type: r.funder_type, type_label: FUNDER_CLASS[r.funder_type] ?? r.funder_type } : {}) },
      // Grants to individuals (scholarships, hardship aid): the person's name and ZIP are withheld.
      recipient: {
        ein: r.recipient_ein, name: r.person ? "Individual (name withheld)" : r.recipient_name, individual: !!r.person,
        city: r.recipient_city, state: r.recipient_state, zip: r.person ? null : r.recipient_zip,
        county_fips: r.county_fips, county_name: r.county_name, ...(source === "charity" ? { country: r.recipient_country, reported_ein: r.reported_ein } : { status: r.recipient_status }),
      },
      amount: num(r.amount),
      ...(source === "charity" ? { cash: num(r.cash), noncash: num(r.noncash), noncash_desc: r.noncash_desc, irc_section: r.irc_section } : { relationship: r.relationship }),
      purpose: r.purpose,
      match: r.recipient_ein ? { method: r.match_method, score: num(r.match_score) } : null,
      filing_url: filing(r.funder_ein, r.object_id),
    })),
    notes: [GRANT_NOTES[source], GRANT_NOTES.years],
  };
}

// ---------- federal awards ----------
export const FEDERAL_YEARS = [2022, 2025] as const;
export const FEDERAL_NOTE = "Direct federal grants and cooperative agreements to nonprofits and private colleges from USAspending, federal fiscal years 2022-2025 (October to September). amount is the net obligation in that fiscal year, so it can be negative. recipient.ein is NomBot's link by name and place (about 85% linked). place_of_performance is where the work happens, recipient.state is the recipient's address.";

export async function apiFederalAwards(p: In) {
  const [fyFrom, fyTo] = yearRange(p, "fiscal_year_from", "fiscal_year_to", ...FEDERAL_YEARS);
  const f = {
    recipient_ein: ein(p, "recipient_ein"), agency: text(p, "agency", 100), assistance_listing: text(p, "assistance_listing", 10),
    fiscal_year_from: fyFrom, fiscal_year_to: fyTo, state: state(p), county: fips(p), recipient_state: state(p, "recipient_state"),
    recipient_kind: oneOf(p, "recipient_kind", ["nonprofit_501c3", "nonprofit_other", "private_college"] as const),
    q: text(p, "q", 100), amount_min: int(p, "amount_min", -1e13, 1e13), limit: pageSize(p, 50, 500),
  };
  if (f.assistance_listing && !/^\d{2}(\.\d{0,3})?$/.test(f.assistance_listing)) throw new BadParam("assistance_listing", "assistance_listing must look like 93.866, or 93 for every listing of an agency.");
  const after = cursor(p, ["n", "n"]);
  const q = new Sql();
  q.and(`a.fiscal_year BETWEEN ${q.v(fyFrom)} AND ${q.v(fyTo)}`);
  if (f.recipient_ein) q.and(`a.recipient_ein = ${q.v(f.recipient_ein)}`);
  if (f.agency) {
    if (/^\d{3}$/.test(f.agency)) q.and(`a.agency_code = ${q.v(f.agency)}`);
    else { const x = q.v(`%${f.agency}%`); q.and(`(a.agency_name ILIKE ${x} OR a.sub_agency_name ILIKE ${x})`); }
  }
  if (f.assistance_listing) {
    const exact = /^\d{2}\.\d{3}$/.test(f.assistance_listing);
    q.and(exact ? `a.cfda_number = ${q.v(f.assistance_listing)}` : `a.cfda_number LIKE ${q.v(f.assistance_listing.replace(/\.?$/, ".") + "%")}`);
  }
  if (f.state) q.and(`a.pop_state = ${q.v(f.state)}`);
  if (f.county) q.and(`a.pop_county_fips = ${q.v(f.county)}`);
  if (f.recipient_state) q.and(`a.recipient_state = ${q.v(f.recipient_state)}`);
  if (f.recipient_kind) q.and(`a.recipient_kind = ${q.v(f.recipient_kind)}`);
  if (f.amount_min != null) q.and(`a.amount >= ${q.v(f.amount_min)}`);
  if (f.q) { const x = q.v(`%${f.q}%`); q.and(`(a.description ILIKE ${x} OR a.cfda_title ILIKE ${x} OR a.recipient_name ILIKE ${x})`); }
  const sum = bool(p, "totals") === true ? totals("federal_awards a", q, "a.amount") : null;
  if (after) q.and(`(a.fiscal_year, a.id) < (${q.v(after[0])}, ${q.v(after[1])})`);
  const { rows } = await db.query(
    `SELECT a.* FROM federal_awards a ${q.clause} ORDER BY a.fiscal_year DESC, a.id DESC LIMIT ${q.v(f.limit + 1)}`, q.params);
  const pg = page(rows, f.limit, (r) => [r.fiscal_year, Number(r.id)]);
  return {
    filters: f,
    ...(sum ? { totals: await sum } : {}),
    ...pg,
    results: pg.results.map((r) => ({
      id: Number(r.id), award_key: r.award_key, fain: r.fain, fiscal_year: r.fiscal_year,
      agency: { code: r.agency_code, name: r.agency_name, sub_agency: r.sub_agency_name },
      assistance_listing: { number: r.cfda_number, title: r.cfda_title }, assistance_type: r.assistance_type,
      recipient: { ein: r.recipient_ein, uei: r.recipient_uei, name: r.recipient_name, city: r.recipient_city, state: r.recipient_state, zip: r.recipient_zip, kind: r.recipient_kind },
      place_of_performance: { scope: r.pop_scope, state: r.pop_state, county_fips: r.pop_county_fips },
      amount: num(r.amount), actions: r.actions, description: r.description,
      match: r.recipient_ein ? { method: r.match_method, score: num(r.match_score) } : null,
      url: `https://www.usaspending.gov/award/${encodeURIComponent(r.award_key)}`,
    })),
    notes: [FEDERAL_NOTE],
  };
}

// ---------- finances ----------
const FOUNDATION_NUMS = ["fmv_assets", "book_assets", "net_assets", "contributions_received", "total_revenue", "investment_income", "net_gain_sales",
  "net_investment_income", "operating_expenses", "total_expenses", "grants_paid", "grants_paid_books", "charitable_disbursements", "excise_tax",
  "net_investment_assets", "minimum_investment_return", "distributable_amount", "qualifying_distributions", "program_related_investments",
  "undistributed_income", "excess_carryover", "payout_rate", "grant_rate"] as const;
export const FOUNDATION_FINANCE_NOTE = "One row per tax year from the foundation's Form 990-PF (the newest return for the year). payout_rate = qualifying distributions / net investment assets, the measure the 5% rule uses. grant_rate = grants paid / fair market value of all assets at year end. meets_distributable = qualifying distributions reached the distributable amount that year (falling short is allowed if made up next year or covered by carryover, and it is blank for operating foundations).";

export async function apiFoundationFinances(einRaw: string) {
  const e = einRaw.replace(/-/g, "");
  if (!/^\d{9}$/.test(e)) throw new BadParam("ein", "EIN must be 9 digits.");
  const [{ rows }, { rows: [name] }] = await Promise.all([
    db.query(`SELECT * FROM foundation_finances WHERE ein = $1 ORDER BY tax_year DESC`, [e]),
    db.query(`SELECT coalesce((SELECT name FROM funders WHERE ein = $1), (SELECT name FROM orgs WHERE ein = $1)) AS name`, [e]),
  ]);
  if (!rows.length) return null;
  return {
    ein: e, name: name?.name ?? null, years: rows.length,
    results: rows.map((r) => ({
      tax_year: r.tax_year, tax_period_end: r.tax_period_end ? isoDay(r.tax_period_end) : null, amended: r.amended,
      private_operating: r.private_operating, charitable_trust: r.charitable_trust,
      ...Object.fromEntries(FOUNDATION_NUMS.map((k) => [k, num(r[k])])),
      meets_distributable: r.meets_distributable, filing_url: filing(e, r.object_id),
    })),
    notes: [FOUNDATION_FINANCE_NOTE],
  };
}

const ORG_NUMS = ["revenue", "expenses", "surplus", "contributions", "program_revenue", "government_grants", "cash", "months_cash",
  "total_assets", "total_liabilities", "net_assets", "unrestricted_net_assets"] as const;
export const ORG_FINANCE_NOTE = "One row per tax year from Form 990 or 990-EZ. source 'filing' is the year's own return. 'prior_year' fills a missing year from the next return's prior-year column (no cash, government grants or liabilities). 990-EZ has no prior-year column, so compare years on form 990. surplus = revenue - expenses, months_cash = cash and savings / monthly expenses, deficit_streak = consecutive deficit years ending this one. revenue_band 1-8 is NomBot's size band.";

export async function apiOrgFinances(einRaw: string) {
  const e = einRaw.replace(/-/g, "");
  if (!/^\d{9}$/.test(e)) throw new BadParam("ein", "EIN must be 9 digits.");
  const [{ rows }, { rows: [o] }] = await Promise.all([
    db.query(`SELECT * FROM org_finance_year WHERE ein = $1 ORDER BY tax_year DESC`, [e]),
    db.query(`SELECT name FROM orgs WHERE ein = $1`, [e]),
  ]);
  if (!rows.length) return null;
  return {
    ein: e, name: o?.name ?? null, years: rows.length,
    results: rows.map((r) => ({
      tax_year: r.tax_year, form: r.form, source: r.source,
      ...Object.fromEntries(ORG_NUMS.map((k) => [k, num(r[k])])),
      deficit: r.deficit, low_cash: r.low_cash, negative_net_assets: r.negative_net_assets, deficit_streak: r.deficit_streak,
      revenue_band: r.revenue_band, state: r.state, county_fips: r.county_fips, ntee: r.ntee_cd, subsection: r.subsection,
      filing_url: r.source === "filing" ? filing(e, r.object_id) : null,
    })),
    notes: [ORG_FINANCE_NOTE],
  };
}

// ---------- household giving (IRS SOI individual) ----------
const AGI_COUNTY = ["", "No AGI or negative", "$1 to $10K", "$10K to $25K", "$25K to $50K", "$50K to $75K", "$75K to $100K", "$100K to $200K", "$200K or more"];
const AGI_ZIP = ["", "$1 to $25K", "$25K to $50K", "$50K to $75K", "$75K to $100K", "$100K to $200K", "$200K or more"];
export const HOUSEHOLD_NOTE = "IRS Statistics of Income individual returns by state and county (tax years 2013-2023) and ZIP code (2013-2022). charity_usd is the itemized charitable deduction (Schedule A), so it counts itemizers only: itemizing fell by about 60% from tax year 2018 after the standard deduction doubled. nonitem_charity_* is the 2020-2021 deduction for non-itemizers. A deduction is not all giving. Cells under 20 returns are suppressed. Dollars, not thousands. ZIP rows are each ZIP's own returns, so they don't add to county totals.";

export async function apiHouseholdGiving(p: In) {
  const level = oneOf(p, "level", ["state", "county", "zip"] as const) ?? "state";
  const maxYear = level === "zip" ? 2022 : 2023;
  const [yearFrom, yearTo] = yearRange(p, "year_from", "year_to", 2013, maxYear);
  const f = { level, state: state(p), county: fips(p), zip: text(p, "zip", 5), year_from: yearFrom, year_to: yearTo, by_agi: bool(p, "by_agi") === true, limit: pageSize(p, 100, 1000) };
  if (f.zip && !/^\d{5}$/.test(f.zip)) throw new BadParam("zip", "zip must be 5 digits.");
  if (f.county && level !== "county") throw new BadParam("county", "county needs level=county.");
  if (f.zip && level !== "zip") throw new BadParam("zip", "zip needs level=zip.");
  const after = cursor(p, f.by_agi ? ["n", "s", "n"] : ["n", "s"]);

  const q = new Sql();
  q.and(`t.tax_year BETWEEN ${q.v(yearFrom)} AND ${q.v(yearTo)}`);
  let table: string, geo: string, extra = "";
  if (level === "zip") {
    table = "soi_individual_zip"; geo = "t.zip5";
    q.and(f.zip ? `t.zip5 = ${q.v(f.zip)}` : "t.zip5 NOT IN ('00000', '99999')");
  } else {
    table = "soi_individual_county"; geo = "t.county_fips"; extra = ", min(t.county_name) AS county_name";
    q.and(`t.level = ${q.v(level)}`);
    if (f.county) q.and(`t.county_fips = ${q.v(f.county)}`);
  }
  if (f.state) q.and(`t.state = ${q.v(f.state)}`);
  if (after) {
    const [y, g] = [q.v(after[0]), q.v(after[1])];
    q.and(f.by_agi
      ? `(t.tax_year < ${y} OR (t.tax_year = ${y} AND (${geo} > ${g} OR (${geo} = ${g} AND t.agi_stub > ${q.v(after[2])}))))`
      : `(t.tax_year < ${y} OR (t.tax_year = ${y} AND ${geo} > ${g}))`);
  }
  const m = ["returns", "agi", "itemizers", "itemized", "charity_n", "charity_usd", "nonitem_charity_n", "nonitem_charity_usd"];
  const group = f.by_agi ? `t.tax_year, t.state, ${geo}, t.agi_stub` : `t.tax_year, t.state, ${geo}`;
  const { rows } = await db.query(
    `SELECT t.tax_year, t.state, ${geo} AS geo${f.by_agi ? ", t.agi_stub" : ""}${extra}, ${m.map((k) => `sum(t.${k})::float8 AS ${k}`).join(", ")}
       FROM ${table} t ${q.clause} GROUP BY ${group}
      ORDER BY t.tax_year DESC, ${geo}${f.by_agi ? ", t.agi_stub" : ""} LIMIT ${q.v(f.limit + 1)}`, q.params);
  const pg = page(rows, f.limit, (r) => (f.by_agi ? [r.tax_year, r.geo, r.agi_stub] : [r.tax_year, r.geo]));
  const ratio = (a: number | null, b: number | null) => (a != null && b ? Math.round((a / b) * 1e4) / 1e4 : null);
  return {
    filters: f,
    ...pg,
    results: pg.results.map((r) => ({
      tax_year: r.tax_year, level, state: r.state,
      ...(level === "zip" ? { zip: r.geo } : level === "county" ? { county_fips: r.geo, county_name: r.county_name } : {}),
      ...(f.by_agi ? { agi_class: r.agi_stub, agi_label: (level === "zip" ? AGI_ZIP : AGI_COUNTY)[r.agi_stub] ?? null } : {}),
      ...Object.fromEntries(m.map((k) => [k, r[k]])),
      share_itemizing: ratio(r.itemizers, r.returns),
      share_claiming_charity: ratio(r.charity_n, r.returns),
      avg_charity_deduction: r.charity_n ? Math.round(r.charity_usd / r.charity_n) : null,
    })),
    notes: [HOUSEHOLD_NOTE],
  };
}

// ---------- cause labels ----------
type Grade = { p?: number; n?: number; lo?: number; hi?: number };
export async function apiLabels() {
  const { rows } = await db.query(
    `SELECT l.label, l.name, l.definition, l.includes, l.excludes, l.mixed_rule, l.version, l.grading,
            count(*) FILTER (WHERE o.tier = 'primary')::int AS primary_n, count(*) FILTER (WHERE o.tier = 'partial')::int AS partial_n
       FROM cause_labels l LEFT JOIN org_labels o ON o.label = l.label GROUP BY l.label ORDER BY l.label`);
  const pct = (g: Grade | undefined) => (g?.p == null ? null : { estimate: g.p, low: g.lo ?? null, high: g.hi ?? null, sample: g.n ?? null });
  return {
    count: rows.length,
    results: rows.map((r) => {
      const g = r.grading ?? {};
      return {
        label: r.label, name: r.name, definition: r.definition, includes: r.includes, excludes: r.excludes, mixed_rule: r.mixed_rule, version: r.version,
        orgs: { primary: r.primary_n, partial: r.partial_n },
        grades: r.grading
          ? {
              classifier: g.classifier ?? null, judge: g.judge ?? null,
              primary_precision: g.primary?.exact_weighted ?? null, primary_sample: pct(g.primary?.exact),
              partial_in_label_precision: g.partial?.in_label_weighted ?? null, partial_exact_tier: g.partial?.exact_weighted ?? null, partial_sample: pct(g.partial?.in_label),
              recall_estimate: g.recall_est ?? null,
            }
          : null,
        api_path: `/api/v1/labels/${r.label}/orgs`,
      };
    }),
    notes: ["Graded cause labels for causes no NTEE code captures. primary = the cause is the organization's main work, partial = one named goal or program among broader work. Precision comes from a judge model grading a random sample of each tier (estimate with a 95% interval). recall_estimate is the share of judged-relevant organizations the labels found."],
  };
}

export async function apiLabelOrgs(label: string, p: In) {
  if (!isLabel(label)) return null;
  const f = { label, tier: oneOf(p, "tier", ["primary", "partial", "all"] as const) ?? "primary", state: state(p), ntee: text(p, "ntee", 5)?.toUpperCase() ?? null, limit: pageSize(p, 100, 1000) };
  if (f.ntee && !/^[A-Z][0-9A-Z]{0,4}$/.test(f.ntee)) throw new BadParam("ntee", "ntee must be an NTEE code prefix, e.g. C or C32.");
  const after = cursor(p, ["s"]);
  const q = new Sql();
  q.and(`l.label = ${q.v(label)}`);
  if (f.tier !== "all") q.and(`l.tier = ${q.v(f.tier)}`);
  if (f.state) q.and(`o.state = ${q.v(f.state)}`);
  if (f.ntee) q.and(`o.ntee_cd LIKE ${q.v(f.ntee + "%")}`);
  if (after) q.and(`l.ein > ${q.v(after[0])}`);
  const { rows } = await db.query(
    `SELECT l.ein, l.tier, l.score, l.method, l.evidence, l.version, o.name, o.city, o.state, o.ntee_cd, o.revenue_amt
       FROM org_labels l LEFT JOIN orgs o ON o.ein = l.ein ${q.clause} ORDER BY l.ein LIMIT ${q.v(f.limit + 1)}`, q.params);
  const pg = page(rows, f.limit, (r) => [r.ein]);
  return {
    filters: f,
    ...pg,
    results: pg.results.map((r) => ({
      ein: r.ein, name: r.name, city: r.city, state: r.state, ntee: r.ntee_cd, revenue: num(r.revenue_amt),
      tier: r.tier, score: num(r.score), method: r.method, why: r.evidence, version: r.version, api_path: `/api/v1/org/${r.ein}`,
    })),
  };
}

// ---------- policy: bills, Federal Register, news ----------
const tsq = (q: Sql, col: string, text: string) => q.and(`${col} @@ websearch_to_tsquery('english', ${q.v(text)})`);
export const POLICY_NOTE = "No organization or EIN links: these are public documents matched by keyword (English stemming, quotes for phrases, -word to exclude), or by meaning with semantic=true.";
export const SEMANTIC_NOTE = "semantic=true: ranked by meaning (cosine similarity of nomic-embed-text-v1.5 vectors, the model NomBot search uses), closest first, instead of keyword match and date. Every row with a vector is ranked, so later pages drift off topic: read similarity. Rows loaded in the last few minutes may not have a vector yet.";

// semantic=true: the q vector's distance to each row (pgvector cosine), rows without a current vector left out.
// Returns null for keyword search. The distance is the first cursor key, so pages stay in order.
async function semantic(p: In, q: Sql, alias: string, text: string | null) {
  if (bool(p, "semantic") !== true) return null;
  if (!text) throw new BadParam("q", "semantic=true needs q.");
  const vec = await embedQuery(text);
  q.and(`${alias}.embedding_model = ${q.v(MODEL_ID)}`);
  return `(${alias}.embedding <=> ${q.v(toSql(vec))}::vector)`;
}
const sim = (dist: unknown) => Math.round((1 - Number(dist)) * 1000) / 1000;
export const BILL_TYPES = ["hr", "s", "hres", "sres", "hjres", "sjres", "hconres", "sconres"] as const;

export async function apiBills(p: In) {
  const f = {
    q: text(p, "q"), congress: int(p, "congress", 93, 200), bill_type: oneOf(p, "bill_type", BILL_TYPES), chamber: oneOf(p, "chamber", ["House", "Senate"] as const),
    introduced_from: day(p, "introduced_from"), introduced_to: day(p, "introduced_to"), action_from: day(p, "action_from"), action_to: day(p, "action_to"),
    semantic: bool(p, "semantic") === true, limit: pageSize(p, 50, 500),
  };
  const q = new Sql();
  const dist = await semantic(p, q, "b", f.q);
  const after = cursor(p, dist ? ["n", "n", "s", "n"] : ["s", "n", "s", "n"]);
  if (f.q && !dist) tsq(q, "b.search", f.q);
  if (f.congress) q.and(`b.congress = ${q.v(f.congress)}`);
  if (f.bill_type) q.and(`b.bill_type = ${q.v(f.bill_type)}`);
  if (f.chamber) q.and(`b.origin_chamber = ${q.v(f.chamber)}`);
  if (f.introduced_from) q.and(`b.introduced >= ${q.v(f.introduced_from)}::date`);
  if (f.introduced_to) q.and(`b.introduced <= ${q.v(f.introduced_to)}::date`);
  if (f.action_from) q.and(`b.latest_action_date >= ${q.v(f.action_from)}::date`);
  if (f.action_to) q.and(`b.latest_action_date <= ${q.v(f.action_to)}::date`);
  const d = "coalesce(b.latest_action_date, b.introduced, date '1900-01-01')::text";
  if (after && dist) q.and(`(${dist}, b.congress, b.bill_type, b.number) > (${q.v(after[0])}::float8, ${q.v(after[1])}, ${q.v(after[2])}, ${q.v(after[3])})`);
  else if (after) q.and(`(${d}, b.congress, b.bill_type, b.number) < (${q.v(after[0])}, ${q.v(after[1])}, ${q.v(after[2])}, ${q.v(after[3])})`);
  const { rows } = await db.query(
    `SELECT b.congress, b.bill_type, b.number, b.title, b.origin_chamber, b.introduced::text AS introduced, b.latest_action_date::text AS action_date,
            b.latest_action, b.updated_at, b.url, ${d} AS sort_day${dist ? `, ${dist} AS dist` : ""}
       FROM congress_bills b ${q.clause}
      ORDER BY ${dist ? `${dist}, b.congress, b.bill_type, b.number` : `${d} DESC, b.congress DESC, b.bill_type DESC, b.number DESC`} LIMIT ${q.v(f.limit + 1)}`, q.params);
  const pg = page(rows, f.limit, (r) => [dist ? r.dist : r.sort_day, r.congress, r.bill_type, r.number]);
  return {
    filters: f, ...pg,
    results: pg.results.map((r) => ({
      id: `${r.congress}-${r.bill_type}-${r.number}`, congress: r.congress, bill_type: r.bill_type, number: r.number, title: r.title,
      chamber: r.origin_chamber, introduced: r.introduced, latest_action: { date: r.action_date, text: r.latest_action },
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at, url: r.url,
      ...(dist ? { similarity: sim(r.dist) } : {}),
    })),
    notes: ["Bills and resolutions of the current (119th) Congress from Congress.gov, refreshed daily. Search covers the title and latest action. Committees, sponsors and bill text are not loaded yet.", POLICY_NOTE, ...(dist ? [SEMANTIC_NOTE] : [])],
  };
}

export const FR_TYPES = ["Rule", "Proposed Rule", "Notice", "Presidential Document"] as const;
export async function apiFederalRegister(p: In) {
  const f = {
    q: text(p, "q"), type: oneOf(p, "type", FR_TYPES), agency: text(p, "agency", 100), date_from: day(p, "date_from"), date_to: day(p, "date_to"),
    funding_only: bool(p, "funding_only") === true, significant: bool(p, "significant"), semantic: bool(p, "semantic") === true, limit: pageSize(p, 50, 500),
  };
  const q = new Sql();
  const dist = await semantic(p, q, "d", f.q);
  const after = cursor(p, dist ? ["n", "s"] : ["s", "s"]);
  if (f.q && !dist) tsq(q, "d.search", f.q);
  if (f.type) q.and(`d.type = ${q.v(f.type)}`);
  if (f.agency) q.and(`EXISTS (SELECT 1 FROM unnest(d.agencies) a WHERE a ILIKE ${q.v(`%${f.agency}%`)})`);
  if (f.date_from) q.and(`d.publication_date >= ${q.v(f.date_from)}::date`);
  if (f.date_to) q.and(`d.publication_date <= ${q.v(f.date_to)}::date`);
  if (f.funding_only) q.and("d.funding_notice");
  if (f.significant != null) q.and(`coalesce(d.significant, false) = ${q.v(f.significant)}`);
  if (after && dist) q.and(`(${dist}, d.document_number) > (${q.v(after[0])}::float8, ${q.v(after[1])})`);
  else if (after) q.and(`(d.publication_date::text, d.document_number) < (${q.v(after[0])}, ${q.v(after[1])})`);
  const { rows } = await db.query(
    `SELECT d.document_number, d.title, d.type, d.abstract, d.agencies, d.action, d.publication_date::text AS published, d.significant, d.funding_notice, d.html_url${dist ? `, ${dist} AS dist` : ""}
       FROM federal_register_docs d ${q.clause}
      ORDER BY ${dist ? `${dist}, d.document_number` : "d.publication_date DESC, d.document_number DESC"} LIMIT ${q.v(f.limit + 1)}`, q.params);
  const pg = page(rows, f.limit, (r) => [dist ? r.dist : r.published, r.document_number]);
  return {
    filters: f, ...pg,
    results: pg.results.map((r) => ({
      document_number: r.document_number, title: r.title, type: r.type, action: r.action, abstract: r.abstract, agencies: r.agencies ?? [],
      published: r.published, significant: r.significant, funding_notice: r.funding_notice, url: r.html_url,
      ...(dist ? { similarity: sim(r.dist) } : {}),
    })),
    notes: ["Federal Register documents (rules, proposed rules, notices, presidential documents) from federalregister.gov, from October 2025 on, refreshed daily. funding_notice marks notices of funding opportunity, found by wording. Search covers title and abstract.", POLICY_NOTE, ...(dist ? [SEMANTIC_NOTE] : [])],
  };
}

const ALSO_MAX = 10;
const DUP_NOTE = `One row per story: copies of the same story under other URLs (same headline, or a headline with near identical meaning within 3 days) are hidden. duplicates counts them, also_reported_by lists their other outlets (up to ${ALSO_MAX}, first seen first). include_duplicates=true shows every copy.`;
const DUP_NOTE_ALL = "include_duplicates=true: every copy of a story is listed. duplicate_of is the id of the story's canonical row (null on the canonical row itself).";
export const NEWS_TOPICS = ["nonprofit", "philanthropy", "foundation grants", "donations", "nonprofit cuts", "giving"] as const;
export async function apiNews(p: In) {
  const f = { q: text(p, "q"), topic: oneOf(p, "topic", NEWS_TOPICS), outlet: text(p, "outlet", 100) ?? text(p, "domain", 100), country: text(p, "country", 50), date_from: day(p, "date_from"), date_to: day(p, "date_to"), semantic: bool(p, "semantic") === true, include_duplicates: bool(p, "include_duplicates") === true, limit: pageSize(p, 50, 500) };
  const q = new Sql();
  const dist = await semantic(p, q, "n", f.q);
  if (!f.include_duplicates) q.and("n.duplicate_of IS NULL");
  const after = cursor(p, dist ? ["n", "s"] : ["s", "s"]);
  if (f.q && !dist) tsq(q, "n.search", f.q);
  if (f.topic) q.and(`n.queries @> ARRAY[${q.v(f.topic)}]::text[]`);
  if (f.outlet) q.and(`n.domain ILIKE ${q.v(`%${f.outlet}%`)}`);
  if (f.country) q.and(`n.source_country ILIKE ${q.v(f.country)}`);
  if (f.date_from) q.and(`n.seen_at >= ${q.v(f.date_from)}::date`);
  if (f.date_to) q.and(`n.seen_at < ${q.v(f.date_to)}::date + 1`);
  if (after && dist) q.and(`(${dist}, n.url) > (${q.v(after[0])}::float8, ${q.v(after[1])})`);
  else if (after) q.and(`(n.seen_at, n.url) < (${q.v(after[0])}::timestamptz, ${q.v(after[1])})`);
  const { rows } = await db.query(
    `SELECT n.id, n.url, n.title, n.seen_at, n.domain, n.source_country, n.language, n.queries, n.duplicate_of, n.dup_count,
            CASE WHEN n.dup_count > 0 THEN ARRAY(SELECT x.domain FROM news_articles x WHERE x.duplicate_of = n.id AND x.domain IS DISTINCT FROM n.domain
                                                  GROUP BY x.domain ORDER BY min(x.seen_at), x.domain LIMIT ${ALSO_MAX}) END AS also${dist ? `, ${dist} AS dist` : ""}
       FROM news_articles n ${q.clause} ORDER BY ${dist ? `${dist}, n.url` : "n.seen_at DESC, n.url DESC"} LIMIT ${q.v(f.limit + 1)}`, q.params);
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));
  const pg = page(rows, f.limit, (r) => [dist ? r.dist : iso(r.seen_at), r.url]);
  return {
    filters: f, ...pg,
    results: pg.results.map((r) => ({
      id: Number(r.id), title: r.title, url: r.url, seen_at: iso(r.seen_at), domain: r.domain, country: r.source_country, language: r.language, topics: r.queries,
      duplicates: r.dup_count, also_reported_by: r.also ?? [], ...(f.include_duplicates ? { duplicate_of: r.duplicate_of == null ? null : Number(r.duplicate_of) } : {}),
      ...(dist ? { similarity: sim(r.dist) } : {}),
    })),
    notes: [
      "News about philanthropy and the nonprofit sector from GDELT (headlines and links only, no article text). topic is one of: nonprofit, philanthropy, foundation grants, donations, nonprofit cuts, giving. Search covers the headline.",
      "Two GDELT feeds: its search API (up to 250 headlines per topic per day, matched on full text) and its raw crawl files (headline must match the topic, so fewer per day). From June 2026 on, refreshed daily.",
      f.include_duplicates ? DUP_NOTE_ALL : DUP_NOTE,
      POLICY_NOTE, ...(dist ? [SEMANTIC_NOTE] : []),
    ],
  };
}

// MCP search_policy: the three sources in one call, a few of each.
export async function apiPolicy(p: In) {
  const which = oneOf(p, "source", ["all", "bills", "federal_register", "news"] as const) ?? "all";
  const lim = String(int(p, "limit", 1, 50) ?? 10);
  const common = { q: p.q, semantic: p.semantic, limit: lim };
  const [bills, fr, news] = await Promise.all([
    which === "all" || which === "bills" ? apiBills({ ...common, action_from: p.date_from, action_to: p.date_to }) : null,
    which === "all" || which === "federal_register" ? apiFederalRegister({ ...common, agency: p.agency, type: p.type, date_from: p.date_from, date_to: p.date_to, funding_only: p.funding_only }) : null,
    which === "all" || which === "news" ? apiNews({ ...common, topic: p.topic, outlet: p.outlet, date_from: p.date_from, date_to: p.date_to, include_duplicates: p.include_duplicates }) : null,
  ]);
  return { source: which, ...(bills ? { bills } : {}), ...(fr ? { federal_register: fr } : {}), ...(news ? { news } : {}) };
}

// ---------- routes ----------
// GET handler for a list endpoint: query string in, JSON out, 400 on a bad parameter, 404 when fn returns null.
export function listRoute<C>(route: string, fn: (p: In, ctx: C) => Promise<unknown>, notFound = "Nothing found.") {
  return keyed(route, async (request: Request, ctx: C) => {
    const p: In = Object.fromEntries(new URL(request.url).searchParams);
    try {
      const out = await fn(p, ctx);
      return out == null ? apiError(404, "not_found", notFound) : withRows(Response.json(out), countRows(out));
    } catch (e) {
      if (e instanceof BadParam) return apiError(400, "bad_param", e.message);
      throw e;
    }
  });
}
