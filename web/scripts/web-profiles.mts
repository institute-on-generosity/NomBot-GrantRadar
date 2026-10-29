// Web profiles for orgs with no 990 program text (Oct 29, Inglewood reports for Keith). For each candidate: its own
// website (the 990 website field first, else one web search by exact name and city), the same org confirmed by rules
// (lib/webMatch: name words plus EIN, address, ZIP or city on the page, unsure means skip), only the homepage and up to
// three About, Programs or Contact pages fetched (robots.txt respected, a polite user agent, one request per second per site,
// 10 s timeouts, no logins), then one cheap model call (Haiku, feature "web-profile", logged in llm_usage) for a
// factual one-line description, a verbatim quote and the places the site says it serves. Rows go to
// generosity-data's org_web_profile (migration 086).
//   npx tsx scripts/web-profiles.mts <candidates.json> [--limit=400] [--only=ein,ein]
// candidates.json: [{ ein, name, city, zip }] in priority order.
import { readFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* none */ }
const { db } = await import("../lib/db");
const { claude } = await import("../lib/llm");
const { matchOrg, ownSite } = await import("../lib/webMatch");

const MODEL = "claude-haiku-4-5";
const UA = "NomBotResearch/1.0 (nonprofit research by the Institute on Generosity; reads public About pages)";
const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 400);
const ONLY = new Set((args.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean));
type Cand = { ein: string; name: string; city: string | null; zip: string | null };
let cands = (JSON.parse(readFileSync(args.find((a) => !a.startsWith("--"))!, "utf8")) as Cand[]).slice(0, LIMIT);
if (ONLY.size) cands = cands.filter((c) => ONLY.has(c.ein));
const ai = claude("web-profile");
if (!ai) throw new Error("No Claude key");

// ------------------------------------------------------------------ polite fetching
const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, kind: "html" | "text" = "html"): Promise<string | null> {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: kind === "html" ? "text/html" : "text/plain" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    if (kind === "html" && !/text\/html/.test(r.headers.get("content-type") ?? "")) return null;
    const t = await r.text();
    return t.length > 1_500_000 ? t.slice(0, 1_500_000) : t;
  } catch { return null; }
}
const robotsCache = new Map<string, string[]>();
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.host)) {
    const txt = (await get(`${u.protocol}//${u.host}/robots.txt`, "text")) ?? "";
    const dis: string[] = [];
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const m = /^(user-agent|disallow):\s*(.*)$/i.exec(line);
      if (!m) continue;
      if (m[1].toLowerCase() === "user-agent") applies = m[2] === "*" || /nombot/i.test(m[2]);
      else if (applies && m[2]) dis.push(m[2]);
    }
    robotsCache.set(u.host, dis);
  }
  return !robotsCache.get(u.host)!.some((p) => u.pathname.startsWith(p));
}
const textOf = (html: string) => html.replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const footerText = (html: string) => (html.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
function aboutLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = m[2].replace(/<[^>]+>/g, " ").toLowerCase();
    if (!/about|program|what we do|our work|mission|services|who we are|contact/.test(`${label} ${m[1].toLowerCase()}`)) continue;
    try { const u = new URL(m[1], base); if (u.host === new URL(base).host && !out.includes(u.href)) out.push(u.href); } catch { /* bad href */ }
    if (out.length >= 3) break;
  }
  return out;
}

// ------------------------------------------------------------------ the site
async function findSite(c: Cand): Promise<{ url: string; method: string } | null> {
  const { rows: [w] } = await db.query(`SELECT website FROM filing_text WHERE ein = $1 AND website IS NOT NULL ORDER BY tax_year DESC LIMIT 1`, [c.ein]);
  const fix = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`);
  if (w?.website && ownSite(fix(String(w.website)))) return { url: fix(String(w.website)), method: "irs_website" };
  const r = await ai!.messages.create({
    model: MODEL, max_tokens: 300, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as never],
    messages: [{ role: "user", content: `Find the official website of the nonprofit "${c.name}" in ${c.city ?? "California"}, CA (IRS EIN ${c.ein.slice(0, 2)}-${c.ein.slice(2)}). Only the organization's own website: not a directory, database, news story, social media page or a different organization with a similar name. If you are not sure, say null. Reply with JSON only: {"url": string or null}` }],
  });
  const text = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const url = /"url"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  return url && ownSite(url) ? { url, method: "web_search" } : null;
}

type Extract = { description: string; quote: string | null; serves_places: string[]; serves_quote: string | null; about_this_org: boolean };
async function extract(c: Cand, text: string): Promise<Extract | null> {
  const r = await ai!.messages.create({
    model: MODEL, max_tokens: 400,
    system: "You read a nonprofit's own website text and report only what it says. No outside knowledge, no praise, plain words. Never use semicolons or em dashes.",
    messages: [{ role: "user", content: `Organization: ${c.name}, ${c.city ?? ""}, CA.\nWebsite text:\n${text.slice(0, 9000)}\n\nReply with JSON only:\n{"about_this_org": true if the text is this organization's own site, "description": "what they do and who they serve, one sentence, at most 25 words, only from the text", "quote": "one verbatim sentence from the text that supports the description", "serves_places": ["cities, neighborhoods or counties the text says they serve, as written"], "serves_quote": "the verbatim sentence naming those places, or null"}` }],
  });
  const t = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try { return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Extract; } catch { return null; }
}

const clean = (s: string) => s.replace(/;/g, ",").replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const verbatim = (q: string | null, page: string) => (q && page.replace(/\s+/g, " ").toLowerCase().includes(q.replace(/\s+/g, " ").toLowerCase().slice(0, 80)) ? clean(q).slice(0, 300) : null);

let done = 0, kept = 0, noSite = 0, notSame = 0, blocked = 0;
const { rows: orgRows } = await db.query(`SELECT ein, name, city, zip, street FROM orgs WHERE ein = ANY($1)`, [cands.map((c) => c.ein)]);
const orgOf = new Map(orgRows.map((o) => [o.ein as string, o]));
async function one(c: Cand) {
  const o = orgOf.get(c.ein);
  const id = { ein: c.ein, name: c.name, city: o?.city ?? c.city, zip: o?.zip ?? c.zip, street: o?.street ?? null };
  const site = await findSite(c).catch(() => null);
  if (!site) { noSite++; return; }
  if (!(await allowed(site.url))) { blocked++; return; }
  const home = await get(site.url);
  if (!home) { noSite++; return; }
  let text = textOf(home) + " " + footerText(home);
  let page = site.url;
  for (const l of aboutLinks(home, site.url)) {
    if (!(await allowed(l))) continue;
    const h = await get(l);
    if (h) { text += " " + textOf(h); if (/about|program|mission/.test(l)) page = l; }
  }
  const m = matchOrg(text, id);
  if (process.env.DEBUG) console.log("DEBUG", c.ein, c.name, "|", site.url, "|", JSON.stringify(m), "|", /inglewood/i.test(text) ? "mentions Inglewood" : "");
  if (!m.same) { notSame++; return; }
  const x = await extract(c, text).catch(() => null);
  if (!x || !x.about_this_org || !x.description) { notSame++; return; }
  let d = clean(x.description);
  if (words(d) > 25) d = d.split(/\s+/).slice(0, 25).join(" ").replace(/[,.]?$/, ".");
  await db.query(`INSERT INTO org_web_profile (ein, url, site, fetched_at, description, quote, serves_places, serves_quote, confidence, match, method)
      VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (ein) DO UPDATE SET url = EXCLUDED.url, site = EXCLUDED.site, fetched_at = EXCLUDED.fetched_at, description = EXCLUDED.description, quote = EXCLUDED.quote,
        serves_places = EXCLUDED.serves_places, serves_quote = EXCLUDED.serves_quote, confidence = EXCLUDED.confidence, match = EXCLUDED.match, method = EXCLUDED.method`,
    [c.ein, page, new URL(site.url).origin, d, verbatim(x.quote, text), (x.serves_places ?? []).map(clean).filter(Boolean).slice(0, 8), verbatim(x.serves_quote, text), m.confidence, m.match, `${site.method}, ${MODEL}`]);
  kept++;
}
// Three at a time (each site is still one request per second)
const queue = [...cands];
await Promise.all([0, 1, 2].map(async () => { for (let c = queue.shift(); c; c = queue.shift()) { await one(c).catch((e) => console.error(c.ein, String(e).slice(0, 120))); if (++done % 25 === 0) console.log(`${done}/${cands.length}: ${kept} kept, ${noSite} no site, ${notSame} not confirmed, ${blocked} blocked by robots.txt`); } }));
console.log(`done ${done}: ${kept} kept, ${noSite} no site, ${notSame} not confirmed, ${blocked} blocked by robots.txt`);
await db.end();
