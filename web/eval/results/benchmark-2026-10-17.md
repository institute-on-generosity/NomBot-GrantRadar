# Research benchmark, 2026-10-17

150 researcher questions (eval/benchmark-questions.json) end to end: router (lib/answerRoute) -> answer (lib/answer). Wall time 213 s.

**Pass rate: 73/150 (49%)** fully answered. Answerable today: 73/74 (99%). Questions that need a missing capability: 76, of which the engine was honest (partial or unanswerable) on 53 and misleading on 13.

| | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|
| all (150) | 73 | 24 | 30 | 10 | 13 |
| answerable today (74) | 73 | 1 | 0 | 0 | 0 |
| need a missing capability (76) | 0 | 23 | 30 | 10 | 13 |

## Pass rate by category

| Category | Pass | ok | partial | unanswerable | wrong route | misleading |
|---|---:|---:|---:|---:|---:|---:|
| trends | 10/17 (59%) | 10 | 3 | 1 | 0 | 3 |
| causes | 11/23 (48%) | 11 | 10 | 1 | 0 | 1 |
| place | 7/14 (50%) | 7 | 1 | 3 | 1 | 2 |
| funder types | 5/12 (42%) | 5 | 2 | 2 | 2 | 1 |
| DAFs and charities | 9/13 (69%) | 9 | 1 | 2 | 1 | 0 |
| federal and government | 10/14 (71%) | 10 | 2 | 0 | 0 | 2 |
| equity and need | 7/10 (70%) | 7 | 1 | 1 | 0 | 1 |
| grant practice | 7/12 (58%) | 7 | 0 | 3 | 1 | 1 |
| nonprofit finances | 6/12 (50%) | 6 | 0 | 2 | 2 | 2 |
| household and total giving | 0/12 (0%) | 0 | 2 | 10 | 0 | 0 |
| track record and people | 0/6 (0%) | 0 | 0 | 3 | 3 | 0 |
| benchmarks and context | 1/5 (20%) | 1 | 2 | 2 | 0 | 0 |

## Missing capabilities, by questions blocked

Questions not fully answered, counted under each capability they need (a question can need several). `cause_label:*` rows are also summed as **cause labels (any)**.

| # | Capability | Questions blocked | Engine honest | Misleading | Examples |
|---:|---|---:|---:|---:|---|
| 1 | household_giving | 14 | 14 | 0 | C16 How much US philanthropy goes to climate change?<br>C17 How much US philanthropy goes to women and girls? |
| 2 | cause labels (any) | 10 | 10 | 0 | T14 Did foundation giving to racial justice spike after 2020 and then fall back?<br>C18 How much foundation money goes to racial equity and racial justice work? |
| 3 | history_pre2022 | 9 | 5 | 3 | T12 How has foundation giving changed over the last 10 years?<br>T13 How did foundation giving to health change from 2015 to 2024? |
| 4 | external_benchmarks | 5 | 5 | 0 | H08 How much is total US charitable giving each year from all sources?<br>H12 What share of total giving comes from foundations versus individuals, bequests and corporations? |
| 5 | foundation_finances | 3 | 1 | 0 | F08 What is the average payout rate of private foundations?<br>F09 Do foundations pay out more than the 5% minimum? |
| 6 | region_geography | 3 | 2 | 1 | P10 How much foundation money goes to Appalachia?<br>P11 Which metro areas get the most foundation money per resident? |
| 7 | boards_people | 2 | 1 | 0 | K03 Which board members sit on the most climate nonprofit boards?<br>K04 How many foundations share board members with the nonprofits they fund? |
| 8 | cause_label:racial_equity | 2 | 2 | 0 | T14 Did foundation giving to racial justice spike after 2020 and then fall back?<br>C18 How much foundation money goes to racial equity and racial justice work? |
| 9 | corporate_direct | 2 | 2 | 0 | F11 How much do corporations give in total, including direct corporate gifts?<br>F12 How much do companies give to food banks outside their foundations? |
| 10 | daf_flows | 2 | 1 | 0 | D10 How much money flows into donor-advised funds each year?<br>D11 What is the payout rate of donor-advised funds? |
| 11 | federal_beyond_grants | 2 | 2 | 0 | G12 How much federal contract money goes to nonprofits?<br>G13 How much federal research money goes to public universities? |
| 12 | finances_panel | 2 | 0 | 2 | N04 How many nonprofits ran deficits two years in a row?<br>N05 How has total nonprofit revenue changed since 2015? |
| 13 | funder_geography | 2 | 1 | 1 | P15 Which states' foundations send the most money to other states?<br>P16 How much do community foundations give in their home county versus elsewhere? |
| 14 | grant_relationships | 2 | 0 | 0 | R12 How long do foundations keep funding the same grantee?<br>K06 Which food security nonprofits got foundation grants every year from 2022 to 2024? |
| 15 | international | 2 | 2 | 0 | C27 How much US foundation money goes to global health programs abroad?<br>X04 How does US foundation giving to climate compare with global climate philanthropy? |
| 16 | led_by | 2 | 2 | 0 | E07 How much foundation money goes to organizations led by people of color?<br>E08 How much foundation money goes to women-led nonprofits? |
| 17 | org_age | 2 | 1 | 0 | K01 Which animal welfare nonprofits are the newest versus the longest established?<br>K02 Do older nonprofits get more foundation money than newer ones? |
| 18 | org_formation | 2 | 2 | 0 | F13 How many new private foundations were created each year since 2015?<br>K05 How many new nonprofits registered with the IRS in 2024? |
| 19 | staff_volunteers | 2 | 2 | 0 | N10 How many people do nonprofits employ in Indiana?<br>H10 How many people volunteer at nonprofits in Texas? |
| 20 | cause_label:animal_subcauses | 1 | 1 | 0 | C25 How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster? |
| 21 | cause_label:democracy | 1 | 1 | 0 | C22 How much foundation money goes to democracy and voting rights? |
| 22 | cause_label:disability | 1 | 1 | 0 | C20 How much foundation money supports people with disabilities? |
| 23 | cause_label:immigrants | 1 | 1 | 0 | C21 How much foundation money supports immigrants and refugees? |
| 24 | cause_label:journalism | 1 | 1 | 0 | C23 How much foundation money goes to local journalism? |
| 25 | cause_label:lgbtq | 1 | 1 | 0 | C19 How much foundation money goes to LGBTQ organizations? |
| 26 | cause_label:native_communities | 1 | 1 | 0 | P14 Which foundations give the most to Native American communities? |
| 27 | cause_label:opioids | 1 | 1 | 0 | C24 Where does foundation money for opioid addiction go? |
| 28 | compensation | 1 | 0 | 0 | N13 How much do food bank CEOs earn on average? |
| 29 | cross_source_compare | 1 | 0 | 1 | G08 How does federal grant money to nonprofits compare with foundation grants? |
| 30 | daf_account_level | 1 | 1 | 0 | D12 How much did my Fidelity DAF grant to charities last year? |
| 31 | engine (answerable, partial) | 1 | 1 | 0 | T17 In real, inflation-adjusted dollars, is foundation money for food banks growing? |
| 32 | expense_detail | 1 | 0 | 0 | N11 What are typical overhead rates for human services nonprofits? |
| 33 | forecast | 1 | 1 | 0 | X03 Will foundation giving to climate rise next year? |
| 34 | funder_concentration | 1 | 0 | 1 | F07 What share of foundation giving comes from the 100 largest foundations? |
| 35 | funder_practices | 1 | 1 | 0 | R10 How many foundations accept unsolicited applications? |
| 36 | funder_trend | 1 | 0 | 1 | T20 Which foundations increased their grantmaking the most from 2022 to 2024? |
| 37 | funding_gap_ratio | 1 | 0 | 1 | C26 Which causes get the least foundation money relative to how many nonprofits work on them? |
| 38 | giving_circles | 1 | 1 | 0 | D13 How much do giving circles give, and to what causes? |
| 39 | grant_purpose | 1 | 0 | 1 | R11 How much foundation money goes to capacity building versus program support? |
| 40 | multi_year | 1 | 1 | 0 | R05 What share of foundation grants are multi-year commitments? |
| 41 | population_served | 1 | 0 | 1 | E09 What share of foundation grants benefit low-income people? |
| 42 | revenue_mix | 1 | 1 | 0 | N12 Which kinds of nonprofits depend most on donations versus earned revenue? |
| 43 | service_area | 1 | 0 | 0 | P13 Do foundation grants reach the places where nonprofits deliver services, not just where they're headquartered? |
| 44 | size_distribution | 1 | 1 | 0 | R08 What share of foundation grants are under $10,000? |
| 45 | state_local_gov | 1 | 0 | 1 | G09 How much do state and local governments give to nonprofits, separate from federal money? |

## Direct SQL checks

Headline numbers re-computed straight from grant_clean (990-PF grants): 9 pass, 0 fail, 0 skipped.

- **pass** T01 Is total foundation giving growing?: headline 11% vs SQL 11.06% (2022->2024)
- **pass** T02 How has foundation funding for mental health changed since 2022?: headline 23% vs SQL 23.20% (2022->2024)
- **pass** T03 Is foundation funding for food banks growing?: headline 2.2% vs SQL 2.23% (2022->2024)
- **pass** T05 How has foundation giving to education changed since 2022?: headline 13% vs SQL 12.51% (2022->2024)
- **pass** T11 Why did foundation funding for education fall?: headline 13% vs SQL 12.51% (2022->2024)
- **pass** C04 How much foundation money goes to food banks?: headline $883.6M vs SQL $883.6M (0.0% off, 2022-2024)
- **pass** C05 How much foundation money goes to mental health?: headline $1500.0M vs SQL $1468.3M (2.2% off, 2022-2024)
- **pass** C06 How much foundation money goes to the arts?: headline $15000.0M vs SQL $14975.2M (0.2% off, 2022-2024)
- **pass** P03 Which states get the most foundation money for food banks?: headline illinois $139.2M vs SQL IL $139.2M

## For human review

53 answers: misleading flags (confirm), keyword-counted causes, unverified headlines.

- T02 [ok] How has foundation funding for mental health changed since 2022?
  > Foundation money for mental health grew 23% (15% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T03 [ok] Is foundation funding for food banks growing?
  > Foundation money for food banks grew 2.2% (down 4.6% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T05 [ok] How has foundation giving to education changed since 2022?
  > Foundation money for education grew 13% (5.0% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T11 [ok] Why did foundation funding for education fall?
  > Foundation money for education didn't fall. The total grew 13% from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T13 [misleading] How did foundation giving to health change from 2015 to 2024?
  > Foundation money for health grew 19% (11% after inflation) from 2022 to 2024
  - answered as if complete; no note that history_pre2022 is missing
- T14 [partial] Did foundation giving to racial justice spike after 2020 and then fall back?
  > Foundation money for racial justice grew 3.9% (down 3.0% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T17 [partial] In real, inflation-adjusted dollars, is foundation money for food banks growing?
  > Foundation money for food banks grew 2.2% (down 4.6% after inflation) from 2022 to 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- T18 [misleading] How has federal funding to nonprofits changed since 2015?
  > Federal awards to nonprofits grew 7.2% (down 3.7% after inflation) from FY2022 to FY2025
  - answered as if complete; no note that history_pre2022 is missing
- T20 [misleading] Which foundations increased their grantmaking the most from 2022 to 2024?
  > Gates Fdn is the largest foundation funder of all causes: $9.7B, 2022–24
  - answered as if complete; no note that funder_trend is missing
- C02 [ok] Within animal welfare, how is foundation money split across sub-causes?
  > Animal Protection & Welfare (D20) got the most foundation money for Animal welfare: $995.1M, 41% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C03 [ok] Which parts of education get the least foundation money?
  > Education (B0) got the least foundation money for education: $200, 0.00% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C04 [ok] How much foundation money goes to food banks?
  > Foundations gave $883.6M to food banks, 2022–24: 0.48% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C05 [ok] How much foundation money goes to mental health?
  > Foundations gave $1.5B to mental health, 2022–24: 0.81% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C06 [ok] How much foundation money goes to the arts?
  > Foundations gave $15.0B to arts, 2022–24: 8.2% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C09 [ok] What share of foundation money goes to religious organizations?
  > Foundations gave $3.4B to religion, 2022–24: 1.9% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C18 [partial] How much foundation money goes to racial equity and racial justice work?
  > Foundations gave $324.3M to racial equity and racial justice, 2022–24: 0.18% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C19 [partial] How much foundation money goes to LGBTQ organizations?
  > Foundations gave $124.4M to LGBTQ organizations, 2022–24: 0.07% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C20 [partial] How much foundation money supports people with disabilities?
  > Foundations gave $406.0M to people with disabilities, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C21 [partial] How much foundation money supports immigrants and refugees?
  > Foundations gave $402.8M to immigrants and refugees, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C22 [partial] How much foundation money goes to democracy and voting rights?
  > Foundations gave $406.5M to democracy and voting rights, 2022–24: 0.22% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C23 [partial] How much foundation money goes to local journalism?
  > Foundations gave $1.3B to local journalism, 2022–24: 0.74% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C24 [partial] Where does foundation money for opioid addiction go?
  > California gets the most foundation grants to opioid addiction: $40.4M
  - cause counted by keywords, not a graded label: check what the set catches
- C25 [partial] How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster?
  > Pet rescue and foster got 24x the foundation dollars of Animal rights and anti-cruelty advocacy, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- C26 [misleading] Which causes get the least foundation money relative to how many nonprofits work on them?
  > 0 (0) got the least foundation money: $25K, 0.00% of the total, 2022–24
  - answered as if complete; no note that funding_gap_ratio is missing
- P03 [ok] Which states get the most foundation money for food banks?
  > Illinois gets the most foundation grants to food banks: $139.2M
  - cause counted by NTEE codes, not a graded label: check what the set catches
- P10 [misleading] How much foundation money goes to Appalachia?
  > Foundations gave $77.7B to organizations in 13 states, 2022–24
  - answered as if complete; no note that region_geography is missing
- P14 [partial] Which foundations give the most to Native American communities?
  > The Bush Fdn is the largest foundation funder of Native American communities: $83.1M, 2022–24
  - cause counted by keywords, not a graded label: check what the set catches
- P15 [misleading] Which states' foundations send the most money to other states?
  > 52% of foundation money for all causes in the US came from out-of-state foundations, 2022–24
  - answered as if complete; no note that funder_geography is missing
- F01 [ok] How much do company foundations give to K-12 education?
  > Company foundations gave $91.7M to K-12 education, 2022–24: 1.0% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F02 [ok] Which company foundations give the most to K-12 schools?
  > Cianbro Charitable Fdn is the largest foundation funder of K-12 schools: $6.0M, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F05 [ok] How much do foundations with over $1 billion in assets give to health?
  > Foundations with $1B and up in assets gave $3.8B to health, 2022–24: 6.4% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- F07 [misleading] What share of foundation giving comes from the 100 largest foundations?
  > Gates Fdn is the largest foundation funder of all causes: $9.7B, 2022–24
  - answered as if complete; no note that funder_concentration is missing
- F12 [partial] How much do companies give to food banks outside their foundations?
  > Company foundations gave $131.9M to food banks, 2022–24: 1.4% of their identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D02 [ok] What share of donor-advised fund grants goes to religious organizations?
  > Donor-advised fund sponsors gave $9.6B to religion, 2022–24: 8.5% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D06 [ok] Do community foundations or DAF sponsors give more to education?
  > Other grantmaking charities gave the most money for education: $47.2B, 60% of the total, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- D08 [ok] How much do United Ways give to food banks?
  > United Ways gave $38.0M to food banks, 2022–24: 1.0% of identified grant dollars
  - cause counted by NTEE codes, not a graded label: check what the set catches
- G03 [ok] How much federal grant money went to Head Start providers?
  > Federal agencies awarded $24.3B to nonprofits for Head Start, FY2022–25: 9.0% of federal awards to nonprofits there
  - cause counted by keywords, not a graded label: check what the set catches
- G08 [misleading] How does federal grant money to nonprofits compare with foundation grants?
  > Federal agencies awarded $272.0B to nonprofits, FY2022–25
  - answered as if complete; no note that cross_source_compare is missing
- G09 [misleading] How much do state and local governments give to nonprofits, separate from federal money?
  > Nonprofits in the US reported $321.8B in government grants for 2024
  - answered as if complete; no note that state_local_gov is missing
- G10 [ok] How many human services nonprofits in Kentucky rely on government grants?
  > 78 of 434 human services organizations in Kentucky with recent filings got half or more of revenue from government grants (18%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- G11 [ok] How dependent are human services nonprofits on government money?
  > 6,469 of 35,898 human services organizations in the US with recent filings got half or more of revenue from government grants (18%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- E09 [misleading] What share of foundation grants benefit low-income people?
  > Foundations gave $17.1B to low-income people, 2022–24: 9.4% of identified grant dollars
  - answered as if complete; no note that population_served is missing
- R01 [ok] What is the median grant size for arts organizations?
  > The median foundation grant to arts is $5K, the average $47K, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- R09 [ok] Average foundation grant to hospitals by state
  > Delaware got the largest average foundation grant for hospitals: $340K, 2022–24
  - cause counted by NTEE codes, not a graded label: check what the set catches
- R11 [misleading] How much foundation money goes to capacity building versus program support?
  > Program support got 3.5x the foundation dollars of capacity building, 2022–24
  - answered as if complete; no note that grant_purpose is missing
- N01 [ok] How many food banks are running deficits?
  > 507 of 1,958 food banks in the US with recent filings ran a deficit (26%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N03 [ok] How many animal shelters in Ohio run deficits?
  > 137 of 334 animal shelters in Ohio with recent filings ran a deficit (41%)
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N04 [misleading] How many nonprofits ran deficits two years in a row?
  > 217,035 of 572,826 nonprofits in the US with recent filings ran a deficit (38%)
  - answered as if complete; no note that finances_panel is missing
- N05 [misleading] How has total nonprofit revenue changed since 2015?
  > Revenue to all causes rose 8.4% (5.3% after inflation) from 2023 to 2024 (same 137,292 orgs)
  - answered as if complete; no note that history_pre2022, finances_panel is missing
- N06 [ok] What share of all nonprofit revenue goes to hospitals?
  > Hospitals reported $1.37T in revenue for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N07 [ok] What is the total revenue of museums in New York?
  > Museums in New York reported $2.7B in revenue for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- N08 [ok] What share of contributions go to religious organizations?
  > Religion organizations reported $18.9B in contributions for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches
- H02 [partial] How much do individuals donate to food banks?
  > Food banks reported $15.1B in contributions for 2024
  - cause counted by NTEE codes, not a graded label: check what the set catches

## Cost and latency

- **Router calls:** 142 (app API key, prompt-cached). Input 807,968 tokens (804,572 cache reads, 0 cache writes, 3,396 uncached), output 27,377.
- **Answers:** SQL only, no model calls. No LLM judge.
- **Latency per question** (route + answer, 4 in parallel): p50 2.1 s, p90 5.2 s.

## All questions

| ID | Category | Status | Question | Route | Headline | Notes |
|---|---|---|---|---|---|---|
| T01 | trends | ok | Is total foundation giving growing? | trend/foundation_grants/all | Foundation money to organizations in the US grew 11% (3.6% after inflation) from 2022 to 2024 | headline 11% vs SQL 11.06% (2022->2024) |
| T02 | trends | ok | How has foundation funding for mental health changed since 2022? | trend/foundation_grants/F | Foundation money for mental health grew 23% (15% after inflation) from 2022 to 2024 | headline 23% vs SQL 23.20% (2022->2024) |
| T03 | trends | ok | Is foundation funding for food banks growing? | trend/foundation_grants/K31 | Foundation money for food banks grew 2.2% (down 4.6% after inflation) from 2022 to 2024 | headline 2.2% vs SQL 2.23% (2022->2024) |
| T04 | trends | ok | Which causes grew fastest in foundation funding from 2022 to 2024? | fastest_causes/foundation_grants/all | Recreation & Sports grew fastest: +44% in foundation grants, 2022 to 2024 |  |
| T05 | trends | ok | How has foundation giving to education changed since 2022? | trend/foundation_grants/B | Foundation money for education grew 13% (5.0% after inflation) from 2022 to 2024 | headline 13% vs SQL 12.51% (2022->2024) |
| T06 | trends | ok | Is federal grant money to nonprofits growing? | trend/federal_awards/all | Federal awards to nonprofits grew 7.2% (down 3.7% after inflation) from FY2022 to FY2025 |  |
| T08 | trends | ok | Did donor-advised fund grants grow between 2022 and 2024? | trend/charity_grants/daf_sponsor/all | Money from DAF sponsors to organizations in the US grew 38% (28% after inflation) from 2022 to 2024 |  |
| T09 | trends | ok | Is foundation money for climate growing? | trend/foundation_grants/climate | Foundation money for climate grew 9.0% (1.7% after inflation) from 2022 to 2024 |  |
| T11 | trends | ok | Why did foundation funding for education fall? | trend/foundation_grants/B | Foundation money for education didn't fall. The total grew 13% from 2022 to 2024 | headline 13% vs SQL 12.51% (2022->2024) |
| T12 | trends | partial | How has foundation giving changed over the last 10 years? _(needs history_pre2022)_ | trend/foundation_grants/all missing:other | Foundation money to organizations in the US grew 11% (3.6% after inflation) from 2022 to 2024 | missing: Our foundation grant data covers only tax years 2022-2025, so a 10-year trend is not available; we can show the trend for 2022 onward. |
| T13 | trends | misleading | How did foundation giving to health change from 2015 to 2024? _(needs history_pre2022)_ | trend/foundation_grants/E | Foundation money for health grew 19% (11% after inflation) from 2022 to 2024 | answered as if complete; no note that history_pre2022 is missing |
| T14 | trends | partial | Did foundation giving to racial justice spike after 2020 and then fall back? _(needs history_pre2022, cause_label:racial_equity)_ | trend/foundation_grants/kw:racial justice+racial equity+racial equality+racism+black lives matter | Foundation money for racial justice grew 3.9% (down 3.0% after inflation) from 2022 to 2024 |  |
| T15 | trends | unanswerable | How did foundation giving respond to the 2008 recession? _(needs history_pre2022)_ | none/foundation_grants/all missing:other | Our grant data covers tax years 2022-2025 only, so 2008 recession-era foundation giving is not available. isn't in our IRS data |  |
| T16 | trends | ok | How much did foundation giving grow after adjusting for inflation from 2022 to 2024? | trend/foundation_grants/all | Foundation money to organizations in the US grew 11% (3.6% after inflation) from 2022 to 2024 |  |
| T17 | trends | partial | In real, inflation-adjusted dollars, is foundation money for food banks growing? | trend/foundation_grants/K31 missing:other | Foundation money for food banks grew 2.2% (down 4.6% after inflation) from 2022 to 2024 | missing: Figures are nominal dollars; we cannot adjust for inflation. |
| T18 | trends | misleading | How has federal funding to nonprofits changed since 2015? _(needs history_pre2022)_ | trend/federal_awards/all | Federal awards to nonprofits grew 7.2% (down 3.7% after inflation) from FY2022 to FY2025 | answered as if complete; no note that history_pre2022 is missing |
| T20 | trends | misleading | Which foundations increased their grantmaking the most from 2022 to 2024? _(needs funder_trend)_ | top_funders/foundation_grants/all | Gates Fdn is the largest foundation funder of all causes: $9.7B, 2022–24 | answered as if complete; no note that funder_trend is missing |
| C01 | causes | ok | Which cause areas get the most foundation money? | breakdown/foundation_grants/by cause/all | Education (B) got the most foundation money: $42.4B, 23% of the total, 2022–24 |  |
| C02 | causes | ok | Within animal welfare, how is foundation money split across sub-causes? | breakdown/foundation_grants/by cause_detail/D | Animal Protection & Welfare (D20) got the most foundation money for Animal welfare: $995.1M, 41% of the total, 2022–24 |  |
| C03 | causes | ok | Which parts of education get the least foundation money? | breakdown/foundation_grants/by cause_detail/B | Education (B0) got the least foundation money for education: $200, 0.00% of the total, 2022–24 |  |
| C04 | causes | ok | How much foundation money goes to food banks? | total/foundation_grants/K31 | Foundations gave $883.6M to food banks, 2022–24: 0.48% of identified grant dollars | headline $883.6M vs SQL $883.6M (0.0% off, 2022-2024) |
| C05 | causes | ok | How much foundation money goes to mental health? | total/foundation_grants/F | Foundations gave $1.5B to mental health, 2022–24: 0.81% of identified grant dollars | headline $1500.0M vs SQL $1468.3M (2.2% off, 2022-2024) |
| C06 | causes | ok | How much foundation money goes to the arts? | total/foundation_grants/A | Foundations gave $15.0B to arts, 2022–24: 8.2% of identified grant dollars | headline $15000.0M vs SQL $14975.2M (0.2% off, 2022-2024) |
| C09 | causes | ok | What share of foundation money goes to religious organizations? | share/foundation_grants/X | Foundations gave $3.4B to religion, 2022–24: 1.9% of identified grant dollars |  |
| C10 | causes | ok | Which foundations give the most to climate? | top_funders/foundation_grants/climate | Sergey Brin Family Fdn is the largest foundation funder of climate: $262.6M, 2022–24 |  |
| C12 | causes | ok | How concentrated is climate funding? | concentration/foundation_grants/climate | The top 1% of recipients got 48% of foundation money for climate, 2022–24 |  |
| C13 | causes | ok | Climate vs women and girls: which gets more foundation money? | compare/foundation_grants/climate,women_girls | Women and girls got 34% more foundation money than climate, 2022–24 |  |
| C15 | causes | ok | How much foundation money goes to women and girls? | total/foundation_grants/women_girls | Foundations gave $3.1B to women and girls, 2022–24: 1.7% of identified grant dollars |  |
| C16 | causes | partial | How much US philanthropy goes to climate change? _(needs household_giving)_ | total/foundation_grants/climate | Foundations gave $2.3B to climate, 2022–24: 1.3% of identified grant dollars |  |
| C17 | causes | partial | How much US philanthropy goes to women and girls? _(needs household_giving)_ | total/foundation_grants/women_girls | Foundations gave $3.1B to women and girls, 2022–24: 1.7% of identified grant dollars |  |
| C18 | causes | partial | How much foundation money goes to racial equity and racial justice work? _(needs cause_label:racial_equity)_ | total/foundation_grants/kw:racial equity+racial justice+racial equality+civil rights | Foundations gave $324.3M to racial equity and racial justice, 2022–24: 0.18% of identified grant dollars |  |
| C19 | causes | partial | How much foundation money goes to LGBTQ organizations? _(needs cause_label:lgbtq)_ | total/foundation_grants/kw:lgbtq+gay+lesbian+transgender+queer | Foundations gave $124.4M to LGBTQ organizations, 2022–24: 0.07% of identified grant dollars |  |
| C20 | causes | partial | How much foundation money supports people with disabilities? _(needs cause_label:disability)_ | total/foundation_grants/kw:disabilities+disability+disabled | Foundations gave $406.0M to people with disabilities, 2022–24: 0.22% of identified grant dollars |  |
| C21 | causes | partial | How much foundation money supports immigrants and refugees? _(needs cause_label:immigrants)_ | total/foundation_grants/kw:immigrant+refugee | Foundations gave $402.8M to immigrants and refugees, 2022–24: 0.22% of identified grant dollars |  |
| C22 | causes | partial | How much foundation money goes to democracy and voting rights? _(needs cause_label:democracy)_ | total/foundation_grants/kw:democracy+voting rights+voter registration+civic engagement+election | Foundations gave $406.5M to democracy and voting rights, 2022–24: 0.22% of identified grant dollars |  |
| C23 | causes | partial | How much foundation money goes to local journalism? _(needs cause_label:journalism)_ | total/foundation_grants/kw:journalism+local news+newsroom+news media+reporting | Foundations gave $1.3B to local journalism, 2022–24: 0.74% of identified grant dollars |  |
| C24 | causes | partial | Where does foundation money for opioid addiction go? _(needs cause_label:opioids)_ | by_state/foundation_grants/kw:opioid | California gets the most foundation grants to opioid addiction: $40.4M |  |
| C25 | causes | partial | How much goes to animal rights and anti-cruelty advocacy versus pet rescue and foster? _(needs cause_label:animal_subcauses)_ | compare/foundation_grants/D02+D05+D12,D20+D60 | Pet rescue and foster got 24x the foundation dollars of Animal rights and anti-cruelty advocacy, 2022–24 |  |
| C26 | causes | misleading | Which causes get the least foundation money relative to how many nonprofits work on them? _(needs funding_gap_ratio)_ | breakdown/foundation_grants/by cause/all | 0 (0) got the least foundation money: $25K, 0.00% of the total, 2022–24 | answered as if complete; no note that funding_gap_ratio is missing |
| C27 | causes | unanswerable | How much US foundation money goes to global health programs abroad? _(needs international)_ | none/foundation_grants/all missing:foreign_giving | Money to other countries aren't in our IRS data |  |
| P01 | place | ok | Which states get the most foundation money per resident? | by_state/foundation_grants/all/per resident | District of Columbia gets the most foundation grants per resident: $6,878 a year, then Massachusetts at $629 |  |
| P02 | place | ok | Which states get the least foundation money per resident? | by_state/foundation_grants/all/per resident | Mississippi gets the least foundation grants per resident: $64.57 a year |  |
| P03 | place | ok | Which states get the most foundation money for food banks? | by_state/foundation_grants/K31 | Illinois gets the most foundation grants to food banks: $139.2M | headline illinois $139.2M vs SQL IL $139.2M |
| P05 | place | ok | Which counties in California get the most foundation money? | breakdown/foundation_grants/by county/all/CA | Los Angeles County, CA got the most foundation money in California: $8.1B, 28% of the total, 2022–24 |  |
| P06 | place | ok | How much of the foundation money in West Virginia comes from out-of-state foundations? | out_of_state/foundation_grants/all/WV | 50% of foundation money for all causes in West Virginia came from out-of-state foundations, 2022–24 |  |
| P07 | place | ok | How much foundation money reaches rural counties in Kentucky and West Virginia? | total/foundation_grants/all/KY,WV | Foundations gave $346.9M to organizations in rural counties of Kentucky, West Virginia, 2022–24 |  |
| P08 | place | ok | Do rural counties get less foundation money per person than urban ones? | by_rurality/foundation_grants/all/per resident | Rural counties get $69.77 per resident a year in foundation grants, 3.1x less than larger counties |  |
| P10 | place | misleading | How much foundation money goes to Appalachia? _(needs region_geography)_ | total/foundation_grants/all/WV,KY,TN,VA,NC,OH,PA,NY,MD,GA,AL,SC,MS | Foundations gave $77.7B to organizations in 13 states, 2022–24 | answered as if complete; no note that region_geography is missing |
| P11 | place | unanswerable | Which metro areas get the most foundation money per resident? _(needs region_geography)_ | none/foundation_grants/all/per resident missing:other | Data is broken out by state, county and rural/urban, not by metro area, so a metro-area ranking is not available. isn't in our IRS data |  |
| P12 | place | unanswerable | Which congressional districts get the most federal grant money for nonprofits? _(needs region_geography)_ | none/federal_awards/all missing:other | Federal awards data is broken down by state and county, not by congressional district. isn't in our IRS data |  |
| P13 | place | wrong route | Do foundation grants reach the places where nonprofits deliver services, not just where they're headquartered? _(needs service_area)_ |  |  | regex screen skipped it (org search); sent to org search |
| P14 | place | partial | Which foundations give the most to Native American communities? _(needs cause_label:native_communities)_ | top_funders/foundation_grants/kw:native american+american indian+tribal+indigenous+alaska native | The Bush Fdn is the largest foundation funder of Native American communities: $83.1M, 2022–24 |  |
| P15 | place | misleading | Which states' foundations send the most money to other states? _(needs funder_geography)_ | out_of_state/foundation_grants/all | 52% of foundation money for all causes in the US came from out-of-state foundations, 2022–24 | answered as if complete; no note that funder_geography is missing |
| P16 | place | unanswerable | How much do community foundations give in their home county versus elsewhere? _(needs funder_geography)_ | none/charity_grants/community_foundation/all missing:other | Our charity grant data has recipient locations but does not identify each community foundation's home county, so we can't split grants into home-county versus elsewhere. isn't in our IRS data |  |
| F01 | funder types | ok | How much do company foundations give to K-12 education? | total/foundation_grants/company/B2 | Company foundations gave $91.7M to K-12 education, 2022–24: 1.0% of their identified grant dollars |  |
| F02 | funder types | ok | Which company foundations give the most to K-12 schools? | top_funders/foundation_grants/company/B2 | Cianbro Charitable Fdn is the largest foundation funder of K-12 schools: $6.0M, 2022–24 |  |
| F03 | funder types | ok | How much do family foundations give in California? | total/foundation_grants/family/all/CA | Family-named foundations gave $5.1B to all causes in California, 2022–24: 17% of all grant dollars |  |
| F04 | funder types | ok | Do big foundations make bigger grants than small ones? | breakdown/foundation_grants/by funder_size/all | Foundations with $1B and up in assets made the largest average foundation grant: $298K, 2022–24 |  |
| F05 | funder types | ok | How much do foundations with over $1 billion in assets give to health? | total/foundation_grants/E | Foundations with $1B and up in assets gave $3.8B to health, 2022–24: 6.4% of their identified grant dollars |  |
| F07 | funder types | misleading | What share of foundation giving comes from the 100 largest foundations? _(needs funder_concentration)_ | top_funders/foundation_grants/all | Gates Fdn is the largest foundation funder of all causes: $9.7B, 2022–24 | answered as if complete; no note that funder_concentration is missing |
| F08 | funder types | wrong route | What is the average payout rate of private foundations? _(needs foundation_finances)_ |  |  | regex screen skipped it (org search); sent to org search |
| F09 | funder types | wrong route | Do foundations pay out more than the 5% minimum? _(needs foundation_finances)_ |  |  | regex screen skipped it (org search); sent to org search |
| F10 | funder types | unanswerable | How much did foundation assets grow from 2022 to 2024? _(needs foundation_finances)_ | none/foundation_grants/all missing:other | We have foundation grants made, not foundation assets or their growth over time (assets are only available as a filter on funder size). isn't in our IRS data |  |
| F11 | funder types | partial | How much do corporations give in total, including direct corporate gifts? _(needs corporate_direct)_ | total/foundation_grants/company/all missing:corporate_giving | Company foundations gave $10.8B to all causes, 2022–24: 4.8% of all grant dollars | missing: Corporate giving outside company foundations |
| F12 | funder types | partial | How much do companies give to food banks outside their foundations? _(needs corporate_direct)_ | total/foundation_grants/company/K31 missing:corporate_giving | Company foundations gave $131.9M to food banks, 2022–24: 1.4% of their identified grant dollars | missing: Corporate giving outside company foundations |
| F13 | funder types | unanswerable | How many new private foundations were created each year since 2015? _(needs org_formation, history_pre2022)_ | none/foundation_grants/all missing:other | We don't have data on when foundations were created or counts of new foundations by year; our data covers grants made by foundations, tax years 2022-2025. isn't in our IRS data |  |
| D01 | DAFs and charities | ok | How much do donor-advised funds give to climate? | total/charity_grants/daf_sponsor/climate | Donor-advised fund sponsors gave $1.8B to climate, 2022–24: 1.6% of identified grant dollars |  |
| D02 | DAFs and charities | ok | What share of donor-advised fund grants goes to religious organizations? | share/charity_grants/daf_sponsor/X | Donor-advised fund sponsors gave $9.6B to religion, 2022–24: 8.5% of identified grant dollars |  |
| D03 | DAFs and charities | ok | Which causes get the most money from donor-advised funds? | breakdown/charity_grants/by cause/daf_sponsor/all | Education (B) got the most money from DAF sponsors: $25.9B, 23% of the total, 2022–24 |  |
| D04 | DAFs and charities | ok | How concentrated is donor-advised fund giving among the biggest sponsors? | top_funders/charity_grants/daf_sponsor/all | Fidelity Investments Charitable Gift Fund is the largest DAF sponsor funder of all causes: $32.4B, 2022–24 |  |
| D05 | DAFs and charities | ok | What's the typical grant from a community foundation? | grant_size/charity_grants/community_foundation/all | The median community foundation grant to all causes is $18K, the average $94K, 2022–24 |  |
| D06 | DAFs and charities | ok | Do community foundations or DAF sponsors give more to education? | breakdown/charity_grants/by charity_funder/B | Other grantmaking charities gave the most money for education: $47.2B, 60% of the total, 2022–24 |  |
| D07 | DAFs and charities | ok | Which states get the most money from DAF sponsors per resident? | by_state/charity_grants/daf_sponsor/all/per resident | District of Columbia gets the most grants from DAF sponsors per resident: $3,702 a year, then Massachusetts at $326 |  |
| D08 | DAFs and charities | ok | How much do United Ways give to food banks? | total/charity_grants/united_way/K31 | United Ways gave $38.0M to food banks, 2022–24: 1.0% of identified grant dollars |  |
| D10 | DAFs and charities | unanswerable | How much money flows into donor-advised funds each year? _(needs daf_flows)_ | none/charity_grants/daf_sponsor/all missing:other | Contributions flowing into donor-advised funds are not in our data; we only have grants that DAF sponsors make out to other organizations (Schedule I). isn't in our IRS data |  |
| D11 | DAFs and charities | wrong route | What is the payout rate of donor-advised funds? _(needs daf_flows)_ |  |  | regex screen skipped it (org search); sent to org search |
| D12 | DAFs and charities | partial | How much did my Fidelity DAF grant to charities last year? _(needs daf_account_level)_ | total/charity_grants/daf_sponsor/all missing:daf_grants | Donor-advised fund sponsors gave $118.6B to organizations in the US, 2022–24 | missing: Grants by individual donor-advised funds |
| D13 | DAFs and charities | unanswerable | How much do giving circles give, and to what causes? _(needs giving_circles)_ | none/foundation_grants/all missing:other | Giving circles are not identified as a distinct funder type in the IRS data; they typically give through donor-advised funds, community foundations or fiscal sponsors, so their grants cannot be separated out. isn't in our IRS data |  |
| D14 | DAFs and charities | ok | How much do grantmaking charities give in total? | total/charity_grants/all | Grantmaking charities gave $496.9B to organizations in the US, 2022–24 |  |
| G01 | federal and government | ok | Which federal agencies gave nonprofits the most in 2024? | top_funders/federal_awards/all | Department of Health and Human Services awarded the most in federal awards to nonprofits: $38.4B, 43% of the total, FY2024 |  |
| G02 | federal and government | ok | Which federal agencies fund the most climate work at nonprofits? | top_funders/federal_awards/climate | Environmental Protection Agency awarded the most in federal awards to nonprofits for climate: $16.1B, 98% of the total, FY2022–25 |  |
| G03 | federal and government | ok | How much federal grant money went to Head Start providers? | total/federal_awards/kw:head start | Federal agencies awarded $24.3B to nonprofits for Head Start, FY2022–25: 9.0% of federal awards to nonprofits there |  |
| G04 | federal and government | ok | What is the median federal award to a nonprofit? | grant_size/federal_awards/all | The median federal award to a nonprofit is about $366K a year, the average $999K, FY2022–25 |  |
| G05 | federal and government | ok | Which Ohio counties get the most federal money for nonprofits per resident? | breakdown/federal_awards/by county/all/OH/per resident | Pike County, OH got the most in federal awards to nonprofits in Ohio per resident: $459 a year, FY2022–25 |  |
| G06 | federal and government | ok | Which federal programs fund the most nonprofit work in rural counties? | breakdown/federal_awards/by program/all | Head Start (93.600) got the most in federal awards to nonprofits in rural counties of the US: $4.6B, 46% of the total, FY2022–25 |  |
| G08 | federal and government | misleading | How does federal grant money to nonprofits compare with foundation grants? _(needs cross_source_compare)_ | compare/federal_awards/all | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | answered as if complete; no note that cross_source_compare is missing |
| G09 | federal and government | misleading | How much do state and local governments give to nonprofits, separate from federal money? _(needs state_local_gov)_ | total/government_grants/all | Nonprofits in the US reported $321.8B in government grants for 2024 | answered as if complete; no note that state_local_gov is missing |
| G10 | federal and government | ok | How many human services nonprofits in Kentucky rely on government grants? | count_orgs/government_grants/P/KY | 78 of 434 human services organizations in Kentucky with recent filings got half or more of revenue from government grants (18%) |  |
| G11 | federal and government | ok | How dependent are human services nonprofits on government money? | count_orgs/government_grants/P | 6,469 of 35,898 human services organizations in the US with recent filings got half or more of revenue from government grants (18%) |  |
| G12 | federal and government | partial | How much federal contract money goes to nonprofits? _(needs federal_beyond_grants)_ | total/federal_awards/all missing:federal_awards | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | missing: Federal money beyond nonprofits |
| G13 | federal and government | partial | How much federal research money goes to public universities? _(needs federal_beyond_grants)_ | total/federal_awards/all missing:federal_awards | Federal agencies awarded $272.0B to nonprofits, FY2022–25 | missing: Federal money beyond nonprofits |
| G14 | federal and government | ok | How much government money has gone to climate change? | total/government_grants/climate | Climate change organizations reported $1.3B in government grants for 2024 |  |
| G15 | federal and government | ok | What share of nonprofit revenue comes from government grants? | share/government_grants/all | Nonprofits in the US reported $321.8B in government grants for 2024 |  |
| E01 | equity and need | ok | Do low-income counties get less foundation money per resident than wealthy ones? | breakdown/foundation_grants/by county_income/all/per resident | Counties with median income $90K and up get $342 per resident a year in foundation money, vs $61.84 in counties with median income under $55K, 2022–24 |  |
| E02 | equity and need | ok | Do high-poverty counties get less foundation money per resident? | breakdown/foundation_grants/by county_poverty/all/per resident | Counties with 20% or more in poverty get $144 per resident a year in foundation money, vs $159 in counties with under 10% in poverty, 2022–24 |  |
| E03 | equity and need | ok | Do majority Black or Hispanic counties get less foundation money? | breakdown/foundation_grants/by county_race/all/per resident | Counties with a majority people of color get $323 per resident a year in foundation money, vs $100 in counties with under 25% people of color, 2022–24 |  |
| E04 | equity and need | ok | Do high-poverty counties get more federal money per person in poverty? | breakdown/federal_awards/by county_poverty/all/per poor | Counties with 20% or more in poverty get $920 per person in poverty a year in federal awards to nonprofits, vs $1,295 in counties with under 10% in poverty, FY2022–25 |  |
| E05 | equity and need | ok | Which states get the most foundation money per person in poverty? | by_state/foundation_grants/all/per poor | District of Columbia gets the most foundation grants per person in poverty: $47,821 a year, then Massachusetts at $6,556 |  |
| E07 | equity and need | unanswerable | How much foundation money goes to organizations led by people of color? _(needs led_by)_ | none/foundation_grants/all missing:other | Our data does not record the race or ethnicity of an organization's leaders, so we cannot identify organizations led by people of color. isn't in our IRS data |  |
| E08 | equity and need | partial | How much foundation money goes to women-led nonprofits? _(needs led_by)_ | total/foundation_grants/women_girls missing:other | Foundations gave $3.1B to women and girls, 2022–24: 1.7% of identified grant dollars | missing: We cannot identify nonprofits by the gender of their leaders; the figure shown is giving to women and girls causes, not women-led organizations. |
| E09 | equity and need | misleading | What share of foundation grants benefit low-income people? _(needs population_served)_ | share/foundation_grants/kw:low-income+low income+poverty+economically disadvantaged+underserved | Foundations gave $17.1B to low-income people, 2022–24: 9.4% of identified grant dollars | answered as if complete; no note that population_served is missing |
| E10 | equity and need | ok | How much foundation money do small nonprofits under $1M get? | total/foundation_grants/all | Foundations gave $12.2B to organizations with under $1M in revenue, 2022–24: 6.7% of identified grant dollars |  |
| E11 | equity and need | ok | How much foundation money goes to small vs large nonprofits? | breakdown/foundation_grants/by recipient_size/all | Organizations with $100M and up in revenue got the most foundation money: $69.7B, 38% of the total, 2022–24 |  |
| R01 | grant practice | ok | What is the median grant size for arts organizations? | grant_size/foundation_grants/A | The median foundation grant to arts is $5K, the average $47K, 2022–24 |  |
| R02 | grant practice | ok | What share of foundation grants are general operating support? | general_support/foundation_grants/all | 30% of foundation dollars to all causes were general operating support, 2022–24 |  |
| R03 | grant practice | ok | What share of foundation grants in Texas are general operating support? | general_support/foundation_grants/all/TX | 29% of foundation dollars to all causes were general operating support, 2022–24 |  |
| R05 | grant practice | unanswerable | What share of foundation grants are multi-year commitments? _(needs multi_year)_ | none/foundation_grants/all missing:other | Our grant data does not indicate whether a grant is a multi-year commitment, so we cannot calculate the share of multi-year grants. isn't in our IRS data |  |
| R06 | grant practice | ok | What share of foundation money goes to the largest 1% of nonprofits by revenue? | concentration/foundation_grants/by recipient_size/all | The largest 1% of nonprofits by revenue got 54% of foundation money, 2022–24 |  |
| R07 | grant practice | ok | How concentrated is foundation money for women and girls? | concentration/foundation_grants/women_girls | The top 1% of recipients got 40% of foundation money for women and girls, 2022–24 |  |
| R08 | grant practice | unanswerable | What share of foundation grants are under $10,000? _(needs size_distribution)_ | none/foundation_grants/all missing:other | We cannot compute the share of grants under a given dollar size, such as under $10,000; we can show average or median grant size but not a distribution by grant amount. isn't in our IRS data |  |
| R09 | grant practice | ok | Average foundation grant to hospitals by state | breakdown/foundation_grants/by state/E2 | Delaware got the largest average foundation grant for hospitals: $340K, 2022–24 |  |
| R10 | grant practice | unanswerable | How many foundations accept unsolicited applications? _(needs funder_practices)_ | none/foundation_grants/all missing:other | Our data does not include whether foundations accept unsolicited applications; that information is not reported in the 990-PF grant data we use. isn't in our IRS data |  |
| R11 | grant practice | misleading | How much foundation money goes to capacity building versus program support? _(needs grant_purpose)_ | compare/foundation_grants/kw:capacity building+organizational capacity+capacity-building,kw:program support+program services+project support | Program support got 3.5x the foundation dollars of capacity building, 2022–24 | answered as if complete; no note that grant_purpose is missing |
| R12 | grant practice | wrong route | How long do foundations keep funding the same grantee? _(needs grant_relationships, history_pre2022)_ |  |  | regex screen skipped it (org search); sent to org search |
| R13 | grant practice | ok | What share of nonprofit revenue do the largest 1% of nonprofits take in? | concentration/revenue/all | The largest 1% of nonprofits took in 87% of all revenue reported for 2024 |  |
| N01 | nonprofit finances | ok | How many food banks are running deficits? | count_orgs/foundation_grants/K31 | 507 of 1,958 food banks in the US with recent filings ran a deficit (26%) |  |
| N02 | nonprofit finances | ok | How many nonprofits in Mississippi have less than three months of cash? | count_orgs/foundation_grants/all/MS | 1,091 of 3,643 nonprofits in Mississippi with recent filings had under 3 months of cash (30%) |  |
| N03 | nonprofit finances | ok | How many animal shelters in Ohio run deficits? | count_orgs/revenue/D20/OH | 137 of 334 animal shelters in Ohio with recent filings ran a deficit (41%) |  |
| N04 | nonprofit finances | misleading | How many nonprofits ran deficits two years in a row? _(needs finances_panel)_ | count_orgs/revenue/all | 217,035 of 572,826 nonprofits in the US with recent filings ran a deficit (38%) | answered as if complete; no note that finances_panel is missing |
| N05 | nonprofit finances | misleading | How has total nonprofit revenue changed since 2015? _(needs history_pre2022, finances_panel)_ | trend/revenue/all | Revenue to all causes rose 8.4% (5.3% after inflation) from 2023 to 2024 (same 137,292 orgs) | answered as if complete; no note that history_pre2022, finances_panel is missing |
| N06 | nonprofit finances | ok | What share of all nonprofit revenue goes to hospitals? | share/revenue/E2 | Hospitals reported $1.37T in revenue for 2024 |  |
| N07 | nonprofit finances | ok | What is the total revenue of museums in New York? | total/revenue/A5/NY | Museums in New York reported $2.7B in revenue for 2024 |  |
| N08 | nonprofit finances | ok | What share of contributions go to religious organizations? | share/contributions/X | Religion organizations reported $18.9B in contributions for 2024 |  |
| N10 | nonprofit finances | unanswerable | How many people do nonprofits employ in Indiana? _(needs staff_volunteers)_ | none/revenue/all/IN missing:other | Employee counts for nonprofits are not available in our data, which covers grants, contributions, revenue, finances and organization counts. isn't in our IRS data |  |
| N11 | nonprofit finances | wrong route | What are typical overhead rates for human services nonprofits? _(needs expense_detail)_ |  |  | regex screen skipped it (org search); sent to org search |
| N12 | nonprofit finances | unanswerable | Which kinds of nonprofits depend most on donations versus earned revenue? _(needs revenue_mix)_ | none/contributions/all missing:other | We have total contributions and total revenue from Form 990, but not a breakdown of earned (program service) revenue versus donations by type of nonprofit. isn't in our IRS data |  |
| N13 | nonprofit finances | wrong route | How much do food bank CEOs earn on average? _(needs compensation)_ |  |  | sent to org search |
| H01 | household and total giving | unanswerable | How much do individuals give to churches each year? _(needs household_giving)_ | none/foundation_grants/X missing:individual_giving | Individual giving isn't in our IRS data |  |
| H02 | household and total giving | partial | How much do individuals donate to food banks? _(needs household_giving)_ | total/contributions/K31 missing:individual_giving | Food banks reported $15.1B in contributions for 2024 | missing: Individual giving |
| H03 | household and total giving | unanswerable | What share of US households give to charity? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H04 | household and total giving | unanswerable | How has the share of households that give changed since 2000? _(needs household_giving, history_pre2022)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H05 | household and total giving | unanswerable | How much do itemizers deduct for charitable gifts in each state? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H06 | household and total giving | unanswerable | Do high-income households give a larger share of income than low-income households? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H07 | household and total giving | unanswerable | How much do Americans leave to charity in bequests? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H08 | household and total giving | unanswerable | How much is total US charitable giving each year from all sources? _(needs household_giving, external_benchmarks)_ | none/foundation_grants/all missing:individual_giving,corporate_giving,other | Individual giving and Corporate giving outside company foundations and Total US charitable giving from all sources (individuals, bequests, corporations, foundations) is not covered; we only have foundation grants, public charity grants, and nonprofit-reported contributions, not a complete all-source total. aren't in our IRS data |  |
| H09 | household and total giving | unanswerable | How much do people give through crowdfunding like GoFundMe? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H10 | household and total giving | unanswerable | How many people volunteer at nonprofits in Texas? _(needs staff_volunteers)_ | none/foundation_grants/all/TX missing:volunteering | Volunteering isn't in our IRS data |  |
| H11 | household and total giving | unanswerable | Do women give more to charity than men? _(needs household_giving)_ | none/foundation_grants/all missing:individual_giving | Individual giving isn't in our IRS data |  |
| H12 | household and total giving | partial | What share of total giving comes from foundations versus individuals, bequests and corporations? _(needs household_giving, external_benchmarks)_ | share/foundation_grants/all missing:individual_giving,corporate_giving | Foundations gave $223.3B to organizations in the US, 2022–24 | missing: Individual giving, Corporate giving outside company foundations |
| K01 | track record and people | wrong route | Which animal welfare nonprofits are the newest versus the longest established? _(needs org_age)_ |  |  | sent to org search |
| K02 | track record and people | unanswerable | Do older nonprofits get more foundation money than newer ones? _(needs org_age)_ | none/foundation_grants/all missing:other | We don't have organization age or founding year, so we can't compare older and newer nonprofits. isn't in our IRS data |  |
| K03 | track record and people | wrong route | Which board members sit on the most climate nonprofit boards? _(needs boards_people)_ |  |  | regex screen skipped it (org search); sent to org search |
| K04 | track record and people | unanswerable | How many foundations share board members with the nonprofits they fund? _(needs boards_people)_ | none/foundation_grants/all missing:other | We don't have board member or officer data linking foundations to the nonprofits they fund, so shared board membership can't be counted. isn't in our IRS data |  |
| K05 | track record and people | unanswerable | How many new nonprofits registered with the IRS in 2024? _(needs org_formation)_ | none/revenue/all missing:other | We don't have IRS registration or new-organization formation dates, so we can't count newly registered nonprofits. isn't in our IRS data |  |
| K06 | track record and people | wrong route | Which food security nonprofits got foundation grants every year from 2022 to 2024? _(needs grant_relationships)_ |  |  | regex screen skipped it (org search); sent to org search |
| X01 | benchmarks and context | unanswerable | How does our foundation giving total compare with Giving USA's estimate for foundations? _(needs external_benchmarks)_ | none/foundation_grants/all missing:other | Giving USA's estimates are an external data source we don't have, so we can't compare against them. We can only report totals from IRS foundation grant data. isn't in our IRS data |  |
| X02 | benchmarks and context | unanswerable | What share of GDP goes to charitable giving? _(needs external_benchmarks, household_giving)_ | none/foundation_grants/all missing:other | We don't have GDP or national economic data, so we can't compute charitable giving as a share of GDP. isn't in our IRS data |  |
| X03 | benchmarks and context | partial | Will foundation giving to climate rise next year? _(needs forecast)_ | trend/foundation_grants/climate missing:forecast | Foundation money for climate grew 9.0% (1.7% after inflation) from 2022 to 2024 | missing: Forecasts |
| X04 | benchmarks and context | partial | How does US foundation giving to climate compare with global climate philanthropy? _(needs external_benchmarks, international)_ | total/foundation_grants/climate missing:foreign_giving | Foundations gave $2.3B to climate, 2022–24: 1.3% of identified grant dollars | missing: Money to other countries |
| X06 | benchmarks and context | ok | Why does DC get so much foundation money per resident? | by_state/foundation_grants/all/per resident | District of Columbia gets the most foundation grants per resident: $6,878 a year, then Massachusetts at $629 |  |
