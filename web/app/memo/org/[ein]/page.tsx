import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MemoTools } from "@/components/MemoTools";
import { MEMO_FOOTER, orgBrief, preparedBy } from "@/lib/brief";
import { becauseText } from "@/lib/vetting";
import "../../memo.css";

export const metadata = { title: "Organization brief · NomBot" };

// One-page organization brief (Oct 28, advisor research brief): print to PDF on US Letter, or the same content as
// an editable Word file (/api/memo/org/[ein]/docx). Facts and fixed-rule text only.
export default function OrgMemoPage(props: { params: Promise<{ ein: string }>; searchParams: Promise<{ by?: string }> }) {
  return <main className="memo-main"><Suspense fallback={<p className="hint">Preparing the brief…</p>}><Memo {...props} /></Suspense></main>;
}

async function Memo({ params, searchParams }: { params: Promise<{ ein: string }>; searchParams: Promise<{ by?: string }> }) {
  const [{ ein }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const b = await orgBrief(ein);
  if (!b) notFound();
  const by = preparedBy(sp.by);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return (
    <>
      <MemoTools docx={`/api/memo/org/${b.ein.replace(/\D/g, "")}/docx`} />
      <article className="memo">
        <header>
          <p className="memo-kicker">Organization brief · {today}</p>
          <h1>{b.name}</h1>
          <p className="memo-meta">{[b.place, b.type, `EIN ${b.ein}`].filter(Boolean).join(" · ")}</p>
          <p className="memo-track">{b.track}</p>
        </header>
        {b.mission && <p className="memo-mission">{b.mission}</p>}
        <dl className="memo-nums">
          {b.numbers.map((n) => <div key={n.label}><dt>{n.label}</dt><dd>{n.value}</dd><dd className="memo-year">{n.year}</dd></div>)}
        </dl>
        <div className="memo-two">
          <section><h2>Top foundation funders <span className="memo-year">{b.fundersYears}</span></h2>
            {b.funders.length ? <ol>{b.funders.map((f) => <li key={f.name}>{f.name}<span>{f.usd}</span></li>)}</ol> : <p className="memo-none">None found in Form 990-PF grants</p>}</section>
          <section><h2>Leadership {b.leadersYear && <span className="memo-year">{b.leadersYear}</span>}</h2>
            {b.leaders.length ? <ol>{b.leaders.map((l) => <li key={l.name}>{l.name}{l.title && <small>{l.title}</small>}<span>{l.pay ? `Pay ${l.pay}` : "Unpaid"}</span></li>)}</ol> : <p className="memo-none">No officers listed</p>}</section>
        </div>
        <section><h2>Signals {b.signalsYear && <span className="memo-year">Form {b.signalsForm}, {b.signalsYear}</span>}</h2>
          <ul className="memo-signals">{b.signals.map((s) => <li key={s}>{s}</li>)}</ul></section>
        <section><h2>Questions to ask</h2>
          <ol className="memo-asks">{b.questions.map((q) => <li key={q.key}>{q.q}<small>{becauseText(q)}</small></li>)}</ol></section>
        <div className="memo-foot">
          <p><b>Sources.</b> {b.sources.join(". ")}. Returns reach the IRS 1 to 2 years after the tax year.</p>
          <p className="memo-by" data-memo-by hidden={!by}>{by ? `Prepared by ${by}` : ""}</p>
          <p>{MEMO_FOOTER}</p>
        </div>
      </article>
    </>
  );
}
