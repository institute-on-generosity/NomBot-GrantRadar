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
| `app/page.tsx` | Search page: plain-language question → filters → hybrid search |
| `app/api/v1/search/route.ts` | `GET /api/v1/search?q=&state=WV,KY&max_revenue=&ntee=&limit=` (read-only, 60 req/min) |
| `lib/` | Shared: `db` (Postgres pool), `llm` (provider setup), `embedder`, `parse`, `search`, `rerank` (relevance 0–100), `buddy` (Research Buddy prompt + sources), `soi` |
| `app/api/feedback/route.ts` | `POST` 👍/👎 on a result → `feedback` table (generosity-data migration 004) |
| `lib/filters.ts` | Filter edits from the chips (`?st=&city=&region=&max=&cause=&drop=`), shared by results, history, CSV export and Buddy |
| `app/api/buddy/route.ts` | `POST` Research Buddy: streams sources, reasoning and the cited answer (NDJSON) |
| `app/source/`, `components/viewers/` | IRS master file (BMF) and SOI financial viewers; open in a side panel or beside an org popover |
| `components/` | Shared UI: `SearchBox`, `FilterChips`, `ResultRow`, `Vote`, `Sidebar`, `ResearchBuddy`, `Modal`, `SidePanel` |
| `lib/landscape.ts`, `lib/themes.ts`, `components/Landscape*.tsx`, `components/CountyMap.tsx` | Landscape panel: breakdown, county map (`lib/geo/counties.json`, rebuilt by `npm run build:counties`), themes, funders |
| `app/compare/`, `components/Compare*.tsx` | Compare 2–4 organizations side by side |
| `eval/` | `npm run eval` (search, 50 questions, goal ≥90% relevant) and `npm run eval:buddy` (Research Buddy, 30 questions, goal 0 unsupported claims) |

## Search eval

```bash
npm run eval                 # 50 questions in eval/queries.json, top 10 each → eval/results/<time>.md
npm run eval -- --only=5     # first 5 questions
npm run eval -- --no-judge   # only existing labels, no Claude calls
```

Labels: people's 👍/👎 first, then Claude's judgments (cached in `eval/judgments.json`, committed so scores are stable). Needs `ANTHROPIC_API_KEY` for new judgments.

Latest: **91% relevant** (`eval/results/2026-10-07-16-21.md`). The eval counts the strong matches (relevance ≥50) shown by default.

## Research Buddy eval

```bash
npm run eval:buddy           # 30 questions in eval/buddy-questions.json → eval/results/buddy-<time>.md
```

Buddy answers each question exactly as in the app. A Claude judge splits the answer into claims and checks each against its cited source: supported, unsupported, or no citation.

Latest: **1 unsupported of 401 claims**, 29/30 answers clean (`eval/results/buddy-2026-10-07-18-20.md`).
