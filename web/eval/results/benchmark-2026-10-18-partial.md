# Research benchmark, 2026-10-18

8 researcher questions (eval/benchmark-questions.json) end to end: router (lib/answerRoute) -> answer (lib/answer). Wall time 10 s.

**Pass rate: 7/8 (88%)** fully answered. Answerable today: 7/7 (100%). Questions that need a missing capability: 1, of which the engine was honest (partial or unanswerable) on 1 and misleading on 0.

| | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|
| all (8) | 7 | 1 | 0 | 0 | 0 |
| answerable today (7) | 7 | 0 | 0 | 0 | 0 |
| need a missing capability (1) | 0 | 1 | 0 | 0 | 0 |

## Pass rate by category

| Category | Pass | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|---:|
| funder types | 3/3 (100%) | 3 | 0 | 0 | 0 | 0 |
| nonprofit finances | 4/5 (80%) | 4 | 1 | 0 | 0 | 0 |

## Missing capabilities, by questions blocked

Questions not fully answered, counted under each capability they need (a question can need several). `cause_label:*` rows are also summed as **cause labels (any)**.

| # | Capability | Questions blocked | Engine honest | Misleading | Examples |
|---:|---|---:|---:|---:|---|
| 1 | finances_panel | 1 | 1 | 0 | N05 How has total nonprofit revenue changed since 2015? |
| 2 | history_pre2022 | 1 | 1 | 0 | N05 How has total nonprofit revenue changed since 2015? |

## Direct SQL checks

Headline numbers re-computed straight from grant_clean (990-PF grants): 0 pass, 0 fail, 0 skipped.


## For human review

2 answers: misleading flags (confirm), keyword-counted causes, unverified headlines.

- N01 [ok] How many food banks are running deficits?
  > 507 of 1,958 food banks in the US with recent filings ran a deficit (26%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N03 [ok] How many animal shelters in Ohio run deficits?
  > 137 of 334 Animal shelters in Ohio with recent filings ran a deficit (41%)
  - cause counted by NTEE codes, not a graded label: check what the set catches

## Cost and latency

- **Router calls:** 8 (app API key, prompt-cached). Input 56,898 tokens (56,712 cache reads, 0 cache writes, 186 uncached), output 1,484.
- **Answers:** SQL only, no model calls. No LLM judge.
- **Latency per question** (route + answer, 4 in parallel): p50 2.0 s, p90 7.8 s.

## All questions

| ID | Category | Status | Question | Route | Headline | Notes |
|---|---|---|---|---|---|---|
| F08 | funder types | ok | What is the average payout rate of private foundations? | share/foundation_finances/all | In 2024 the median private foundation paid out 5.2% of its investment assets, and 55% paid out 5% or more |  |
| F09 | funder types | ok | Do foundations pay out more than the 5% minimum? | share/foundation_finances/all | In 2024 the median private foundation paid out 5.2% of its investment assets, and 55% paid out 5% or more |  |
| F10 | funder types | ok | How much did foundation assets grow from 2022 to 2024? | trend/foundation_finances/all | The median private foundation paid out 5.7% of its investment assets in 2022 and 5.2% in 2024. 71% paid out 5% or more in 2022, 55% in 2024 |  |
| N01 | nonprofit finances | ok | How many food banks are running deficits? | count_orgs/foundation_grants/K31 | 507 of 1,958 food banks in the US with recent filings ran a deficit (26%) |  |
| N02 | nonprofit finances | ok | How many nonprofits in Mississippi have less than three months of cash? | count_orgs/revenue/all/MS | 1,091 of 3,643 nonprofits in Mississippi with recent filings had under 3 months of cash (30%) |  |
| N03 | nonprofit finances | ok | How many animal shelters in Ohio run deficits? | count_orgs/foundation_grants/D20/OH | 137 of 334 Animal shelters in Ohio with recent filings ran a deficit (41%) |  |
| N04 | nonprofit finances | ok | How many nonprofits ran deficits two years in a row? | count_orgs/revenue/all | 61,634 of 309,002 nonprofits in the US with recent filings ran deficits 2 years in a row (20%) |  |
| N05 | nonprofit finances | partial | How has total nonprofit revenue changed since 2015? _(needs history_pre2022, finances_panel)_ | trend/revenue/all | Revenue to all causes rose 8.4% (5.3% after inflation) from 2023 to 2024 (same 137,292 orgs). Our data starts in 2023, so 2015–2022 isn't included | missing: Years before 2023 |
