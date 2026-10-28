// Vetting card rules (Oct 28): questions to ask from an org's own signals, and the track record line. No database.
//   npm run test:vetting
import { pickQuestions, questionsFrom, trackText, type Signals } from "../lib/vetting";
import type { HealthYear } from "../lib/healthText";
let fails = 0;
const ok = (c: boolean, what: string) => { if (c) console.log(`ok    ${what}`); else { fails++; console.log(`FAIL  ${what}`); } };
const y = (year: number, revenue: number, expenses: number, x: Partial<HealthYear> = {}): HealthYear => ({ year, form: "990", source: "filing", object_id: "", revenue, expenses, surplus: revenue - expenses, deficit: revenue < expenses,
  contributions: null, program_revenue: null, government_grants: null, cash: null, months_cash: 6, unrestricted_net_assets: null, months_unrestricted: null, program_ratio: 0.8, fundraising_per_dollar: null,
  contributions_share: 0.5, program_revenue_share: 0.4, government_share: 0.1, total_assets: null, total_liabilities: null, liabilities_to_assets: 0.2, ...x });
const base: Signals = { years: [y(2021, 1e6, 9e5), y(2022, 1e6, 9e5), y(2023, 1e6, 9e5), y(2024, 1e6, 9e5)], checks: [], board: { members: 10, independent: 9 }, revoked: false, funders: [], revenueInGrantYears: 3e6, grantYears: [2022, 2024] };
const keys = (s: Signals) => questionsFrom(s).map((q) => q.key);

ok(keys(base).length === 0, "a healthy org fires no rule");
const std = pickQuestions(questionsFrom(base));
ok(std.length === 3 && /no warning signs/.test(std[0].because), "no rule fired: 3 standard questions, the first says no warning signs");
const def = questionsFrom({ ...base, years: [y(2021, 1e6, 1.1e6), y(2022, 1e6, 9e5), y(2023, 1e6, 1.2e6), y(2024, 1e6, 1.1e6)] });
ok(def[0].key === "deficits" && def[0].because === "deficits in 3 of the last 4 years (2021–24)", `deficits in 3 of 4 years leads with its reason (${def[0]?.because})`);
ok(keys({ ...base, years: [...base.years.slice(0, 3), y(2024, 1e6, 1.2e6)] }).includes("deficit"), "one deficit in the last year asks what it paid for");
const cash = questionsFrom({ ...base, years: [...base.years.slice(0, 3), y(2024, 1e6, 9e5, { months_cash: 0.5 })] }).find((q) => q.key === "cash");
ok(!!cash && cash.because === "cash covers under 1 month of spending (2024)", "cash under 1 month");
const conc = questionsFrom({ ...base, funders: [{ name: "SMITH FAMILY FDN", usd: 6e5 }, { name: "JONES TR", usd: 4e5 }] }).find((q) => q.key === "concentration");
ok(!!conc && /two largest funders/.test(conc.q) && conc.because === "Smith Family Foundation and Jones Trust gave 33% of its income, 2022–24", `top 2 funders 33% of income (${conc?.because})`);
ok(!keys({ ...base, funders: [{ name: "A FDN", usd: 1e5 }, { name: "B FDN", usd: 1e5 }] }).includes("concentration"), "small funders: no concentration question");
ok(keys({ ...base, checks: [{ key: "business_with_insiders", ok: false }] }).includes("insiders"), "business with insiders asks who approved it");
ok(keys({ ...base, checks: [{ key: "audited", ok: false }], years: [...base.years.slice(0, 3), y(2024, 2e6, 1.8e6)] }).includes("audit"), "no audit over $1M asks for statements");
ok(!keys({ ...base, checks: [{ key: "audited", ok: false }], years: [...base.years.slice(0, 3), y(2024, 5e5, 4e5)] }).includes("audit"), "no audit under $1M: no question");
const drop = questionsFrom({ ...base, years: [...base.years.slice(0, 3), y(2024, 7e5, 6e5)] }).find((q) => q.key === "drop");
ok(!!drop && drop.because === "income fell 30% (2023 to 2024)", "income drop 30%");
ok(keys({ ...base, years: [y(2022, 1e6, 9e5), y(2023, 1.3e6, 1.2e6), y(2024, 2e6, 1.8e6)] }).includes("growth"), "fast growth 100% over 2 years");
ok(keys({ ...base, revoked: true })[0] === "status", "revoked status comes first");
ok(keys({ ...base, board: { members: 6, independent: 2 } }).includes("board"), "under half independent board");
const many = pickQuestions(questionsFrom({ ...base, revoked: true, board: { members: 6, independent: 2 }, checks: [{ key: "business_with_insiders", ok: false }, { key: "family_business_ties", ok: false }], years: [y(2021, 1e6, 1.1e6), y(2022, 1e6, 1.1e6), y(2023, 1e6, 1.2e6), y(2024, 7e5, 1.1e6, { months_cash: 0.5, liabilities_to_assets: 1.2 })] }));
ok(many.length === 5, `at most 5 questions (${many.length})`);
ok([...many.map((q) => q.q + q.because)].every((t) => !/;|—/.test(t)), "no semicolons or em dashes");
ok(trackText({ since: 1998, age: 28, filings: 5, firstFiling: 2020, revenue: { fromYear: 2020, toYear: 2024, from: 1e6, to: 1.18e6, change: 0.18 } }) === "Tax-exempt since 1998 · 28 years · 5 returns on record since 2020 · income up 18% (2020–24)", "track record line");
ok(trackText({ since: null, age: null, filings: 0, firstFiling: null, revenue: null }) === "No e-filed returns on record", "track record with no data");
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
