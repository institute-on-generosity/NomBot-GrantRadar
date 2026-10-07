# GrantRadar

**Describe your mission. Get the foundations most likely to fund you, from public IRS data.**
Institute on Generosity AI Fellowship · **Deadline: Dec 31, 2026** · Ships as **`/grants` in the [NomBot](https://github.com/institute-on-generosity/NomBot-GrantRadar/tree/NomBot) app** (one codebase, one deploy)

## Problem
Every foundation grant is public (990-PF, Part XV), but small nonprofits can't use it. Discovery tools cost $150–400/mo.

## Solution

| Feature | What | Ships |
|---|---|---|
| **Match** | Mission → similar nonprofits → who funded them → ranked funders | Dec 6 |
| **Why this funder?** | LLM reasons over the funder's grants, shows steps, cites every claim | Dec 6 |

**A funder ranks high only if it already funded orgs like yours.**

## Users

| Who | Gets |
|---|---|
| Development directors (<$2M orgs) | Realistic funders, free |
| IoG partner orgs | Saved matches + weekly digest |
| First-time grant writers | *Why* a funder fits, with evidence |

## Experience
*Mock data.*

![GrantRadar match mockup: mission box, chips, three ranked foundations with evidence and typical grant size](docs/grantradar/ux/match-v1.png)

![GrantRadar explain mockup: reasoning-step chips, a one-line verdict and cited similar grantees](docs/grantradar/ux/explain-v1.png)

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/grantradar/architecture-dark-v2.svg" />
  <img src="docs/grantradar/architecture-light-v2.svg" alt="GrantRadar architecture: IRS BMF, 990-PF XML and foundation websites feed the generosity-data grant parser, recipient matcher and site scraper into Supabase Postgres + pgvector shared with NomBot; nonprofits use the /grants section of the NomBot app, whose matching engine and explainer query the database" />
</picture>

[Interactive diagram](docs/grantradar/architecture.html)

**Hardest step:** grants list recipients by name + address, usually without an EIN. The matcher links them to `orgs` with a confidence score; weak links are excluded.

## Reused from NomBot
GrantRadar is NomBot plus a grants table.

| Reused | New |
|---|---|
| Database, Supabase, migrations | `grants` + `funders` tables |
| Org list (BMF) | Recipient matcher |
| 990 XML pipeline | Part XV extractor |
| SOI loader | 990-PF file |
| Mission embeddings | Funder ranking query |
| Research Buddy reasoner | "Why this funder?" prompt |
| App, UI, API, Vercel, GitHub Actions | `/grants` pages, Supabase Auth, digest |

## Data

| Source | Gives | Link |
|---|---|---|
| IRS 990-PF XML | Grants paid (Part XV) | [irs.gov](https://www.irs.gov/charities-non-profits/form-990-series-downloads) |
| IRS EO BMF | Orgs + funders (already loaded) | [irs.gov](https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf) |
| IRS SOI 990-PF | Foundation assets + giving | [irs.gov](https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data) |
| Foundation sites | Contacts, deadlines (top ~500) | Public web |

## Roadmap

| Dates | Work |
|---|---|
| Nov 23–29 *(light)* | Grants tables + Part XV extractor; 5-state grants loaded |
| Nov 30–Dec 6 | Matcher + ranking + `/grants` + explainer → **local proof of concept** |
| Dec 7–13 | National data on existing Supabase; ships with NomBot deploy; logins |
| Dec 14–20 | 10 nonprofits test; 👍/👎; digest; scraper *(stretch)* → **done** |
| Dec 21–31 | Buffer + handoff |

## Success metrics
- ≥10 nonprofits test by Dec 20
- ≥70% of matches rated relevant
- ≥70% of grants linked to a recipient
- Results <3s; every explanation cited
- Adds <$50/mo

## Budget
**Local:** ~$1. **Cloud:** ~$5–15/mo extra (shares NomBot's Supabase).

## Progress

**Planning**
- [x] Plan, diagram, mockups
- [x] Lives in `NomBot-GrantRadar`, branch `GrantRadar`

**Nov 23–29: Grants data**
- [ ] `grants` + `funders` migration
- [ ] Part XV extractor
- [ ] 990-PF financials
- [ ] 5-state grants loaded

**Nov 30–Dec 6: Local proof of concept**
- [ ] Recipient matcher (≥70% linked)
- [ ] Funder ranking
- [ ] `/grants` match page
- [ ] "Why this funder?"
- [ ] **Demo works locally**

**Dec 7–13: Cloud**
- [ ] National 990-PF load
- [ ] `/grants` live on NomBot deploy
- [ ] Logins + saved matches

**Dec 14–20: Test + launch**
- [ ] 10 nonprofits testing, 👍/👎
- [ ] Weekly digest
- [ ] Foundation scraper *(stretch)*
- [ ] **Done**

**Dec 21–31: Wrap-up**
- [ ] Fixes, docs, handoff
