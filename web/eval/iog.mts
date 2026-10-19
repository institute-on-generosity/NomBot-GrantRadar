// IoG internal API checks (/api/v1/iog/*, MCP search_iog_guides and get_iog_guide) against a running server,
// default the dev server on :3000. Makes two temporary "api-test" keys (secrets stay in memory, never printed):
// one with read only, one with read,iog_internal. Revokes both at the end.
// Checks: 401 without a key, 403 insufficient_scope without iog_internal (REST and MCP), 200 with it, shapes,
// 404/400, the api-key scopes command, and that search puts the right guide in the top 3 for known questions.
//   npm run test:iog                       against http://localhost:3000
//   npm run test:iog -- --base=http://localhost:4000
import { join } from "node:path";
import { execFileSync } from "node:child_process";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");

const BASE = (process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? process.env.API_BASE ?? "http://localhost:3000").replace(/\/$/, "");
const CWD = join(import.meta.dirname, "..");
let fails = 0, passes = 0;
const check = (ok: boolean, what: string) => { if (ok) passes++; else { fails++; console.log(`FAIL  ${what}`); } };
const keyCmd = (...args: string[]) => execFileSync("npm", ["run", "-s", "api-key", "--", ...args], { cwd: CWD, encoding: "utf8" });

function makeKey(scopes: string) {
  const out = keyCmd("create", "api-test", "--rate=1000", `--scopes=${scopes}`);
  const key = /nb_live_[A-Za-z0-9_-]+/.exec(out)?.[0];
  const id = /Key (\d+)/.exec(out)?.[1];
  if (!key || !id) throw new Error("Could not create a test key.");
  return { key, id };
}

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function get(path: string, key: string | null) {
  const r = await fetch(BASE + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as J };
}
async function mcp(key: string) {
  const client = new Client({ name: "nombot-iog-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
  };
  return { client, call, tools: (await client.listTools()).tools.map((t) => t.name) };
}

// Questions a researcher would ask, and the guide that should answer them (in the top 3 passages).
const SEARCHES: [string, string][] = [
  ["how to do a site visit", "conducting-a-site-visit"],
  ["philanthropic risk", "philanthropic-risk"],
  ["due diligence red flags", "conducting-in-depth-nonprofit-due-diligence"],
  ["mapping the key players and allies in an issue area", "ecosystem-mapping"],
  ["fiduciary duties of nonprofit board members", "nonprofit-board-service"],
  ["can a private foundation fund lobbying", "policy-advocacy"],
];
const PATHS = ["/api/v1/iog/guides", "/api/v1/iog/guides/conducting-a-site-visit", "/api/v1/iog/search?q=site+visit"];

const plain = makeKey("read");
const iog = makeKey("read,iog_internal");
console.log(`Test keys #${plain.id} (read) and #${iog.id} (read,iog_internal) created. Base ${BASE}`);
try {
  // ---------- scope ----------
  for (const p of PATHS) {
    const none = await get(p, null);
    check(none.status === 401 && none.body.error?.code === "missing_key", `${p} without key -> 401 (got ${none.status})`);
    const r = await get(p, plain.key);
    check(r.status === 403 && r.body.error?.code === "insufficient_scope", `${p} with read-only key -> 403 insufficient_scope (got ${r.status})`);
    check((await get(p, iog.key)).status === 200, `${p} with iog_internal key -> 200`);
  }
  check((await get("/api/v1/search?q=food&limit=1", iog.key)).status === 200, "iog key keeps read access to /api/v1/search");

  // ---------- REST shapes ----------
  const list = (await get("/api/v1/iog/guides", iog.key)).body;
  check(list.count === 13 && list.guides.length === 13, `13 guides listed (got ${list.count})`);
  check(list.guides.every((g: J) => g.slug && g.title.startsWith("Giving Guide: ") && g.edition === "GG2026, July 2026" && g.source_url.startsWith("https://docs.google.com/") && g.chunks > 0 && !("text" in g)),
    "guide list: slug, title, edition, Drive link, chunk count, no text");
  const one = (await get("/api/v1/iog/guides/conducting-a-site-visit", iog.key)).body;
  check(typeof one.guide?.text === "string" && one.guide.text.length > 5000, "guide detail has full text");
  check(Array.isArray(one.guide?.sections) && one.guide.sections.some((s: J) => s.heading === "Before the Visit" && s.level === 1), "guide detail has sections");
  check((await get("/api/v1/iog/guides/no-such-guide", iog.key)).status === 404, "unknown slug -> 404");
  check((await get("/api/v1/iog/guides/BAD%20SLUG", iog.key)).status === 404, "malformed slug -> 404");
  const noQ = await get("/api/v1/iog/search", iog.key);
  check(noQ.status === 400 && noQ.body.error?.code === "bad_param", "search without q -> 400 bad_param");
  const lim = (await get("/api/v1/iog/search?q=board&limit=2", iog.key)).body;
  check(lim.results?.length === 2, "search limit");
  const only = (await get("/api/v1/iog/search?q=reserves&guide=philanthropic-risk&limit=5", iog.key)).body;
  check(only.results?.length > 0 && only.results.every((r: J) => r.guide.slug === "philanthropic-risk"), "search guide filter");

  // ---------- search quality ----------
  for (const [q, want] of SEARCHES) {
    const t = performance.now();
    const b = (await get(`/api/v1/iog/search?q=${encodeURIComponent(q)}&limit=3`, iog.key)).body;
    const got = (b.results ?? []).map((r: J) => r.guide.slug);
    const r0 = b.results?.[0];
    check(got.includes(want), `"${q}": ${want} in top 3 (got ${got.join(", ")})`);
    check(!!r0 && typeof r0.text === "string" && r0.source_url?.startsWith("https://docs.google.com/") && typeof r0.score === "number" && typeof r0.section === "string",
      `"${q}": result has text, section, source_url, score`);
    console.log(`  ${q.padEnd(55)} ${got[0] ?? "-"}${got[0] === want ? "" : `  (want ${want} at #${got.indexOf(want) + 1})`}  ${Math.round(performance.now() - t)} ms`);
  }

  // ---------- docs ----------
  // Public docs leave IoG internal endpoints out; openapi.json lists them only for a key with iog_internal.
  const pub = await (await fetch(`${BASE}/api/openapi.json`)).json();
  const spec = await (await fetch(`${BASE}/api/openapi.json`, { headers: { Authorization: `Bearer ${iog.key}` } })).json();
  const readSpec = await (await fetch(`${BASE}/api/openapi.json`, { headers: { Authorization: `Bearer ${plain.key}` } })).json();
  const html = await (await fetch(`${BASE}/api/docs`)).text();
  check(!html.includes("/api/v1/iog") && !html.includes("search_iog_guides"), "public /api/docs leaves out IoG internal endpoints and tools");
  for (const p of ["/api/v1/iog/guides", "/api/v1/iog/guides/{slug}", "/api/v1/iog/search"]) {
    check(!pub.paths?.[p] && !readSpec.paths?.[p], `public and read-key openapi.json leave out ${p}`);
    check(spec.paths?.[p]?.get?.["x-required-scope"] === "iog_internal", `openapi.json with an iog_internal key documents ${p}`);
  }

  // ---------- MCP ----------
  const p = await mcp(plain.key);
  check(!p.tools.includes("search_iog_guides") && !p.tools.includes("get_iog_guide"), "MCP hides IoG tools from a read-only key");
  const denied = await p.call("search_iog_guides", { q: "site visit" }).catch(() => ({ isError: true, text: "", json: null }));
  check(denied.isError, "MCP search_iog_guides refused for a read-only key");
  await p.client.close();
  const m = await mcp(iog.key);
  check(m.tools.includes("search_iog_guides") && m.tools.includes("get_iog_guide") && m.tools.includes("search_nonprofits"), "MCP lists IoG tools (and the public ones) for an iog_internal key");
  let r = await m.call("search_iog_guides", { q: "how to do a site visit", limit: 3 });
  check(!r.isError && r.json.results[0]?.guide.slug === "conducting-a-site-visit", "MCP search_iog_guides");
  r = await m.call("get_iog_guide", {});
  check(!r.isError && r.json.count === 13, "MCP get_iog_guide without slug lists guides");
  r = await m.call("get_iog_guide", { slug: "philanthropic-risk" });
  check(!r.isError && r.json.guide.slug === "philanthropic-risk" && r.json.guide.sections.length > 2, "MCP get_iog_guide with slug");
  r = await m.call("get_iog_guide", { slug: "no-such-guide" });
  check(r.isError && r.text === "Not found.", "MCP get_iog_guide: unknown slug is Not found");
  await m.client.close();

  // ---------- key tooling: scopes command (on the read-only test key only) ----------
  let refused = false;
  try { keyCmd("scopes", plain.id, "read,write"); } catch { refused = true; }
  check(refused, "api-key scopes refuses an unknown scope");
  check(/now has scopes read,iog_internal/.test(keyCmd("scopes", plain.id, "read,iog_internal")), "api-key scopes adds iog_internal");
  await new Promise((res) => setTimeout(res, 10_500)); // the server caches a key's row for 10 s
  check((await get("/api/v1/iog/guides", plain.key)).status === 200, "after scopes: the key gets 200");
} finally {
  for (const k of [plain, iog]) keyCmd("revoke", k.id);
  console.log(`Test keys #${plain.id} and #${iog.id} revoked.`);
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
