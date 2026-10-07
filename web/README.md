# NomBot web app

Next.js (App Router) app for NomBot search, the read-only JSON API, and later Research Buddy and GrantRadar (`/grants`).

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
| `lib/` | Shared: `db` (Postgres pool), `llm` (provider setup), `embedder`, `parse`, `search` |
| `app/api/feedback/route.ts` | `POST` 👍/👎 on a result → `feedback` table (generosity-data migration 004) |
| `lib/filters.ts` | Filter edits from the chips (`?st=&max=&cause=&drop=`), shared by results, history and CSV export |
| `components/` | Shared UI: `SearchBox`, `FilterChips`, `ResultRow`, `Vote`, `Sidebar` |
| `eval/` | Search eval: `npm run eval` scores the top 10 for 50 questions (goal ≥90% relevant) |

## Search eval

```bash
npm run eval                 # 50 questions in eval/queries.json, top 10 each → eval/results/<time>.md
npm run eval -- --only=5     # first 5 questions
npm run eval -- --no-judge   # only existing labels, no Claude calls
```

Labels: people's 👍/👎 first, then Claude's judgments (cached in `eval/judgments.json`, committed so scores are stable). Needs `ANTHROPIC_API_KEY` for new judgments.
