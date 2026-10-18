# Research benchmark, 2026-10-18

150 researcher questions (eval/benchmark-questions.json) end to end: router (lib/answerRoute) -> answer (lib/answer). Wall time 135 s.

**Pass rate: 83/150 (55%)** fully answered. Answerable today: 83/84 (99%). Questions that need a missing capability: 66, of which the engine was honest (partial or unanswerable) on 65 and misleading on 1.

| | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|
| all (150) | 83 | 40 | 26 | 0 | 1 |
| answerable today (84) | 83 | 1 | 0 | 0 | 0 |
| need a missing capability (66) | 0 | 39 | 26 | 0 | 1 |

## Pass rate by category

| Category | Pass | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|---:|
| trends | 13/17 (76%) | 13 | 4 | 0 | 0 | 0 |
| causes | 11/23 (48%) | 11 | 11 | 0 | 0 | 1 |
| place | 8/14 (57%) | 8 | 4 | 2 | 0 | 0 |
| funder types | 9/12 (75%) | 9 | 2 | 1 | 0 | 0 |
| DAFs and charities | 9/13 (69%) | 9 | 0 | 4 | 0 | 0 |
| federal and government | 10/14 (71%) | 10 | 4 | 0 | 0 | 0 |
| equity and need | 6/10 (60%) | 6 | 4 | 0 | 0 | 0 |
| grant practice | 7/12 (58%) | 7 | 0 | 5 | 0 | 0 |
| nonprofit finances | 7/12 (58%) | 7 | 1 | 4 | 0 | 0 |
| household and total giving | 2/12 (17%) | 2 | 7 | 3 | 0 | 0 |
| track record and people | 0/6 (0%) | 0 | 0 | 6 | 0 | 0 |
| benchmarks and context | 1/5 (20%) | 1 | 3 | 1 | 0 | 0 |

## Missing capabilities, by questions blocked

Questions not fully answered, counted under each capability they need (a question can need several). `cause_label:*` rows are also summed as **cause labels (any)**.

| # | Capability | Questions blocked | Engine honest | Misleading | Examples |
|---:|---|---:|---:|---:|---|
| 1 | household_giving | 12 | 12 | 0 | C16 How much US philanthropy goes to climate change?<br>C17 How much US philanthropy goes to women and girls? |
| 2 | cause labels (any) | 10 | 9 | 1 | T14 Did foundation giving to racial justice spike after 2020 and then fall back?<br>C18 How much foundation money goes to racial equity and racial justice work? |
| 3 | history_pre2022 | 6 | 6 | 0 | T15 How did foundation giving respond to the 2008 recession?<br>T18 How has federal funding to nonprofits changed since 2015? |
| 4 | external_benchmarks | 5 | 5 | 0 | H08 How much is total US charitable giving each year from all sources?<br>H12 What share of total giving comes from foundations versus individuals, bequests and corporations? |
| 5 | boards_people | 2 | 2 | 0 | K03 Which board members sit on the most climate nonprofit boards?<br>K04 How many foundations share board members with the nonprofits they fund? |
| 6 | cause_label:racial_equity | 2 | 2 | 0 | T14 Did foundation giving to racial justice spike after 2020 and then fall back?<br>C18 How much foundation money goes to racial equity and racial justice work? |
| 7 | corporate_direct | 2 | 2 | 0 | F11 How much do corporations give in total, including direct corporate gifts?<br>F12 How much do companies give to food banks outside their foundations? |
| 8 | daf_flows | 2 | 2 | 0 | D10 How much money flows into donor-advised funds each year?<br>D11 What is the payout rate of donor-advised funds? |
| 9 | federal_beyond_grants | 2 | 2 | 0 | G12 How much federal contract money goes to nonprofits?<br>G13 How much federal research money goes to public universities? |
| 10 | funder_geography | 2 | 2 | 0 | P15 Which states' foundations send the most money to other states?<br>P16 How much do community foundations give in their home county versus elsewhere? |
| 11 | grant_relationships | 2 | 2 | 0 | R12 How long do foundations keep funding the same grantee?<br>K06 Which food security nonprofits got foundation grants every year from 2022 to 2024? |
| 12 | international | 2 | 2 | 0 | C27 How much US foundation money goes to global health programs abroad?<br>X04 How does US foundation giving to climate compare with global climate philanthropy? |
| 13 | led_by | 2 | 2 | 0 | E07 How much foundation money goes to organizations led by people of color?<br>E08 How much foundation money goes to women-led nonprofits? |
| 14 | org_age | 2 | 2 | 0 | K01 Which animal welfare nonprofits are the newest versus the longest established?<br>K02 Do older nonprofits get more foundation money than newer ones? |
| 15 | org_formation | 2 | 2 | 0 | F13 How many new private foundations were created each year since 2015?<br>K05 How many new nonprofits registered with the IRS in 2024? |
| 16 | region_geography | 2 | 2 | 0 | P11 Which metro areas get the most foundation money per resident?<br>P12 Which congressional districts get the most federal grant money for nonprofits? |
| 17 | staff_volunteers | 2 | 2 | 0 | N10 How many people do nonprofits employ in Indiana?<br>H10 How many people volunteer at nonprofits in Texas? |
| 18 | cause_label:animal_subcauses | 1 | 1 | 0 | C25 How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster? |
| 19 | cause_label:democracy | 1 | 1 | 0 | C22 How much foundation money goes to democracy and voting rights? |
| 20 | cause_label:disability | 1 | 1 | 0 | C20 How much foundation money supports people with disabilities? |
| 21 | cause_label:immigrants | 1 | 1 | 0 | C21 How much foundation money supports immigrants and refugees? |
| 22 | cause_label:journalism | 1 | 1 | 0 | C23 How much foundation money goes to local journalism? |
| 23 | cause_label:lgbtq | 1 | 1 | 0 | C19 How much foundation money goes to LGBTQ organizations? |
| 24 | cause_label:native_communities | 1 | 1 | 0 | P14 Which foundations give the most to Native American communities? |
| 25 | cause_label:opioids | 1 | 0 | 1 | C24 Where does foundation money for opioid addiction go? |
| 26 | compensation | 1 | 1 | 0 | N13 How much do food bank CEOs earn on average? |
| 27 | cross_source_compare | 1 | 1 | 0 | G08 How does federal grant money to nonprofits compare with foundation grants? |
| 28 | daf_account_level | 1 | 1 | 0 | D12 How much did my Fidelity DAF grant to charities last year? |
| 29 | engine (answerable, partial) | 1 | 1 | 0 | E02 Do high-poverty counties get less foundation money per resident? |
| 30 | expense_detail | 1 | 1 | 0 | N11 What are typical overhead rates for human services nonprofits? |
| 31 | finances_panel | 1 | 1 | 0 | N05 How has total nonprofit revenue changed since 2015? |
| 32 | forecast | 1 | 1 | 0 | X03 Will foundation giving to climate rise next year? |
| 33 | funder_practices | 1 | 1 | 0 | R10 How many foundations accept unsolicited applications? |
| 34 | funder_trend | 1 | 1 | 0 | T20 Which foundations increased their grantmaking the most from 2022 to 2024? |
| 35 | funding_gap_ratio | 1 | 1 | 0 | C26 Which causes get the least foundation money relative to how many nonprofits work on them? |
| 36 | giving_circles | 1 | 1 | 0 | D13 How much do giving circles give, and to what causes? |
| 37 | grant_purpose | 1 | 1 | 0 | R11 How much foundation money goes to capacity building versus program support? |
| 38 | multi_year | 1 | 1 | 0 | R05 What share of foundation grants are multi-year commitments? |
| 39 | population_served | 1 | 1 | 0 | E09 What share of foundation grants benefit low-income people? |
| 40 | revenue_mix | 1 | 1 | 0 | N12 Which kinds of nonprofits depend most on donations versus earned revenue? |
| 41 | service_area | 1 | 1 | 0 | P13 Do foundation grants reach the places where nonprofits deliver services, not just where they're headquartered? |
| 42 | size_distribution | 1 | 1 | 0 | R08 What share of foundation grants are under $10,000? |
| 43 | state_local_gov | 1 | 1 | 0 | G09 How much do state and local governments give to nonprofits, separate from federal money? |

## Direct SQL checks

Headline numbers re-computed straight from grant_clean (990-PF grants): 10 pass, 0 fail, 0 skipped.

- **pass** T01 Is total foundation giving growing?: headline 32% vs SQL 31.79% (2020->2024)
- **pass** T02 How has foundation funding for mental health changed since 2022?: headline 23% vs SQL 22.83% (2022->2024)
- **pass** T03 Is foundation funding for food banks growing?: headline -20% vs SQL -20.32% (2020->2024)
- **pass** T05 How has foundation giving to education changed since 2022?: headline 12% vs SQL 12.44% (2022->2024)
- **pass** T11 Why did foundation funding for education fall?: headline 35% vs SQL 35.28% (2020->2024)
- **pass** C04 How much foundation money goes to food banks?: headline $889.8M vs SQL $889.8M (0.0% off, 2022-2024)
- **pass** C05 How much foundation money goes to mental health?: headline $1500.0M vs SQL $1481.6M (1.2% off, 2022-2024)
- **pass** C06 How much foundation money goes to the arts?: headline $15100.0M vs SQL $15082.8M (0.1% off, 2022-2024)
- **pass** P03 Which states get the most foundation money for food banks?: headline illinois $140.0M vs SQL IL $140.0M
- **pass** H05 How much do itemizers deduct for charitable gifts in each state?: headline california $33.5B vs SQL CA $33.5B (2023)

## For human review

45 answers: misleading flags (confirm), keyword-counted causes, unverified headlines.

- T02 [ok] How has foundation funding for mental health changed since 2022?
  > Foundation money for Mental health grew 23% (15% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T03 [ok] Is foundation funding for food banks growing?
  > Foundation money for Food banks fell 20% (34% after inflation) from 2020 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T05 [ok] How has foundation giving to education changed since 2022?
  > Foundation money for Education grew 12% (4.9% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T11 [ok] Why did foundation funding for education fall?
  > Foundation money for education didn't fall. The total grew 35% from 2020 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T13 [ok] How did foundation giving to health change from 2015 to 2024?
  > Foundation money for Health grew 313% (212% after inflation) from 2015 to 2024. Tax years before 2020 miss many smaller filers, so growth from 2015 runs high
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T14 [partial] Did foundation giving to racial justice spike after 2020 and then fall back?
  > Foundation money for Racial justice grew 313% (231% after inflation) from 2018 to 2024. Tax years before 2020 miss many smaller filers, so growth from 2018 runs high
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T17 [ok] In real, inflation-adjusted dollars, is foundation money for food banks growing?
  > Foundation money for Food banks fell 20% (34% after inflation) from 2020 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C02 [ok] Within animal welfare, how is foundation money split across sub-causes?
  > Animal Protection & Welfare (D20) got the most foundation money for Animal welfare: $1.0B, 41% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C03 [ok] Which parts of education get the least foundation money?
  > Education (B0) got the least foundation money for Education: $200, 0.00% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C04 [ok] How much foundation money goes to food banks?
  > Foundations gave $889.8M to Food banks, 2022–24: 0.48% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C05 [ok] How much foundation money goes to mental health?
  > Foundations gave $1.5B to Mental health, 2022–24: 0.81% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C06 [ok] How much foundation money goes to the arts?
  > Foundations gave $15.1B to Arts, 2022–24: 8.2% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C09 [ok] What share of foundation money goes to religious organizations?
  > Foundations gave $3.5B to Religion, 2022–24: 1.9% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C18 [partial] How much foundation money goes to racial equity and racial justice work?
  > Foundations gave $327.4M to racial equity and racial justice, 2022–24: 0.18% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C19 [partial] How much foundation money goes to LGBTQ organizations?
  > Foundations gave $124.8M to LGBTQ organizations, 2022–24: 0.07% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C20 [partial] How much foundation money supports people with disabilities?
  > Foundations gave $411.1M to People with disabilities, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C21 [partial] How much foundation money supports immigrants and refugees?
  > Foundations gave $404.6M to Immigrants and refugees, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C22 [partial] How much foundation money goes to democracy and voting rights?
  > Foundations gave $408.1M to Democracy and voting rights, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C23 [partial] How much foundation money goes to local journalism?
  > Foundations gave $1.4B to Local journalism, 2022–24: 0.74% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C24 [misleading] Where does foundation money for opioid addiction go?
  > Texas gets the most foundation grants to Substance use: $42.5M
  - answered as if complete; no note that cause_label:opioids is missing
- C25 [partial] How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster?
  > Pet rescue and foster got 35% more foundation money than animal rights and anti-cruelty advocacy, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C27 [partial] How much US foundation money goes to global health programs abroad?
  > Foundations gave $0 to global health, 2022–24: 0.00% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- P03 [ok] Which states get the most foundation money for food banks?
  > Illinois gets the most foundation grants to food banks: $140.0M
  - cause counted by NTEE codes, not a graded label: check what the set catches
- P14 [partial] Which foundations give the most to Native American communities?
  > The Bush Fdn is the largest foundation funder of Native American communities: $83.1M, 2022–24
  - cause counted by keywords, not a graded label: check what the set catches
- F01 [ok] How much do company foundations give to K-12 education?
  > Company foundations gave $92.4M to K-12 education, 2022–24: 1.0% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F02 [ok] Which company foundations give the most to K-12 schools?
  > Cianbro Charitable Fdn is the largest foundation funder of K-12 schools: $6.0M, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F05 [ok] How much do foundations with over $1 billion in assets give to health?
  > Foundations with $1B and up in assets gave $3.8B to Health, 2022–24: 6.4% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F12 [partial] How much do companies give to food banks outside their foundations?
  > Company foundations gave $132.6M to food banks, 2022–24: 1.4% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D02 [ok] What share of donor-advised fund grants goes to religious organizations?
  > Donor-advised fund sponsors gave $9.6B to Religion, 2022–24: 8.4% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D06 [ok] Do community foundations or DAF sponsors give more to education?
  > Other grantmaking charities gave the most money for education: $47.1B, 60% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D08 [ok] How much do United Ways give to food banks?
  > United Ways gave $38.0M to Food banks, 2022–24: 1.0% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- G03 [ok] How much federal grant money went to Head Start providers?
  > Federal agencies awarded $24.3B to nonprofits for Head Start, FY2022–25: 9.0% of federal awards to nonprofits there
  - cause counted by keywords, not a graded label: check what the set catches
- G10 [ok] How many human services nonprofits in Kentucky rely on government grants?
  > 78 of 434 Human services organizations in Kentucky with recent filings got half or more of revenue from government grants (18%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- G11 [ok] How dependent are human services nonprofits on government money?
  > 6,469 of 35,898 human services organizations in the US with recent filings got half or more of revenue from government grants (18%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- E07 [partial] How much foundation money goes to organizations led by people of color?
  > Foundations gave $327.4M to organizations led by people of color, 2022–24: 0.18% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- E09 [partial] What share of foundation grants benefit low-income people?
  > Foundations gave $14.0B to low-income people, 2022–24: 7.6% of identified grant dollars
  - cause counted by keywords, not a graded label: check what the set catches
- R01 [ok] What is the median grant size for arts organizations?
  > The median foundation grant to Arts organizations is $5K, the average $46K, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- R09 [ok] Average foundation grant to hospitals by state
  > Delaware got the largest average foundation grant for Hospitals: $323K, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N01 [ok] How many food banks are running deficits?
  > 507 of 1,958 food banks in the US with recent filings ran a deficit (26%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N03 [ok] How many animal shelters in Ohio run deficits?
  > 137 of 334 animal shelters in Ohio with recent filings ran a deficit (41%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N06 [ok] What share of all nonprofit revenue goes to hospitals?
  > Hospitals reported $1.37T in revenue for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N07 [ok] What is the total revenue of museums in New York?
  > Museums in New York reported $2.7B in revenue for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N08 [ok] What share of contributions go to religious organizations?
  > Religion organizations reported $18.9B in contributions for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- H01 [partial] How much do individuals give to churches each year?
  > Foundation money for religion grew 55% (28% after inflation) from 2020 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- H02 [partial] How much do individuals donate to food banks?
  > Foundations gave $889.8M to Food banks, 2022–24: 0.48% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches

## Cost and latency

- **Router calls:** 150 (app API key, prompt-cached). Input 1,076,254 tokens (1,072,650 cache reads, 0 cache writes, 3,604 uncached), output 29,291.
- **Answers:** SQL only, no model calls. No LLM judge.
- **Latency per question** (route + answer, 4 in parallel): p50 2.1 s, p90 3.3 s.

## All questions

| ID | Category | Status | Question | Route | Headline | Notes |
|---|---|---|---|---|---|---|
| T01 | trends | ok | Is total foundation giving growing? | trend/foundation_grants/all | Foundation money to organizations in the US grew 32% (8.7% after inflation) from 2020 to 2024 | headline 32% vs SQL 31.79% (2020->2024) |
| T02 | trends | ok | How has foundation funding for mental health changed since 2022? | trend/foundation_grants/F | Foundation money for Mental health grew 23% (15% after inflation) from 2022 to 2024 | headline 23% vs SQL 22.83% (2022->2024) |
| T03 | trends | ok | Is foundation funding for food banks growing? | trend/foundation_grants/K31 | Foundation money for Food banks fell 20% (34% after inflation) from 2020 to 2024 | headline -20% vs SQL -20.32% (2020->2024) |
| T04 | trends | ok | Which causes grew fastest in foundation funding from 2022 to 2024? | fastest_causes/foundation_grants/all | Recreation & Sports grew fastest: +44% in foundation grants, 2022 to 2024 |  |
| T05 | trends | ok | How has foundation giving to education changed since 2022? | trend/foundation_grants/B | Foundation money for Education grew 12% (4.9% after inflation) from 2022 to 2024 | headline 12% vs SQL 12.44% (2022->2024) |
| T06 | trends | ok | Is federal grant money to nonprofits growing? | trend/federal_awards/all | Federal awards to nonprofits grew 7.2% (down 3.7% after inflation) from FY2022 to FY2025 |  |
| T08 | trends | ok | Did donor-advised fund grants grow between 2022 and 2024? | trend/charity_grants/daf_sponsor/all | Money from DAF sponsors to organizations in the US grew 38% (28% after inflation) from 2022 to 2024 |  |
| T09 | trends | ok | Is foundation money for climate growing? | trend/foundation_grants/climate | Foundation money for climate grew 97% (62% after inflation) from 2020 to 2024 |  |
| T11 | trends | ok | Why did foundation funding for education fall? | trend/foundation_grants/B | Foundation money for education didn't fall. The total grew 35% from 2020 to 2024 | headline 35% vs SQL 35.28% (2020->2024) |
| T12 | trends | ok | How has foundation giving changed over the last 10 years? | trend/foundation_grants/all | Foundation money to organizations in the US grew 240% (160% after inflation) from 2016 to 2024. Tax years before 2020 miss many smaller filers, so growth from 2016 runs high |  |
| T13 | trends | ok | How did foundation giving to health change from 2015 to 2024? | trend/foundation_grants/E | Foundation money for Health grew 313% (212% after inflation) from 2015 to 2024. Tax years before 2020 miss many smaller filers, so growth from 2015 runs high |  |
| T14 | trends | partial | Did foundation giving to racial justice spike after 2020 and then fall back? _(needs cause_label:racial_equity)_ | trend/foundation_grants/kw:racial justice+racial equity+racial | Foundation money for Racial justice grew 313% (231% after inflation) from 2018 to 2024. Tax years before 2020 miss many smaller filers, so growth from 2018 runs high |  |
| T15 | trends | partial | How did foundation giving respond to the 2008 recession? _(needs history_pre2022)_ | trend/foundation_grants/all | Foundations gave $12.2B to organizations in the US, 2012. Tax years before 2020 miss many smaller filers, so growth from 2012 runs high. Our data starts in 2012, so 2008–2010 isn't included | missing: Years before 2012 |
| T16 | trends | ok | How much did foundation giving grow after adjusting for inflation from 2022 to 2024? | trend/foundation_grants/all | Foundation money to organizations in the US grew 11% (3.6% after inflation) from 2022 to 2024 |  |
| T17 | trends | ok | In real, inflation-adjusted dollars, is foundation money for food banks growing? | trend/foundation_grants/K31 | Foundation money for Food banks fell 20% (34% after inflation) from 2020 to 2024 |  |
| T18 | trends | partial | How has federal funding to nonprofits changed since 2015? _(needs history_pre2022)_ | trend/federal_awards/all | Federal awards to nonprofits grew 7.2% (down 3.7% after inflation) from FY2022 to FY2025. Our data starts in 2022, so 2015–2021 isn't included | missing: Years before 2022 |
| T20 | trends | partial | Which foundations increased their grantmaking the most from 2022 to 2024? _(needs funder_trend)_ | top_funders/foundation_grants/all missing:other | Gates Fdn is the largest foundation funder of all causes: $9.7B, 2022–24 | missing: Change in each funder's giving |
| C01 | causes | ok | Which cause areas get the most foundation money? | breakdown/foundation_grants/by cause/all | Education (B) got the most foundation money: $42.7B, 23% of the total, 2022–24 |  |
| C02 | causes | ok | Within animal welfare, how is foundation money split across sub-causes? | breakdown/foundation_grants/by cause_detail/D | Animal Protection & Welfare (D20) got the most foundation money for Animal welfare: $1.0B, 41% of the total, 2022–24 |  |
| C03 | causes | ok | Which parts of education get the least foundation money? | breakdown/foundation_grants/by cause_detail/B | Education (B0) got the least foundation money for Education: $200, 0.00% of the total, 2022–24 |  |
| C04 | causes | ok | How much foundation money goes to food banks? | total/foundation_grants/K31 | Foundations gave $889.8M to Food banks, 2022–24: 0.48% of identified grant dollars | headline $889.8M vs SQL $889.8M (0.0% off, 2022-2024) |
| C05 | causes | ok | How much foundation money goes to mental health? | total/foundation_grants/F | Foundations gave $1.5B to Mental health, 2022–24: 0.81% of identified grant dollars | headline $1500.0M vs SQL $1481.6M (1.2% off, 2022-2024) |
| C06 | causes | ok | How much foundation money goes to the arts? | total/foundation_grants/A | Foundations gave $15.1B to Arts, 2022–24: 8.2% of identified grant dollars | headline $15100.0M vs SQL $15082.8M (0.1% off, 2022-2024) |
| C09 | causes | ok | What share of foundation money goes to religious organizations? | share/foundation_grants/X | Foundations gave $3.5B to Religion, 2022–24: 1.9% of identified grant dollars |  |
| C10 | causes | ok | Which foundations give the most to climate? | top_funders/foundation_grants/climate | Sergey Brin Family Fdn is the largest foundation funder of climate: $262.6M, 2022–24 |  |
| C12 | causes | ok | How concentrated is climate funding? | concentration/foundation_grants/climate | The top 1% of recipients got 48% of foundation money for climate, 2022–24 |  |
| C13 | causes | ok | Climate vs women and girls: which gets more foundation money? | compare/foundation_grants/climate,women_girls | Women and girls got 35% more foundation money than climate, 2022–24 |  |
| C15 | causes | ok | How much foundation money goes to women and girls? | total/foundation_grants/women_girls | Foundations gave $3.1B to Women and girls, 2022–24: 1.7% of identified grant dollars |  |
| C16 | causes | partial | How much US philanthropy goes to climate change? _(needs household_giving)_ | total/foundation_grants/climate | Foundations gave $2.3B to Climate change, 2022–24: 1.3% of identified grant dollars |  |
| C17 | causes | partial | How much US philanthropy goes to women and girls? _(needs household_giving)_ | total/foundation_grants/women_girls | Foundations gave $3.1B to women and girls, 2022–24: 1.7% of identified grant dollars |  |
| C18 | causes | partial | How much foundation money goes to racial equity and racial justice work? _(needs cause_label:racial_equity)_ | total/foundation_grants/kw:racial equity+racial justice | Foundations gave $327.4M to racial equity and racial justice, 2022–24: 0.18% of identified grant dollars |  |
| C19 | causes | partial | How much foundation money goes to LGBTQ organizations? _(needs cause_label:lgbtq)_ | total/foundation_grants/kw:lgbtq+gay+lesbian+transgender+queer | Foundations gave $124.8M to LGBTQ organizations, 2022–24: 0.07% of identified grant dollars |  |
| C20 | causes | partial | How much foundation money supports people with disabilities? _(needs cause_label:disability)_ | total/foundation_grants/kw:disabilities+disability+disabled+developmental disabilities | Foundations gave $411.1M to People with disabilities, 2022–24: 0.22% of identified grant dollars |  |
| C21 | causes | partial | How much foundation money supports immigrants and refugees? _(needs cause_label:immigrants)_ | total/foundation_grants/kw:immigrant+refugee | Foundations gave $404.6M to Immigrants and refugees, 2022–24: 0.22% of identified grant dollars |  |
| C22 | causes | partial | How much foundation money goes to democracy and voting rights? _(needs cause_label:democracy)_ | total/foundation_grants/kw:democracy+voting rights+voter registration+civic engagement+election | Foundations gave $408.1M to Democracy and voting rights, 2022–24: 0.22% of identified grant dollars |  |
| C23 | causes | partial | How much foundation money goes to local journalism? _(needs cause_label:journalism)_ | total/foundation_grants/kw:journalism+local news+news media+newsroom+public radio | Foundations gave $1.4B to Local journalism, 2022–24: 0.74% of identified grant dollars |  |
| C24 | causes | misleading | Where does foundation money for opioid addiction go? _(needs cause_label:opioids)_ | by_state/foundation_grants/substance_use | Texas gets the most foundation grants to Substance use: $42.5M | answered as if complete; no note that cause_label:opioids is missing |
| C25 | causes | partial | How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster? _(needs cause_label:animal_subcauses)_ | compare/foundation_grants/D02+D05+D12+D20,D20+D30+D40 | Pet rescue and foster got 35% more foundation money than animal rights and anti-cruelty advocacy, 2022–24 |  |
| C26 | causes | partial | Which causes get the least foundation money relative to how many nonprofits work on them? _(needs funding_gap_ratio)_ | breakdown/foundation_grants/by cause/all missing:other | Mutual & Membership Benefit (Y) got the least foundation money: $56.5M, 0.03% of the total, 2022–24 | missing: Money per nonprofit by cause |
| C27 | causes | partial | How much US foundation money goes to global health programs abroad? _(needs international)_ | total/foundation_grants/kw:global health+international health+health abroad missing:foreign_giving | Foundations gave $0 to global health, 2022–24: 0.00% of identified grant dollars | missing: Money to other countries |
| P01 | place | ok | Which states get the most foundation money per resident? | by_state/foundation_grants/all/per resident | District of Columbia gets the most foundation grants per resident: $6,878 a year, then Massachusetts at $629 |  |
| P02 | place | ok | Which states get the least foundation money per resident? | by_state/foundation_grants/all/per resident | Mississippi gets the least foundation grants per resident: $64.55 a year |  |
| P03 | place | ok | Which states get the most foundation money for food banks? | by_state/foundation_grants/K31 | Illinois gets the most foundation grants to food banks: $140.0M | headline illinois $140.0M vs SQL IL $140.0M |
| P05 | place | ok | Which counties in California get the most foundation money? | breakdown/foundation_grants/by county/all/CA | Los Angeles County, CA got the most foundation money in California: $8.1B, 28% of the total, 2022–24 |  |
| P06 | place | ok | How much of the foundation money in West Virginia comes from out-of-state foundations? | out_of_state/foundation_grants/all/WV | 50% of foundation money for all causes in West Virginia came from out-of-state foundations, 2022–24 |  |
| P07 | place | ok | How much foundation money reaches rural counties in Kentucky and West Virginia? | total/foundation_grants/all/KY,WV | Foundations gave $346.9M to organizations in rural counties of Kentucky, West Virginia, 2022–24 |  |
| P08 | place | ok | Do rural counties get less foundation money per person than urban ones? | by_rurality/foundation_grants/all/per resident | Rural counties get $69.76 per resident a year in foundation grants, 3.1x less than larger counties |  |
| P10 | place | ok | How much foundation money goes to Appalachia? | total/foundation_grants/all | Foundations gave $7.3B to organizations in Appalachia, 2022–24 |  |
| P11 | place | partial | Which metro areas get the most foundation money per resident? _(needs region_geography)_ | by_state/foundation_grants/all/per resident missing:other | District of Columbia gets the most foundation grants per resident: $6,878 a year, then Massachusetts at $629 | missing: Metro areas |
| P12 | place | partial | Which congressional districts get the most federal grant money for nonprofits? _(needs region_geography)_ | breakdown/federal_awards/by state/all missing:other | New York got the most in federal awards to nonprofits: $27.2B, 12% of the total, FY2022–25 | missing: Congressional districts |
| P13 | place | unanswerable | Do foundation grants reach the places where nonprofits deliver services, not just where they're headquartered? _(needs service_area)_ | none/foundation_grants/all missing:other | Where services are delivered isn't in our IRS data |  |
| P14 | place | partial | Which foundations give the most to Native American communities? _(needs cause_label:native_communities)_ | top_funders/foundation_grants/kw:native american+american indian+alaska native+tribal+indigenous | The Bush Fdn is the largest foundation funder of Native American communities: $83.1M, 2022–24 |  |
| P15 | place | partial | Which states' foundations send the most money to other states? _(needs funder_geography)_ | out_of_state/foundation_grants/all missing:other | 52% of foundation money for all causes in the US came from out-of-state foundations, 2022–24 | missing: Rankings by funder state |
| P16 | place | unanswerable | How much do community foundations give in their home county versus elsewhere? _(needs funder_geography)_ | none/charity_grants/community_foundation/all missing:other | Funder home county versus recipient county isn't in our IRS data |  |
| F01 | funder types | ok | How much do company foundations give to K-12 education? | total/foundation_grants/company/B2 | Company foundations gave $92.4M to K-12 education, 2022–24: 1.0% of their identified grant dollars |  |
| F02 | funder types | ok | Which company foundations give the most to K-12 schools? | top_funders/foundation_grants/company/B2 | Cianbro Charitable Fdn is the largest foundation funder of K-12 schools: $6.0M, 2022–24 |  |
| F03 | funder types | ok | How much do family foundations give in California? | total/foundation_grants/family/all/CA | Family-named foundations gave $5.1B to all causes in California, 2022–24: 17% of all grant dollars |  |
| F04 | funder types | ok | Do big foundations make bigger grants than small ones? | breakdown/foundation_grants/by funder_size/all | Foundations with $1B and up in assets made the largest average foundation grant: $298K, 2022–24 |  |
| F05 | funder types | ok | How much do foundations with over $1 billion in assets give to health? | total/foundation_grants/E | Foundations with $1B and up in assets gave $3.8B to Health, 2022–24: 6.4% of their identified grant dollars |  |
| F07 | funder types | ok | What share of foundation giving comes from the 100 largest foundations? | top_funders/foundation_grants/all | The 100 largest foundations gave 31% of foundation money to US organizations, 2022–24 |  |
| F08 | funder types | ok | What is the average payout rate of private foundations? | share/foundation_finances/all | In 2024 the median private foundation paid out 5.2% of its investment assets, and 55% paid out 5% or more |  |
| F09 | funder types | ok | Do foundations pay out more than the 5% minimum? | share/foundation_finances/all | In 2024 the median private foundation paid out 5.2% of its investment assets, and 55% paid out 5% or more |  |
| F10 | funder types | ok | How much did foundation assets grow from 2022 to 2024? | trend/foundation_finances/all | The median private foundation paid out 5.7% of its investment assets in 2022 and 5.2% in 2024. 71% paid out 5% or more in 2022, 55% in 2024 |  |
| F11 | funder types | partial | How much do corporations give in total, including direct corporate gifts? _(needs corporate_direct)_ | total/foundation_grants/company/all missing:corporate_giving | Company foundations gave $10.8B to all causes, 2022–24: 4.8% of all grant dollars | missing: Corporate giving outside company foundations |
| F12 | funder types | partial | How much do companies give to food banks outside their foundations? _(needs corporate_direct)_ | total/foundation_grants/company/K31 missing:corporate_giving | Company foundations gave $132.6M to food banks, 2022–24: 1.4% of their identified grant dollars | missing: Corporate giving outside company foundations |
| F13 | funder types | unanswerable | How many new private foundations were created each year since 2015? _(needs org_formation, history_pre2022)_ | none/foundation_finances/all missing:other | Foundation formation counts by year aren't in our IRS data |  |
| D01 | DAFs and charities | ok | How much do donor-advised funds give to climate? | total/charity_grants/daf_sponsor/climate | Donor-advised fund sponsors gave $1.8B to climate, 2022–24: 1.6% of identified grant dollars |  |
| D02 | DAFs and charities | ok | What share of donor-advised fund grants goes to religious organizations? | share/charity_grants/daf_sponsor/X | Donor-advised fund sponsors gave $9.6B to Religion, 2022–24: 8.4% of identified grant dollars |  |
| D03 | DAFs and charities | ok | Which causes get the most money from donor-advised funds? | breakdown/charity_grants/by cause/daf_sponsor/all | Education (B) got the most money from DAF sponsors: $26.1B, 23% of the total, 2022–24 |  |
| D04 | DAFs and charities | ok | How concentrated is donor-advised fund giving among the biggest sponsors? | top_funders/charity_grants/daf_sponsor/all | Fidelity Investments Charitable Gift Fund is the largest DAF sponsor funder of all causes: $32.4B, 2022–24 |  |
| D05 | DAFs and charities | ok | What's the typical grant from a community foundation? | grant_size/charity_grants/community_foundation/all | The median community foundation grant to all causes is $18K, the average $93K, 2022–24 |  |
| D06 | DAFs and charities | ok | Do community foundations or DAF sponsors give more to education? | breakdown/charity_grants/by charity_funder/B | Other grantmaking charities gave the most money for education: $47.1B, 60% of the total, 2022–24 |  |
| D07 | DAFs and charities | ok | Which states get the most money from DAF sponsors per resident? | by_state/charity_grants/daf_sponsor/all/per resident | District of Columbia gets the most grants from DAF sponsors per resident: $3,699 a year, then Massachusetts at $326 |  |
| D08 | DAFs and charities | ok | How much do United Ways give to food banks? | total/charity_grants/united_way/K31 | United Ways gave $38.0M to Food banks, 2022–24: 1.0% of identified grant dollars |  |
| D10 | DAFs and charities | unanswerable | How much money flows into donor-advised funds each year? _(needs daf_flows)_ | none/charity_grants/all missing:other | Money flowing into DAFs aren't in our IRS data |  |
| D11 | DAFs and charities | unanswerable | What is the payout rate of donor-advised funds? _(needs daf_flows)_ | none/charity_grants/daf_sponsor/all missing:other | Donor-advised fund payout rates aren't in our IRS data |  |
| D12 | DAFs and charities | unanswerable | How much did my Fidelity DAF grant to charities last year? _(needs daf_account_level)_ | none/charity_grants/daf_sponsor/all missing:daf_grants | Grants by individual donor-advised funds aren't in our IRS data |  |
| D13 | DAFs and charities | unanswerable | How much do giving circles give, and to what causes? _(needs giving_circles)_ | none/foundation_grants/all missing:other | Giving circles as a donor type isn't in our IRS data |  |
| D14 | DAFs and charities | ok | How much do grantmaking charities give in total? | total/charity_grants/all | Grantmaking charities gave $496.6B to organizations in the US, 2022–24 |  |
| G01 | federal and government | ok | Which federal agencies gave nonprofits the most in 2024? | top_funders/federal_awards/all | Department of Health and Human Services awarded the most in federal awards to nonprofits: $38.4B, 43% of the total, FY2024 |  |
| G02 | federal and government | ok | Which federal agencies fund the most climate work at nonprofits? | top_funders/federal_awards/climate | Environmental Protection Agency awarded the most in federal awards to nonprofits for climate: $16.1B, 98% of the total, FY2022–25 |  |
| G03 | federal and government | ok | How much federal grant money went to Head Start providers? | total/federal_awards/kw:head start | Federal agencies awarded $24.3B to nonprofits for Head Start, FY2022–25: 9.0% of federal awards to nonprofits there |  |
| G04 | federal and government | ok | What is the median federal award to a nonprofit? | grant_size/federal_awards/all | The median federal award to a nonprofit is about $366K a year, the average $999K, FY2022–25 |  |
| G05 | federal and government | ok | Which Ohio counties get the most federal money for nonprofits per resident? | breakdown/federal_awards/by county/all/OH/per resident | Pike County, OH got the most in federal awards to nonprofits in Ohio per resident: $459 a year, FY2022–25 |  |
| G06 | federal and government | ok | Which federal programs fund the most nonprofit work in rural counties? | breakdown/federal_awards/by program/all | Head Start (93.600) got the most in federal awards to nonprofits in rural counties of the US: $4.6B, 46% of the total, FY2022–25 |  |
| G08 | federal and government | partial | How does federal grant money to nonprofits compare with foundation grants? _(needs cross_source_compare)_ | total/federal_awards/all missing:other | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | missing: Side-by-side with foundation grants |
| G09 | federal and government | partial | How much do state and local governments give to nonprofits, separate from federal money? _(needs state_local_gov)_ | total/government_grants/all missing:other | Nonprofits in the US reported $321.8B in government grants for 2024 | missing: State and local government grants alone |
| G10 | federal and government | ok | How many human services nonprofits in Kentucky rely on government grants? | count_orgs/government_grants/P/KY | 78 of 434 Human services organizations in Kentucky with recent filings got half or more of revenue from government grants (18%) |  |
| G11 | federal and government | ok | How dependent are human services nonprofits on government money? | count_orgs/revenue/P | 6,469 of 35,898 human services organizations in the US with recent filings got half or more of revenue from government grants (18%) |  |
| G12 | federal and government | partial | How much federal contract money goes to nonprofits? _(needs federal_beyond_grants)_ | total/federal_awards/all missing:federal_awards | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | missing: Federal money beyond nonprofits |
| G13 | federal and government | partial | How much federal research money goes to public universities? _(needs federal_beyond_grants)_ | total/federal_awards/all missing:federal_awards | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | missing: Federal money beyond nonprofits |
| G14 | federal and government | ok | How much government money has gone to climate change? | total/government_grants/climate | Climate organizations reported $1.3B in government grants for 2024 |  |
| G15 | federal and government | ok | What share of nonprofit revenue comes from government grants? | share/government_grants/all | Nonprofits in the US reported $321.8B in government grants for 2024 |  |
| E01 | equity and need | ok | Do low-income counties get less foundation money per resident than wealthy ones? | breakdown/foundation_grants/by county_income/all/per resident | Counties with median income $90K and up get $342 per resident a year in foundation money, vs $61.84 in counties with median income under $55K, 2022–24 |  |
| E02 | equity and need | partial | Do high-poverty counties get less foundation money per resident? | breakdown/foundation_grants/by county_poverty/all/per resident | Counties with 20% or more in poverty get $144 per resident a year in foundation money, vs $159 in counties with under 10% in poverty, 2022–24. Counts one year, not 10 in a row | missing: 10 years in a row |
| E03 | equity and need | ok | Do majority Black or Hispanic counties get less foundation money? | breakdown/foundation_grants/by county_race/all | Counties with a majority people of color get $323 per resident a year in foundation money, vs $100 in counties with under 25% people of color, 2022–24 |  |
| E04 | equity and need | ok | Do high-poverty counties get more federal money per person in poverty? | breakdown/federal_awards/by county_poverty/all/per poor | Counties with 20% or more in poverty get $920 per person in poverty a year in federal awards to nonprofits, vs $1,295 in counties with under 10% in poverty, FY2022–25 |  |
| E05 | equity and need | ok | Which states get the most foundation money per person in poverty? | by_state/foundation_grants/all/per poor | District of Columbia gets the most foundation grants per person in poverty: $47,820 a year, then Massachusetts at $6,556 |  |
| E07 | equity and need | partial | How much foundation money goes to organizations led by people of color? _(needs led_by)_ | total/foundation_grants/kw:people of color+bipoc+communities of color+black-led+latino-led+racial equity missing:other | Foundations gave $327.4M to organizations led by people of color, 2022–24: 0.18% of identified grant dollars | missing: Leadership demographics of recipient organizations |
| E08 | equity and need | partial | How much foundation money goes to women-led nonprofits? _(needs led_by)_ | total/foundation_grants/women_girls missing:other | Foundations gave $3.1B to women-led nonprofits, 2022–24: 1.7% of identified grant dollars | missing: Nonprofits led by women |
| E09 | equity and need | partial | What share of foundation grants benefit low-income people? _(needs population_served)_ | share/foundation_grants/kw:low-income+poverty+economically disadvantaged missing:other | Foundations gave $14.0B to low-income people, 2022–24: 7.6% of identified grant dollars | missing: Who grants serve (low-income people) |
| E10 | equity and need | ok | How much foundation money do small nonprofits under $1M get? | total/foundation_grants/all | Foundations gave $12.4B to organizations with under $1M in revenue, 2022–24: 6.7% of identified grant dollars |  |
| E11 | equity and need | ok | How much foundation money goes to small vs large nonprofits? | breakdown/foundation_grants/by recipient_size/all | Organizations with $100M and up in revenue got the most foundation money: $70.1B, 38% of the total, 2022–24 |  |
| R01 | grant practice | ok | What is the median grant size for arts organizations? | grant_size/foundation_grants/A | The median foundation grant to Arts organizations is $5K, the average $46K, 2022–24 |  |
| R02 | grant practice | ok | What share of foundation grants are general operating support? | general_support/foundation_grants/all | 30% of foundation dollars to all causes were general operating support, 2022–24 |  |
| R03 | grant practice | ok | What share of foundation grants in Texas are general operating support? | general_support/foundation_grants/all/TX | 29% of foundation dollars to all causes were general operating support, 2022–24 |  |
| R05 | grant practice | unanswerable | What share of foundation grants are multi-year commitments? _(needs multi_year)_ | none/foundation_grants/all missing:other | Multi-year grants aren't in our IRS data |  |
| R06 | grant practice | ok | What share of foundation money goes to the largest 1% of nonprofits by revenue? | concentration/foundation_grants/by recipient_size/all | The largest 1% of nonprofits by revenue got 53% of foundation money, 2022–24 |  |
| R07 | grant practice | ok | How concentrated is foundation money for women and girls? | concentration/foundation_grants/women_girls | The top 1% of recipients got 40% of foundation money for Women and girls, 2022–24 |  |
| R08 | grant practice | unanswerable | What share of foundation grants are under $10,000? _(needs size_distribution)_ | none/foundation_grants/all missing:other | Grants under a dollar size isn't in our IRS data |  |
| R09 | grant practice | ok | Average foundation grant to hospitals by state | breakdown/foundation_grants/by state/E2 | Delaware got the largest average foundation grant for Hospitals: $323K, 2022–24 |  |
| R10 | grant practice | unanswerable | How many foundations accept unsolicited applications? _(needs funder_practices)_ | none/foundation_grants/all missing:other | Foundation application policies aren't in our IRS data |  |
| R11 | grant practice | unanswerable | How much foundation money goes to capacity building versus program support? _(needs grant_purpose)_ | none/foundation_grants/all missing:other | Grant purpose (capacity building, program, capital) isn't in our IRS data |  |
| R12 | grant practice | unanswerable | How long do foundations keep funding the same grantee? _(needs grant_relationships, history_pre2022)_ | none/foundation_grants/all missing:other | Grant relationships over time isn't in our IRS data |  |
| R13 | grant practice | ok | What share of nonprofit revenue do the largest 1% of nonprofits take in? | concentration/revenue/all | The largest 1% of nonprofits took in 87% of all revenue reported for 2024 |  |
| N01 | nonprofit finances | ok | How many food banks are running deficits? | count_orgs/revenue/K31 | 507 of 1,958 food banks in the US with recent filings ran a deficit (26%) |  |
| N02 | nonprofit finances | ok | How many nonprofits in Mississippi have less than three months of cash? | count_orgs/foundation_grants/all/MS | 1,091 of 3,643 nonprofits in Mississippi with recent filings had under 3 months of cash (30%) |  |
| N03 | nonprofit finances | ok | How many animal shelters in Ohio run deficits? | count_orgs/foundation_grants/D20/OH | 137 of 334 animal shelters in Ohio with recent filings ran a deficit (41%) |  |
| N04 | nonprofit finances | ok | How many nonprofits ran deficits two years in a row? | count_orgs/revenue/all | 61,634 of 309,002 nonprofits in the US with recent filings ran deficits 2 years in a row (20%) |  |
| N05 | nonprofit finances | partial | How has total nonprofit revenue changed since 2015? _(needs history_pre2022, finances_panel)_ | trend/revenue/all | Revenue to all causes rose 8.4% (5.3% after inflation) from 2023 to 2024 (same 137,292 orgs). Our data starts in 2023, so 2015–2022 isn't included | missing: Years before 2023 |
| N06 | nonprofit finances | ok | What share of all nonprofit revenue goes to hospitals? | share/revenue/E2 | Hospitals reported $1.37T in revenue for 2024 |  |
| N07 | nonprofit finances | ok | What is the total revenue of museums in New York? | total/revenue/A5/NY | Museums in New York reported $2.7B in revenue for 2024 |  |
| N08 | nonprofit finances | ok | What share of contributions go to religious organizations? | share/contributions/X | Religion organizations reported $18.9B in contributions for 2024 |  |
| N10 | nonprofit finances | unanswerable | How many people do nonprofits employ in Indiana? _(needs staff_volunteers)_ | none/revenue/all/IN missing:other | Nonprofit employment and workforce counts aren't in our IRS data |  |
| N11 | nonprofit finances | unanswerable | What are typical overhead rates for human services nonprofits? _(needs expense_detail)_ | none/foundation_grants/P missing:other | Overhead rates aren't in our IRS data |  |
| N12 | nonprofit finances | unanswerable | Which kinds of nonprofits depend most on donations versus earned revenue? _(needs revenue_mix)_ | none/revenue/all missing:other | Earned revenue versus donations mix by nonprofit type isn't in our IRS data |  |
| N13 | nonprofit finances | unanswerable | How much do food bank CEOs earn on average? _(needs compensation)_ | none/foundation_grants/K31 missing:other | Executive pay isn't in our IRS data |  |
| H01 | household and total giving | partial | How much do individuals give to churches each year? _(needs household_giving)_ | trend/foundation_grants/X missing:individual_giving | Foundation money for religion grew 55% (28% after inflation) from 2020 to 2024 | missing: Individual giving by cause or donor |
| H02 | household and total giving | partial | How much do individuals donate to food banks? _(needs household_giving)_ | total/foundation_grants/K31 missing:individual_giving | Foundations gave $889.8M to Food banks, 2022–24: 0.48% of identified grant dollars | missing: Individual giving by cause or donor |
| H03 | household and total giving | partial | What share of US households give to charity? _(needs household_giving)_ | share/household_giving/all missing:individual_giving | Itemizers in the US deducted 1.4% of all income (AGI) for charitable gifts in 2023: $205.8B | missing: Individual giving by cause or donor |
| H04 | household and total giving | partial | How has the share of households that give changed since 2000? _(needs household_giving, history_pre2022)_ | trend/household_giving/all missing:individual_giving | Charitable deductions in the US rose 6.6% (down 19% after inflation) from 2013 to 2023, as itemizers went from 44.5M to 14.9M after the 2017 tax law. Our data starts in 2013, so 2000–2012 isn't included | missing: Individual giving by cause or donor, Years before 2013 |
| H05 | household and total giving | ok | How much do itemizers deduct for charitable gifts in each state? | by_state/household_giving/all | California had the highest charitable deductions: $33.5B, 16% of the total, 2023 | headline california $33.5B vs SQL CA $33.5B (2023) |
| H06 | household and total giving | ok | Do high-income households give a larger share of income than low-income households? | breakdown/household_giving/by income/all | Returns with $200K and up in AGI gave the largest share of income in charitable deductions: 2.2%, 2023. Lowest: $1 to $10K, 0.16% |  |
| H07 | household and total giving | partial | How much do Americans leave to charity in bequests? _(needs household_giving)_ | total/household_giving/all missing:individual_giving | Itemizers in the US deducted $205.8B in charitable gifts in 2023, on 7.3% of tax returns | missing: Individual giving by cause or donor |
| H08 | household and total giving | partial | How much is total US charitable giving each year from all sources? _(needs household_giving, external_benchmarks)_ | trend/foundation_grants/all missing:individual_giving,corporate_giving,foreign_giving,other | Foundation money to organizations in the US grew 32% (8.7% after inflation) from 2020 to 2024 | missing: Individual giving by cause or donor, Corporate giving outside company foundations, Money to other countries, Total giving from all sources combined |
| H09 | household and total giving | unanswerable | How much do people give through crowdfunding like GoFundMe? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving by cause or donor isn't in our IRS data |  |
| H10 | household and total giving | unanswerable | How many people volunteer at nonprofits in Texas? _(needs staff_volunteers)_ | none/foundation_grants/all/TX missing:volunteering | Volunteering isn't in our IRS data |  |
| H11 | household and total giving | unanswerable | Do women give more to charity than men? _(needs household_giving)_ | none/household_giving/all missing:individual_giving | Individual giving by cause or donor isn't in our IRS data |  |
| H12 | household and total giving | partial | What share of total giving comes from foundations versus individuals, bequests and corporations? _(needs household_giving, external_benchmarks)_ | share/foundation_grants/all missing:individual_giving,corporate_giving | Foundations gave $223.2B to organizations in the US, 2022–24 | missing: Individual giving by cause or donor, Corporate giving outside company foundations |
| K01 | track record and people | unanswerable | Which animal welfare nonprofits are the newest versus the longest established? _(needs org_age)_ | none/foundation_grants/D missing:other | Organization age isn't in our IRS data |  |
| K02 | track record and people | unanswerable | Do older nonprofits get more foundation money than newer ones? _(needs org_age)_ | none/foundation_grants/all missing:other | Organization age isn't in our IRS data |  |
| K03 | track record and people | unanswerable | Which board members sit on the most climate nonprofit boards? _(needs boards_people)_ | none/foundation_grants/climate missing:other | Board members aren't in our IRS data |  |
| K04 | track record and people | unanswerable | How many foundations share board members with the nonprofits they fund? _(needs boards_people)_ | none/foundation_grants/all missing:other | Board members shared with grantees isn't in our IRS data |  |
| K05 | track record and people | unanswerable | How many new nonprofits registered with the IRS in 2024? _(needs org_formation)_ | none/revenue/all missing:other | Organization age isn't in our IRS data |  |
| K06 | track record and people | unanswerable | Which food security nonprofits got foundation grants every year from 2022 to 2024? _(needs grant_relationships)_ | none/foundation_grants/K missing:other | Grant relationships over time isn't in our IRS data |  |
| X01 | benchmarks and context | partial | How does our foundation giving total compare with Giving USA's estimate for foundations? _(needs external_benchmarks)_ | total/foundation_grants/all missing:other | Foundations gave $223.2B to organizations in the US, 2022–24 | missing: Giving USA estimates for comparison |
| X02 | benchmarks and context | unanswerable | What share of GDP goes to charitable giving? _(needs external_benchmarks, household_giving)_ | none/foundation_grants/all missing:other | National GDP comparison isn't in our IRS data |  |
| X03 | benchmarks and context | partial | Will foundation giving to climate rise next year? _(needs forecast)_ | trend/foundation_grants/climate missing:forecast | Foundation money for climate grew 97% (62% after inflation) from 2020 to 2024 | missing: Forecasts |
| X04 | benchmarks and context | partial | How does US foundation giving to climate compare with global climate philanthropy? _(needs external_benchmarks, international)_ | total/foundation_grants/climate missing:foreign_giving | Foundations gave $2.3B to climate, 2022–24: 1.3% of identified grant dollars | missing: Money to other countries |
| X06 | benchmarks and context | ok | Why does DC get so much foundation money per resident? | by_state/foundation_grants/all/per resident | District of Columbia gets the most foundation grants per resident: $6,878 a year, then Massachusetts at $629 |  |
