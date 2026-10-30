// Partner API and MCP checks against a running server (default the dev server on :3000). Makes a temporary key
// with `npm run api-key -- create "api-test"` (the secret stays in memory, never printed) and revokes it at the end.
// Every /api/v1 endpoint: 401 without a key, JSON shape, 400 on bad input, cursor pagination, a few values vs SQL,
// timings. MCP: lists tools and calls each new one with the SDK client. No Claude calls (the answer endpoint
// is called with spec, not q).
//   npm run test:api                       against http://localhost:3000
//   npm run test:api -- --base=http://localhost:4000
import { join } from "node:path";
import { execFileSync } from "node:child_process";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { db } = await import("../lib/db");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? process.env.API_BASE ?? "http://localhost:3000").replace(/\/$/, "");
let fails = 0, passes = 0;
const check = (ok: boolean, what: string) => { if (ok) passes++; else { fails++; console.log(`FAIL  ${what}`); } };
const timings: [string, number][] = [];

// Temporary key: create, read the secret from the command's output, keep only the id for the revoke.
const out = execFileSync("npm", ["run", "-s", "api-key", "--", "create", "api-test", "--rate=1000"], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
const KEY = /nb_live_[A-Za-z0-9_-]+/.exec(out)?.[0];
const KEY_ID = /Key (\d+)/.exec(out)?.[1];
if (!KEY || !KEY_ID) throw new Error("Could not create the test key.");
console.log(`Test key #${KEY_ID} created. Base ${BASE}`);

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function get(path: string, key: string | null = KEY!): Promise<{ status: number; body: J; headers: Headers; ms: number }> {
  const t = performance.now();
  const r = await fetch(BASE + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  const ms = Math.round(performance.now() - t);
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers, ms };
}
async function ok(path: string, label = path) {
  const r = await get(path);
  timings.push([label, r.ms]);
  check(r.status === 200, `${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body;
}
const sql = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows;
const isList = (b: J, path: string) => {
  check(Array.isArray(b.results), `${path}: results is an array`);
  check(typeof b.count === "number" && b.count === b.results?.length, `${path}: count matches results`);
  check(typeof b.has_more === "boolean" && (b.has_more ? typeof b.next_cursor === "string" : b.next_cursor === null), `${path}: has_more / next_cursor`);
  check(typeof b.filters === "object", `${path}: filters echoed`);
};

try {
  // ---------- auth ----------
  const ENDPOINTS = ["/api/v1/search?q=food", "/api/v1/org/341877332", "/api/v1/research", "/api/v1/grants", "/api/v1/federal-awards",
    "/api/v1/foundations/131684331/finances", "/api/v1/orgs/341877332/finances", "/api/v1/orgs/341877332/status", "/api/v1/orgs/341877332/similar", "/api/v1/household-giving", "/api/v1/labels",
    "/api/v1/labels/climate/orgs", "/api/v1/congress/bills", "/api/v1/federal-register", "/api/v1/news"];
  for (const e of ENDPOINTS) {
    const r = await get(e, null);
    check(r.status === 401 && r.body.error?.code === "missing_key", `${e} without key -> 401 missing_key (got ${r.status})`);
  }
  check((await get("/api/v1/grants", "nb_live_notarealkey")).status === 401, "unknown key -> 401");
  const mcpNoKey = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check(mcpNoKey.status === 401, `/mcp without key -> 401 (got ${mcpNoKey.status})`);

  // ---------- grants ----------
  let b = await ok("/api/v1/grants?limit=5", "grants (no filter)");
  isList(b, "grants");
  check(b.results.every((g: J) => g.tax_year >= 2012 && g.tax_year <= 2025 && g.funder?.ein && "recipient" in g), "grants: row shape");
  // Pagination: two pages of 5 = one page of 10, in order, no overlap
  const p1 = await ok("/api/v1/grants?state=WV&year_from=2022&year_to=2024&limit=5", "grants state+years");
  const p2 = await ok(`/api/v1/grants?state=WV&year_from=2022&year_to=2024&limit=5&cursor=${p1.next_cursor}`, "grants page 2");
  const p12 = await ok("/api/v1/grants?state=WV&year_from=2022&year_to=2024&limit=10");
  check(JSON.stringify([...p1.results, ...p2.results].map((g: J) => g.id)) === JSON.stringify(p12.results.map((g: J) => g.id)), "grants: page 1 + page 2 = limit 10");
  check(p1.results.every((g: J) => g.recipient.state === "WV" && g.tax_year >= 2022 && g.tax_year <= 2024), "grants: state and year filters hold");
  // Values vs SQL: one funder's grants in 2022-24, count and total
  const FUNDER = "010277832";
  const [s1] = await sql("SELECT count(*)::int AS n, sum(amount)::float8 AS usd FROM grants WHERE funder_ein = $1 AND tax_year BETWEEN 2022 AND 2024", [FUNDER]);
  b = await ok(`/api/v1/grants?funder_ein=${FUNDER}&year_from=2022&year_to=2024&totals=true&limit=500`, "grants funder + totals");
  check(b.totals?.count === s1.n && b.totals?.amount === s1.usd, `grants totals vs SQL (${b.totals?.count}/${s1.n}, ${b.totals?.amount}/${s1.usd})`);
  check(b.results.length === Math.min(s1.n, 500) && b.results.every((g: J) => g.funder.ein === FUNDER), "grants funder rows vs SQL count");
  // Walk every page of a small filter: rows = SQL count, ids unique
  const [s2] = await sql("SELECT count(*)::int AS n FROM grants WHERE funder_ein = $1 AND tax_year BETWEEN 2022 AND 2024", [FUNDER]);
  const seen = new Set<number>(); let cur: string | null = null, pages = 0;
  do {
    const r: J = await ok(`/api/v1/grants?funder_ein=${FUNDER}&year_from=2022&year_to=2024&limit=50${cur ? `&cursor=${cur}` : ""}`);
    r.results.forEach((g: J) => seen.add(g.id)); cur = r.next_cursor; pages++;
  } while (cur && pages < 20);
  check(seen.size === s2.n, `grants: walking ${pages} pages gives ${seen.size} unique rows, SQL ${s2.n}`);
  b = await ok("/api/v1/grants?county=54011&limit=5", "grants county");
  check(b.results.every((g: J) => g.recipient.county_fips === "54011"), "grants: county filter holds");
  b = await ok("/api/v1/grants?label=climate&year_from=2023&year_to=2024&limit=5", "grants label");
  const climate = new Set((await sql("SELECT ein FROM org_labels WHERE label = 'climate' AND tier = 'primary'")).map((r) => r.ein));
  check(b.results.length > 0 && b.results.every((g: J) => climate.has(g.recipient.ein)), "grants: label filter holds");
  b = await ok("/api/v1/grants?amount_min=1000000&limit=5", "grants amount_min");
  check(b.results.every((g: J) => g.amount >= 1e6), "grants: amount_min holds");
  b = await ok("/api/v1/grants?source=charity&funder_type=daf_sponsor&limit=5", "grants charity DAF");
  check(b.results.every((g: J) => g.source === "charity" && g.funder.type === "daf_sponsor"), "grants charity: funder_type holds");
  b = await ok("/api/v1/grants?source=charity&funder_type=other&state=WV&limit=5", "grants charity other");
  check(b.results.every((g: J) => g.funder.type === "other"), "grants charity: funder_type other holds");
  b = await ok("/api/v1/grants?source=charity&recipient_ein=341877332&limit=100");
  const [s3] = await sql("SELECT count(*)::int AS n FROM charity_grants WHERE recipient_ein = '341877332' AND tax_year BETWEEN 2012 AND 2025 AND NOT is_placeholder_recipient(recipient_name)");
  check(b.results.length === s3.n, `grants charity recipient rows vs SQL (${b.results.length}/${s3.n})`);
  const indiv = await sql("SELECT id, tax_year FROM grants WHERE recipient_kind = 'individual' AND tax_year = 2024 LIMIT 1");
  if (indiv.length) {
    const fe = (await sql("SELECT funder_ein FROM grants WHERE id = $1", [indiv[0].id]))[0].funder_ein;
    b = await ok(`/api/v1/grants?funder_ein=${fe}&year_from=2024&year_to=2024&limit=500`);
    const row = b.results.find((g: J) => g.id === Number(indiv[0].id));
    check(row?.recipient.individual === true && row.recipient.name === "Individual (name withheld)" && row.recipient.zip === null, "grants: individual recipient's name withheld");
  }
  for (const [q, code] of [["year_from=2011", "bad_param"], ["funder_ein=123", "bad_param"], ["cursor=xyz", "bad_param"], ["funder_type=daf_sponsor", "bad_param"], ["label=dogs", "bad_param"], ["county=99999", "bad_param"]]) {
    const r = await get(`/api/v1/grants?${q}`);
    check(r.status === 400 && r.body.error?.code === code, `grants?${q} -> 400 ${code} (got ${r.status})`);
  }

  // ---------- federal awards ----------
  b = await ok("/api/v1/federal-awards?limit=5", "federal-awards (no filter)");
  isList(b, "federal-awards");
  const UPENN = "231352685";
  const [f1] = await sql("SELECT count(*)::int AS n, sum(amount)::float8 AS usd FROM federal_awards WHERE recipient_ein = $1", [UPENN]);
  b = await ok(`/api/v1/federal-awards?recipient_ein=${UPENN}&totals=true&limit=10`, "federal-awards recipient + totals");
  check(b.totals?.count === f1.n && b.totals?.amount === f1.usd, `federal-awards totals vs SQL (${b.totals?.count}/${f1.n})`);
  b = await ok("/api/v1/federal-awards?agency=075&assistance_listing=93.866&state=PA&fiscal_year_from=2025&limit=5", "federal-awards agency+cfda+state");
  check(b.results.every((a: J) => a.agency.code === "075" && a.assistance_listing.number === "93.866" && a.place_of_performance.state === "PA" && a.fiscal_year === 2025), "federal-awards: filters hold");
  b = await ok("/api/v1/federal-awards?assistance_listing=93&county=54011&limit=5", "federal-awards county");
  check(b.results.every((a: J) => a.assistance_listing.number?.startsWith("93.") && a.place_of_performance.county_fips === "54011"), "federal-awards: cfda prefix and county hold");
  const fp1 = await ok("/api/v1/federal-awards?state=WV&limit=3");
  const fp2 = await ok(`/api/v1/federal-awards?state=WV&limit=3&cursor=${fp1.next_cursor}`);
  check(!fp2.results.some((a: J) => fp1.results.some((x: J) => x.id === a.id)), "federal-awards: pages don't overlap");

  // ---------- finances ----------
  b = await ok("/api/v1/foundations/13-1684331/finances", "foundation finances");
  const [ff] = await sql("SELECT grants_paid::float8 AS g, payout_rate::float8 AS p FROM foundation_finances WHERE ein = '131684331' ORDER BY tax_year DESC LIMIT 1");
  check(b.results?.[0]?.grants_paid === ff.g && Math.abs(b.results[0].payout_rate - ff.p) < 1e-9, "foundation finances: newest grants_paid and payout_rate vs SQL");
  b = await ok("/api/v1/orgs/341877332/finances", "org finances");
  const of = await sql("SELECT tax_year, revenue::float8 AS r FROM org_finance_year WHERE ein = '341877332' ORDER BY tax_year DESC");
  check(b.results?.length === of.length && b.results[0].revenue === of[0].r, "org finances: years and revenue vs SQL");
  check((await get("/api/v1/foundations/000000001/finances")).status === 404, "foundation finances unknown EIN -> 404");
  check((await get("/api/v1/orgs/12/finances")).status === 400, "org finances bad EIN -> 400");

  // ---------- IRS tax status (Pub 78, revocations) ----------
  b = await ok("/api/v1/orgs/34-1877332/status", "tax status");
  const [p78] = await sql("SELECT deductibility_codes AS c FROM irs_pub78 WHERE ein = '341877332'");
  check(b.pub78?.eligible === Boolean(p78) && b.status === (p78 ? "eligible" : "not_listed") && b.pub78.codes.map((c: J) => c.code).join() === (p78?.c ?? []).join(), "tax status: Pub 78 eligibility and codes vs SQL");
  const [rv] = await sql(`SELECT s.ein, s.revocation_date::text AS d, s.status, (SELECT count(*)::int FROM irs_revocations r WHERE r.ein = s.ein) AS n
    FROM org_tax_status s WHERE s.status = 'revoked' AND s.revocations > 1 ORDER BY s.ein LIMIT 1`);
  b = await ok(`/api/v1/orgs/${rv.ein}/status`, "tax status revoked");
  check(b.status === "revoked" && b.revocation?.revoked_now === true && b.revocation.revocation_date === rv.d && b.revocation.history.length === rv.n && b.pub78.eligible === false, "tax status: revoked org's latest revocation and history vs SQL");
  const [fa] = await sql(`SELECT g.recipient_ein AS ein, count(*)::int AS n, sum(g.amount)::float8 AS usd FROM grant_clean g
    WHERE g.recipient_ein = (SELECT ein FROM org_tax_status WHERE status = 'revoked' AND ein IN (SELECT recipient_ein FROM grant_clean WHERE recipient_ein IS NOT NULL AND tax_year >= 2023) ORDER BY ein LIMIT 1)
      AND EXISTS (SELECT 1 FROM irs_revocations r WHERE r.ein = g.recipient_ein AND g.tax_year > extract(year FROM r.revocation_date)
        AND (r.reinstatement_date IS NULL OR extract(year FROM r.reinstatement_date) > g.tax_year)) GROUP BY 1`);
  if (fa) {
    b = await ok(`/api/v1/orgs/${fa.ein}/status`, "tax status funded after revocation");
    check(b.revocation?.grants_after_revocation?.count === fa.n && b.revocation.grants_after_revocation.total === fa.usd, "tax status: grants after revocation vs SQL");
  }
  b = await ok("/api/v1/org/341877332", "org (tax status)");
  check(b.org?.tax_status?.pub78?.eligible === Boolean(p78), "org: tax_status.pub78 vs SQL");
  const [lr] = await sql(`SELECT max(tax_year)::int AS y FROM (SELECT tax_year FROM filing_text WHERE ein = '341877332' UNION ALL SELECT tax_year FROM filing_flag WHERE ein = '341877332' UNION ALL SELECT tax_year FROM foundation_finances WHERE ein = '341877332') x`);
  check(b.org?.latest_990?.tax_year === lr.y && typeof b.org.latest_990.note === "string", `org: latest_990 tax year vs SQL (${b.org?.latest_990?.tax_year} / ${lr.y})`);
  check((await get("/api/v1/orgs/12/status")).status === 400, "tax status bad EIN -> 400");
  check((await get("/api/v1/orgs/000000001/status")).status === 404, "tax status unknown EIN -> 404");

  // ---------- similar organizations (generosity-data 070 org_similar) ----------
  const [sim] = await sql(`SELECT ein, count(*) FILTER (WHERE list = 'all')::int AS n, count(*) FILTER (WHERE list = 'less_funded')::int AS nl,
      (array_agg(similar_ein ORDER BY rank) FILTER (WHERE list = 'all'))[1] AS top, max(similarity) FILTER (WHERE list = 'all' AND rank = 1) AS s1
    FROM org_similar WHERE ein = (SELECT ein FROM org_similar WHERE list = 'less_funded' AND rank = 3 ORDER BY ein LIMIT 1) GROUP BY ein`);
  b = await ok(`/api/v1/orgs/${sim.ein}/similar`, "similar");
  check(b.list === "all" && b.count === Math.min(sim.n, 10) && b.results[0]?.ein === sim.top && Math.abs(b.results[0].similarity - sim.s1) < 0.001, "similar: count, top EIN and similarity vs SQL");
  check(b.results.every((x: J, i: number) => x.rank === i + 1 && x.similarity >= 0.8 && typeof x.similarity_words === "string" && x.url.endsWith(`/org/${x.ein}`)), "similar: ranks, threshold, words, urls");
  check(b.results.every((x: J, i: number) => i === 0 || x.similarity <= b.results[i - 1].similarity), "similar: best first");
  b = await ok(`/api/v1/orgs/${sim.ein}/similar?underfunded=true&limit=3`, "similar underfunded");
  check(b.list === "less_funded" && b.count === 3 && b.results.every((x: J) => x.foundation_grants_2022_2024 < 25000 && (x.revenue ?? 0) >= 50000), "similar underfunded: under $25K foundation grants, revenue $50K+");
  check(b.notes.length === 2, "similar underfunded: notes");
  b = await ok(`/api/v1/org/${sim.ein}`, "org (similar)");
  check(b.org?.similar?.results?.[0]?.ein === sim.top && typeof b.org.similar.underfunded_url === "string", "org: similar field vs SQL");
  check((await get("/api/v1/orgs/12/similar")).status === 400, "similar bad EIN -> 400");
  check((await get(`/api/v1/orgs/${sim.ein}/similar?underfunded=maybe`)).status === 400, "similar bad underfunded -> 400");
  check((await get(`/api/v1/orgs/${sim.ein}/similar?limit=11`)).status === 400, "similar limit 11 -> 400");
  check((await get("/api/v1/orgs/000000001/similar")).status === 404, "similar unknown EIN -> 404");

  // ---------- household giving ----------
  b = await ok("/api/v1/household-giving?state=WV&year_from=2022&year_to=2022", "household state");
  isList(b, "household-giving");
  const [h1] = await sql("SELECT sum(charity_usd)::float8 AS usd, sum(returns)::float8 AS n FROM soi_individual_county WHERE level = 'state' AND state = 'WV' AND tax_year = 2022");
  check(b.results.length === 1 && b.results[0].charity_usd === h1.usd && b.results[0].returns === h1.n, "household: WV 2022 charity_usd and returns vs SQL");
  b = await ok("/api/v1/household-giving?level=county&state=WV&year_from=2023&by_agi=true&limit=16", "household county by_agi");
  check(b.results.length === 16 && b.results[0].agi_class === 1 && typeof b.results[0].agi_label === "string", "household: by_agi rows");
  const hp2 = await ok(`/api/v1/household-giving?level=county&state=WV&year_from=2023&by_agi=true&limit=16&cursor=${b.next_cursor}`);
  check(hp2.results[0]?.county_fips > b.results[15].county_fips || hp2.results[0]?.agi_class > b.results[15].agi_class, "household: page 2 continues");
  const [hc] = await sql("SELECT count(DISTINCT county_fips)::int AS n FROM soi_individual_county WHERE level = 'county' AND state = 'WV' AND tax_year = 2023");
  b = await ok("/api/v1/household-giving?level=county&state=WV&year_from=2023&limit=1000");
  check(b.results.length === hc.n, `household: WV counties ${b.results.length} vs SQL ${hc.n}`);
  b = await ok("/api/v1/household-giving?level=zip&zip=25701", "household zip");
  check(b.results.length > 0 && b.results.every((r: J) => r.zip === "25701"), "household: zip filter");
  check((await get("/api/v1/household-giving?level=zip&year_from=2023")).status === 400, "household: zip 2023 -> 400");

  // ---------- labels ----------
  b = await ok("/api/v1/labels", "labels");
  const lc = await sql("SELECT label, count(*) FILTER (WHERE tier = 'primary')::int AS p FROM org_labels GROUP BY 1");
  const [nl] = await sql("SELECT count(*)::int AS n FROM cause_labels");
  check(b.results.length === nl.n && lc.every((r) => b.results.find((l: J) => l.label === r.label)?.orgs.primary === r.p), "labels: primary counts vs SQL");
  check(b.results.filter((l: J) => l.grades).every((l: J) => typeof l.grades.primary_precision === "number"), "labels: grades present");
  b = await ok("/api/v1/labels/climate/orgs?tier=primary&state=CO&limit=1000", "label orgs");
  const [lo] = await sql("SELECT count(*)::int AS n FROM org_labels l JOIN orgs o ON o.ein = l.ein WHERE l.label = 'climate' AND l.tier = 'primary' AND o.state = 'CO'");
  check(b.results.length === lo.n, `label orgs: climate primary CO ${b.results.length} vs SQL ${lo.n}`);
  const lp1 = await ok("/api/v1/labels/women_girls/orgs?limit=3");
  const lp2 = await ok(`/api/v1/labels/women_girls/orgs?limit=3&cursor=${lp1.next_cursor}`);
  check(lp2.results[0].ein > lp1.results[2].ein, "label orgs: page 2 continues by EIN");
  check((await get("/api/v1/labels/dogs/orgs")).status === 404, "label orgs: unknown label -> 404");
  // Sub-types (immigrants_refugees: services, policy; generosity-data 069): counts, filter, and the grants filter's default.
  const ir = (await ok("/api/v1/labels")).results.find((l: J) => l.label === "immigrants_refugees");
  const [sc] = await sql("SELECT count(*) FILTER (WHERE 'services' = ANY(subtypes) AND tier = 'primary')::int AS s, count(*) FILTER (WHERE 'policy' = ANY(subtypes) AND tier = 'primary')::int AS p FROM org_labels WHERE label = 'immigrants_refugees'");
  check(ir?.subtypes?.find((x: J) => x.subtype === "services")?.orgs.primary === sc.s && ir?.subtypes?.find((x: J) => x.subtype === "policy")?.orgs.primary === sc.p
    && ir.subtypes.find((x: J) => x.subtype === "services").default === true, `labels: immigrants_refugees subtypes services ${sc.s}, policy ${sc.p} primary vs SQL`);
  b = await ok("/api/v1/labels/immigrants_refugees/orgs?subtype=policy&tier=all&limit=1000", "label orgs subtype");
  const [pol] = await sql("SELECT count(*)::int AS n FROM org_labels WHERE label = 'immigrants_refugees' AND 'policy' = ANY(subtypes)");
  check(b.results.length === pol.n && b.results.every((r: J) => r.subtypes.includes("policy")) && b.results.some((r: J) => r.ein === "521136126"),
    `label orgs: immigrants_refugees policy ${b.results.length} vs SQL ${pol.n}, FAIR in it`);
  check((await get("/api/v1/labels/immigrants_refugees/orgs?subtype=nope")).status === 400, "label orgs: bad subtype -> 400");
  const gs = await ok("/api/v1/grants?label=immigrants_refugees&year_from=2023&year_to=2023&totals=true&limit=1", "grants label default subtype");
  const [gsq] = await sql(`SELECT count(*)::int AS n FROM grants g WHERE g.tax_year = 2023 AND g.recipient_ein IN (SELECT ein FROM org_labels WHERE label = 'immigrants_refugees' AND tier = 'primary' AND 'services' = ANY(subtypes))`);
  check(gs.filters.label_subtype === "services" && gs.totals?.count === gsq.n, `grants: label immigrants_refugees defaults to services (${gs.totals?.count} vs SQL ${gsq.n})`);

  // ---------- policy ----------
  b = await ok("/api/v1/congress/bills?q=charitable&limit=5", "bills q");
  isList(b, "bills");
  const [bc] = await sql("SELECT count(*)::int AS n FROM congress_bills WHERE search @@ websearch_to_tsquery('english', 'charitable')");
  let total = 0; cur = null; pages = 0;
  do {
    const r: J = await ok(`/api/v1/congress/bills?q=charitable&limit=500${cur ? `&cursor=${cur}` : ""}`);
    total += r.results.length; cur = r.next_cursor; pages++;
  } while (cur && pages < 10);
  check(total === bc.n, `bills: q=charitable ${total} rows vs SQL ${bc.n}`);
  b = await ok("/api/v1/congress/bills?bill_type=s&action_from=2026-09-01&limit=5", "bills type+date");
  check(b.results.every((x: J) => x.bill_type === "s" && x.latest_action.date >= "2026-09-01"), "bills: type and date filters hold");
  b = await ok("/api/v1/federal-register?agency=Education&type=Notice&funding_only=true&limit=5", "federal-register");
  isList(b, "federal-register");
  check(b.results.length > 0 && b.results.every((d: J) => d.funding_notice && d.agencies.some((a: string) => /education/i.test(a))), "federal-register: filters hold");
  const [fr] = await sql("SELECT count(*)::int AS n FROM federal_register_docs WHERE search @@ websearch_to_tsquery('english', 'nonprofit') AND publication_date >= '2026-06-01'");
  b = await ok("/api/v1/federal-register?q=nonprofit&date_from=2026-06-01&limit=500", "federal-register q+date");
  check(b.results.length === Math.min(fr.n, 500), `federal-register: q=nonprofit since June ${b.results.length} vs SQL ${fr.n}`);
  b = await ok("/api/v1/news?q=nonprofit&limit=5", "news");
  isList(b, "news");
  check((await get("/api/v1/news?date_from=yesterday")).status === 400, "news: bad date -> 400");
  check((await get("/api/v1/news?topic=sports")).status === 400, "news: unknown topic -> 400");
  const [nw] = await sql("SELECT count(*)::int AS n, count(*) FILTER (WHERE 'philanthropy' = ANY(queries) AND duplicate_of IS NULL)::int AS ph, count(*) FILTER (WHERE 'philanthropy' = ANY(queries))::int AS ph_all, max(seen_at)::date::text AS newest FROM news_articles");
  check(nw.n > 0, `news: table has rows (${nw.n})`);
  if (nw.n > 0) {
    const np1 = await ok("/api/v1/news?topic=philanthropy&limit=5", "news topic");
    check(np1.results.every((a: J) => a.topics.includes("philanthropy")), "news: topic filter holds");
    check(np1.results.every((a: J, i: number) => i === 0 || a.seen_at <= np1.results[i - 1].seen_at), "news: newest first");
    const np2 = await ok(`/api/v1/news?topic=philanthropy&limit=5&cursor=${np1.next_cursor}`);
    check(np2.results.length > 0 && np2.results[0].seen_at <= np1.results[4].seen_at && !np2.results.some((a: J) => np1.results.some((x: J) => x.url === a.url)), "news: page 2 continues, no overlap");
    let n = 0; cur = null; pages = 0;
    do {
      const r: J = await ok(`/api/v1/news?topic=philanthropy&limit=500${cur ? `&cursor=${cur}` : ""}`);
      n += r.results.length; cur = r.next_cursor; pages++;
    } while (cur && pages < 100);
    check(n === nw.ph, `news: topic=philanthropy walk ${n} canonical rows vs SQL ${nw.ph}`);
    // Duplicates (generosity-data 065): hidden by default, counted on the canonical row, listed with include_duplicates=true
    n = 0; cur = null; pages = 0;
    do {
      const r: J = await ok(`/api/v1/news?topic=philanthropy&include_duplicates=true&limit=500${cur ? `&cursor=${cur}` : ""}`);
      n += r.results.length; cur = r.next_cursor; pages++;
    } while (cur && pages < 100);
    check(n === nw.ph_all, `news: include_duplicates=true walk ${n} rows vs SQL ${nw.ph_all}`);
    const [dc] = await sql(`SELECT c.id::int, c.domain, c.dup_count, c.seen_at::date::text AS day,
        (SELECT count(DISTINCT x.domain) FROM news_articles x WHERE x.duplicate_of = c.id AND x.domain IS DISTINCT FROM c.domain)::int AS outlets
      FROM news_articles c WHERE c.duplicate_of IS NULL AND c.dup_count > 0 ORDER BY c.dup_count DESC, c.id LIMIT 1`);
    if (dc) {
      const walk = async (qs: string) => { const out: J[] = []; let c2: string | null = null, p2 = 0;
        do { const r: J = await ok(`/api/v1/news?date_from=${dc.day}&date_to=${dc.day}&limit=500${qs}${c2 ? `&cursor=${c2}` : ""}`); out.push(...r.results); c2 = r.next_cursor; p2++; } while (c2 && p2 < 20);
        return out; };
      const canon = await walk("");
      const hit = canon.find((a: J) => a.id === dc.id);
      check(canon.every((a: J) => !("duplicate_of" in a) && Array.isArray(a.also_reported_by)), "news: default rows are canonical only, each with also_reported_by");
      check(!!hit && hit.duplicates === dc.dup_count && hit.also_reported_by.length === Math.min(10, dc.outlets) && !hit.also_reported_by.includes(dc.domain),
        `news: canonical row counts ${dc.dup_count} copies, also_reported_by ${hit?.also_reported_by.length} of ${dc.outlets} outlets (cap 10)`);
      const all = await walk("&include_duplicates=true");
      check(all.length > canon.length && all.some((a: J) => a.duplicate_of === dc.id) && all.find((a: J) => a.id === dc.id)?.duplicate_of === null, "news: include_duplicates=true lists the copies with duplicate_of");
    }
    const dom = (await sql("SELECT domain FROM news_articles WHERE domain IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1"))[0].domain;
    b = await ok(`/api/v1/news?outlet=${encodeURIComponent(dom)}&date_from=${nw.newest}&limit=20`, "news outlet + date");
    check(b.results.every((a: J) => a.domain.includes(dom) && a.seen_at.slice(0, 10) >= nw.newest), "news: outlet and date filters hold");
    b = await ok("/api/v1/news?q=donation&limit=5", "news q");
    check(b.results.length > 0, "news: q finds headlines");
  }
  // News org links (generosity-data 071): ein= filter, orgs on each row, org news
  check((await get("/api/v1/news?ein=123")).status === 400, "news: bad ein -> 400");
  const [nk] = await sql("SELECT l.ein, count(*)::int AS n FROM news_org_links l JOIN news_articles a ON a.id = l.news_id AND a.duplicate_of IS NULL GROUP BY l.ein ORDER BY count(*) DESC, l.ein LIMIT 1");
  check(!!nk, "news_org_links: table has links");
  if (nk) {
    b = await ok(`/api/v1/news?ein=${nk.ein}&limit=500`, "news ein");
    check(b.results.length === nk.n && b.results.every((a: J) => a.orgs.some((o: J) => o.ein === nk.ein && o.name && o.matched)), `news: ein=${nk.ein} gives its ${nk.n} headlines, each listing the org (${b.results.length})`);
    const og: J = await ok(`/api/v1/org/${nk.ein}`, "org news");
    check(og.org.news?.total === nk.n && og.org.news.results.length === Math.min(5, nk.n) && og.org.news.all_url.endsWith(`/api/v1/news?ein=${nk.ein}`), `org: news total ${og.org.news?.total} vs SQL ${nk.n}, newest ${Math.min(5, nk.n)} listed`);
    check(og.org.news.results.every((h: J, i: number) => i === 0 || h.seen_at <= og.org.news.results[i - 1].seen_at), "org: news newest first");
  }

  // semantic=true (generosity-data 064): ranked by meaning, closest first, filters still hold, distance cursor pages on
  check((await get("/api/v1/news?semantic=true")).status === 400, "semantic: no q -> 400");
  const [sv] = await sql("SELECT (SELECT count(*) FROM news_articles WHERE embedding_model IS NOT NULL)::int AS n, (SELECT count(*) FROM congress_bills WHERE embedding_model IS NOT NULL)::int AS b, (SELECT count(*) FROM federal_register_docs WHERE embedding_model IS NOT NULL)::int AS f");
  const desc = (r: J[]) => r.every((x: J, i: number) => typeof x.similarity === "number" && (i === 0 || x.similarity <= r[i - 1].similarity));
  if (sv.n > 0) {
    const sn1 = await ok("/api/v1/news?q=rural+food+access&semantic=true&limit=5", "news semantic");
    isList(sn1, "news semantic");
    check(sn1.results.length === Math.min(5, sv.n) && desc(sn1.results), "news semantic: closest first, with similarity");
    if (sn1.next_cursor) {
      const sn2 = await ok(`/api/v1/news?q=rural+food+access&semantic=true&limit=5&cursor=${sn1.next_cursor}`);
      check(sn2.results.length > 0 && sn2.results[0].similarity <= sn1.results[4].similarity && !sn2.results.some((a: J) => sn1.results.some((x: J) => x.url === a.url)), "news semantic: page 2 continues, no overlap");
    }
  }
  if (sv.b > 0) {
    const sb = await ok("/api/v1/congress/bills?q=charitable+deduction+changes&semantic=true&bill_type=hr&limit=5", "bills semantic");
    check(sb.results.length > 0 && desc(sb.results) && sb.results.every((x: J) => x.bill_type === "hr"), "bills semantic: filters hold, closest first");
  }
  if (sv.f > 0) {
    const sf = await ok("/api/v1/federal-register?q=disaster+relief+nonprofits&semantic=true&type=Notice&limit=5", "federal-register semantic");
    check(sf.results.length > 0 && desc(sf.results) && sf.results.every((x: J) => x.type === "Notice"), "federal-register semantic: filters hold, closest first");
  }

  // ---------- rate headers ----------
  const rh = await get("/api/v1/labels");
  check(rh.headers.get("x-ratelimit-limit") === "1000" && rh.headers.has("x-ratelimit-remaining"), "rate-limit headers");

  // ---------- docs ----------
  const spec = await (await fetch(`${BASE}/api/openapi.json`)).json();
  for (const p of ["/api/v1/grants", "/api/v1/federal-awards", "/api/v1/foundations/{ein}/finances", "/api/v1/orgs/{ein}/finances", "/api/v1/household-giving",
    "/api/v1/labels", "/api/v1/labels/{label}/orgs", "/api/v1/congress/bills", "/api/v1/federal-register", "/api/v1/news"])
    check(!!spec.paths?.[p], `openapi.json documents ${p}`);
  check((await fetch(`${BASE}/api/docs`)).status === 200, "/api/docs loads");

  // ---------- answer: steps (the evidence chain) with spec, no Claude call ----------
  const FB_SPEC = { metric: "trend", causes: [{ name: "food banks", label: null, ntee: ["K31"], keywords: [] }] };
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify(FB_SPEC))}`, "answer food bank trend (spec)");
  const stepKeys = (b.steps ?? []).map((x: J) => x.key);
  check(["question", "cause", "data", "count", "compute", "check", "reproduce"].every((k) => stepKeys.includes(k)), `answer: steps cover the chain (${stepKeys.join(",")})`);
  const comp = b.steps?.find((x: J) => x.key === "compute");
  check(!!comp && comp.line.includes(b.numbers?.[0]?.value), `answer: compute step matches the headline tile (${comp?.line} / ${b.numbers?.[0]?.value})`);
  check(b.steps?.every((x: J) => !/\*\*|;|—/.test(x.line + x.details.join(" "))), "answer: steps are plain text, no semicolons or em dashes");
  check(Array.isArray(b.follow_ups), "answer: follow_ups array");
  check(b.data_years?.from === 2020 && b.data_years.to === 2024 && /1 to 2 years late/.test(b.data_years.note) && !/;|—/.test(b.data_years.note), `answer: data_years note (${b.data_years?.note})`);

  // ---------- answer: under-funded orgs (metric underfunded), spec, no Claude call ----------
  const UF_SPEC = { metric: "underfunded", causes: [{ name: "mental health", label: "mental_health", ntee: [], keywords: [] }], states: ["CA"] };
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify(UF_SPEC))}`, "answer under-funded mental health orgs in CA (spec)");
  const uf: J[] = b.underfunded_orgs ?? [];
  check(uf.length > 0 && uf.length <= 10 && uf.every((o) => /^\d{9}$/.test(o.ein) && o.state === "CA" && o.revenue > 0 && o.foundation_usd_a_year <= 0.25 * o.peer_median_usd_a_year + 1), `answer: underfunded_orgs listed below a quarter of peers (${uf.length})`);
  check(b.caveats?.some((c: string) => /can't link/.test(c)) && !b.caveats.some((c: string) => /;|—/.test(c)), "answer: underfunded caveat on unlinked grants, plain words");
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify(FB_SPEC))}`, "answer food bank trend again");
  check(b.underfunded_orgs === null, "answer: underfunded_orgs null on other metrics");

  check(b.who_received === null, "answer: who_received null on a cause answer");
  check(b.financial_health === null && b.financial_health_orgs === null, "answer: financial_health fields null on other metrics");

  // ---------- financial health (metric financial_health, org financial_health field), spec, no Claude call ----------
  const fhRaw = (await sql(`SELECT cy_revenue, cy_expenses FROM filing_flag WHERE ein = '363673599' AND tax_year = 2024 ORDER BY object_id DESC LIMIT 1`))[0];
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify({ metric: "financial_health", ein: "363673599" }))}`, "answer financial health of one org (spec)");
  const fy = b.financial_health?.years?.find((y: J) => y.tax_year === 2024);
  check(fy && fy.revenue === Number(fhRaw.cy_revenue) && fy.surplus === Number(fhRaw.cy_revenue) - Number(fhRaw.cy_expenses) && b.financial_health.years.every((y: J) => y.tax_year <= b.financial_health.latest_full_year), "answer: financial_health 2024 revenue and surplus vs SQL, full years only");
  check(Array.isArray(b.financial_health?.flags) && /not a rating/.test(b.financial_health?.note ?? "") && !b.financial_health.flags.some((f: string) => /;|—/.test(f)), "answer: financial_health flags in plain words, not a rating");
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify({ metric: "financial_health", causes: [{ name: "mental health", label: "mental_health", ntee: [], keywords: [] }], states: ["CA"], condition: "deficit", streak: 3 }))}`, "answer mental health CA deficit streaks (spec)");
  const fo: J[] = b.financial_health_orgs ?? [];
  check(fo.length > 0 && fo.length <= 10 && fo.every((o) => /^\d{9}$/.test(o.ein) && o.state === "CA" && o.consecutive_deficits >= 3), `answer: financial_health_orgs ran deficits 3 years in a row (${fo.length})`);
  b = await ok("/api/v1/org/363673599", "org financial_health");
  check(b.org?.financial_health?.years?.find((y: J) => y.tax_year === 2024)?.revenue === Number(fhRaw.cy_revenue) && b.org.financial_health.window?.to === b.org.financial_health.latest_full_year, "org: financial_health field vs SQL");

  // ---------- who received it (generosity-data 079): answers with no cause, funder pages ----------
  b = await ok(`/api/v1/answer?spec=${encodeURIComponent(JSON.stringify({ metric: "total", states: ["TX"] }))}`, "answer Texas total (spec)");
  const wr = b.who_received;
  check(!!wr && wr.parts.length === 6 && Math.abs(wr.parts.reduce((t: number, x: J) => t + x.usd, 0) - wr.total_usd) <= 1 && wr.linked_share_nonprofit_usd >= wr.linked_share_all_usd && !/;|—/.test(wr.note), "answer: who_received parts add up, both link rates");
  const directTx = Number((await db.query(`SELECT coalesce(sum(amount), 0) AS s FROM grants WHERE amount > 0 AND recipient_kind IS NULL AND recipient_ein IS NULL AND recipient_entity IS NULL AND tax_year BETWEEN 2022 AND 2024 AND recipient_state = 'TX' AND recipient_type IN ('international', 'company')`)).rows[0].s);
  check(!!wr && Math.abs(wr.international_and_company_share * wr.total_usd - directTx) <= Math.max(1, directTx * 0.001), `answer: who_received international + companies vs SQL (${directTx})`);
  check(b.caveats?.some((c: string) => /^About \d+(\.\d+)?% of these grant dollars went to governments and public universities/.test(c)), "answer: share caveat line");
  b = await ok("/api/v1/org/562618866", "org Gates (recipient types)");
  const bt: J[] = b.org?.grants_given?.by_recipient_type?.types ?? [];
  const intl = bt.find((t) => t.type === "international");
  const directIntl = Number((await db.query(`SELECT coalesce(sum(amount), 0) AS s FROM grants WHERE funder_ein = '562618866' AND tax_year IS NOT NULL AND recipient_kind IS NULL AND recipient_ein IS NULL AND recipient_entity IS NULL AND recipient_type = 'international'`)).rows[0].s);
  check(!!intl && intl.total === directIntl && intl.top_recipients.some((x: J) => /RECONSTRUCTION/.test(x.name)), `org: Gates by_recipient_type international vs SQL (${intl?.total} / ${directIntl})`);
  check(Math.abs(bt.reduce((t, x) => t + x.total, 0) - b.org.grants_given.total) <= 1, "org: by_recipient_type adds up to grants_given.total");

  // ---------- MCP ----------
  const client = new Client({ name: "nombot-api-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${KEY}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  for (const t of ["search_nonprofits", "get_organization", "list_research", "get_research", "answer_research_question", "search_grants", "get_federal_awards", "get_finances", "get_tax_status", "find_similar_orgs", "get_household_giving", "list_cause_labels", "search_policy"])
    check(tools.includes(t), `MCP lists ${t}`);
  const call = async (name: string, args: Record<string, unknown>) => {
    const t = performance.now();
    const r = await client.callTool({ name, arguments: args });
    timings.push([`mcp ${name}`, Math.round(performance.now() - t)]);
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
  };
  let m = await call("search_grants", { funder_ein: FUNDER, year_from: 2022, year_to: 2024, totals: true, limit: 3 });
  check(!m.isError && m.json.totals.count === s1.n && m.json.results.length === 3, "MCP search_grants: totals vs SQL");
  const m2 = await call("search_grants", { funder_ein: FUNDER, year_from: 2022, year_to: 2024, limit: 3, cursor: m.json.next_cursor });
  check(!m2.isError && m2.json.results[0].id !== m.json.results[0].id, "MCP search_grants: cursor");
  m = await call("search_grants", { source: "charity", funder_type: "community_foundation", state: "OH", limit: 2 });
  check(!m.isError && m.json.results.every((g: J) => g.funder.type === "community_foundation"), "MCP search_grants: charity funder_type");
  m = await call("get_federal_awards", { recipient_ein: UPENN, limit: 2 });
  check(!m.isError && m.json.results.length === 2, "MCP get_federal_awards");
  m = await call("get_finances", { ein: "131684331" });
  check(!m.isError && m.json.foundation?.results?.[0]?.grants_paid === ff.g, "MCP get_finances: foundation vs SQL");
  m = await call("get_tax_status", { ein: rv.ein });
  check(!m.isError && m.json.status === "revoked" && m.json.revocation.revocation_date === rv.d, "MCP get_tax_status: revoked org vs SQL");
  m = await call("get_organization", { ein: "341877332" });
  check(!m.isError && m.json.org.tax_status?.pub78?.eligible === Boolean(p78), "MCP get_organization: tax_status");
  m = await call("find_similar_orgs", { ein: sim.ein, underfunded: true, limit: 2 });
  check(!m.isError && m.json.list === "less_funded" && m.json.results.length === 2, "MCP find_similar_orgs: underfunded");
  m = await call("get_household_giving", { state: "WV", year_from: 2022, year_to: 2022 });
  check(!m.isError && m.json.results[0].charity_usd === h1.usd, "MCP get_household_giving vs SQL");
  m = await call("list_cause_labels", {});
  check(!m.isError && m.json.results.length === nl.n, "MCP list_cause_labels");
  m = await call("list_cause_labels", { label: "climate", state: "CO", limit: 1000 });
  check(!m.isError && m.json.results.length === lo.n, "MCP list_cause_labels: orgs vs SQL");
  m = await call("answer_research_question", FB_SPEC);
  check(!m.isError && Array.isArray(m.json.steps) && m.json.steps.length >= 6, "MCP answer_research_question: steps");
  m = await call("search_policy", { q: "charitable", limit: 3 });
  check(!m.isError && m.json.bills.results.length === 3 && Array.isArray(m.json.federal_register.results) && Array.isArray(m.json.news.results), "MCP search_policy: all three sources");
  m = await call("search_policy", { q: "nonprofit", source: "news", limit: 50 });
  check(!m.isError && m.json.news.results.every((x: J) => !("duplicate_of" in x) && Array.isArray(x.also_reported_by)), "MCP search_policy: news canonical only by default");
  m = await call("search_policy", { q: "nonprofit", source: "news", include_duplicates: true, limit: 50 });
  check(!m.isError && m.json.news.results.every((x: J) => "duplicate_of" in x), "MCP search_policy: include_duplicates shows copies");
  const [gl] = await sql("SELECT l.ein FROM news_org_links l JOIN news_articles a ON a.id = l.news_id AND a.duplicate_of IS NULL GROUP BY l.ein ORDER BY count(*) DESC, l.ein LIMIT 1");
  m = await call("search_policy", { ein: gl.ein, limit: 50 });
  check(!m.isError && m.json.source === "news" && m.json.news.results.length > 0 && m.json.news.results.every((x: J) => x.orgs.some((o: J) => o.ein === gl.ein)), "MCP search_policy: ein gives news naming that org");
  m = await call("search_policy", { q: "AI in schools", semantic: true, source: "bills", limit: 3 });
  check(!m.isError && m.json.bills.results.every((x: J) => typeof x.similarity === "number"), "MCP search_policy: semantic ranks with similarity");
  m = await call("search_grants", { funder_ein: "12" });
  check(m.isError, "MCP search_grants: bad EIN is a tool error");
  m = await call("get_finances", { ein: "000000001" });
  check(m.isError && m.text === "Not found.", "MCP get_finances: unknown EIN is Not found");
  await client.close();

  // Org hover card data (Oct 27): /api/org-preview/[ein]. Facts only, cached, warm under 150 ms, 404 when no IRS record.
  {
    const pv = async (ein: string) => { const t = performance.now(); const r = await fetch(`${BASE}/api/org-preview/${ein}`); return { status: r.status, body: await r.json().catch(() => ({})) as J, ms: Math.round(performance.now() - t) }; };
    const ford = await pv("131684331");
    check(ford.status === 200 && ford.body.name === "Ford Foundation" && ford.body.type === "Private foundation" && ford.body.href === "/org/131684331", "org-preview: Ford Foundation is a private foundation with a profile link");
    check(/^Funds mostly [a-z ]+( and [a-z ]+)?, in (every state|\d+ states?|one state), \d{4}–\d{2}$/.test(ford.body.mission ?? "") && ford.body.computed === true && ford.body.causes.length === 0, `org-preview: a foundation with no mission gets a computed line (${ford.body.mission})`);
    check(ford.body.stats?.length >= 2 && ford.body.stats.length <= 3 && ford.body.causes?.length <= 3, "org-preview: 2-3 stats for a foundation");
    const { rows: [fs] } = await db.query(`SELECT assets::float8 AS a FROM funders WHERE ein = '131684331'`);
    check(ford.body.stats?.some((s: J) => s.label === "assets" && s.value === fs.a), "org-preview: Ford assets vs SQL");
    const warm = await pv("131684331");
    timings.push(["org-preview: Ford, warm", warm.ms]);
    check(warm.ms < 150, `org-preview: warm under 150 ms (${warm.ms})`);
    const rc = await pv("530196605");
    check(rc.status === 200 && rc.body.type === "Public charity" && !/\bInc\b/.test(rc.body.name) && (rc.body.mission === null || (rc.body.mission.length <= 141 && rc.body.mission !== rc.body.mission.toUpperCase())), "org-preview: Red Cross is a public charity, no Inc, mission clipped and not all caps");
    check((await pv("000000000")).status === 404, "org-preview: unknown EIN is 404");
    check((await pv("abc")).status === 404, "org-preview: bad EIN is 404");
  }

  // Vetting card (Oct 28): track record line and questions to ask on /api/v1/org/{ein}
  {
    const d = (await get("/api/v1/org/954623022")).body.org;
    check(d?.track_record?.tax_exempt_since === 1998 && /^Tax-exempt since 1998 · \d+ years · \d+ returns? on record/.test(d.track_record.text ?? ""), `org: track record line (${d?.track_record?.text})`);
    check(Array.isArray(d?.questions_to_ask) && d.questions_to_ask.length >= 3 && d.questions_to_ask.length <= 5 && d.questions_to_ask.every((q: J) => q.question && q.because), "org: 3 to 5 questions, each with a reason");
    check(d?.questions_to_ask?.some((q: J) => q.key === "deficits" || q.key === "deficit"), "org: Dodgers Foundation deficits bring a question");
  }

  // Memos (Oct 28): one-page org brief and options memo, print page and editable Word file
  {
    const html = (await (await fetch(`${BASE}/memo/org/954623022?by=Test%20Advisor`)).text()).replace(/<!-- -->/g, "");
    check(/Questions to ask/.test(html) && /Prepared with NomBot by the Institute on Generosity/.test(html) && /Prepared by Test Advisor/.test(html) && /Tax-exempt since 1998/.test(html), "memo: org brief has questions, track record, prepared by and footer");
    const t = performance.now();
    const dx = await fetch(`${BASE}/api/memo/org/954623022/docx?by=Test`);
    const buf = Buffer.from(await dx.arrayBuffer());
    timings.push(["memo: org brief docx", Math.round(performance.now() - t)]);
    check(dx.status === 200 && /wordprocessingml/.test(dx.headers.get("content-type") ?? "") && buf.subarray(0, 2).toString() === "PK" && buf.length > 5000, "memo: org brief Word file");
    const cm = (await (await fetch(`${BASE}/memo/compare?ein=954623022,931724843`)).text()).replace(/<!-- -->/g, "");
    check(/Takeaways/.test(cm) && /Figures from 2024/.test(cm) && /Surplus or deficit/.test(cm), "memo: options memo table and takeaways");
    check((await fetch(`${BASE}/api/memo/compare/docx?ein=954623022,931724843`)).status === 200, "memo: options memo Word file");
    check((await fetch(`${BASE}/api/memo/compare/docx?ein=954623022`)).status === 400, "memo: options memo needs 2 orgs");
    check((await fetch(`${BASE}/api/memo/org/000000000/docx`)).status === 404, "memo: unknown EIN is 404");
  }

  // Web profiles and the report's one-page summary (Oct 29, Inglewood reports)
  {
    const pv = (await (await fetch(`${BASE}/api/org-preview/393805685`)).json()) as J;
    check(pv.web?.site === "inglewoodextendedcareofcalifornia.com" && /clinic/i.test(pv.mission ?? ""), "web profile: a no-text org's hover card says what its website says, labeled");
    const t = performance.now();
    const rep = (await (await fetch(`${BASE}/report?question=${encodeURIComponent("Health nonprofits in Inglewood, CA, especially mobile dental care (dental bus)")}`)).text()).replace(/<!-- -->/g, "");
    timings.push(["report: Inglewood dental (cached scores)", Math.round(performance.now() - t)]);
    check(/Top picks/.test(rep) && /Who funds this in Inglewood/.test(rep) && /No confirmed mobile or school-based dental service/.test(rep) && /Programs serving Inglewood that aren/.test(rep) && /Inglewood Clinic Group/.test(rep), "report: one-page summary, dental gap and programs table");
    check(/(Active filer|Website live|Name only)/.test(rep) && /Appendix: everything considered/.test(rep), "report: badges and appendix");
  }

  // Every export path returns a non-empty file of the right type (Oct 29: Export looked dead on the results page)
  {
    const q = encodeURIComponent("Youth sports programs in Inglewood, CA");
    const paths: [string, RegExp, number][] = [
      [`/export?question=${q}`, /text\/csv/, 2000], [`/report?question=${q}`, /text\/html/, 5000],
      ["/memo/org/954623022", /text\/html/, 3000], ["/api/memo/org/954623022/docx", /wordprocessingml/, 5000],
      ["/memo/compare?ein=954623022,931724843", /text\/html/, 3000], ["/api/memo/compare/docx?ein=954623022,931724843", /wordprocessingml/, 5000],
    ];
    for (const [p, type, min] of paths) {
      const r = await fetch(BASE + p);
      const n = (await r.arrayBuffer()).byteLength;
      check(r.status === 200 && type.test(r.headers.get("content-type") ?? "") && n >= min, `export path ${p.split("?")[0]}: ${r.status}, ${r.headers.get("content-type")}, ${n} bytes`);
    }
    // The results page's Export list opens under its own button (it opened off screen with no positioned parent)
    const { readFileSync } = await import("node:fs");
    check(/\.export-menu \{ position: relative;/.test(readFileSync(join(import.meta.dirname, "..", "app", "serp.css"), "utf8")), "export menu is anchored to its button");
  }

  // Compare (round-2 audit V7): one filing year per org, vetting rows, no em dash for missing values
  {
    const html = (await (await fetch(`${BASE}/compare?ein=954623022,931724843`)).text()).replace(/<!-- -->/g, "");
    check(/Figures from 2024/.test(html) && /Surplus or deficit/.test(html) && /Cash on hand/.test(html) && /Foundation grants, 2022/.test(html), "compare: one year per org and vetting rows");
    check(!/—/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), "compare: no em dash for missing values");
  }

  // Research loading stages (Oct 27): /api/research/stages streams the thread's real stages in order
  {
    const t = performance.now();
    const res = await fetch(`${BASE}/api/research/stages?${new URLSearchParams({ q: "Who are the biggest foundation funders of education?" })}`);
    const stages = (await res.text()).trim().split("\n").map((l) => JSON.parse(l).stage);
    timings.push(["stages: known question", Math.round(performance.now() - t)]);
    check(res.status === 200 && stages.join(",") === "routed,queried,done", `stages: routed, queried, done in order (${stages.join(",")})`);
    check((await fetch(`${BASE}/api/research/stages`)).status === 400, "stages: no q is 400");
  }

  // Search export (Oct 26): place tiers with evidence, NTEE code, foundation grants 2022-24, top funder, latest 990,
  // website, and a relevance status on every row. unscored=1: no relevance calls (one cached question parse).
  {
    const t = performance.now();
    const res = await fetch(`${BASE}/export?${new URLSearchParams({ question: "Youth sports programs in Inglewood, CA", unscored: "1" })}`);
    const text = await res.text();
    timings.push(["export: youth sports in Inglewood (unscored)", Math.round(performance.now() - t)]);
    const parseCsv = (line: string) => { const out: string[] = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
    const lines = text.split("\n");
    const head = parseCsv(lines[0]);
    const want = ["relevance", "relevance_status", "place_tier", "place_evidence", "ntee_code", "foundation_grants_2022_24", "top_funder", "latest_990_year", "website", "zip"];
    check(res.status === 200 && want.every((k) => head.includes(k)), `export: CSV has ${want.join(", ")}`);
    const rows = lines.slice(1).filter(Boolean).map((l) => Object.fromEntries(parseCsv(l).map((v, i) => [head[i], v])));
    check(rows.length > 0 && rows.every((r) => r.relevance_status === "unscored" && r.relevance === ""), "export: unscored=1 marks every row unscored");
    check(["based in the place", "based elsewhere, works in the place", "nearby, within 3.5 mi"].every((t) => rows.some((r) => r.place_tier === t)), "export: three place tiers");
    const ill = rows.find((r) => r.ein === "84-3026438");
    check(!!ill && ill.place_tier === "based in the place" && /^name: Named for Inglewood, mailed from Los Angeles/.test(ill.place_evidence), "export: Inglewood Little League (LA 90065) in the place by name, flagged mailed from elsewhere");
    const [g] = await sql(`SELECT coalesce(sum(amount), 0)::bigint AS usd FROM grant_clean WHERE recipient_ein = '843026438' AND tax_year BETWEEN 2022 AND 2024`);
    check(!!ill && Number(ill.foundation_grants_2022_24) === Number(g.usd), "export: foundation grants 2022-24 vs SQL");
    const pp = rows.find((r) => r.ein === "95-4623022"); // Dodgers Foundation: a 2022 grant purpose names Inglewood
    check(!!pp && pp.place_tier === "based elsewhere, works in the place" && /grant purpose: .*Inglewood/i.test(pp.place_evidence), "export: Dodgers Foundation serves Inglewood by grant purpose");
    check(rows.filter((r) => r.place_tier === "based in the place").every((r) => /^(HQ|HQ ZIP|name):/.test(r.place_evidence)), "export: every in-place row says why");
  }
} finally {
  execFileSync("npm", ["run", "-s", "api-key", "--", "revoke", KEY_ID], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
  console.log(`Test key #${KEY_ID} revoked.`);
  await db.end();
}

console.log("\nTimings (ms):");
for (const [k, ms] of timings.filter(([k]) => !k.startsWith("/"))) console.log(`  ${String(ms).padStart(5)}  ${k}`);
console.log(`\n${passes} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
