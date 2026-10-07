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
| `components/` | Shared UI: `SearchBox`, `Chips`, `ResultRow` |
