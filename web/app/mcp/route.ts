// Remote MCP server (Streamable HTTP, JSON-RPC over POST) for AI tools: search_nonprofits, get_organization, get_tax_status, find_similar_orgs,
// list_research, get_research, answer_research_question, plus row-level data (lib/apiData.ts): search_grants,
// get_federal_awards, get_finances, get_household_giving, list_cause_labels, search_policy. Keys with the iog_internal scope also get search_iog_guides and get_iog_guide (lib/apiIog.ts, IoG internal). Same Bearer API key as /api/v1/*. Stateless: a fresh server and transport per
// request, plain JSON responses (no SSE stream, no sessions). Tools call the same functions as the REST API,
// never the Claude API. Setup snippets at /api/docs.
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, record, baseUrl, type Auth } from "@/lib/apiAuth";
import { countRows, describe, logCall, rememberMcpClient, requestKey, clientIp } from "@/lib/apiLog";
import { apiSearch, apiOrg, apiResearchList, apiResearch, SECTION_KEYS } from "@/lib/api";
import { answer, answerBrief } from "@/lib/answer";
import { DEFAULT_SPEC, normalizeSpec, specSchema } from "@/lib/answerSpec";
import { ANSWER_TOOL_DESCRIPTION } from "@/lib/answerTool";
import { LABEL_SLUGS, type LabelSlug } from "@/lib/labels";
import { BadParam, apiGrants, apiFederalAwards, apiFoundationFinances, apiOrgFinances, apiHouseholdGiving, apiLabels, apiLabelOrgs, apiPolicy, FUNDER_TYPES, FR_TYPES, NEWS_TOPICS } from "@/lib/apiData";
import { apiOrgStatus } from "@/lib/taxStatus";
import { apiSimilar } from "@/lib/similar";
import { apiIogGuides, apiIogGuide, apiIogSearch, IogBadParam, IOG_SCOPE } from "@/lib/apiIog";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
class BadInput extends Error {} // shown to the caller as a tool error

// What the tool call did, for the per-call log (lib/apiLog.ts): its own status (a tool error is still HTTP 200) and rows.
type CallOutcome = { status: number | null; rows: number | null };

function server(auth: Auth, base: string, outcome: CallOutcome) {
  const s = new McpServer(
    { name: "nombot", title: "NomBot (Institute on Generosity)", version: "1.0.0" },
    { instructions: "Public IRS data on US nonprofits and foundations: search organizations in plain language, look one up by EIN (financials, leaders, foundation grants), read verified research findings, and page through raw rows (grants, federal awards, finances by year, household giving, cause labels, bills, Federal Register, news). List tools return next_cursor: pass it back as cursor for the next page. Amounts are US dollars. Cite the sources and urls returned." },
  );
  // Each tool call is counted as mcp:<tool> in api_usage; a thrown error becomes an MCP tool error, not a crash.
  // Time per call goes to api_usage too (ms_sum, ms_max) for the /admin dashboard.
  const run = (tool: string, fn: () => Promise<unknown>) => async (): Promise<Result> => {
    const t0 = performance.now();
    const ms = () => performance.now() - t0;
    const done = (status: number) => { outcome.status = status; record(auth.key.id, `mcp:${tool}`, status, ms()); };
    try {
      const out = await fn();
      if (out == null) {
        done(404);
        return { content: [{ type: "text", text: "Not found." }], isError: true };
      }
      done(200);
      outcome.rows = countRows(out);
      return { content: [{ type: "text", text: JSON.stringify(out) }] };
    } catch (e) {
      if (e instanceof BadInput || e instanceof BadParam) {
        done(400);
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
      console.error(`mcp ${tool} failed`, e);
      done(500);
      return { content: [{ type: "text", text: "Something went wrong on our side. Try again." }], isError: true };
    }
  };

  s.registerTool("search_nonprofits", {
    title: "Search nonprofits",
    description: "Find US nonprofits by what they do, in plain language (meaning + keyword search over IRS 990 mission and program text). Returns ranked organizations with EIN, place, cause (NTEE), revenue, mission, staff and sources. Use filters for place, size and graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health); put only the topic in q.",
    inputSchema: {
      q: z.string().max(300).describe("Topic in plain words, e.g. 'food bank workforce training'. Empty lists every org in the filters."),
      state: z.array(z.string().length(2)).max(60).optional().describe("Two-letter state codes, e.g. ['WV','KY']"),
      city: z.array(z.string()).max(10).optional().describe("City names, e.g. ['Huntington']"),
      max_revenue: z.number().int().nonnegative().optional().describe("Only orgs with revenue at or below this, in dollars"),
      ntee: z.string().max(5).optional().describe("NTEE cause code prefix, e.g. 'K' (food) or 'K31' (food banks)"),
      label: z.enum(LABEL_SLUGS as [LabelSlug, ...LabelSlug[]]).optional().describe("Graded cause label no NTEE code captures: 'climate', 'women_girls', 'substance_use', 'housing_homelessness', 'ai_tech_learning_work', 'racial_equity', 'immigrants_refugees' or 'mental_health'. Only orgs with that label (each result's label shows its tier)"),
      label_tier: z.enum(["primary", "all"]).optional().describe("With label: 'primary' (default) = the cause is the org's main work; 'all' also adds 'partial' orgs where it is one named goal among others"),
      label_subtype: z.enum(["services", "policy", "all"]).optional().describe("With label immigrants_refugees: 'services' (default) = orgs serving immigrants and refugees, 'policy' = immigration policy research and advocacy of any stance, 'all' = both"),
      limit: z.number().int().min(1).max(50).optional().describe("Results to return, 1-50 (default 10)"),
    },
    annotations: { title: "Search nonprofits", ...READ_ONLY },
  }, (a) => run("search_nonprofits", () => apiSearch(a, base))());

  s.registerTool("get_organization", {
    title: "Get organization",
    description: "Everything NomBot has on one organization by EIN: address, cause, graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health) with tier and why, status, IRS tax status (Pub 78 eligibility for tax-deductible gifts, automatic revocation with dates and foundation grants after it), years tax-exempt, website, mission, programs, staff and volunteers, financial history, Form 990 health signals, leaders and pay, foundation grants received (top funders) and given (top recipients), grants received from public charities and given on Form 990 Schedule I (by year, funder type such as donor-advised fund sponsor or community foundation, top funders and recipients), direct federal awards (by fiscal year, agency, program, place of performance), and sources. The grant sources overlap: do not add them.",
    inputSchema: { ein: z.string().describe("9-digit EIN, dashes allowed, e.g. '55-0123456'") },
    annotations: { title: "Get organization", ...READ_ONLY },
  }, ({ ein }) => run("get_organization", async () => {
    const r = await apiOrg(ein, base);
    if ("error" in r && r.error === "bad_ein") throw new BadInput("EIN must be 9 digits.");
    return "error" in r ? null : r;
  })());

  s.registerTool("get_tax_status", {
    title: "Get IRS tax status",
    description: "IRS tax-exempt status for one EIN, including EINs no longer in the master file: Pub 78 eligibility for tax-deductible gifts (with deductibility codes), automatic revocation (date, posting date, reinstatement, history) and foundation grants linked to the EIN after the revocation. file_date is the IRS list's date.",
    inputSchema: { ein: z.string().describe("9-digit EIN, dashes allowed, e.g. '55-0123456'") },
    annotations: { title: "Get IRS tax status", ...READ_ONLY },
  }, ({ ein }) => run("get_tax_status", () => apiOrgStatus(ein))());

  s.registerTool("find_similar_orgs", {
    title: "Find similar organizations",
    description: "Organizations most like one EIN by the meaning of their newest Form 990 mission and program text (precomputed nearest neighbors, cosine similarity 0.80 or above, up to 10, with place, cause, revenue, foundation grants 2022-24 and similarity in words). underfunded=true lists only less-funded peers: active orgs (revenue $50K+) with under $25K in linked foundation grants 2022-24, useful for finding overlooked organizations.",
    inputSchema: {
      ein: z.string().describe("9-digit EIN, dashes allowed, e.g. '55-0123456'"),
      underfunded: z.boolean().optional().describe("Only less-funded peers. Default false"),
      limit: z.number().int().min(1).max(10).optional().describe("Organizations to return, 1-10 (default 10)"),
    },
    annotations: { title: "Find similar organizations", ...READ_ONLY },
  }, (a) => run("find_similar_orgs", () => apiSimilar(a.ein, a, base))());

  s.registerTool("list_research", {
    title: "List research findings",
    description: "Verified research findings from NomBot (funding gaps, rising and fading causes, money flows, track record, affiliations, financial stress), best first. Each has a headline, 2-3 key points, key numbers and a slug for get_research. No data rows here.",
    inputSchema: {
      section: z.enum(SECTION_KEYS as [string, ...string[]]).optional().describe("Only this section"),
      state: z.string().length(2).optional().describe("Only findings about this state"),
      cause: z.string().max(80).optional().describe("Only findings whose cause contains this text"),
      limit: z.number().int().min(1).max(300).optional().describe("Findings to return (default 50)"),
    },
    annotations: { title: "List research findings", ...READ_ONLY },
  }, (a) => run("list_research", () => apiResearchList(a, base))());

  s.registerTool("get_research", {
    title: "Get research finding",
    description: "One verified finding in full: headline, key points, key numbers, method, caveats, the SQL behind it, sources, data rows (up to max_rows), organizations' EINs, the Vega-Lite chart and a citation.",
    inputSchema: {
      slug: z.string().max(200).describe("Finding slug from list_research"),
      max_rows: z.number().int().min(0).max(5000).optional().describe("Data rows to include (default 200)"),
    },
    annotations: { title: "Get research finding", ...READ_ONLY },
  }, ({ slug, max_rows }) => run("get_research", () => apiResearch(slug, base, max_rows ?? 200))());

  // The calling AI fills the structured spec itself, so this stays LLM-free on our side.
  s.registerTool("answer_research_question", {
    title: "Answer a research question",
    description: ANSWER_TOOL_DESCRIPTION,
    inputSchema: specSchema.partial().shape,
    annotations: { title: "Answer a research question", ...READ_ONLY },
  }, (a) => run("answer_research_question", async () => {
    const parsed = specSchema.safeParse({ ...DEFAULT_SPEC, ...a });
    if (!parsed.success) throw new BadInput(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 500));
    return answerBrief(await answer("MCP research question", normalizeSpec(parsed.data)), 50, { steps: true });
  })());

  // ---------- row-level data (lib/apiData.ts): same JSON as the REST list endpoints ----------
  const ein = z.string().describe("9-digit EIN, dashes allowed");
  const cursor = z.string().max(500).optional().describe("next_cursor from the previous page");
  const st = z.string().length(2).optional().describe("Two-letter state code");
  const county = z.string().regex(/^\d{5}$/).optional().describe("5-digit county FIPS, e.g. '54011'");
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

  s.registerTool("search_grants", {
    title: "Search grants",
    description: "Grant rows, newest first. source 'foundation' (default): private foundations' 990-PF grants. 'charity': public charities' Schedule I grants, with funder_type. Tax years 2012-2025. Place is the recipient's address. Set totals for a count and dollar sum.",
    inputSchema: {
      source: z.enum(["foundation", "charity"]).optional(),
      funder_ein: ein.optional(), recipient_ein: ein.optional(),
      year_from: z.number().int().min(2012).max(2025).optional(), year_to: z.number().int().min(2012).max(2025).optional(),
      state: st, county,
      label: z.enum(LABEL_SLUGS as [LabelSlug, ...LabelSlug[]]).optional().describe("Recipient's graded cause label"),
      label_tier: z.enum(["primary", "all"]).optional(),
      label_subtype: z.enum(["services", "policy", "all"]).optional().describe("With label immigrants_refugees: 'services' (default) = orgs serving immigrants and refugees, 'policy' = immigration policy research and advocacy of any stance, 'all' = both"),
      amount_min: z.number().int().nonnegative().optional().describe("Dollars"),
      funder_type: z.enum(FUNDER_TYPES).optional().describe("source 'charity' only"),
      totals: z.boolean().optional().describe("Also return count and sum for the filters"),
      limit: z.number().int().min(1).max(500).optional().describe("Rows per page (default 50)"), cursor,
    },
    annotations: { title: "Search grants", ...READ_ONLY },
  }, (a) => run("search_grants", () => apiGrants(a))());

  s.registerTool("get_federal_awards", {
    title: "Get federal awards",
    description: "USAspending grants and cooperative agreements to nonprofits and private colleges, federal fiscal years 2022-2025, newest first. Filter by recipient EIN, agency, assistance listing (CFDA) and place of performance.",
    inputSchema: {
      recipient_ein: ein.optional(),
      agency: z.string().max(100).optional().describe("3-digit agency code (e.g. '075' HHS) or part of the agency name"),
      assistance_listing: z.string().max(10).optional().describe("e.g. '93.866', or '93' for all of an agency's listings"),
      fiscal_year_from: z.number().int().min(2022).max(2025).optional(), fiscal_year_to: z.number().int().min(2022).max(2025).optional(),
      state: st.describe("Place of performance state"), county: county.describe("Place of performance county FIPS"),
      recipient_kind: z.enum(["nonprofit_501c3", "nonprofit_other", "private_college"]).optional(),
      q: z.string().max(100).optional().describe("Words in the award description, program title or recipient name"),
      totals: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(), cursor,
    },
    annotations: { title: "Get federal awards", ...READ_ONLY },
  }, (a) => run("get_federal_awards", () => apiFederalAwards(a))());

  s.registerTool("get_finances", {
    title: "Get finances by year",
    description: "Finances by tax year for one EIN. kind 'org': Form 990 panel (revenue, expenses, surplus, cash months, deficit streak). 'foundation': 990-PF (assets, grants paid, payout rate vs the 5% rule). Default 'both'.",
    inputSchema: { ein, kind: z.enum(["org", "foundation", "both"]).optional() },
    annotations: { title: "Get finances by year", ...READ_ONLY },
  }, ({ ein: e, kind }) => run("get_finances", async () => {
    const k = kind ?? "both";
    const [org, foundation] = await Promise.all([k !== "foundation" ? apiOrgFinances(e) : null, k !== "org" ? apiFoundationFinances(e) : null]);
    return org || foundation ? { ...(k !== "foundation" ? { org } : {}), ...(k !== "org" ? { foundation } : {}) } : null;
  })());

  s.registerTool("get_household_giving", {
    title: "Get household giving",
    description: "IRS SOI individual returns: itemized charitable deductions, returns and AGI by state or county (2013-2023) or ZIP (2013-2022). Itemizers only. by_agi splits by income class.",
    inputSchema: {
      level: z.enum(["state", "county", "zip"]).optional().describe("Default 'state'"),
      state: st, county: county.describe("level 'county' only"), zip: z.string().regex(/^\d{5}$/).optional().describe("level 'zip' only"),
      year_from: z.number().int().min(2013).max(2023).optional(), year_to: z.number().int().min(2013).max(2023).optional(),
      by_agi: z.boolean().optional(),
      limit: z.number().int().min(1).max(1000).optional().describe("Rows per page (default 100)"), cursor,
    },
    annotations: { title: "Get household giving", ...READ_ONLY },
  }, (a) => run("get_household_giving", () => apiHouseholdGiving(a))());

  s.registerTool("list_cause_labels", {
    title: "List cause labels",
    description: "Without label: the graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health) with definitions, org counts and precision grades. With label: the organizations carrying it, by EIN, paginated.",
    inputSchema: {
      label: z.enum(LABEL_SLUGS as [LabelSlug, ...LabelSlug[]]).optional(),
      tier: z.enum(["primary", "partial", "all"]).optional().describe("With label. Default 'primary'"),
      subtype: z.enum(["services", "policy", "all"]).optional().describe("With label immigrants_refugees: 'services', 'policy' or 'all' (default). Each org lists its subtypes"),
      state: st, ntee: z.string().max(5).optional().describe("NTEE code prefix"),
      limit: z.number().int().min(1).max(1000).optional(), cursor,
    },
    annotations: { title: "List cause labels", ...READ_ONLY },
  }, ({ label, ...a }) => run("list_cause_labels", () => (label ? apiLabelOrgs(label, a) : apiLabels()))());

  s.registerTool("search_policy", {
    title: "Search policy and news",
    description: "Search current-Congress bills (Congress.gov), Federal Register documents (from October 2025) and sector news headlines (GDELT), refreshed daily. Keyword search, newest first, by default; semantic=true ranks by meaning instead (closest first, with similarity), better for plain-language topics like 'rural food access'. News is one row per story (copies under other URLs hidden, their outlets in also_reported_by), with orgs: the nonprofits and foundations the headline names (EINs). ein= returns the headlines that name one org (news only). Bills and Federal Register have no EIN links.",
    inputSchema: {
      q: z.string().max(200).optional().describe("Keywords (quotes for phrases, -word to exclude), or a topic in plain words with semantic=true"),
      semantic: z.boolean().optional().describe("Rank by meaning instead of keyword match and date. Needs q. Default false"),
      source: z.enum(["all", "bills", "federal_register", "news"]).optional().describe("Default 'all'"),
      agency: z.string().max(100).optional().describe("Federal Register agency name contains this"),
      type: z.enum(FR_TYPES).optional().describe("Federal Register document type"),
      funding_only: z.boolean().optional().describe("Federal Register notices of funding opportunity only"),
      topic: z.enum(NEWS_TOPICS).optional().describe("News topic"),
      outlet: z.string().max(100).optional().describe("News site contains this"),
      ein: z.string().max(12).optional().describe("News that names this org: 9-digit EIN, dashes allowed. Implies source 'news' unless source is set"),
      include_duplicates: z.boolean().optional().describe("News: list every copy of a story under other URLs. Default false: one row per story, with also_reported_by"),
      date_from: day, date_to: day,
      limit: z.number().int().min(1).max(50).optional().describe("Per source (default 10)"),
    },
    annotations: { title: "Search policy and news", ...READ_ONLY },
  }, (a) => run("search_policy", () => apiPolicy(a))());

  // ---------- IoG internal (lib/apiIog.ts): listed and callable only for keys with the iog_internal scope ----------
  if (auth.key.scopes.includes(IOG_SCOPE)) {
    const iog = <T,>(fn: () => Promise<T>) => async () => {
      try { return await fn(); } catch (e) { if (e instanceof IogBadParam) throw new BadInput(e.message); throw e; }
    };
    s.registerTool("search_iog_guides", {
      title: "Search IoG Giving Guides",
      description: "IoG internal. Search the Institute on Generosity's Giving Guides (GG2026 edition: site visits, due diligence, initial assessment, philanthropic risk, ecosystem mapping, evaluation, board service, policy advocacy, giving models and more) by meaning and keyword. Returns passages with guide, section, Drive link and score. Internal course material: do not share outside IoG.",
      inputSchema: {
        q: z.string().min(1).max(300).describe("Question or topic in plain words, e.g. 'how to do a site visit'"),
        guide: z.string().max(120).optional().describe("Only this guide (slug from get_iog_guide with no slug)"),
        limit: z.number().int().min(1).max(20).optional().describe("Passages to return, 1-20 (default 5)"),
      },
      annotations: { title: "Search IoG Giving Guides", ...READ_ONLY },
    }, (a) => run("search_iog_guides", iog(() => apiIogSearch(a)))());

    s.registerTool("get_iog_guide", {
      title: "Get an IoG Giving Guide",
      description: "IoG internal. Without slug: the list of Giving Guides (slug, title, edition, notes, size). With slug: one guide in full, as Markdown text and as sections. Internal course material: do not share outside IoG.",
      inputSchema: { slug: z.string().max(120).optional().describe("Guide slug, e.g. 'conducting-a-site-visit'") },
      annotations: { title: "Get an IoG Giving Guide", ...READ_ONLY },
    }, ({ slug }) => run("get_iog_guide", () => (slug ? apiIogGuide(slug) : apiIogGuides(base)))());
  }

  return s;
}

type RpcMessage = { method?: unknown; params?: { name?: unknown; clientInfo?: { name?: unknown } } };

async function handle(request: Request) {
  const at = new Date(), start = performance.now();
  const keyed = request.headers.has("authorization");
  // The JSON-RPC body, read from a copy (the transport reads the original): method, tool name, client name.
  const body: unknown = keyed && request.method === "POST" ? await request.clone().json().catch(() => null) : null;
  const messages = (Array.isArray(body) ? body : body ? [body] : []) as RpcMessage[];
  const tool = messages.map((m) => (m.method === "tools/call" && typeof m.params?.name === "string" ? m.params.name : typeof m.method === "string" ? m.method : "?"))
    .join(",").slice(0, 100) || null;
  const log = (status: number, rows: number | null = null) => {
    if (keyed) logCall({ ...describe(request, requestKey.get(request) ?? null), at, route: "/mcp", mcpTool: tool, status, ms: performance.now() - start, rows });
  };

  const auth = await authenticate(request);
  if (auth instanceof Response) { log(auth.status); return auth; }
  // initialize carries clientInfo: remember it so this client's later calls (no clientInfo) show its name as the app.
  const init = messages.find((m) => m.method === "initialize");
  if (init) rememberMcpClient(auth.key.id, clientIp(request), typeof init.params?.clientInfo?.name === "string" ? init.params.clientInfo.name : null);
  const outcome: CallOutcome = { status: null, rows: null };
  const s = server(auth, baseUrl(request), outcome);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await s.connect(transport);
  const res = await transport.handleRequest(request);
  log(outcome.status ?? res.status, outcome.rows);
  for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
  return res;
}

export const POST = handle;
// Stateless server: no server-to-client stream (GET) and no sessions to end (DELETE). The spec allows 405 here.
const notAllowed = () => Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Send JSON-RPC with POST." }, id: null }, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
