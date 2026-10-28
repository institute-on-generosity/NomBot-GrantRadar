import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MemoTools } from "@/components/MemoTools";
import { MEMO_FOOTER, optionsMemo, preparedBy } from "@/lib/brief";
import { parseEins } from "@/lib/compare";
import "../memo.css";

export const metadata = { title: "Options memo · NomBot" };

// Options memo from Compare (2 to 4 orgs, Oct 28): one page, a side-by-side table and 2 or 3 takeaways computed from
// the numbers. Print to PDF or download as Word (/api/memo/compare/docx).
export default function CompareMemoPage(props: { searchParams: Promise<{ ein?: string | string[]; by?: string }> }) {
  return <main className="memo-main"><Suspense fallback={<p className="hint">Preparing the memo…</p>}><Memo {...props} /></Suspense></main>;
}

async function Memo({ searchParams }: { searchParams: Promise<{ ein?: string | string[]; by?: string }> }) {
  const sp = await searchParams;
  const eins = parseEins(sp.ein);
  await connection();
  const m = await optionsMemo(eins);
  if (!m) notFound();
  const by = preparedBy(sp.by);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <>
      <MemoTools docx={`/api/memo/compare/docx?ein=${eins.join(",")}`} />
      <article className="memo">
        <header>
          <p className="memo-kicker">Options memo · {today}</p>
          <h1>{m.orgs.length} organizations side by side</h1>
          <p className="memo-meta">Each column uses its own newest full filing year, named under it.</p>
        </header>
        <section><h2>Takeaways</h2><ul className="memo-signals">{m.takeaways.map((t) => <li key={t}>{t}</li>)}</ul></section>
        <table className="memo-table">
          <thead><tr><th />{m.orgs.map((o) => <th key={o.ein}>{o.name}<small>{o.year}</small></th>)}</tr></thead>
          <tbody>{m.rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
        </table>
        <div className="memo-foot">
          <p><b>Sources.</b> Form 990 and 990-EZ figures from each organization&apos;s newest full return, foundation grants from Form 990-PF filings, {m.grantYears}. Returns reach the IRS 1 to 2 years after the tax year.</p>
          <p className="memo-by" data-memo-by hidden={!by}>{by ? `Prepared by ${by}` : ""}</p>
          <p>{MEMO_FOOTER}</p>
        </div>
      </article>
    </>
  );
}
