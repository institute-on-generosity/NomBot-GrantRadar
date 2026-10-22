// What the partner API offers, in one place: the /api/docs page and /api/openapi.json are both built from it.
// Examples are real responses (Oct 16 and Oct 19, 2026), trimmed to a few fields and rows.
export type Param = { name: string; in: "query" | "path"; type: "string" | "integer" | "boolean"; required?: boolean; example?: string; desc: string };
export type Endpoint = { id: string; method: "GET"; path: string; title: string; summary: string; params: Param[]; curl: string; example: unknown; mcpTool: string; scope?: string };
// scope: set on IoG internal endpoints, which need a key with that scope (iog_internal). Others need read.

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
      { name: "label", in: "query", type: "string", example: "climate", desc: "Graded cause label, for causes no NTEE code captures: climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity or animal_welfare. Only organizations with that label. Each result's label shows its tier. Unknown values are ignored." },
      { name: "label_tier", in: "query", type: "string", example: "primary", desc: "With label: primary (default) keeps organizations whose main work is the cause. all also adds partial ones, where it is one named goal or program among broader work." },
      { name: "label_subtype", in: "query", type: "string", example: "services", desc: "With label=immigrants_refugees: services (default) = organizations serving immigrants and refugees, policy = immigration policy research and advocacy of any stance (including groups that argue for less immigration), all = both. Each result's label lists its subtypes." },
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
    summary: "Everything NomBot has on one organization: profile, financial history, Form 990 health signals (fixed rules, no AI), leaders and pay, private-foundation grants received and given (990-PF), grants received from public charities and grants given on Schedule I (with funder type: donor-advised fund sponsor, community foundation, United Way, other), and direct federal awards (USAspending, by fiscal year, agency, program and place of performance). The sources overlap, so do not add them together. news lists the newest headlines (up to 5) that name the org, with total and all_url (/api/v1/news?ein=). Foundations also get assets and how to apply. labels lists graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity, animal_welfare), each with label, name, tier (primary or partial) and why. ntee is the IRS code. ntee_suggested is a suggested NTEE major group (kind, major, code, name, quote, irs_code, note), else null. kind corrected: the IRS code doesn't fit the org's own 990 text (4,049 orgs, graded 94% right on a sample of 150). kind uncoded: the org has no IRS code, so irs_code is null and the group comes from similar orgs and its own filings (42,973 orgs, graded 98% right on a sample of 150). code is a detailed NTEE code (e.g. B20) for 21,274 uncoded orgs (graded 98.7% on 150), else null. tax_status is the IRS Pub 78 and revocation block from /api/v1/orgs/{ein}/status. similar lists up to 10 organizations most like this one by 990 text (results as in /api/v1/orgs/{ein}/similar, with underfunded_url for less-funded peers), or null before the table exists.",
    params: [{ name: "ein", in: "path", type: "string", required: true, example: "34-1877332", desc: "9-digit EIN. Dashes are fine." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/org/341877332"`,
    example: {
      org: {
        ein: "34-1877332", name: "MID-OHIO YOUTH MENTORING INC",
        address: { street: "...", city: "MANSFIELD", state: "OH", zip: "..." },
        ntee: { code: "O31", label: "Youth Development" },
        // Corrected NTEE major group when the IRS code doesn't fit the org's own 990 text (4,049 orgs), else null. e.g. Brown University:
        // { kind: "corrected", major: "B", code: null, name: "Education", quote: "...", irs_code: "S41", note: "Suggested from the org's own 990 text by a model check, graded 94% right on a sample of 150. The IRS code is unchanged." }
        ntee_suggested: null,
        labels: [], // e.g. Climate Central: [{ label: "climate", name: "Climate", tier: "primary", why: "Climate science and communication is the whole mission." }]
        status: { standing: "Recognized as tax-exempt", kind: "Public charity, supported by the public" },
        tax_status: {
          status: "eligible",
          pub78: { eligible: true, codes: [{ code: "PC", label: "Public charity (50% deduction limit)" }], city: "Mansfield", state: "OH", file_date: "2026-10-13" },
          revocation: null, note: "status: eligible (on Pub 78), revoked ...",
        },
        subsection: "03", ruling_year: 1999, years_tax_exempt: 27, website: null,
        mission: "TO INSURE THAT ALL CHILDREN ...", programs: "...",
        team: { staff: 3, volunteers: 300, year: 2024 },
        latest_filing: { year: 2024, form: "990", url: "https://projects.propublica.org/nonprofits/organizations/341877332/202512999349300001/full" },
        latest_990: { tax_year: 2024, form: "990", irs_processed_year: 2025, note: "Returns reach the IRS 1 to 2 years after the tax year, so newer years may not be filed yet." },
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
        // Newest headlines that name the org, matched by name. e.g. Gates Foundation (56-2618866): { total: 2, results: [{ id: 2826,
        //   title: "Warren Buffett Accelerates Charitable Donations, Ends Contributions to Gates Foundation", url: "https://themunicheye.com/...", outlet: "themunicheye.com", seen_at: "2026-07-14T21:00:00.000Z", matched: "Gates Foundation" }, ...], ... }
        news: { total: 0, results: [], all_url: "https://<host>/api/v1/news?ein=341877332", note: "Headlines that name this organization, matched by name ..." },
        leaders: [{ name: "JAMES R NICHOLSON", title: "EXECUTIVE DI", role: "officer", hours: 40, pay: 65069, year: 2024 }],
        grants_received: {
          count: 5, total: 20200, funders: 3, first_year: 2022, latest_year: 2024,
          top_funders: [{ ein: "341623986", name: "RICHARD & ARLINE LANDERS FOUNDATION", grants: 3, total: 15000, latest_year: 2024 }],
          note: "Only grants from private foundations' 990-PF filings that we linked to this EIN (about 66% of grants and 58% of grant dollars are linked).",
        },
        // by_recipient_type: who received the 990-PF grants (null when none went to governments, public universities, international bodies or
        //   companies). e.g. Gates Foundation (56-2618866): { types: [{ type: "international", label: "International bodies", grants: 638, total: 1723000000, share: 0.028,
        //   top_recipients: [{ name: "INTERNATIONAL BANK FOR RECONSTRUCTION AND DEVELOPMENT", total: 763000000 }] }, ...], note: "..." }
        grants_given: { count: 0, total: 0, first_year: null, latest_year: null, top_recipients: [], by_recipient_type: null },
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
        // e.g. University of Pennsylvania: { count: 283, total: 49688062, not_itemized: 1356315, transfers: 0, by_year: [{ tax_year: 2024, count: 127, total: 18114947, not_itemized: 730743, transfers: 0, part_ix_line1: 18845690 }], top_recipients: [...], note: "..." }
        charity_grants_given: null,
        // Schedule I lines moving assets between related organizations (and clear reporting errors), left out of every total.
        // e.g. Underwriters Laboratories (36-1892375): { received: [], given: [{ id: 3743650, tax_year: 2021, to: { ein: "301211139", name: "ULSE INC" }, amount: 7632896943, cash: 0, noncash: 7632896943, kind: "transfer", reason: "..." }], note: "..." }
        schedule_i_transfers: null,
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
    summary: "An aggregate answer (how much money goes to a cause, its share, trend, states, top funders or recipients, grant sizes, concentration, how many orgs run deficits, which orgs in a cause get little foundation money for their size) from fixed SQL over 990-PF grants and Form 990 lines, with method, caveats, coverage and what the data can't answer. who_received (foundation grant totals with no cause, and splits by recipient kind): the dollars split into linked nonprofits, governments, public universities, international bodies, companies and unidentified, with the linked share of all dollars and of dollars to nonprofits, null otherwise. underfunded_orgs (metric underfunded): up to 10 orgs with their revenue, foundation grants a year, the peer median for their size and government share, null otherwise. data_years: the filing years it covers and which are still arriving (a later tax year with under 90% of the fullest year's filings is partial). steps: the step-by-step evidence (how the question was read, the cause set, the data, per-year totals with the biggest recipients and funders, the computation, the baseline, checks such as a start-year spike, and the SQL), built from the same query results, no extra Claude call. With q, one small Claude call reads the question (about $0.006 per new question, cached 24 h); with spec, no Claude call. MCP takes the spec directly.",
    params: [
      { name: "q", in: "query", type: "string", example: "how much foundation money goes to climate", desc: "The question in plain words, up to 300 characters." },
      { name: "spec", in: "query", type: "string", example: '{"metric":"total","causes":[{"name":"climate","label":"climate","ntee":[],"keywords":[]}]}', desc: "Instead of q: the structured question as JSON (metric, causes, source, yearFrom, yearTo, states, county, area, condition, perResident, order, ntee). ntee \"corrected\" counts NTEE-coded causes by corrected groups (orgs whose IRS code doesn't fit their 990 text count under a suggested major group, with a footnote on what moved). Default \"irs\". No Claude call." },
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
      steps: [
        { n: 1, key: "question", title: "Understood the question", line: "A total, climate, foundation grants (990-PF), the US, tax years 2022 to 2024", details: ["Years: no years asked, so 2022 to 2024, when e-filing covers almost every filer and 2024 is the newest full year"] },
        { n: 4, key: "count", title: "Counted", line: "2022 $763.0M … 2024 $825.9M (main-purpose (primary) orgs)", details: ["2022–24 biggest recipients: ...", "2022–24 biggest funders: ..."], evidence: [{ role: "recipient", name: "...", ein: "...", usd: 0, year: "2022–24" }] },
        { n: 5, key: "compute", title: "Computed", line: "share = $2.4B / $186.1B = 1.3% of identified foundation grant dollars", details: ["a year = ... / 3 full years = ..."] },
      ],
      follow_ups: [],
      who_received: null,
      data_years: { form: "990-PF", from: 2022, to: 2024, newest_per_org: false, latest_full: 2024, partial: [{ year: 2025, share: 0.54 }], partial_in_range: [], trend_end_partial: false, note: "Covers 990-PF grants for tax years 2022 to 2024. Returns arrive 1 to 2 years late, so 2025 is still incomplete." },
      chart: null, queries: [{ title: "Foundation grants to climate, by tax year", sql: "SELECT ..." }], ms: 250,
    },
  },
  // ---------- row-level data (lib/apiData.ts). Lists page with limit and cursor (pass next_cursor back unchanged). ----------
  {
    id: "grants", method: "GET", path: "/api/v1/grants", title: "List grants", mcpTool: "search_grants",
    summary: "Grant rows, newest tax year first. source=foundation (default): private foundations' 990-PF grants. source=charity: grants public charities list on Form 990 Schedule I, with the funder's type (donor-advised fund sponsor, community foundation, United Way, other), lines that name no recipient left out. Tax years 2012 to 2025. Place is the recipient's mailing address, not where the money is spent. Grants to individuals withhold the person's name and ZIP. totals=true adds the count and dollar sum for the filters.",
    params: [
      { name: "source", in: "query", type: "string", example: "foundation", desc: "foundation (990-PF, default) or charity (Schedule I)." },
      { name: "funder_ein", in: "query", type: "string", example: "924018392", desc: "Only grants this funder made." },
      { name: "recipient_ein", in: "query", type: "string", example: "810777076", desc: "Only grants linked to this recipient." },
      { name: "year_from", in: "query", type: "integer", example: "2022", desc: "First tax year, 2012 to 2025. Default 2012." },
      { name: "year_to", in: "query", type: "integer", example: "2024", desc: "Last tax year. Default 2025." },
      { name: "state", in: "query", type: "string", example: "WV", desc: "Recipient's state." },
      { name: "county", in: "query", type: "string", example: "54039", desc: "Recipient's county, 5-digit FIPS (by ZIP code)." },
      { name: "label", in: "query", type: "string", example: "climate", desc: "Recipient's graded cause label: climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity or animal_welfare." },
      { name: "label_tier", in: "query", type: "string", example: "primary", desc: "With label: primary (default) or all (adds partial)." },
      { name: "label_subtype", in: "query", type: "string", example: "services", desc: "With label=immigrants_refugees: services (default), policy (immigration policy and advocacy, any stance) or all." },
      { name: "amount_min", in: "query", type: "integer", example: "50000", desc: "Only grants of at least this many dollars." },
      { name: "funder_type", in: "query", type: "string", example: "daf_sponsor", desc: "With source=charity: daf_sponsor, community_foundation, united_way or other." },
      { name: "totals", in: "query", type: "boolean", example: "true", desc: "Also return totals.count and totals.amount for the filters (capped at 8 seconds)." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Rows per page, 1 to 500. Default 50." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" \\\n  "$NOMBOT/api/v1/grants?state=WV&year_from=2024&year_to=2024&amount_min=50000&limit=1"`,
    example: {
      filters: { source: "foundation", funder_ein: null, recipient_ein: null, year_from: 2024, year_to: 2024, state: "WV", county: null, label: null, label_tier: null, amount_min: 50000, funder_type: null, limit: 1 },
      results: [{
        id: 11426378, source: "foundation", tax_year: 2024,
        funder: { ein: "924018392", name: "WEST VIRGINIA FIRST FOUNDATION INC" },
        recipient: { ein: "810777076", name: "POLLEN8 WV INC", individual: false, city: "SOUTH CHARLESTON", state: "WV", zip: "25303", county_fips: "54039", county_name: "Kanawha County", status: null },
        amount: 90000, relationship: null, purpose: "TRANSITIONAL/RECOVERY", match: { method: "zip", score: 0.727 },
        filing_url: "https://projects.propublica.org/nonprofits/organizations/924018392/202641349349102084/full",
      }],
      count: 1, has_more: true, next_cursor: "WzIwMjQsMTE0MjYzNzhd",
      notes: ["Grants private foundations list on Form 990-PF Part XV, tax years 2012-2025. ...", "Tax years before 2020 cover e-filed returns only ..."],
    },
  },
  {
    id: "federal-awards", method: "GET", path: "/api/v1/federal-awards", title: "List federal awards", mcpTool: "get_federal_awards",
    summary: "Direct federal grants and cooperative agreements to nonprofits and private colleges (USAspending), newest fiscal year first. Federal fiscal years 2022 to 2025 (October to September). amount is the net obligation that year, so it can be negative. state and county are the place of performance, and recipient_state is the recipient's address.",
    params: [
      { name: "recipient_ein", in: "query", type: "string", example: "231352685", desc: "Only awards linked to this EIN (about 85% of awards are linked)." },
      { name: "agency", in: "query", type: "string", example: "075", desc: "3-digit agency code (075 is Health and Human Services) or part of the agency or sub-agency name." },
      { name: "assistance_listing", in: "query", type: "string", example: "93.866", desc: "Assistance listing (CFDA) number, or its 2-digit prefix (93) for all of an agency's listings." },
      { name: "fiscal_year_from", in: "query", type: "integer", example: "2024", desc: "First fiscal year, 2022 to 2025." },
      { name: "fiscal_year_to", in: "query", type: "integer", example: "2025", desc: "Last fiscal year." },
      { name: "state", in: "query", type: "string", example: "PA", desc: "Place of performance state." },
      { name: "county", in: "query", type: "string", example: "42101", desc: "Place of performance county, 5-digit FIPS." },
      { name: "recipient_state", in: "query", type: "string", example: "PA", desc: "Recipient's address state." },
      { name: "recipient_kind", in: "query", type: "string", example: "private_college", desc: "nonprofit_501c3, nonprofit_other or private_college." },
      { name: "q", in: "query", type: "string", example: "dementia", desc: "Words in the description, program title or recipient name." },
      { name: "amount_min", in: "query", type: "integer", example: "1000000", desc: "Only award-years of at least this many dollars." },
      { name: "totals", in: "query", type: "boolean", example: "true", desc: "Also return totals.count and totals.amount for the filters." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Rows per page, 1 to 500. Default 50." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" \\\n  "$NOMBOT/api/v1/federal-awards?recipient_ein=231352685&assistance_listing=93.866&limit=1"`,
    example: {
      filters: { recipient_ein: "231352685", agency: null, assistance_listing: "93.866", fiscal_year_from: 2022, fiscal_year_to: 2025, state: null, county: null, recipient_state: null, recipient_kind: null, q: null, amount_min: null, limit: 1 },
      results: [{
        id: 408907, award_key: "ASST_NON_P30AG064105_075", fain: "P30AG064105", fiscal_year: 2025,
        agency: { code: "075", name: "Department of Health and Human Services", sub_agency: "National Institutes of Health" },
        assistance_listing: { number: "93.866", title: "AGING RESEARCH" }, assistance_type: "04",
        recipient: { ein: "231352685", uei: "GM1XX56LEP58", name: "TRUSTEES OF THE UNIVERSITY OF PENNSYLVANIA, THE", city: "PHILADELPHIA", state: "PA", zip: "19104", kind: "private_college" },
        place_of_performance: { scope: "STATE-WIDE", state: "PA", county_fips: null },
        amount: 0, actions: 1, description: "TRANSFORMING RESIDENTIAL PALLIATIVE CARE FOR PERSONS WITH DEMENTIA ...",
        match: { method: "exact", score: 1 }, url: "https://www.usaspending.gov/award/ASST_NON_P30AG064105_075",
      }],
      count: 1, has_more: true, next_cursor: "WzIwMjUsNDA4OTA3XQ", notes: ["Direct federal grants and cooperative agreements ..."],
    },
  },
  {
    id: "foundation-finances", method: "GET", path: "/api/v1/foundations/{ein}/finances", title: "Foundation finances by year", mcpTool: "get_finances",
    summary: "A private foundation's Form 990-PF finances, one row per tax year (newest return for the year): assets, revenue, expenses, grants paid, qualifying distributions, distributable amount, payout_rate (qualifying distributions over net investment assets, the 5% rule's measure), grant_rate and meets_distributable. 404 when the EIN has no 990-PF loaded.",
    params: [{ name: "ein", in: "path", type: "string", required: true, example: "13-1684331", desc: "9-digit EIN. Dashes are fine." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/foundations/131684331/finances"`,
    example: {
      ein: "131684331", name: "THE FORD FOUNDATION", years: 3,
      results: [{
        tax_year: 2024, tax_period_end: "2024-12-31", amended: false, private_operating: false, charitable_trust: false,
        fmv_assets: 17482000476, book_assets: 17484692219, net_assets: 14899612523, total_revenue: 1147097733, total_expenses: 1043691402,
        grants_paid: 840817348, qualifying_distributions: 1102547617, net_investment_assets: 16033542268, distributable_amount: 814928501,
        excess_carryover: 962048816, payout_rate: 0.0688, grant_rate: 0.0481, meets_distributable: true,
        filing_url: "https://projects.propublica.org/nonprofits/organizations/131684331/202513219349106006/full",
      }],
      notes: ["One row per tax year from the foundation's Form 990-PF ..."],
    },
  },
  {
    id: "org-finances", method: "GET", path: "/api/v1/orgs/{ein}/finances", title: "Nonprofit finances by year", mcpTool: "get_finances",
    summary: "A nonprofit's Form 990 or 990-EZ finance panel, one row per tax year: revenue, expenses, surplus, contributions, program revenue, government grants, cash, months of cash, assets, liabilities, net assets, and flags (deficit, low_cash under 3 months, negative_net_assets, deficit_streak). source prior_year rows fill a missing year from the next return's prior-year column.",
    params: [{ name: "ein", in: "path", type: "string", required: true, example: "34-1877332", desc: "9-digit EIN. Dashes are fine." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/orgs/341877332/finances"`,
    example: {
      ein: "341877332", name: "MID-OHIO YOUTH MENTORING INC", years: 2,
      results: [{
        tax_year: 2024, form: "990", source: "filing", revenue: 327923, expenses: 255813, surplus: 72110, contributions: 179730, program_revenue: 0,
        government_grants: null, cash: 101420, months_cash: 4.76, total_assets: 414989, total_liabilities: 2168, net_assets: 412821, unrestricted_net_assets: 412821,
        deficit: false, low_cash: false, negative_net_assets: false, deficit_streak: 0, revenue_band: 2, state: "OH", county_fips: "39139", ntee: "O31", subsection: "03",
        filing_url: "https://projects.propublica.org/nonprofits/organizations/341877332/202512999349300001/full",
      }],
      notes: ["One row per tax year from Form 990 or 990-EZ. ..."],
    },
  },
  {
    id: "org-status", method: "GET", path: "/api/v1/orgs/{ein}/status", title: "IRS tax status", mcpTool: "get_tax_status",
    summary: "IRS tax-exempt status for one EIN, including EINs no longer in the master file. pub78: on IRS Publication 78 (eligible to receive tax-deductible gifts) with deductibility codes. revocation: the latest automatic revocation (no 990 for 3 straight years) with revocation, posting and reinstatement dates, the full history, and foundation (990-PF) grants linked to the EIN in tax years after the revocation year and before any reinstatement. status sums it up: eligible, revoked (no reinstatement, not on Pub 78, no newer IRS ruling date), conflict (no reinstatement date but on Pub 78 or recognized again per the master file ruling date, usually reinstated), reinstated or not_listed. file_date is the IRS list's date. 404 when the EIN is on neither list and not in the master file.",
    params: [{ name: "ein", in: "path", type: "string", required: true, example: "20-8064678", desc: "9-digit EIN. Dashes are fine." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/orgs/208064678/status"`,
    example: {
      ein: "208064678", name: "FRIENDS OF WILDLIFE PRAIRIE PARK", status: "conflict",
      pub78: { eligible: true, codes: [{ code: "PC", label: "Public charity (50% deduction limit)" }], city: "Hanna City", state: "IL", file_date: "2026-10-13" },
      revocation: {
        revoked_now: true, revocation_date: "2021-07-15", posting_date: "2021-10-11", reinstatement_date: null, exemption_type: "03",
        history: [{ revocation_date: "2021-07-15", posting_date: "2021-10-11", reinstatement_date: null, exemption_type: "03" }],
        grants_after_revocation: { count: 15, total: 3659900, latest_year: 2025 },
        file_date: "2026-10-13",
      },
      sources: [{ label: "IRS Tax Exempt Organization Search (Pub 78 and revocations)", url: "https://apps.irs.gov/app/eos/" }],
      notes: ["status: eligible (on Pub 78), revoked ..."],
    },
  },
  {
    id: "org-similar", method: "GET", path: "/api/v1/orgs/{ein}/similar", title: "Similar organizations", mcpTool: "find_similar_orgs",
    summary: "Up to 10 organizations most like this one by the meaning of their newest Form 990 mission and program text (precomputed nearest neighbors, cosine similarity of nomic-embed-text-v1.5 vectors, rebuilt weekly), best first. Only pairs at 0.80 or above are kept. similarity_words: 0.90+ very similar, 0.85-0.90 similar, 0.80-0.85 somewhat similar (hand-checked: about 9 in 10 pairs at 0.80+ do the same kind of work). underfunded=true lists less-funded peers instead: active organizations (revenue $50K or more) with under $25K in linked private-foundation grants 2022-2024, for finding overlooked organizations. Each result has place, NTEE cause, latest revenue and foundation grants 2022-2024. /api/v1/org/{ein} carries the plain list as similar. 404 for an unknown EIN, an empty list when nothing is close enough.",
    params: [
      { name: "ein", in: "path", type: "string", required: true, example: "58-1376648", desc: "9-digit EIN. Dashes are fine." },
      { name: "underfunded", in: "query", type: "boolean", example: "true", desc: "Only less-funded peers (under $25K in linked foundation grants 2022-2024, revenue $50K+). Default false." },
      { name: "limit", in: "query", type: "integer", example: "2", desc: "Organizations to return, 1 to 10. Default 10." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/orgs/581376648/similar?underfunded=true&limit=2"`,
    example: {
      ein: "581376648", name: "ATLANTA COMMUNITY FOOD BANK INC", list: "less_funded", count: 2,
      results: [
        { rank: 1, ein: "582645073", name: "FIRST AFRICAN COMMUNITY DEVELOPMENT CORPORATION", city: "LITHONIA", state: "GA", ntee: { code: "S20", label: "Community Improvement" },
          revenue: 338693, revenue_year: 2023, foundation_grants_2022_2024: 0, similarity: 0.891, similarity_words: "similar",
          url: "https://<host>/org/582645073", api_url: "https://<host>/api/v1/org/582645073" },
        { rank: 2, ein: "472383634", name: "GLENLOCH COMMUNITY OUTREACH INC", city: "ROOPVILLE", state: "GA", ntee: { code: "K31", label: "Food Banks, Food Pantries" },
          revenue: 60757, revenue_year: null, foundation_grants_2022_2024: 0, similarity: 0.859, similarity_words: "similar",
          url: "https://<host>/org/472383634", api_url: "https://<host>/api/v1/org/472383634" },
      ],
      notes: ["Nearest organizations by the meaning of their newest Form 990 mission and program text ...", "less_funded: the nearest active organizations ..."],
    },
  },
  {
    id: "household-giving", method: "GET", path: "/api/v1/household-giving", title: "Household giving", mcpTool: "get_household_giving",
    summary: "IRS Statistics of Income individual returns: returns, AGI, itemizers and the itemized charitable deduction, by state or county (tax years 2013 to 2023) or ZIP code (2013 to 2022), newest year first. Itemizers only, and itemizing fell by about 60% from 2018. by_agi=true splits rows by income class. Dollars, not thousands.",
    params: [
      { name: "level", in: "query", type: "string", example: "county", desc: "state (default), county or zip." },
      { name: "state", in: "query", type: "string", example: "WV", desc: "Two-letter state code." },
      { name: "county", in: "query", type: "string", example: "54011", desc: "With level=county: 5-digit county FIPS." },
      { name: "zip", in: "query", type: "string", example: "25701", desc: "With level=zip: 5-digit ZIP." },
      { name: "year_from", in: "query", type: "integer", example: "2022", desc: "First tax year. Default 2013." },
      { name: "year_to", in: "query", type: "integer", example: "2023", desc: "Last tax year. Default 2023 (2022 for ZIPs)." },
      { name: "by_agi", in: "query", type: "boolean", example: "false", desc: "One row per income class (8 classes for states and counties, 6 for ZIPs)." },
      { name: "limit", in: "query", type: "integer", example: "100", desc: "Rows per page, 1 to 1,000. Default 100." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/household-giving?state=WV&year_from=2022&year_to=2022"`,
    example: {
      filters: { level: "state", state: "WV", county: null, zip: null, year_from: 2022, year_to: 2022, by_agi: false, limit: 100 },
      results: [{
        tax_year: 2022, level: "state", state: "WV", returns: 775900, agi: 50575539000, itemizers: 26320, itemized: 987009000, charity_n: 19620, charity_usd: 303663000,
        nonitem_charity_n: null, nonitem_charity_usd: null, share_itemizing: 0.0339, share_claiming_charity: 0.0253, avg_charity_deduction: 15477,
      }],
      count: 1, has_more: false, next_cursor: null, notes: ["IRS Statistics of Income individual returns by state and county ..."],
    },
  },
  {
    id: "labels", method: "GET", path: "/api/v1/labels", title: "List cause labels", mcpTool: "list_cause_labels",
    summary: "The graded cause labels (climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity, animal_welfare): definition, what's in and out, org counts per tier, and grades. primary_precision and partial_in_label_precision are the share a judge model agreed with on a random sample (with 95% intervals). recall_estimate is the share of relevant organizations the label found. immigrants_refugees also lists its subtypes (services, the default for questions and filters, and policy: immigration policy research and advocacy of any stance) with org counts and the sub-type grade.",
    params: [],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/labels"`,
    example: {
      count: 3,
      results: [{
        label: "climate", name: "Climate", definition: "Organizations whose stated work addresses climate change: cutting greenhouse gas emissions ...",
        includes: "Climate advocacy and policy groups (Clean Air Task Force, 350.org, ...", excludes: "Land, wildlife, ocean or water conservation, parks, ...",
        mixed_rule: "primary = climate or clean energy is the main stated purpose ...", version: "2026-10-16.9",
        orgs: { primary: 1327, partial: 1462 },
        grades: { classifier: "claude-haiku-5-5", judge: "claude-opus-5-5", primary_precision: 0.953, primary_sample: { estimate: 0.955, low: 0.875, high: 0.984, sample: 66 },
          partial_in_label_precision: 0.948, partial_exact_tier: 0.821, partial_sample: { estimate: 0.955, low: 0.875, high: 0.984, sample: 66 }, recall_estimate: 0.892 },
        api_path: "/api/v1/labels/climate/orgs",
      }],
      notes: ["Graded cause labels for causes no NTEE code captures. ..."],
    },
  },
  {
    id: "label-orgs", method: "GET", path: "/api/v1/labels/{label}/orgs", title: "Organizations with a label", mcpTool: "list_cause_labels",
    summary: "Organizations carrying one cause label, by EIN, with tier, score, method and the one-line why.",
    params: [
      { name: "label", in: "path", type: "string", required: true, example: "climate", desc: "climate, women_girls, substance_use, housing_homelessness, ai_tech_learning_work, racial_equity, immigrants_refugees, mental_health, education, health_equity or animal_welfare." },
      { name: "tier", in: "query", type: "string", example: "primary", desc: "primary (default), partial or all." },
      { name: "subtype", in: "query", type: "string", example: "policy", desc: "immigrants_refugees only: services, policy or all (default). Each row lists the org's subtypes." },
      { name: "state", in: "query", type: "string", example: "CO", desc: "Organization's state." },
      { name: "ntee", in: "query", type: "string", example: "C", desc: "NTEE code prefix." },
      { name: "limit", in: "query", type: "integer", example: "100", desc: "Rows per page, 1 to 1,000. Default 100." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/labels/climate/orgs?state=CO&limit=1"`,
    example: {
      filters: { label: "climate", tier: "primary", state: "CO", ntee: null, limit: 1 },
      results: [{
        ein: "043116623", name: "ICLEI LOCAL GOVERNMENTS FOR SUSTAINABILITY USA INC", city: "DENVER", state: "CO", ntee: "C010", revenue: 4053847,
        tier: "primary", score: 0.92, method: "llm:claude-sonnet-5-5", why: "Mission and programs center on climate protection, greenhouse gas inventories and adaptation for local governments.",
        version: "2026-10-16.9", api_path: "/api/v1/org/043116623",
      }],
      count: 1, has_more: true, next_cursor: "WyIwNDMxMTY2MjMiXQ",
    },
  },
  {
    id: "bills", method: "GET", path: "/api/v1/congress/bills", title: "Search bills in Congress", mcpTool: "search_policy",
    summary: "Bills and resolutions of the current (119th) Congress from Congress.gov, latest action first, refreshed daily. Keyword search over the title and latest action, or search by meaning with semantic=true. Committees, sponsors and bill text are not loaded yet, and bills carry no EIN links.",
    params: [
      { name: "q", in: "query", type: "string", example: "\"charitable deduction\"", desc: "Keywords. Quotes for a phrase, -word to exclude." },
      { name: "congress", in: "query", type: "integer", example: "119", desc: "Congress number." },
      { name: "bill_type", in: "query", type: "string", example: "hr", desc: "hr, s, hres, sres, hjres, sjres, hconres or sconres." },
      { name: "chamber", in: "query", type: "string", example: "House", desc: "Chamber of origin: House or Senate." },
      { name: "introduced_from", in: "query", type: "string", example: "2026-01-01", desc: "Introduced on or after, YYYY-MM-DD." },
      { name: "introduced_to", in: "query", type: "string", example: "2026-12-31", desc: "Introduced on or before." },
      { name: "action_from", in: "query", type: "string", example: "2026-09-01", desc: "Latest action on or after." },
      { name: "action_to", in: "query", type: "string", example: "2026-10-15", desc: "Latest action on or before." },
      { name: "semantic", in: "query", type: "boolean", example: "true", desc: "Rank by meaning instead of keyword and date: closest first, each row with similarity. Needs q. Use plain words, e.g. rural food access." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Rows per page, 1 to 500. Default 50." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/congress/bills?q=%22charitable+deduction%22&limit=1"`,
    example: {
      filters: { q: "\"charitable deduction\"", congress: null, bill_type: null, chamber: null, introduced_from: null, introduced_to: null, action_from: null, action_to: null, semantic: false, limit: 1 },
      results: [{
        id: "119-hr-9173", congress: 119, bill_type: "hr", number: 9173, title: "Charitable Deductions for Digital Asset Donations Act", chamber: "House",
        introduced: "2026-06-08", latest_action: { date: "2026-06-08", text: "Referred to the House Committee on Ways and Means." },
        updated_at: "2026-09-23T07:00:00.000Z", url: "https://www.congress.gov/bill/119th-congress/house-bill/9173",
      }],
      count: 1, has_more: false, next_cursor: null, notes: ["Bills and resolutions of the current (119th) Congress ..."],
    },
  },
  {
    id: "federal-register", method: "GET", path: "/api/v1/federal-register", title: "Search the Federal Register", mcpTool: "search_policy",
    summary: "Federal Register documents from October 2025 on (rules, proposed rules, notices, presidential documents), newest first, refreshed daily. Keyword search over title and abstract, or search by meaning with semantic=true. funding_only keeps notices of funding opportunity.",
    params: [
      { name: "q", in: "query", type: "string", example: "nonprofit", desc: "Keywords. Quotes for a phrase, -word to exclude." },
      { name: "type", in: "query", type: "string", example: "Notice", desc: "Rule, Proposed Rule, Notice or Presidential Document." },
      { name: "agency", in: "query", type: "string", example: "Education", desc: "An agency name contains this." },
      { name: "date_from", in: "query", type: "string", example: "2026-06-01", desc: "Published on or after, YYYY-MM-DD." },
      { name: "date_to", in: "query", type: "string", example: "2026-10-14", desc: "Published on or before." },
      { name: "funding_only", in: "query", type: "boolean", example: "true", desc: "Only notices of funding opportunity." },
      { name: "significant", in: "query", type: "boolean", example: "true", desc: "Only (or, with false, no) significant rules under EO 12866." },
      { name: "semantic", in: "query", type: "boolean", example: "true", desc: "Rank by meaning instead of keyword and date: closest first, each row with similarity. Needs q. Use plain words, e.g. rural food access." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Rows per page, 1 to 500. Default 50." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/federal-register?funding_only=true&agency=Education&limit=1"`,
    example: {
      filters: { q: null, type: null, agency: "Education", date_from: null, date_to: null, funding_only: true, significant: null, semantic: false, limit: 1 },
      results: [{
        document_number: "2026-19240", title: "Notice Announcing Impact Aid Discretionary Construction Grant Program Competition", type: "Notice", action: "Notice.",
        abstract: "The Employment and Training Administration at the U.S. Department of Labor (DOL) is soliciting applications ...", agencies: ["Education Department"],
        published: "2026-09-21", significant: null, funding_notice: true,
        url: "https://www.federalregister.gov/documents/2026/09/21/2026-19240/notice-announcing-impact-aid-discretionary-construction-grant-program-competition",
      }],
      count: 1, has_more: true, next_cursor: "WyIyMDI2LTA5LTIxIiwiMjAyNi0xOTI0MCJd", notes: ["Federal Register documents ..."],
    },
  },
  {
    id: "news", method: "GET", path: "/api/v1/news", title: "Search sector news", mcpTool: "search_policy",
    summary: "Headlines and links about philanthropy and the nonprofit sector from GDELT, newest first, tagged with the topic searches that found them. No article text. From June 2026 on, from GDELT's search API (up to 250 per topic per day) plus its raw crawl files for days the API rate-limited (fewer per day). Refreshed daily. Keyword search over the headline, or search by meaning with semantic=true. One row per story: copies of the same story under other URLs (same headline, or near identical meaning within 3 days) are hidden, counted in duplicates and named in also_reported_by. Each row lists orgs: the nonprofits and foundations the headline names (ein, name, matched words), matched strictly by name, so many mentions are missed. ein= keeps the headlines that name one org.",
    params: [
      { name: "q", in: "query", type: "string", example: "layoffs", desc: "Keywords in the headline." },
      { name: "ein", in: "query", type: "string", example: "56-2618866", desc: "Only headlines that name this org (9-digit EIN, dashes fine)." },
      { name: "topic", in: "query", type: "string", example: "nonprofit cuts", desc: "nonprofit, philanthropy, foundation grants, donations, nonprofit cuts or giving." },
      { name: "outlet", in: "query", type: "string", example: "apnews.com", desc: "News site (domain) contains this. domain works too." },
      { name: "country", in: "query", type: "string", example: "United States", desc: "Source country." },
      { name: "date_from", in: "query", type: "string", example: "2026-10-01", desc: "Seen on or after, YYYY-MM-DD." },
      { name: "date_to", in: "query", type: "string", example: "2026-10-19", desc: "Seen on or before." },
      { name: "semantic", in: "query", type: "boolean", example: "true", desc: "Rank by meaning instead of keyword and date: closest first, each row with similarity. Needs q. Use plain words, e.g. rural food access." },
      { name: "include_duplicates", in: "query", type: "boolean", example: "true", desc: "List every copy of a story, each with duplicate_of (the id of its canonical row, null on that row). Default false: one row per story." },
      { name: "limit", in: "query", type: "integer", example: "50", desc: "Rows per page, 1 to 500. Default 50." },
      { name: "cursor", in: "query", type: "string", desc: "next_cursor from the previous page." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/news?topic=nonprofit+cuts&limit=20"`,
    example: {
      filters: { q: null, ein: null, topic: "nonprofit cuts", outlet: null, country: null, date_from: null, date_to: null, semantic: false, include_duplicates: false, limit: 20 },
      results: [{ id: 2817, title: "Nonprofit lays off staff after federal grant cut", url: "https://example.com/news/nonprofit-layoffs", seen_at: "2026-10-18T14:00:00.000Z", domain: "example.com", country: "United States", language: "English", topics: ["nonprofit cuts"], duplicates: 3, also_reported_by: ["example.org", "example.net"], orgs: [{ ein: "123456789", name: "EXAMPLE COMMUNITY SERVICES INC", matched: "Example Community Services" }] }],
      count: 1, has_more: true, next_cursor: "WyIyMDI2LTEwLTE4VDE0OjAwOjAwLjAwMFoiLCJodHRwczovL2V4YW1wbGUuY29tIl0",
      notes: ["News about philanthropy and the nonprofit sector from GDELT ...", "Two GDELT feeds: its search API ... and its raw crawl files ...", "One row per story: copies of the same story under other URLs ... are hidden ..."],
    },
  },
  // ---------- IoG internal (scope iog_internal): keys without it get 403 insufficient_scope ----------
  {
    id: "iog-guides", method: "GET", path: "/api/v1/iog/guides", title: "List IoG Giving Guides", mcpTool: "get_iog_guide", scope: "iog_internal",
    summary: "IoG internal (scope iog_internal). The Institute on Generosity's Giving Guides, GG2026 edition: slug, title, edition, reading notes, size in words and passages, and the Google Doc link (IoG staff access). No guide text here. Internal course material: do not publish or share outside IoG.",
    params: [],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/iog/guides"`,
    example: {
      collection: "giving_guides", note: "IoG internal. ...", count: 13,
      guides: [{
        slug: "conducting-a-site-visit", title: "Giving Guide: Conducting a Site Visit", guide: "Conducting a Site Visit", edition: "GG2026, July 2026",
        notes: null, words: 3458, chunks: 8, modified: "2026-08-04T20:58:44.617Z", source_url: "https://docs.google.com/document/d/.../edit",
        api_url: "https://<host>/api/v1/iog/guides/conducting-a-site-visit",
      }],
    },
  },
  {
    id: "iog-guide", method: "GET", path: "/api/v1/iog/guides/{slug}", title: "Get an IoG Giving Guide", mcpTool: "get_iog_guide", scope: "iog_internal",
    summary: "IoG internal (scope iog_internal). One Giving Guide in full: text as Markdown (# section, ## subsection, - list item, | table row |) and the same text split into sections, each with heading, level and path.",
    params: [{ name: "slug", in: "path", type: "string", required: true, example: "conducting-a-site-visit", desc: "Guide slug from /api/v1/iog/guides." }],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/iog/guides/conducting-a-site-visit"`,
    example: {
      note: "IoG internal. ...",
      guide: {
        slug: "conducting-a-site-visit", title: "Giving Guide: Conducting a Site Visit", guide: "Conducting a Site Visit", edition: "GG2026, July 2026",
        notes: null, words: 3458, modified: "2026-08-04T20:58:44.617Z", source_url: "https://docs.google.com/document/d/.../edit",
        sections: [{ level: 1, heading: "Before the Visit", path: ["Before the Visit"], text: "..." }, { level: 2, heading: "Setting Up the Visit", path: ["Before the Visit", "Setting Up the Visit"], text: "..." }],
        text: "# Overview\n\n...",
      },
    },
  },
  {
    id: "iog-search", method: "GET", path: "/api/v1/iog/search", title: "Search IoG Giving Guides", mcpTool: "search_iog_guides", scope: "iog_internal",
    summary: "IoG internal (scope iog_internal). Passages from the Giving Guides that best match a question, by keyword (Postgres full text, any of the words, section names weigh more) and by meaning (the same local embedding model as /api/v1/search), fused by reciprocal rank. Each passage is about 300 to 600 words with its guide, section path and Google Doc link. LLM-free.",
    params: [
      { name: "q", in: "query", type: "string", required: true, example: "how to do a site visit", desc: "Question or topic in plain words, up to 300 characters." },
      { name: "guide", in: "query", type: "string", example: "philanthropic-risk", desc: "Only this guide (slug)." },
      { name: "limit", in: "query", type: "integer", example: "5", desc: "Passages to return, 1 to 20. Default 5." },
    ],
    curl: `curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/iog/search?q=how+to+do+a+site+visit&limit=3"`,
    example: {
      query: { q: "how to do a site visit", guide: null, limit: 3 }, model: "local:nomic-embed-text-v1.5-fp32@512", note: "IoG internal. ...", count: 3,
      results: [{
        guide: { slug: "conducting-a-site-visit", title: "Giving Guide: Conducting a Site Visit", name: "Conducting a Site Visit", edition: "GG2026, July 2026" },
        section: "Before the Visit > Setting Up the Visit", heading_path: ["Before the Visit", "Setting Up the Visit"], position: 1,
        text: "...", source_url: "https://docs.google.com/document/d/.../edit",
        score: 0.03279, similarity: 0.8089, matched: { keyword_rank: 1, vector_rank: 1 },
      }],
    },
  },
];

// Optional X-App request header: the caller names its app, shown on IoG's API call log (lib/apiLog.ts).
export const APP_HEADER = {
  name: "X-App",
  desc: "Optional. Name your app, e.g. X-App: muneeb-rag, so IoG can tell your apps apart in the call log. Letters, digits and . _ : / @ + ( ) - only, up to 60 characters.",
  example: "muneeb-rag",
};
// What the call log keeps (lib/apiLog.ts, api_calls). Shown on /api/docs and in the OpenAPI description.
export const CALL_LOG_NOTE = "Each call is logged with its time, endpoint or MCP tool, status, duration, query string, key name, app, user agent and IP, and kept for 90 days. The key itself, passwords and the Authorization header are never logged.";

export const ERRORS = [
  { status: 400, code: "bad_ein", when: "The EIN isn't 9 digits." },
  { status: 400, code: "bad_param", when: "A parameter is out of range or malformed (the message names it), or the cursor was edited." },
  { status: 401, code: "missing_key", when: "No Authorization: Bearer header." },
  { status: 401, code: "invalid_key", when: "The key is unknown or mistyped." },
  { status: 403, code: "revoked_key", when: "The key was revoked." },
  { status: 403, code: "insufficient_scope", when: "The key lacks the scope the endpoint needs." },
  { status: 404, code: "not_found", when: "No organization, finding, finances, tax status or label with that id." },
  { status: 429, code: "rate_limited", when: "Over the key's per-minute limit. Wait Retry-After seconds." },
  { status: 500, code: "server_error", when: "Our bug. Try again, then tell us." },
];

export const MCP_TOOLS = [
  { name: "search_nonprofits", desc: "Same as GET /api/v1/search. Arguments: q, state[], city[], max_revenue, ntee, label, label_tier, label_subtype, limit." },
  { name: "get_organization", desc: "Same as GET /api/v1/org/{ein}. Argument: ein." },
  { name: "get_tax_status", desc: "Same as GET /api/v1/orgs/{ein}/status. Argument: ein." },
  { name: "find_similar_orgs", desc: "Same as GET /api/v1/orgs/{ein}/similar. Arguments: ein, underfunded, limit." },
  { name: "list_research", desc: "Same as GET /api/v1/research. Arguments: section, state, cause, limit." },
  { name: "get_research", desc: "Same as GET /api/v1/research/{slug}, with up to max_rows data rows (default 200)." },
  { name: "answer_research_question", desc: "Same as GET /api/v1/answer with spec, steps included. The calling AI fills the structured question, so no Claude call on our side." },
  { name: "search_grants", desc: "Same as GET /api/v1/grants. Arguments: source, funder_ein, recipient_ein, year_from, year_to, state, county, label, label_tier, label_subtype, amount_min, funder_type, totals, limit, cursor." },
  { name: "get_federal_awards", desc: "Same as GET /api/v1/federal-awards. Arguments: recipient_ein, agency, assistance_listing, fiscal_year_from, fiscal_year_to, state, county, recipient_kind, q, totals, limit, cursor." },
  { name: "get_finances", desc: "Both finance endpoints in one: { org, foundation } for an ein. kind: org, foundation or both (default)." },
  { name: "get_household_giving", desc: "Same as GET /api/v1/household-giving. Arguments: level, state, county, zip, year_from, year_to, by_agi, limit, cursor." },
  { name: "list_cause_labels", desc: "GET /api/v1/labels with no label, GET /api/v1/labels/{label}/orgs with one. Arguments: label, tier, subtype, state, ntee, limit, cursor." },
  { name: "search_policy", desc: "Bills, Federal Register and news in one call, up to limit of each (default 10). Arguments: q, semantic (rank by meaning), source, agency, type, funding_only, topic, outlet, ein (news that names one org; news only), include_duplicates (news: every copy of a story, default one row per story), date_from, date_to, limit." },
  { name: "search_iog_guides", desc: "IoG internal (scope iog_internal): listed only for keys with that scope. Same as GET /api/v1/iog/search. Arguments: q, guide, limit." },
  { name: "get_iog_guide", desc: "IoG internal (scope iog_internal): listed only for keys with that scope. No slug: GET /api/v1/iog/guides. With slug: GET /api/v1/iog/guides/{slug}." },
];

// What the public /api/docs page and /api/openapi.json show: endpoints and MCP tools that need only the read scope.
// IoG internal ones (scope set, /api/v1/iog/*) stay out of public docs. Keys with that scope get them from IoG directly.
export const PUBLIC_ENDPOINTS = ENDPOINTS.filter((e) => !e.scope);
const INTERNAL_TOOLS = new Set(ENDPOINTS.filter((e) => e.scope).map((e) => e.mcpTool));
export const PUBLIC_MCP_TOOLS = MCP_TOOLS.filter((t) => !INTERNAL_TOOLS.has(t.name));

const schemaFor = (v: unknown): Record<string, unknown> => {
  if (v === null) return {}; // null in the example: type not shown
  if (Array.isArray(v)) return { type: "array", items: v.length ? schemaFor(v[0]) : {} };
  if (typeof v === "object") return { type: "object", properties: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, schemaFor(x)])) };
  return { type: typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v };
};

export function openapi(server: string, includeInternal = false) {
  const errorSchema = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, docs: { type: "string" } } } } };
  return {
    openapi: "3.1.0",
    info: {
      title: "NomBot API", version: "1.0.0",
      description: "Read-only access to public IRS data on US nonprofits and foundations (organizations, grants, finances by year), federal awards, IRS household giving, graded cause labels, bills, Federal Register documents and sector news, plus NomBot's verified research findings. List endpoints page with limit and cursor. Institute on Generosity. Human docs: /api/docs. Remote MCP server: POST /mcp with the same key. Optional header X-App names your app (e.g. X-App: muneeb-rag). " + CALL_LOG_NOTE,
    },
    servers: [{ url: server }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API key, nb_live_..." } },
      schemas: { Error: errorSchema },
    },
    paths: Object.fromEntries((includeInternal ? ENDPOINTS : PUBLIC_ENDPOINTS).map((e) => [e.path, {
      get: {
        operationId: e.id.replace(/-(\w)/g, (_, c) => c.toUpperCase()),
        summary: e.title, description: e.summary,
        ...(e.scope ? { security: [{ bearer: [e.scope] }], "x-required-scope": e.scope, tags: ["IoG internal"] } : {}),
        parameters: [...e.params.map((p) => ({ name: p.name, in: p.in, required: p.in === "path" || !!p.required, description: p.desc, schema: { type: p.type },
          ...(p.example == null ? {} : { example: p.type === "integer" ? Number(p.example) : p.type === "boolean" ? p.example === "true" : p.example }) })),
          { name: APP_HEADER.name, in: "header", required: false, description: APP_HEADER.desc, schema: { type: "string" }, example: APP_HEADER.example }],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: schemaFor(e.example), example: e.example } } },
          ...Object.fromEntries([...new Set(ERRORS.map((x) => x.status))].map((s) => [String(s), { description: ERRORS.filter((x) => x.status === s).map((x) => `${x.code}: ${x.when}`).join(" "), content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }])),
        },
      },
    }])),
  };
}
