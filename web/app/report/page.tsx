import { Suspense } from "react";
import { connection } from "next/server";
import { PrintButton } from "@/components/PrintButton";
import { readable, titleCase, orgTitle } from "@/components/text";
import { applyOverrides, money, OVERRIDE_KEYS, type Overrides } from "@/lib/filters";
import { NEAR_MILES, TIER_ORDER, tierNote, tierTitle, type Scope } from "@/lib/place";
import { fundersOf, fundingOf, GRANT_YEARS, labelsOf, placeCoverage } from "@/lib/placeReport";
import { parseQuestion } from "@/lib/parse";
import { labelPhrase } from "@/lib/labels";
import { isStrong, rankedSearch, STRONG, type Ranked } from "@/lib/rerank";
import { summaryFor, summaryLines } from "@/lib/searchSummary";
import "./report.css";

export const metadata = { title: "Search report · NomBot" };
type SP = Promise<Record<string, string | string[] | undefined>>;

// A search as a report to keep or send: the question, how the place and the matches were found, the organizations
// in place tiers with their evidence, the funders active among them, plain caveats and leads to verify. Opened
// from "Download report" on the results page. "Save as PDF" prints it (print styles drop the app around it).
export default function ReportPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="report">
      <Suspense fallback={<p className="report-wait">Building the report…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const yearNow = () => new Date().getFullYear();

async function Report({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const question = (one(sp.question) ?? "").trim().slice(0, 300);
  if (!question) return <p>Add a question to build a report.</p>;
  await connection();
  const overrides = Object.fromEntries(OVERRIDE_KEYS.map((k) => [k, one(sp[k])])) as Overrides;
  const filters = applyOverrides(await parseQuestion(question), overrides);
  const [res, summary] = await Promise.all([
    rankedSearch(question, filters, { includeInactive: one(sp.all) === "1", limit: 25 }),
    summaryFor(question, filters, one(sp.all) === "1").then(summaryLines).catch(() => [] as string[]),
  ]);
  const rows = res.results as Ranked[];
  const strong = rows.filter((r) => r.relevance ? isStrong(r) : true);
  const leads = rows.filter((r) => !r.filing && (r.relevance ? r.relevance.score >= 40 : true));
  const shown = [...new Set([...strong, ...leads])];
  const [funding, labels, funders, coverage] = await Promise.all([
    fundingOf(shown.map((r) => r.ein)), labelsOf(shown.map((r) => r.ein)), fundersOf(strong.map((r) => r.ein)),
    res.scope ? placeCoverage(res.scope) : Promise.resolve(null),
  ]);
  const scope = res.scope ?? null;
  const tiers = res.tiers ? TIER_ORDER.filter((t) => res.tiers!.some((b) => b.tier === t)) : [null];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const [g0, g1] = GRANT_YEARS;
  const noText = coverage ? coverage.orgs - coverage.withText : null;

  return (
    <>
      <header className="report-head">
        <p className="report-kicker">NomBot search report · {today}</p>
        <h1>{question}</h1>
        <div className="report-tools"><PrintButton label="Save as PDF" /></div>
      </header>

      {summary.length > 0 && (
        <section className="report-summary">
          <h2>Summary</h2>
          {summary.map((l, i) => i === 0
            ? <p key={i} className="report-count"><b>{l.split(" ")[0]}</b> {l.split(" ").slice(1).join(" ")}</p>
            : <p key={i}>{l}</p>)}
        </section>
      )}

      {/* Method folded on screen (one click), always printed in full */}
      <details className="report-method">
        <summary><h2>Method</h2></summary>
        <ul>
          {scope ? <li><b>Place.</b> {placeText(scope)}</li> : <li><b>Place.</b> {filters.placeLabel ?? (filters.states.join(", ") || "Anywhere in the US")}, by HQ address.</li>}
          <li><b>Topic.</b> {filters.topic || "Any"}{filters.prefer?.length ? `. Preference (ranks higher, never required): ${filters.prefer.map((p) => p.label).join(" and ")}` : ""}{filters.preferLabel && filters.preferLabel !== filters.label ? `. Organizations graded ${labelPhrase(filters.preferLabel)} rank higher, and others that fit still show` : ""}{filters.boostLabels?.length ? `. Organizations graded ${filters.boostLabels.map(labelPhrase).join(" or ")} rank a little higher (graded labels miss some orgs, so they never filter here)` : ""}{filters.requirements.length ? `. Must mention ${filters.requirements.map((r) => r.label).join(" and ")} in the 990 text` : ""}.</li>
          <li><b>Finding matches.</b> Meaning and keyword search over 990 mission and program text, plus the name and IRS cause code (NTEE) for organizations with no 990 text. Claude scored the closest {res.tiers ? "candidates in each group" : "40 candidates"} from 0 to 100 against the question. Strong matches score {STRONG} or more.</li>
          <li><b>Sources and years.</b> IRS exempt organization master file (names, addresses, cause codes, revenue), Form 990 and 990-EZ e-files for tax years 2021 to 2025 (mission, programs, finances), 990-PF foundation grants {g0} to {g1}, Schedule I grant purposes from 2021, Census 2024 ZIP code points.</li>
        </ul>
      </details>

      {tiers.map((t) => {
        const block = t ? res.tiers!.find((b) => b.tier === t)! : null;
        const list = strong.filter((r) => (t ? r.place?.tier === t : true));
        return (
          <section key={t ?? "all"}>
            <h2>{t && scope ? tierTitle(t, scope) : "Organizations"} <small>{list.length} strong {list.length === 1 ? "match" : "matches"}</small></h2>
            {t && scope && <p className="report-note">{tierNote(t, scope)}.{block && block.total > list.length ? ` ${block.total.toLocaleString("en-US")} organizations here were considered.` : ""}</p>}
            {list.length ? <OrgTable rows={list} funding={funding} labels={labels} /> : <p className="report-note">No strong matches in this group.</p>}
          </section>
        );
      })}

      <section>
        <h2>Funders active here for this cause</h2>
        <p className="report-note">Foundations (Form 990-PF) that paid the most to the strong matches above, tax years {g0} to {g1}.</p>
        {funders.length ? (
          <table className="report-table compact">
            <thead><tr><th>Foundation</th><th>Based in</th><th>Organizations funded</th><th>Grants {g0} to {g1}</th></tr></thead>
            <tbody>{funders.map((f) => <tr key={f.ein}><td>{orgTitle(f.name)}</td><td>{[f.city && titleCase(f.city), f.state].filter(Boolean).join(", ")}</td><td>{f.orgs}</td><td>{money(f.usd)}</td></tr>)}</tbody>
          </table>
        ) : <p className="report-note">No foundation grants to these organizations in {g0} to {g1}.</p>}
      </section>

      <section>
        <h2>Caveats</h2>
        <ul>
          {coverage && noText != null && <li>{Math.round((100 * noText) / Math.max(1, coverage.orgs))}% of the {coverage.orgs.toLocaleString("en-US")} organizations with an address in {scope?.label} have no 990 text since 2021. Most are small groups that file the short 990-N postcard. They can only be found by name and cause code, so some are missed and some listed ones need a check.</li>}
          <li>Grants are placed where the recipient is headquartered, not where the work happens. A group serving {scope?.kind === "city" ? titleCase(scope.city) : "the place"} from an office elsewhere shows only when a filing or grant names the place.</li>
          <li>Returns arrive 1 to 2 years late, so {g1 + 1} and later years are still incomplete.</li>
          <li>Relevance scores and reasons are written by AI from the filings. Check an organization before you rely on it.</li>
          {scope?.kind === "city" && <li>Nearby means an HQ ZIP whose center is within {NEAR_MILES} miles of the center of {/^[AEIOU]/i.test(scope.city) ? "an" : "a"} {titleCase(scope.city)} ZIP. City ZIPs are the ZIPs where most organizations give {titleCase(scope.city)} as their mailing city.</li>}
        </ul>
      </section>

      {leads.length > 0 && <section>
        <h2>Leads to verify</h2>
        <p className="report-note">Organizations with no 990 text that the name or cause code suggests may fit. Look up their website or call before relying on them.</p>
        {leads.length ? (
          <table className="report-table compact">
            <thead><tr><th>Organization</th><th>EIN</th><th>Address</th><th>Cause code</th><th>Why listed</th></tr></thead>
            <tbody>{leads.map((r) => <tr key={r.ein}><td>{orgTitle(r.name)}</td><td className="nowrap">{r.ein}</td><td>{address(r)}</td><td>{r.ntee ? (r.ntee.label ?? r.ntee.code) : "None"}</td><td>{r.relevance?.why ?? r.place?.note ?? ""}</td></tr>)}</tbody>
          </table>
        ) : null}
      </section>}
      <p className="report-foot">NomBot, from public IRS filings. Institute on Generosity.</p>
    </>
  );
}

function placeText(s: Scope) {
  if (s.kind === "county") return `${s.label}: organizations whose HQ address is in one of the county's ${s.zips.length} ZIP codes.`;
  const c = titleCase(s.city);
  return `${s.label}. In ${c}: HQ in one of ${c}'s ${s.zips.length} ZIP codes (${s.zips.join(", ")}) or mailing city ${c}, plus organizations named for ${c} that mail from elsewhere. Serving ${c}: HQ elsewhere in ${s.state}, but a Form 990 since 2021 or a grant purpose line since 2021 names ${c}. Nearby: HQ in one of ${s.near.length} ZIP codes within ${NEAR_MILES} miles (${s.near.map((n) => n.zip).join(", ")}).`;
}

const address = (r: Ranked) => [r.street && titleCase(r.street), [r.city && titleCase(r.city), r.state].filter(Boolean).join(", "), r.zip?.slice(0, 5)].filter(Boolean).join(", ");

function OrgTable({ rows, funding, labels }: { rows: Ranked[]; funding: Awaited<ReturnType<typeof fundingOf>>; labels: Map<string, string[]> }) {
  return (
    <table className="report-table">
      <thead><tr><th>Organization</th><th>Size and filings</th><th>Funding {GRANT_YEARS[0]} to {GRANT_YEARS[1]}</th><th>Why it fits</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const f = funding.get(r.ein.replace("-", ""));
          const latest = r.filing?.year ?? r.health?.year ?? r.financials?.tax_year ?? null;
          const newest = Math.max(latest ?? 0, r.revenue?.year ?? 0);
          return (
            <tr key={r.ein}>
              <td>
                <b>{orgTitle(r.name)}</b>
                <span>EIN {r.ein}</span>
                <span>{address(r)}</span>
                <span title={r.ntee?.code ?? undefined}>{r.ntee ? (r.ntee.label ?? r.ntee.code) : "No cause code"}</span>
                {(labels.get(r.ein.replace("-", "")) ?? []).length > 0 && <span>{labels.get(r.ein.replace("-", ""))!.join(", ")}</span>}
                {r.mission && <span className="mission">{clip(readable(r.mission, [r.name]), 220)}</span>}
              </td>
              <td>
                <span>{r.revenue ? `${money(r.revenue.amount)} revenue (${r.revenue.year ?? "year not given"})` : "No revenue reported"}</span>
                <span>Latest 990: {latest ?? "none e-filed"}</span>
                <span>Active: {newest >= yearNow() - 3 ? "yes, recent filing" : newest ? `last seen ${newest}` : "unknown"}</span>
              </td>
              <td>
                <span>{f ? `${money(f.total)} in ${f.grants} ${f.grants === 1 ? "grant" : "grants"}` : "No foundation grants"}</span>
                {f?.top && <span>Top funder: {orgTitle(f.top.name)} ({money(f.top.amount)})</span>}
              </td>
              <td>
                <span title={r.relevance ? `Match score ${r.relevance.score} of 100` : undefined}>{r.relevance ? r.relevance.why : "Not scored"}</span>
                {r.place && <span>{r.place.note}{r.place.quote ? `: "${r.place.quote}"` : ""}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Filing excerpts in the report's house style: semicolons and dashes used as punctuation become commas.
const clip = (t0: string, n: number) => {
  const t = t0.replace(/\s*;\s*/g, ", ").replace(/\s+[—–]\s+|\s*—\s*/g, ", ");
  return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`;
};
