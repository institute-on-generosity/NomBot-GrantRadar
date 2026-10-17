# NomBot web app

Next.js (App Router) app for NomBot search, the read-only JSON API and Research Buddy (later GrantRadar at `/grants`).

```bash
cp .env.example .env.local      # optional keys; works without them in POC fallback mode
npm install
npm run dev                     # http://localhost:3000
```

Needs the local `nombot` database loaded by [generosity-data](https://github.com/institute-on-generosity/generosity-data).

| Path | What |
|---|---|
| `proxy.ts` | Optional sign-in gate: HTTP Basic auth on every page and API when `SITE_PASSWORD` is set (public tunnel). Off in development. `/api/v1/*` and `/mcp` skip it (API key instead), `/api/docs` and `/api/openapi.json` are public |
| `app/page.tsx` | Search page: plain-language question → filters → hybrid search |
| `lib/apiAuth.ts`, `scripts/api-key.mts` | Partner API keys (generosity-data migration 031): Bearer `nb_live_…` checked in each route (`keyed()`), sha256 lookup cached 10 s, per-key rate limit in memory per process, daily usage counts. `npm run api-key -- create "<partner>" [--rate=60] \| list \| usage \| revoke <id> \| delete <id>` (secret printed once) |
| `lib/api.ts`, `app/api/v1/` | Read-only JSON API, needs a key: `search` (`q, state, city, max_revenue, ntee, limit`), `org/[ein]` (profile, financials, health signals, leaders, grants received and given), `research`, `research/[slug]`, `research/questions`, `answer` (`q` or `spec`). No Claude calls, except `answer?q=` (one router call, ~$0.006 per new question, cached 24 h) |
| `app/mcp/route.ts` | Remote MCP server (`@modelcontextprotocol/sdk`, Streamable HTTP, stateless JSON, same key): `search_nonprofits`, `get_organization`, `list_research`, `get_research`, `answer_research_question` (takes the spec, no Claude call) |
| `lib/answerSpec.ts`, `lib/answerRoute.ts`, `lib/answer.ts`, `lib/answerTool.ts`, `components/AnswerCard.tsx` | **Research answers**: `answerSpec` (zod spec: metric, causes, source, years, place, condition), `answerRoute` (regex screen, then one Sonnet 5.5 structured-output call → spec, cached 24 h, `answer-route:v1`), `answer` (fixed parameterized SQL blocks on generosity-data migration 033 views, templates for headline/bullets, `answerBrief` for tools; cached 6 h, `answer:v10`), `answerTool` (tool definition shared by Research Buddy and MCP), `AnswerCard` (top of results: tiles, Vega chart, bullets, missing data + where to find it, How we got this with SQL, CSV, Export slide). `app/page.tsx` plans the page per question (`contentPlan`): research → redirect to `app/research/ask/` (the card, "See the N organizations behind this" link to a plain search, Research Buddy, back to Research; no parse, search or landscape runs; saved by `lib/researchQuestions.ts` to `research_questions`, migration 035, repeat renders within 30 s count once); mixed (`count_orgs` with a cause) → the card, then the org list, no analysis panel; otherwise the normal results + analysis panel |
| `components/AskedQuestions.tsx`, `app/api/research/questions/`, `app/api/v1/research/questions/` | **Asked questions** above the findings feed (on `/research` and the home Research tab, via `InsightsFeed`): recent and most asked, each linking to `/research/ask?q=`; hidden until one exists. Keyed `GET /api/v1/research/questions?order=recent\|top&limit=` |
| `eval/answer.mts`, `eval/answers.mts`, `eval/answer-questions.json` | `npm run test:answer`: 21 specs through every block, 7 checked against direct SQL on the base tables, bullet rules (≤16 words, no semicolons or em dashes), timings; `--route` also routes sample questions. `npx tsx eval/answers.mts`: the 23 sample questions end to end (router + engine) |
| `lib/apiDocs.ts`, `app/api/docs/`, `app/api/openapi.json/` | Public API docs page and OpenAPI 3.1, built from one endpoint list |
| `lib/` | Shared: `db` (Postgres pool), `llm` (provider setup), `embedder`, `parse`, `search`, `rerank` (relevance 0–100), `buddy` (Research Buddy prompt + sources), `soi` |
| `app/api/feedback/route.ts` | `POST` 👍/👎 on a result → `feedback` table (generosity-data migration 004) |
| `lib/filters.ts` | Filter edits from the chips (`?st=&city=&region=&max=&min=&cause=&drop=`), shared by results, history, CSV export and Buddy |
| `app/api/buddy/route.ts` | `POST` Research Buddy: streams sources, reasoning, `tool` steps and the cited answer (NDJSON). Has the `research_answer` tool (up to 3 rounds) and the search's own research answer in context, so follow-ups change one field of its spec |
| `app/source/`, `components/viewers/` | IRS master file (BMF) and SOI financial viewers; open in a side panel or beside an org popover |
| `components/` | Shared UI: `SearchBox`, `FilterChips`, `ResultRow`, `Vote`, `Sidebar`, `ResearchBuddy`, `Modal`, `SidePanel`, `PrintButton` (print memo + stamp) |
| `lib/landscape.ts`, `lib/themes.ts`, `components/Landscape*.tsx`, `components/TrackRecord.tsx`, `components/CountyMap.tsx` | Landscape panel: breakdown, track record, county map (`lib/geo/counties.json`, rebuilt by `npm run build:counties`), themes, funders |
| `lib/overviewFacts.ts`, `components/OverviewVisual.tsx`, `components/AiOverview.tsx`, `lib/overview.ts` | Overview tab, visual first: headline, 3–4 key-number tiles and one chart picked from the landscape (deficits, growing vs shrinking, or income sizes), all computed without Claude so they render before the AI text; then the AI headline (replaces the computed one) and 2–3 cited bullets (`overview:v11`, ≤16 words, no semicolons or dashes), then Track record |
| `lib/slide.ts`, `components/SlideButton.tsx` | **Export slide** (Overview tab, finding pages, quiet **Slide** link on feed cards): one light 16:9 slide, headline, 1–3 key numbers, the chart (Vega, drawn off screen at slide size), 1–2 bullets (≤30 words of text), source line (link host from `PUBLIC_BASE_URL`, else the page's origin; no link on a local origin) and NomBot mark. **PNG** 1920×1080 (canvas, 2x) or **PPTX** (pptxgenjs 4.0.1, editable text boxes, chart as image). Both loaded only on click |
| `app/compare/`, `components/Compare*.tsx` | Compare 2–4 organizations side by side |
| `lib/people.ts`, `components/PersonView.tsx`, `app/person/` | People: a name typed in search (`looksLikeName`) or `/person?name=` shows their board seats and profile; `boardLinks` feeds Board connections on org pages (generosity-data migration 018) |
| `components/HeroFlip.tsx`, `lib/examples.ts` (`PROMPT_SETS`) | Home page: "Look up nonprofits / philanthropic leaders / foundations" flips, with example prompts for each; a fourth tab, **Research** (`/?tab=research`), shows the feed instead |
| `lib/insights.ts`, `lib/insightMeta.ts`, `lib/report.ts`, `app/api/insights/`, `app/research/` (`/insights` redirects in `next.config.ts`), `components/InsightsFeed.tsx`, `components/InsightChart.tsx`, `components/InsightPoints.tsx` | Research feed: verified rows of the `insights` table (`GET /api/insights`), section and state filters, Vega-Lite charts (lazy vega-embed, app colors, dark mode, PNG/SVG export), CSV, saved report (localStorage, Markdown export); key points (`points`: bullets with `**bold**` numbers, rendered as text and `<b>` only, summary as fallback) on cards and finding pages; each card's **Open research** goes to the finding page; `/research/orgs?ein=` lists a finding's organizations |
| `app/research/[slug]/`, `components/ResearchFinding.tsx`, `app/api/research/[slug]/ask/` | Finding page: key numbers (`stats`), tall chart, sortable data table, orgs (open in the `@panel` org popover), Cite, Save, related findings; `POST /api/research/<slug>/ask` streams an answer from that finding's data only (NDJSON, Sonnet 5.5) |
| `eval/` | `npm run eval` (search, 50 questions, goal ≥90% relevant), `npm run bench` (same questions through keyword, vector, hybrid and `--bm25` OpenSearch retrieval, no Claude scoring; `--kw=0.1,0.25` tries hybrid weights) and `npm run eval:buddy` (Research Buddy, 30 questions, goal 0 unsupported claims) |

## Search eval

```bash
npm run eval                 # 50 questions in eval/queries.json, top 10 each → eval/results/<time>.md
npm run eval -- --only=5     # first 5 questions
npm run eval -- --no-judge   # only existing labels, no Claude calls
```

Labels: people's 👍/👎 first, then Claude's judgments (cached in `eval/judgments.json`, committed so scores are stable). Needs `ANTHROPIC_API_KEY` for new judgments.

Latest: **91% relevant**, median 7.2s, with Sonnet 5.5 scoring (`eval/results/2026-10-11-23-55.md`; Opus run: `2026-10-07-16-21.md`, median 14s). The eval counts the strong matches (relevance ≥50) shown by default.

## Research Buddy eval

```bash
npm run eval:buddy           # 30 questions in eval/buddy-questions.json → eval/results/buddy-<time>.md
```

Buddy answers each question exactly as in the app. A Claude judge splits the answer into claims and checks each against its cited source: supported, unsupported, or no citation.

Latest: **1 unsupported of 401 claims**, 29/30 answers clean (`eval/results/buddy-2026-10-07-18-20.md`).
