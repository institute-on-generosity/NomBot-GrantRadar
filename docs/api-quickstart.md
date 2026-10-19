# NomBot API quickstart

Read-only JSON over public data on US nonprofits, foundations and giving, from the Institute on Generosity.
Full reference: **`/api/docs`** (human) and **`/api/openapi.json`** (OpenAPI 3.1).

## 1. Base URL and key

| | |
|---|---|
| **Base URL** | `https://thes-macbook-air.tail3090cf.ts.net` |
| **Auth** | `Authorization: Bearer <YOUR_KEY>` on every call (REST and MCP). Never in the URL. |
| **Your rate limit** | **120 requests per minute** per key |
| **Methods** | `GET` for REST, `POST` for MCP. Nothing you send changes the data. |
| **Name your app** | Optional `X-App` header, e.g. `X-App: muneeb-rag`. Helps us tell your apps apart |
| **Call log** | Each call is logged with time, endpoint or MCP tool, status, key name and app, kept **90 days**. Never the key itself |

Your key looks like `nb_live_…`. We keep only a fingerprint of it, so we can't resend it. Store it like a password.

```bash
export NOMBOT="https://thes-macbook-air.tail3090cf.ts.net"
export NOMBOT_KEY="nb_live_REPLACE_ME"
```

```python
import os, requests

BASE = "https://thes-macbook-air.tail3090cf.ts.net"
S = requests.Session()
S.headers["Authorization"] = f"Bearer {os.environ['NOMBOT_KEY']}"
S.headers["X-App"] = "muneeb-rag"  # optional: name your app

def get(path, **params):
    r = S.get(BASE + path, params=params, timeout=60)
    r.raise_for_status()
    return r.json()
```

## 2. Top 8 calls

**1. Foundation grants to a state, one year** (990-PF, newest first)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" \
  "$NOMBOT/api/v1/grants?state=WV&year_from=2024&year_to=2024&amount_min=50000&limit=100"
```
```python
get("/api/v1/grants", state="WV", year_from=2024, year_to=2024, amount_min=50000, limit=100)
```

**2. Donor-advised fund grants (Schedule I) with totals**
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" \
  "$NOMBOT/api/v1/grants?source=charity&funder_type=daf_sponsor&state=OH&year_from=2022&totals=true"
```
```python
get("/api/v1/grants", source="charity", funder_type="daf_sponsor", state="OH", year_from=2022, totals="true")
```

**3. Grants to a cause label** (climate, women_girls, substance_use, housing_homelessness)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/grants?label=climate&year_from=2022&year_to=2024"
```
```python
get("/api/v1/grants", label="climate", year_from=2022, year_to=2024)
```

**4. Federal awards to one organization** (USAspending, FY2022-2025)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/federal-awards?recipient_ein=231352685&totals=true"
```
```python
get("/api/v1/federal-awards", recipient_ein="231352685", totals="true")
```

**5. Foundation payout by year** (990-PF: assets, grants paid, payout rate vs the 5% rule)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/foundations/131684331/finances"
```
```python
get("/api/v1/foundations/131684331/finances")
```

**6. Nonprofit finance panel** (Form 990: revenue, surplus, months of cash, deficit streak)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/orgs/341877332/finances"
```
```python
get("/api/v1/orgs/341877332/finances")
```

**7. Household giving by county** (IRS SOI itemized charitable deductions)
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" \
  "$NOMBOT/api/v1/household-giving?level=county&state=WV&year_from=2018&year_to=2023"
```
```python
get("/api/v1/household-giving", level="county", state="WV", year_from=2018, year_to=2023)
```

**8. Policy and news**
```bash
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/congress/bills?q=%22charitable+deduction%22"
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/federal-register?funding_only=true&agency=Education"
curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/news?topic=nonprofit+cuts&date_from=2026-09-01"
```
```python
get("/api/v1/congress/bills", q='"charitable deduction"')
get("/api/v1/federal-register", funding_only="true", agency="Education")
get("/api/v1/news", topic="nonprofit cuts", date_from="2026-09-01")
```

**Also:** `/api/v1/search?q=…` (find orgs in plain words), `/api/v1/org/{ein}` (full profile), `/api/v1/labels` and `/api/v1/labels/{label}/orgs` (cause labels with grades), `/api/v1/research` (verified findings), `/api/v1/answer?spec=…` (aggregate answers).

## 3. Pagination

- List endpoints return `results`, `count`, `has_more`, `next_cursor`.
- Pass `next_cursor` back as `cursor` with **the same filters**. Don't edit it.
- Keyset pages, newest first: page 500 is as fast as page 1, and rows don't shift while you walk.
- `limit`: up to 500 (grants, awards, bills, Federal Register, news) or 1,000 (household giving, label orgs).

```python
import pandas as pd

def walk(path, **params):
    rows, cursor = [], None
    while True:
        page = get(path, **params, limit=500, **({"cursor": cursor} if cursor else {}))
        rows += page["results"]
        cursor = page["next_cursor"]
        if not cursor:
            return rows

df = pd.json_normalize(walk("/api/v1/grants", funder_ein="924018392"))
```

## 4. Rate limits and errors

- **120 requests/minute** for your key. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds).
- Over the limit: **429** with `Retry-After`. Sleep that long and retry.
- Errors are JSON: `{"error": {"code": "bad_param", "message": "...", "docs": "/api/docs"}}`.
  - **400** `bad_param` / `bad_ein`: the message names the parameter.
  - **401** `missing_key` / `invalid_key`, **403** `revoked_key`, **404** `not_found`, **500** `server_error`.

```python
import time
def get(path, **params):
    while True:
        r = S.get(BASE + path, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", "5")))
            continue
        r.raise_for_status()
        return r.json()
```

## 5. MCP (AI tools)

Remote MCP server at **`$NOMBOT/mcp`** (Streamable HTTP, stateless), same key and rate limit. 11 read-only tools:
`search_nonprofits`, `get_organization`, `list_research`, `get_research`, `answer_research_question`, `search_grants`, `get_federal_awards`, `get_finances`, `get_household_giving`, `list_cause_labels`, `search_policy`.

**Claude Code**
```bash
claude mcp add --transport http nombot "$NOMBOT/mcp" \
  --header "Authorization: Bearer $NOMBOT_KEY"
```

**Claude Desktop** (`claude_desktop_config.json`, via the `mcp-remote` bridge, needs Node.js)
```json
{
  "mcpServers": {
    "nombot": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://thes-macbook-air.tail3090cf.ts.net/mcp",
               "--header", "Authorization:Bearer ${NOMBOT_KEY}"],
      "env": { "NOMBOT_KEY": "nb_live_REPLACE_ME" }
    }
  }
}
```

**ChatGPT / OpenAI API** (Responses API)
```python
from openai import OpenAI
resp = OpenAI().responses.create(
    model="gpt-5",
    tools=[{"type": "mcp", "server_label": "nombot",
            "server_url": "https://thes-macbook-air.tail3090cf.ts.net/mcp",
            "headers": {"Authorization": "Bearer nb_live_REPLACE_ME"},
            "require_approval": "never"}],
    input="Which donor-advised fund sponsors gave the most to West Virginia nonprofits in 2024?",
)
print(resp.output_text)
```

- The chat apps at **claude.ai** and **chatgpt.com** add custom connectors through OAuth sign-in, which NomBot doesn't offer yet. Use Claude Code, Claude Desktop or the APIs above.
- List tools take `cursor` too: the model passes `next_cursor` back for more rows.
- Add `X-App` as a second header to name the app, e.g. `--header "X-App: muneeb-claude"`. Without it, the call log shows the MCP client's own name.

## 6. Data caveats

- **Coverage**
  - **990-PF grants:** tax years 2012-2025, 14.8M rows. About **64%** linked to a recipient EIN (59% of dollars), so per-org totals run low.
  - **Schedule I grants:** 8.5M lines, 2012-2025. Lines over $5,000 per recipient only. Named lines cover **about 93%** of what filers report (2022-24). "SEE ATTACHED" / "VARIOUS" lines are left out.
  - **Federal awards:** FY2022-2025 only, grants and cooperative agreements, about 85% linked to an EIN. Net obligations, so a year can be negative.
  - **Household giving:** itemizers only (itemizing fell about 60% from 2018). A deduction is not all giving. No cause or recipient.
  - **Tax year 2025** is partial.
- **Pre-2020 e-file coverage:** e-filing was optional before 2020, so earlier years hold only e-filed returns (2019 foundation grant dollars are about 62% of the IRS SOI total). Compare trends from 2020 on.
- **Headquarters vs place of service:** grants and finances are placed by the organization's mailing address, usually its headquarters. Federal awards also give the place of performance.
- **Don't add sources together:** a DAF grant can start as a foundation grant to the sponsor, and federal money passed through a charity shows twice.
- **Individuals:** grants to individuals keep amount and place but withhold the person's name and ZIP.
- **Cause labels** are model-graded. `/api/v1/labels` gives precision and recall estimates per label.
- **Policy and news:** keyword search only, no EIN links. Bills: current Congress. Federal Register: from Oct 2025. News: GDELT headlines from late June 2026, tagged by topic. Recent days come from GDELT's search API (up to 250 per topic per day), older ones from its raw crawl files sampled hourly (headline must match, so fewer per day). Headlines and links only.
- **Refresh schedule:** IRS data loads as the IRS releases it (a monthly refresh is planned). Bills, Federal Register and news are refreshed by hand for now (a daily schedule is planned). Check the newest date in each response.

## 7. Requests and help

- More data, a higher rate limit, a new field or filter: email **hunter@instituteongenerosity.org** with the question you're trying to answer.
- A wrong number: send the request URL and what you expected.
- Fields may be added under `/api/v1`, never renamed or removed.
