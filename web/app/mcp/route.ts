// Remote MCP server (Streamable HTTP, JSON-RPC over POST) for AI tools: search_nonprofits, get_organization,
// list_research, get_research, answer_research_question. Same Bearer API key as /api/v1/*. Stateless: a fresh server and transport per
// request, plain JSON responses (no SSE stream, no sessions). Tools call the same functions as the REST API,
// never the Claude API. Setup snippets at /api/docs.
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, record, baseUrl, type Auth } from "@/lib/apiAuth";
import { apiSearch, apiOrg, apiResearchList, apiResearch, SECTION_KEYS } from "@/lib/api";
import { answer, answerBrief } from "@/lib/answer";
import { DEFAULT_SPEC, normalizeSpec, specSchema } from "@/lib/answerSpec";
import { ANSWER_TOOL_DESCRIPTION } from "@/lib/answerTool";
import { LABEL_SLUGS, type LabelSlug } from "@/lib/labels";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
class BadInput extends Error {} // shown to the caller as a tool error

function server(auth: Auth, base: string) {
  const s = new McpServer(
    { name: "nombot", title: "NomBot (Institute on Generosity)", version: "1.0.0" },
    { instructions: "Public IRS data on US nonprofits and foundations: search organizations in plain language, look one up by EIN (financials, leaders, foundation grants), and read verified research findings. Amounts are US dollars. Cite the sources and urls returned." },
  );
  // Each tool call is counted as mcp:<tool> in api_usage; a thrown error becomes an MCP tool error, not a crash.
  const run = (tool: string, fn: () => Promise<unknown>) => async (): Promise<Result> => {
    try {
      const out = await fn();
      if (out == null) {
        record(auth.key.id, `mcp:${tool}`, 404);
        return { content: [{ type: "text", text: "Not found." }], isError: true };
      }
      record(auth.key.id, `mcp:${tool}`, 200);
      return { content: [{ type: "text", text: JSON.stringify(out) }] };
    } catch (e) {
      if (e instanceof BadInput) {
        record(auth.key.id, `mcp:${tool}`, 400);
        return { content: [{ type: "text", text: e.message }], isError: true };
      }
      console.error(`mcp ${tool} failed`, e);
      record(auth.key.id, `mcp:${tool}`, 500);
      return { content: [{ type: "text", text: "Something went wrong on our side. Try again." }], isError: true };
    }
  };

  s.registerTool("search_nonprofits", {
    title: "Search nonprofits",
    description: "Find US nonprofits by what they do, in plain language (meaning + keyword search over IRS 990 mission and program text). Returns ranked organizations with EIN, place, cause (NTEE), revenue, mission, staff and sources. Use filters for place, size and graded cause labels (climate, women_girls, substance_use); put only the topic in q.",
    inputSchema: {
      q: z.string().max(300).describe("Topic in plain words, e.g. 'food bank workforce training'. Empty lists every org in the filters."),
      state: z.array(z.string().length(2)).max(60).optional().describe("Two-letter state codes, e.g. ['WV','KY']"),
      city: z.array(z.string()).max(10).optional().describe("City names, e.g. ['Huntington']"),
      max_revenue: z.number().int().nonnegative().optional().describe("Only orgs with revenue at or below this, in dollars"),
      ntee: z.string().max(5).optional().describe("NTEE cause code prefix, e.g. 'K' (food) or 'K31' (food banks)"),
      label: z.enum(LABEL_SLUGS as [LabelSlug, ...LabelSlug[]]).optional().describe("Graded cause label no NTEE code captures: 'climate', 'women_girls' or 'substance_use'. Only orgs with that label (each result's label shows its tier)"),
      label_tier: z.enum(["primary", "all"]).optional().describe("With label: 'primary' (default) = the cause is the org's main work; 'all' also adds 'partial' orgs where it is one named goal among others"),
      limit: z.number().int().min(1).max(50).optional().describe("Results to return, 1-50 (default 10)"),
    },
    annotations: { title: "Search nonprofits", ...READ_ONLY },
  }, (a) => run("search_nonprofits", () => apiSearch(a, base))());

  s.registerTool("get_organization", {
    title: "Get organization",
    description: "Everything NomBot has on one organization by EIN: address, cause, graded cause labels (climate, women_girls, substance_use) with tier and why, status, years tax-exempt, website, mission, programs, staff and volunteers, financial history, Form 990 health signals, leaders and pay, foundation grants received (top funders) and given (top recipients), grants received from public charities and given on Form 990 Schedule I (by year, funder type such as donor-advised fund sponsor or community foundation, top funders and recipients), direct federal awards (by fiscal year, agency, program, place of performance), and sources. The grant sources overlap: do not add them.",
    inputSchema: { ein: z.string().describe("9-digit EIN, dashes allowed, e.g. '55-0123456'") },
    annotations: { title: "Get organization", ...READ_ONLY },
  }, ({ ein }) => run("get_organization", async () => {
    const r = await apiOrg(ein, base);
    if ("error" in r && r.error === "bad_ein") throw new BadInput("EIN must be 9 digits.");
    return "error" in r ? null : r;
  })());

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
    return answerBrief(await answer("MCP research question", normalizeSpec(parsed.data)), 50);
  })());

  return s;
}

async function handle(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const s = server(auth, baseUrl(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await s.connect(transport);
  const res = await transport.handleRequest(request);
  for (const [k, v] of Object.entries(auth.headers)) res.headers.set(k, v);
  return res;
}

export const POST = handle;
// Stateless server: no server-to-client stream (GET) and no sessions to end (DELETE). The spec allows 405 here.
const notAllowed = () => Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Send JSON-RPC with POST." }, id: null }, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
