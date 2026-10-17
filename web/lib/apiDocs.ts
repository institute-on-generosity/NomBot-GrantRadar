// What the partner API offers, in one place: the /api/docs page and /api/openapi.json are both built from it.
// Examples are real responses (Oct 16, 2026), trimmed to a few fields and rows.
export type Param = { name: string; in: "query" | "path"; type: "string" | "integer"; required?: boolean; example?: string; desc: string };
export type Endpoint = { id: string; method: "GET"; path: string; title: string; summary: string; params: Param[]; curl: string; example: unknown; mcpTool: string };

export const ENDPOINTS: Endpoint[] = [
  {
    id: "search", method: "GET", path: "/api/v1/search", title: "Search nonprofits", mcpTool: "search_nonprofits",
    summary: "Ranked nonprofits for a topic in plain words, by meaning and keyword over IRS 990 mission and program text. Fast (about 0.5 s with a state) and LLM-free, so results are not the relevance-scored list the website shows.",
    params: [
      { name: "q", in: "query", type: "string", example: "youth mentoring", desc: "Topic in plain words, up to 300 characters. Leave empty to list every organization in the filters." },
      { name: "state", in: "query", type: "string", example: "OH,KY", desc: "Two-letter state codes, comma separated." },
      { name: "city", in: "query", type: "string", example: "Mansfield", desc: "City names, comma separated (up to 10)." },
      { name: "max_revenue", in: "query", type: "integer", example: "500000", desc: "Only organizations with revenue at or below this, in dollars." },
      { name: "ntee", in: "query", type: "string", example: "O", desc: "NTEE cause code prefix, e.g. K (food) or K31 (food banks)." },
      { name: "label", in: "query", type: "string", example: "climate", desc: "Graded cause label, for causes no NTEE code captures: climate or women_girls. Only organizations with that label. Each result's label shows its tier. Unknown values are ignored." },
      { name: "label_tier", in: "query", type: "string", example: "primary", desc: "With label: primary (default) keeps organizations whose main work is the cause. all also adds partial ones, where it is one named goal or program among broader work." },
      { name: "limit", in: "query", type: "integer", example: "10", desc: "Results to return, 1 to 50. Default 10." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" \\\n  "$NOMBOT/api/v1/search?q=youth+mentoring&state=OH&limit=1"`,
    example: {
      query: { q: "youth mentoring", state: ["OH"], city: [], max_revenue: null, ntee: null, label: null, label_tier: null, limit: 1 },
      total: 3515, exact_total: null, semantic: true, model: "local:nomic-embed-text-v1.5-fp32@512",
      results: [{
        ein: "34-1877332", name: "MID-OHIO YOUTH MENTORING INC", city: "MANSFIELD", state: "OH",
        ntee: { code: "O31", label: "Youth Development" },
        revenue: { amount: 327923, year: 2024, source: "IRS BMF" },
        financials: { tax_year: 2023, revenue: 356039, expenses: 247555, assets: 354331 },
        health: { trend: { change: -0.079, from: { year: 2023, amount: 356039 }, to: { year: 2024, amount: 327923 } }, margin: 0.22, year: 2024, revenue: 327923, expenses: 255813, reserveMonths: 4.76, reserveBasis: "cash" },
        mission: "TO INSURE THAT ALL CHILDREN LIVING IN THE ORGANIZATION'S SERVICE AREA WILL HAVE THE OPPORTUNITY TO EXPERIENCE POSITIVE MENTORING RELATIONSHIPS.",
        programs: "MID-OHIO YOUTH MENTORING FACILITATES A ONE-TO-ONE MENTORING RELATIONSHIP FOR YOUTH...",
        team: { staff: 3, volunteers: 300 }, filing: { year: 2024, form: "990" }, exact: null, score: 0.82, label: null, data_completeness: "full",
        sources: [{ label: "Form 990 (2024)", detail: "Mission and programs, from the organization's IRS e-filed return", url: "https://projects.propublica.org/nonprofits/organizations/341877332/202512999349300001/full" }],
        url: "https://<host>/org/341877332",
      }],
    },
  },
  {
    id: "org", method: "GET", path: "/api/v1/org/{ein}", title: "Get an organization", mcpTool: "get_organization",
    summary: "Everything NomBot has on one organization: profile, financial history, Form 990 health signals (fixed rules, no AI), leaders and pay, private-foundation grants received and given (990-PF), grants received from public charities and grants given on Schedule I (with funder type: donor-advised fund sponsor, community foundation, United Way, other), and direct federal awards (USAspending, by fiscal year, agency, program and place of performance). The sources overlap, so do not add them together. Foundations also get assets and how to apply. labels lists graded cause labels (climate, women_girls), each with label, name, tier (primary or partial) and why.",
    params: [{ name: "ein", in: "path", type: "string", required: true, example: "34-1877332", desc: "9-digit EIN. Dashes are fine." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/org/341877332"`,
    example: {
      org: {
        ein: "34-1877332", name: "MID-OHIO YOUTH MENTORING INC",
        address: { street: "...", city: "MANSFIELD", state: "OH", zip: "..." },
        ntee: { code: "O31", label: "Youth Development" },
        labels: [], // e.g. Climate Central: [{ label: "climate", name: "Climate", tier: "primary", why: "Climate science and communication is the whole mission." }]
        status: { standing: "Recognized as tax-exempt", kind: "Public charity, supported by the public" },
        subsection: "03", ruling_year: 1999, years_tax_exempt: 27, website: null,
        mission: "TO INSURE THAT ALL CHILDREN ...", programs: "...",
        team: { staff: 3, volunteers: 300, year: 2024 },
        latest_filing: { year: 2024, form: "990", url: "https://projects.propublica.org/nonprofits/organizations/341877332/202512999349300001/full" },
        financials: {
          latest: { year: 2024, revenue: 327923, expenses: null, assets: 414989, source: "IRS master file" },
          history: [{ year: 2024, revenue: 327923, expenses: null, assets: 414989, source: "IRS master file" }, { year: 2023, revenue: 356039, expenses: 247555, assets: 354331, source: "IRS SOI (Form 990)" }],
          income: { year: 2023, form: "990", total: 356039, parts: [{ key: "gifts", label: "Gifts and grants", amount: 200854 }, { key: "other", label: "Other", amount: 138516 }], gifts: 0.56 },
        },
        health: {
          year: 2024, form: "990", rating: "Strong",
          signals: [{ key: "revenue", label: "Income", level: "ok", note: "down 8% from last year", ask: null }, { key: "result", label: "Bottom line", level: "ok", note: "took in 22% more than it spent", ask: null }],
          cash_months: 4.76, program_share: 0.88, debt_share: 0.005, spending: { program: 0.88, admin: 0.087, fundraising: 0.031 }, board: { members: 12, independent: 12 },
        },
        leaders: [{ name: "JAMES R NICHOLSON", title: "EXECUTIVE DI", role: "officer", hours: 40, pay: 65069, year: 2024 }],
        grants_received: {
          count: 5, total: 20200, funders: 3, first_year: 2022, latest_year: 2024,
          top_funders: [{ ein: "341623986", name: "RICHARD & ARLINE LANDERS FOUNDATION", grants: 3, total: 15000, latest_year: 2024 }],
          note: "Only grants from private foundations' 990-PF filings that we linked to this EIN (about 66% of grants and 58% of grant dollars are linked).",
        },
        grants_given: { count: 0, total: 0, first_year: null, latest_year: null, top_recipients: [] },
        charity_grants_received: {
          count: 13, total: 346274,
          by_year: [{ tax_year: 2024, count: 3, total: 104330 }, { tax_year: 2023, count: 5, total: 140844 }],
          by_funder_type: [{ type: "united_way", label: "United Way", funders: 2, count: 7, total: 268000 }, { type: "daf_sponsor", label: "Donor-advised fund sponsor", funders: 1, count: 1, total: 10894 }],
          top_funders: [{ ein: "340714455", name: "UNITED WAY OF RICHLAND COUNTY", type: "united_way", grants: 4, total: 188000, latest_year: 2024 }],
          note: "Grants public charities list on Form 990 Schedule I (over $5,000 per recipient), linked to this EIN. Tax years. ...",
        },
        // e.g. University of Pennsylvania (23-1352685): { awards: 3653, total: 3253705102, by_fiscal_year: [{ fiscal_year: 2025, award_years: 1956, total: 837436182 }],
        //   by_agency: [{ agency: "Department of Health and Human Services", awards: 2928, total: 2730316350 }],
        //   top_programs: [{ assistance_listing: "93.866", title: "AGING RESEARCH", agency: "...", awards: 264, total: 356384694 }], place_of_performance: [{ place: "PA", total: 3226858723 }], note: "..." }
        federal_awards: null,
        // e.g. University of Pennsylvania: { count: 283, total: 49688062, not_itemized: 1356315, by_year: [{ tax_year: 2024, count: 127, total: 18114947, not_itemized: 730743, part_ix_line1: 18845690 }], top_recipients: [...], note: "..." }
        charity_grants_given: null,
        funding_overlap_note: "The sources overlap. A donor-advised fund grant can start as a foundation grant to the sponsor, ...",
        foundation: null,
        sources: [{ label: "Form 990 (2024)", detail: "Mission and programs, from the organization's IRS e-filed return", url: "https://projects.propublica.org/..." }],
        url: "https://<host>/org/341877332",
      },
    },
  },
  {
    id: "research-list", method: "GET", path: "/api/v1/research", title: "List research findings", mcpTool: "list_research",
    summary: "Verified findings from NomBot Research, best first: headline, key points, key numbers. No data rows or charts, so it stays small. Open one with its slug.",
    params: [
      { name: "section", in: "query", type: "string", example: "funding-gaps", desc: "funding-gaps, rising-fading, money-flows, track-record, affiliations or financial-stress." },
      { name: "state", in: "query", type: "string", example: "WV", desc: "Only findings about this state." },
      { name: "cause", in: "query", type: "string", example: "E", desc: "Only findings whose cause contains this text." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Findings to return, 1 to 300. Default 50." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/research?section=money-flows&limit=1"`,
    example: {
      filters: { section: "money-flows", state: null, cause: null, limit: 1 },
      sections: [{ key: "funding-gaps", label: "Funding gaps" }, { key: "money-flows", label: "Money flows" }],
      count: 1,
      research: [{
        slug: "flow-pharma-patient-assistance", section: "money-flows", section_label: "Money flows",
        headline: "Drug-company patient aid is a fifth of all foundation grant dollars",
        summary: "Drug-company patient-assistance foundations reported $69B in grants for 2022-24, 19% of all private-foundation grant dollars, mostly donated medicine.",
        points: ["**$69B** in 2022-24 grants from **14** patient-assistance foundations", "Mostly donated medicine to patients. Largest: Genentech Patient Foundation", "**Why it matters:** strip them out before benchmarking giving to charities"],
        stats: [{ label: "Patient-assistance grants", value: "$69B" }, { label: "Share of all grant dollars", value: "19%" }, { label: "Foundations", value: "14" }],
        cause: "E", state: null, score: 0.93, org_count: 0, row_count: 14, updated: "2026-10-16T17:27:34.206Z",
        url: "https://<host>/research/flow-pharma-patient-assistance", api_url: "https://<host>/api/v1/research/flow-pharma-patient-assistance",
      }],
    },
  },
  {
    id: "research-get", method: "GET", path: "/api/v1/research/{slug}", title: "Get a research finding", mcpTool: "get_research",
    summary: "One finding in full: key points and numbers, method, caveats, the SQL behind it, sources, every data row (up to 5,000), the organizations' EINs, the Vega-Lite chart and a citation.",
    params: [{ name: "slug", in: "path", type: "string", required: true, example: "flow-pharma-patient-assistance", desc: "The finding's slug, from the list." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/research/flow-pharma-patient-assistance"`,
    example: {
      research: {
        slug: "flow-pharma-patient-assistance", section: "money-flows", section_label: "Money flows",
        headline: "Drug-company patient aid is a fifth of all foundation grant dollars", summary: "...", points: ["..."], stats: [{ label: "Foundations", value: "14" }],
        cause: "E", state: null, score: 0.93,
        method: "990-PF Part XV grants for tax years 2022-24. Patient-assistance foundations: ...",
        caveats: "Values are as reported by each foundation (donated drugs are usually valued at wholesale prices). ...",
        sql: "WITH f AS (SELECT funder_ein, sum(amount) AS total ...",
        sources: [{ url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads", label: "IRS Form 990-PF e-file returns, Part XV grants (IRS releases 2023-2026)" }],
        chart: { $schema: "https://vega.github.io/schema/vega-lite/v5.json", mark: "bar" },
        data: [{ ein: "460500266", name: "Genentech Patient Foundation", state: "CA", grants_2022_24: 10160427640 }],
        row_count: 14, data_truncated: false, org_eins: [], updated: "2026-10-16T17:27:34.206Z",
        url: "https://<host>/research/flow-pharma-patient-assistance",
        cite: "Institute on Generosity, NomBot Research: \"Drug-company patient aid is a fifth of all foundation grant dollars\" (https://<host>/research/flow-pharma-patient-assistance), updated 2026-10-16.",
      },
    },
  },
  {
    id: "answer", method: "GET", path: "/api/v1/answer", title: "Answer a research question", mcpTool: "answer_research_question",
    summary: "An aggregate answer (how much money goes to a cause, its share, trend, states, top funders or recipients, grant sizes, concentration, how many orgs run deficits) from fixed SQL over 990-PF grants and Form 990 lines, with method, caveats, coverage and what the data can't answer. With q, one small Claude call reads the question (about $0.006 per new question, cached 24 h); with spec, no Claude call. MCP takes the spec directly.",
    params: [
      { name: "q", in: "query", type: "string", example: "how much foundation money goes to climate", desc: "The question in plain words, up to 300 characters." },
      { name: "spec", in: "query", type: "string", example: '{"metric":"total","causes":[{"name":"climate","label":"climate","ntee":[],"keywords":[]}]}', desc: "Instead of q: the structured question as JSON (metric, causes, source, yearFrom, yearTo, states, county, area, condition, perResident, order). No Claude call." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" \\\n  "$NOMBOT/api/v1/answer?q=how+much+foundation+money+goes+to+climate"`,
    example: {
      research: true, question: "how much foundation money goes to climate", status: "ok",
      headline: "Foundations gave $2.3B to climate, 2022–24: 1.3% of identified grant dollars",
      numbers: [{ value: "$2.3B", label: "primary, 2022–24", note: "up to $4.2B with partial" }, { value: "1.3%", label: "of identified foundation grant $" }],
      bullets: ["$759.7M a year to climate as a main purpose, $1.4B with partial"],
      what_counts: "Climate label (org_labels): primary = the main stated purpose, partial = one program among others.",
      method: "Sum of 990-PF grants paid in tax years 2022–24 to identified recipients ...", caveats: ["Only private-foundation grants (990-PF). ..."],
      coverage: [{ label: "Grants counted", value: "4,575,000" }], missing: [],
      data: [{ cause: "climate", tax_year: 2022, usd: 1348800000, primary_usd: 732700000 }],
      sources: [{ label: "IRS Form 990-PF e-file (Part XV grants)", url: "https://www.irs.gov/charities-non-profits/form-990-series-downloads" }],
      chart: null, queries: [{ title: "Foundation grants to climate, by tax year", sql: "SELECT ..." }], ms: 250,
    },
  },
];

export const ERRORS = [
  { status: 400, code: "bad_ein", when: "The EIN isn't 9 digits." },
  { status: 401, code: "missing_key", when: "No Authorization: Bearer header." },
  { status: 401, code: "invalid_key", when: "The key is unknown or mistyped." },
  { status: 403, code: "revoked_key", when: "The key was revoked." },
  { status: 403, code: "insufficient_scope", when: "The key lacks the read scope." },
  { status: 404, code: "not_found", when: "No organization or finding with that id." },
  { status: 429, code: "rate_limited", when: "Over the key's per-minute limit. Wait Retry-After seconds." },
  { status: 500, code: "server_error", when: "Our bug. Try again, then tell us." },
];

export const MCP_TOOLS = [
  { name: "search_nonprofits", desc: "Same as GET /api/v1/search. Arguments: q, state[], city[], max_revenue, ntee, label, label_tier, limit." },
  { name: "get_organization", desc: "Same as GET /api/v1/org/{ein}. Argument: ein." },
  { name: "list_research", desc: "Same as GET /api/v1/research. Arguments: section, state, cause, limit." },
  { name: "get_research", desc: "Same as GET /api/v1/research/{slug}, with up to max_rows data rows (default 200)." },
];

const schemaFor = (v: unknown): Record<string, unknown> => {
  if (v === null) return {}; // null in the example: type not shown
  if (Array.isArray(v)) return { type: "array", items: v.length ? schemaFor(v[0]) : {} };
  if (typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, schemaFor(x)])) };
  return { type: typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v };
};

export function openapi(server: string) {
  const errorSchema = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, docs: { type: "string" } } } } };
  return {
    openapi: "3.1.0",
    info: {
      title: "NomBot API", version: "1.0.0",
      description: "Read-only access to public IRS data on US nonprofits and foundations, and NomBot's verified research findings. Institute on Generosity. Human docs: /api/docs. Remote MCP server: POST /mcp with the same key.",
    },
    servers: [{ url: server }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API key, nb_live_..." } },
      schemas: { Error: errorSchema },
    },
    paths: Object.fromEntries(ENDPOINTS.map((e) => [e.path, {
      get: {
        operationId: e.id.replace(/-(\w)/g, (_, c) => c.toUpperCase()),
        summary: e.title, description: e.summary,
        parameters: e.params.map((p) => ({ name: p.name, in: p.in, required: p.in === "path" || !!p.required, description: p.desc, schema: { type: p.type }, example: p.example })),
        responses: {
          200: { description: "OK", content: { "application/json": { schema: schemaFor(e.example), example: e.example } } },
          ...Object.fromEntries([...new Set(ERRORS.map((x) => x.status))].map((s) => [String(s), { description: ERRORS.filter((x) => x.status === s).map((x) => `${x.code}: ${x.when}`).join(" "), content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])),
        },
      },
    }])),
  };
}
