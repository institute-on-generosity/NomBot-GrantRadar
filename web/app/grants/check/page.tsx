import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { money } from "@/components/money";
import { titleCase } from "@/components/text";
import { findOrgs, getCheck } from "@/lib/check";
import { prettyTitle } from "@/lib/flag";

type Params = { q?: string; ein?: string };

export const metadata = { title: "How funders will see you · GrantRadar" };

// "How funders will see you": look up your nonprofit, then see the diligence a foundation would run on
// your newest 990 (same fixed rules as NomBot) and what to have ready before you apply.
export default function CheckPage({ searchParams }: PageProps<"/grants/check">) {
  return (
    <main className="check">
      <h1>How funders will see you</h1>
      <p className="check-sub">Foundations read your Form 990 before they read your proposal. See what they&apos;ll notice, and what to prepare.</p>
      <Suspense fallback={null}><Body searchParams={searchParams as Promise<Params>} /></Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  await connection();
  if (p.ein) return <Report ein={p.ein} />;
  const found = p.q?.trim() ? await findOrgs(p.q) : [];
  return (
    <>
      <form action="/grants/check" className="check-form">
        <input name="q" defaultValue={p.q ?? ""} placeholder="Your nonprofit's name or EIN" aria-label="Nonprofit name or EIN" autoFocus />
        <button type="submit">Check</button>
      </form>
      {p.q && (found.length ? (
        <ul className="check-found">
          {found.map((o) => (
            <li key={o.ein}>
              {o.filed ? <Link href={`/grants/check?ein=${o.ein}`}>{o.name}</Link> : <span>{o.name}</span>}
              <small>{o.place}{!o.filed && " · no e-filed 990 loaded"}</small>
            </li>
          ))}
        </ul>
      ) : <p className="ls-note">No nonprofit found. Try the exact name on your 990, or your EIN.</p>)}
    </>
  );
}

async function Report({ ein }: { ein: string }) {
  const c = await getCheck(ein);
  if (!c) return <p className="ls-note">No e-filed 990 loaded for that EIN. <Link href="/grants/check">Look up another</Link></p>;
  const { d } = c;
  const order = { weak: 0, watch: 1, ok: 2 } as const;
  const signals = [...d.rating.signals].sort((a, b) => order[a.level] - order[b.level]);
  const paid = d.people.filter((x) => x.pay + x.other > 0).slice(0, 3);
  return (
    <div className="check-report">
      <header>
        <h2>{c.name}</h2>
        <p>{c.place} · EIN {c.ein} · Form {d.form === "990EZ" ? "990-EZ" : "990"}, {d.year}{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">your filing ↗</a></>}</p>
      </header>

      <section className="rating">
        <h3>What they&apos;ll see first</h3>
        <ul>{signals.map((x) => <li key={x.label} className={x.level}><b>{x.label}</b>{x.note}</li>)}</ul>
      </section>

      <section className="check-prep">
        <h3>{c.prepare.length ? "Be ready to answer" : "Nothing stands out"}</h3>
        {c.prepare.length ? (
          <ol>{c.prepare.map((x) => <li key={x.topic}><b>{x.topic}</b><span>{x.ask}</span></li>)}</ol>
        ) : <p className="ls-note">No concerns by these rules. Lead with your results; funders will still ask about impact, which the 990 doesn&apos;t show.</p>}
      </section>

      {(d.spending || d.income || paid.length > 0) && (
        <section className="check-facts">
          <h3>Numbers they&apos;ll look at</h3>
          <dl>
            {d.income && <div><dt>Revenue</dt><dd>{money(d.income.total)} · {Math.round(d.income.gifts * 100)}% gifts and grants</dd></div>}
            {d.spending && <div><dt>Spending</dt><dd>{Math.round(d.spending.program * 100)}% programs · {Math.round(d.spending.admin * 100)}% admin · {Math.round(d.spending.fundraising * 100)}% fundraising</dd></div>}
            {d.board && <div><dt>Board</dt><dd>{d.board.members} members, {d.board.independent} independent</dd></div>}
            {paid.length > 0 && <div><dt>Top pay</dt><dd>{paid.map((x) => `${x.title ? prettyTitle(x.title) : titleCase(x.name)} ${money(x.pay + x.other)}`).join(" · ")}</dd></div>}
          </dl>
        </section>
      )}
      <p className="note">From your newest e-filed Form 990, by fixed rules. <Link href="/grants/check">Check another organization</Link></p>
    </div>
  );
}
