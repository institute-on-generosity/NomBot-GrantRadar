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
    "/api/v1/foundations/131684331/finances", "/api/v1/orgs/341877332/finances", "/api/v1/orgs/341877332/status", "/api/v1/household-giving", "/api/v1/labels",
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
  check((await get("/api/v1/orgs/12/status")).status === 400, "tax status bad EIN -> 400");
  check((await get("/api/v1/orgs/000000001/status")).status === 404, "tax status unknown EIN -> 404");

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
  const [nw] = await sql("SELECT count(*)::int AS n, count(*) FILTER (WHERE 'philanthropy' = ANY(queries))::int AS ph, max(seen_at)::date::text AS newest FROM news_articles");
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
    check(n === nw.ph, `news: topic=philanthropy walk ${n} rows vs SQL ${nw.ph}`);
    const dom = (await sql("SELECT domain FROM news_articles WHERE domain IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1"))[0].domain;
    b = await ok(`/api/v1/news?outlet=${encodeURIComponent(dom)}&date_from=${nw.newest}&limit=20`, "news outlet + date");
    check(b.results.every((a: J) => a.domain.includes(dom) && a.seen_at.slice(0, 10) >= nw.newest), "news: outlet and date filters hold");
    b = await ok("/api/v1/news?q=donation&limit=5", "news q");
    check(b.results.length > 0, "news: q finds headlines");
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

  // ---------- MCP ----------
  const client = new Client({ name: "nombot-api-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${KEY}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  for (const t of ["search_nonprofits", "get_organization", "list_research", "get_research", "answer_research_question", "search_grants", "get_federal_awards", "get_finances", "get_tax_status", "get_household_giving", "list_cause_labels", "search_policy"])
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
  m = await call("get_household_giving", { state: "WV", year_from: 2022, year_to: 2022 });
  check(!m.isError && m.json.results[0].charity_usd === h1.usd, "MCP get_household_giving vs SQL");
  m = await call("list_cause_labels", {});
  check(!m.isError && m.json.results.length === nl.n, "MCP list_cause_labels");
  m = await call("list_cause_labels", { label: "climate", state: "CO", limit: 1000 });
  check(!m.isError && m.json.results.length === lo.n, "MCP list_cause_labels: orgs vs SQL");
  m = await call("search_policy", { q: "charitable", limit: 3 });
  check(!m.isError && m.json.bills.results.length === 3 && Array.isArray(m.json.federal_register.results) && Array.isArray(m.json.news.results), "MCP search_policy: all three sources");
  m = await call("search_policy", { q: "AI in schools", semantic: true, source: "bills", limit: 3 });
  check(!m.isError && m.json.bills.results.every((x: J) => typeof x.similarity === "number"), "MCP search_policy: semantic ranks with similarity");
  m = await call("search_grants", { funder_ein: "12" });
  check(m.isError, "MCP search_grants: bad EIN is a tool error");
  m = await call("get_finances", { ein: "000000001" });
  check(m.isError && m.text === "Not found.", "MCP get_finances: unknown EIN is Not found");
  await client.close();
} finally {
  execFileSync("npm", ["run", "-s", "api-key", "--", "revoke", KEY_ID], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
  console.log(`Test key #${KEY_ID} revoked.`);
  await db.end();
}

console.log("\nTimings (ms):");
for (const [k, ms] of timings.filter(([k]) => !k.startsWith("/"))) console.log(`  ${String(ms).padStart(5)}  ${k}`);
console.log(`\n${passes} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
