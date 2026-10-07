# GrantRadar

> 🌿 **Branch `GrantRadar`.** Combined app: [`main`](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/main) · NomBot plan: [`NomBot`](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/NomBot)


**Describe your nonprofit's mission and get the foundations most likely to fund you, built only on public IRS data.**

> **Where it lives:** GrantRadar ships as the **`/grants` section of the [NomBot](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/NomBot) app**: one codebase, one deploy. This branch (`GrantRadar`) holds the GrantRadar plan and, later, the `/grants` code. It merges into `main`, the combined app.
An [Institute on Generosity](https://instituteongenerosity.org) AI Fellowship project · **Deadline: Dec 31, 2026**

## Problem
Every private foundation reports every grant it pays on Form 990-PF (Part XV). That covers roughly 100K+ foundations and millions of grants, all public, and almost entirely unused by the small nonprofits that need it most.
Grant-discovery tools (Instrumentl, Candid) cost **$150–400/mo**, which most small nonprofits can't afford.

## Solution
A free funder-matching tool. A nonprofit describes what it does, and GrantRadar finds the foundations that **have already funded work like theirs**.

1. **Match (by Dec 6, local).** Mission → nonprofits with similar missions → the foundations that funded them → ranked by how often, how much and how recently they gave.
2. **Explain (by Dec 6, local).** Reuses NomBot's Research Buddy reasoner. "Why this funder?" The LLM reasons over that foundation's grant history, shows its steps, and cites a 990-PF for every claim.

**GrantRadar works backwards from proof:** a funder ranks high only because it has actually paid grants to organizations like yours.

Free and open source. Shares its data pipeline and database with [NomBot](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/NomBot), so it adds only ~$5–15/mo.

## Target users

| Who | What they want | Served by |
|---|---|---|
| **Development directors** at nonprofits under $2M | A short list of realistic funders, without a paid subscription | Mission → ranked funders, with typical grant size |
| **IoG partner organizations** | Funding leads from a tool IoG endorses | The same matches, plus saved lists and a weekly digest of new matches |
| **Fiscal sponsors** | Funders for several small projects at once | One saved profile per sponsored project |
| **First-time grant writers** | To understand *why* a funder fits before writing | "Why this funder?" explanations with cited grant history |

## User experience
> All names, EINs and figures below are **mock data** for illustration.

### Nonprofit: find funders (by Dec 6)

**Input:** *"We run a food pantry in Hazard, KY and train adults for kitchen jobs."*

**Outcome:** the mission becomes filter chips, then a ranked list of foundations, each with the evidence ("funded 4 food banks like yours") and a typical grant size.

![GrantRadar match mockup: a mission box, chips (food + job training, eastern Kentucky, budget ~$280K), and three ranked foundations, each showing location, how many similar orgs it funded, and its typical grant, with a "Why this funder?" link](docs/grantradar/ux/match-v1.png)

### Nonprofit: why this funder? (by Dec 6)

**Question:** *"Why is Laurel Ridge a good fit for us?"*

**Outcome:** the reasoning steps, a one-line verdict, and the evidence: the similar grantees this foundation actually paid, with amounts and years, each cited to a 990-PF.

![GrantRadar explain mockup: asked why Laurel Ridge Foundation fits, it shows reasoning steps (found 4 grantees like you, read their grants, compared size), concludes it funds food + job training across Appalachia, notes a typical $15K grant is about 5% of the budget, and lists four similar grantees with cited amounts](docs/grantradar/ux/explain-v1.png)

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/grantradar/architecture-dark-v2.svg" />
  <img src="docs/grantradar/architecture-light-v2.svg" alt="GrantRadar architecture: three public sources (IRS EO BMF, IRS 990-PF XML Part XV, foundation websites) feed the generosity-data Grant Parser, Recipient Matcher and Site Scraper, which write to Postgres + pgvector hosted on Supabase and shared with NomBot. Nonprofits use the /grants section of the NomBot app on Vercel; the Matching Engine runs vector + SQL queries, and the Match Explainer reads grant history." />
</picture>

[Interactive version](docs/grantradar/architecture.html) (download and open in a browser) · made with [Archify](https://github.com/tt-a1i/archify)

> This is the **cloud target**. The proof of concept runs the same components on a laptop first (see **Stack**).

**Matching:** mission → embedding → most similar grantees (NomBot's existing `filing_text` embeddings, no new embedding job) → their funders → ranked by number of similar grantees funded, grant amounts, and recency. Grant purpose text alone is weak (often just "general support"), so matching runs through the **grantees**, not the purpose line.

**The hardest step: linking grants to recipients.** Part XV lists recipients by **name and address, usually without an EIN**. The Recipient Matcher links each grant to an org in `orgs` by normalized name + city/state, and keeps a confidence score. Low-confidence links are excluded from rankings.

## Reused from NomBot
**GrantRadar is NomBot plus a grants table.** Most of the system already exists by Nov 22. GrantRadar only builds what is genuinely new: the grant parser, recipient matching, funder ranking and logins.

| Component | Already built for NomBot | GrantRadar reuses it for | New work |
|---|---|---|---|
| **Database** | Postgres 17 + pgvector (local), Supabase Pro (cloud), migration runner | Same database and same Supabase project | `grants` + `funders` tables (one migration) |
| **Org list** | BMF loader → `orgs` (1.8M orgs) | Identifying recipients and funders | None |
| **990 XML pipeline** | Index filtering, batch download, streaming XML parser (`filing_text`) | The same downloads: 990-PF filings are in the same zips | **Part XV extractor** (a new parser step) |
| **Financials** | SOI loader → `financials` | Foundation assets + total giving (990-PF extract) | Load the 990-PF zip with the same loader |
| **Mission embeddings** | `filing_text` + HNSW index | "Find nonprofits like yours" is the same vector search | None |
| **Mission → filters** | LLM query parser (question → filters + search text) | Turning a mission into chips (cause, region, budget) | Prompt tweak |
| **Reasoning chat** | Research Buddy (reasoning steps + citations, Vercel AI SDK) | "Why this funder?": same reasoner, fed one funder's grants | New context + prompt |
| **App + API** | Next.js app, DB client, search UI components, `/api/v1` pattern | **Same app:** a `/grants` section with `/api/v1/grants/…` routes, sharing components and libraries | Match + explain pages |
| **Cloud + ops** | Vercel deploy, GitHub Actions ETL, monthly refresh | **Same deploy:** ships with NomBot on the same Vercel project and URL | Add 990-PF to the refresh |
| **Design** | Green minimal UI (`docs/ux/src/base.css`) | Same styles | None |

**Truly new in GrantRadar:** the Part XV grant parser, the recipient matcher (name + city/state, with confidence), the funder ranking query, Supabase Auth with saved matches, and the weekly digest.

## Data

| Source | Provides | Notes | Download |
|---|---|---|---|
| IRS 990-PF e-file XML | Every grant paid: recipient name + address, amount, purpose (**Part XV**, *not* Schedule B) | Monthly zip batches + `index_YYYY.csv` (filter to 990-PF). The old AWS S3 990 dataset is discontinued | [irs.gov: Form 990 series downloads](https://www.irs.gov/charities-non-profits/form-990-series-downloads) |
| IRS EO BMF | Name, EIN, address, NTEE for matching recipients and funders | Already loaded by `generosity-data` for NomBot | [irs.gov: EO BMF extract](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf) |
| IRS SOI 990-PF extract | Foundation assets and total giving | Annual zip (`eoextract990pf`) | [irs.gov: SOI annual extract](https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data) |
| NomBot `filing_text` | Mission + program embeddings for grantees | Shared table, no new download | [NomBot](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/NomBot) |
| Foundation websites | Contacts, deadlines, open RFPs | **Top ~500 foundations only**; scraped quarterly. Smaller funders show "check their site" | Public web pages |
| ProPublica API | Backup 990-PF detail per foundation | Free, no key, rate-limited; on demand only | [ProPublica Nonprofit Explorer API](https://projects.propublica.org/nonprofits/api) |

Form reference: [IRS: About Form 990-PF](https://www.irs.gov/forms-pubs/about-form-990-pf).

## Stack
**Local first, then cloud**, the same pattern as NomBot. The grants tables live in the shared [`generosity-data`](https://github.com/institute-on-generosity/generosity-data) schema, so the cloud move is a `pg_dump` / `pg_restore` into the Supabase project NomBot already uses.

| Layer | Proof of concept (local) | Cloud (after migration) |
|---|---|---|
| Database | Postgres 17 + pgvector via Homebrew (same DB as NomBot) | Supabase Pro, shared with NomBot |
| Data | 990-PF grants paid to orgs in 5 Appalachian states (WV, KY, TN, VA, OH) | All US 990-PF grants, 3 most recent years |
| ETL | Python scripts run by hand (parser, matcher) | Same scripts on GitHub Actions; scraper quarterly |
| App | NomBot app, `/grants` section on `localhost:3000/grants` | Same NomBot deploy on Vercel, at `/grants` |
| Accounts | None (single local user) | Supabase Auth: logins, saved matches, digest subscribers *(new)* |
| LLM | [Vercel AI SDK](https://ai-sdk.dev), any provider (one env var) | Same |
| Email digest | Not in POC | [Resend](https://resend.com) free tier |

No LangChain: matching is one SQL + vector query; the explainer is NomBot's Research Buddy reasoner over a single foundation's grants. **Everything except the grants tables, matcher, ranking and Auth comes from NomBot** (see **Reused from NomBot**).

## Roadmap
**Deadline: Dec 31, 2026.** GrantRadar is built **Nov 23 – Dec 20**, right after NomBot. Because the database, pipeline, embeddings, app and cloud are reused, the time goes to the **new** parts only, and the explainer moves a week earlier.

| Dates | New work only | Done when |
|---|---|---|
| Nov 23 – Nov 29 *(Thanksgiving, light)* | `grants` + `funders` migration; **Part XV extractor** added to NomBot's 990 XML pipeline; 990-PF financials through the existing SOI loader | Grants from 5-state funders loaded locally |
| Nov 30 – Dec 6 | **Recipient matcher** (EIN, then name + city/state); **funder ranking query** over existing embeddings; `/grants` match page + **"Why this funder?"** inside the NomBot app, reusing Research Buddy | **Local proof of concept:** demo mission → sensible funders, with explanations |
| Dec 7 – Dec 13 | National 990-PF load (3 years) into the **existing** Supabase project; `/grants` ships with the **existing** NomBot deploy; 990-PF added to the **existing** GitHub Actions refresh; **Supabase Auth + saved matches** | Public URL; logins work |
| Dec 14 – Dec 20 | Test with 10 IoG-network nonprofits; 👍/👎 on every match; weekly digest; scraper for top ~500 foundations *(stretch)* | **GrantRadar build complete** |
| Dec 21 – Dec 31 | Buffer; fixes from testing; documentation; IoG handoff | **Everything done** |

## Success metrics
Adjusted from the original 6-month spec to the 4-week build:
- ≥10 IoG-network nonprofits test GrantRadar by Dec 20 *(spec: 50+ over 6 months)*
- ≥70% of top-20 matches rated 👍 relevant by testers
- ≥70% of Part XV grant rows linked to a recipient EIN with high confidence
- Match results in under 3 seconds
- 100% of "Why this funder?" claims cite a 990-PF
- IoG endorses GrantRadar as a resource for its partner network
- Adds under $50/mo to the shared infrastructure

## Budget (infrastructure)

| Item | Proof of concept (Nov 23 – Dec 6) | Cloud (from Dec 7), monthly |
|---|---|---|
| Database | $0 (shared local Postgres) | $0 extra (shares NomBot's $25 Supabase Pro) |
| Hosting + ETL | $0 (localhost, run by hand) | $0 (Vercel, GitHub Actions) |
| 990-PF download | $0 (irs.gov) | $0 (irs.gov) |
| LLM explanations | ~$1 (testing) | $5–10 |
| Email digest | none | $0 (Resend free tier) |
| **Total** | **~$1** | **~$5–15 extra** |

## Progress

### Planning
- [x] Project plan and README
- [x] System architecture diagram
- [x] User experience mockups
- [x] Lives in the NomBot-GrantRadar repo: `GrantRadar` branch, code at `/grants`
- [x] Deadline set: Dec 31, 2026

### Nov 23 – Nov 29: Grants data (on NomBot's pipeline)
- [ ] `grants` + `funders` migration in `generosity-data`
- [ ] Part XV extractor added to the existing 990 XML pipeline
- [ ] 990-PF financials via the existing SOI loader
- [ ] Grants from 5-state funders loaded locally

### Nov 30 – Dec 6: Local proof of concept
- [ ] Recipient matcher: EIN first, then name + city/state, with confidence
- [ ] Measure link rate (target ≥70%)
- [ ] Funder ranking query over existing `filing_text` embeddings
- [ ] `/grants` match page in the NomBot app, reusing its components
- [ ] "Why this funder?" from NomBot's Research Buddy reasoner
- [ ] **Demo mission returns sensible funders, with explanations, on a laptop**

### Dec 7 – Dec 13: Cloud (existing infrastructure)
- [ ] National 990-PF load (3 years) into the existing Supabase project
- [ ] `/grants` live on the NomBot deploy (public URL)
- [ ] 990-PF added to the existing GitHub Actions refresh
- [ ] Supabase Auth: logins + saved matches

### Dec 14 – Dec 20: Test + launch
- [ ] 10 IoG-network nonprofits testing
- [ ] 👍/👎 on every match
- [ ] Weekly digest of new matches
- [ ] Scraper for top ~500 foundation contacts + deadlines *(stretch)*
- [ ] **GrantRadar build complete**

### Dec 21 – Dec 31: Wrap-up
- [ ] Fixes from testing
- [ ] Documentation and IoG handoff
