// Browse by cause figures (lib/browse.ts): every number is a research answer's own, with a link that asks it.
// UI copy: no semicolons, no em dashes.
import { connection } from "next/server";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { orgName } from "@/components/text";
import { askLink, cachedFigures, asks, entry, figures, figuresTimed, perOrgHint, type Figures, type Part } from "@/lib/browse";

const Ask = ({ q, children }: { q: string; children: React.ReactNode }) => (
  <NavLink href={askLink(q)} className="br-ask" label="Working out the answer…">{children}</NavLink>
);
const val = (p: Part | null, i = 0) => (p && p.status !== "unanswerable" ? p.numbers[i] ?? null : null);

// Compact line for a card: dollars, trend, orgs.
export async function MiniFigures({ id }: { id: string }) {
  await connection();
  const f = await figures(id).catch(() => null);
  if (!f || f.status !== "ok") return <p className="br-mini muted">No figures yet</p>;
  const t = val(f.parts.total), tr = val(f.parts.trend), n = val(f.parts.count_orgs);
  return (
    <p className="br-mini">
      {t && <span><b>{t.value}</b> 2022 to 24</span>}
      {tr && <span className={tr.value.startsWith("−") ? "down" : "up"}><b>{tr.value}</b> since 2020</span>}
      {n && <span><b>{n.value}</b> orgs</span>}
    </p>
  );
}
export const MiniSkeleton = () => <p className="br-mini muted">Loading figures…</p>;

export async function FullFigures({ id, searchName }: { id: string; searchName: string }) {
  await connection();
  const e = entry(id);
  const { f, ms } = await figuresTimed(id).catch((err) => { console.error("browse figures failed", id, err); return { f: null, ms: 0 }; });
  if (!e || !f) return <p className="hint">These figures couldn&apos;t be computed right now.</p>;
  if (f.status !== "ok") return <p className="hint">{f.parts.total?.headline ?? "No foundation grants matched this cause."}</p>;
  const q = asks(e.name);
  const all = await cachedFigures();
  const hint = perOrgHint(id, all);
  return (
    <div className="br-figs">
      <div className="br-tiles">
        <Tile label="Foundation grants, 2022 to 2024" p={f.parts.total} i={0} q={q.total} />
        <Tile label="Growth since 2020" p={f.parts.trend} i={0} q={q.trend} sub={val(f.parts.trend, 1)} />
        <Tile label="Organizations" p={f.parts.count_orgs} i={0} q={q.count_orgs} sub={val(f.parts.count_orgs, 1)} />
        <Tile label="Concentration" p={f.parts.concentration} i={0} q={q.concentration} sub={val(f.parts.concentration, 1)} />
      </div>

      {f.years.length > 0 && <Years f={f} />}

      <div className="br-two">
        <section>
          <h3>Top foundation funders</h3>
          {f.funders.length ? (
            <ol className="br-list">{f.funders.map((x) => <li key={x.name}><span>{orgName(x.name)}{x.state ? `, ${x.state}` : ""}</span><b>{money(x.usd)}</b></li>)}</ol>
          ) : <p className="muted">None found</p>}
          <Ask q={q.top_funders}>Ask who funds it →</Ask>
        </section>
        <section>
          <h3>Top states</h3>
          {f.states.length ? (
            <ol className="br-list">{f.states.map((x) => <li key={x.state}><span>{x.name}</span><b>{money(x.usd)}</b></li>)}</ol>
          ) : <p className="muted">None found</p>}
          <Ask q={q.by_state}>Ask which states get most →</Ask>
        </section>
      </div>

      {hint && f.perOrg != null && (
        <section className={`br-hint ${hint.tone}`}>
          <h3>Crowded or under-funded?</h3>
          <p><b>{money(f.perOrg)}</b> a year in foundation grants per org that e-files a 990. That ranks <b>{hint.rank}</b> of {hint.of} causes, against a median of {money(hint.median)}.</p>
          <p>{hint.text}</p>
          <Ask q={q.underfunded}>Find orgs here that get little foundation money for their size →</Ask>
        </section>
      )}

      {/* Method folded under "How we count" (UX audit BG2: no internal table names or timings on the page) */}
      <details className="more-info br-meta">
        <summary>How we count</summary>
        <p>{f.causeNote.replace(/\s*\(org_labels\)/g, "")}</p>
        {f.recency && <p><b>Data years.</b> {f.recency}</p>}
        <p className="muted" data-ms={ms}>Figures are the research answers for this cause, refreshed daily.</p>
      </details>

      <section className="br-asks">
        <h3>Ask about it</h3>
        <div className="chips suggest">
          {Object.values(q).map((x) => <NavLink key={x} href={askLink(x)} className="chip link" label="Working out the answer…">{x}</NavLink>)}
          <NavLink href={`/?${new URLSearchParams({ question: searchName })}`} className="chip link" label="Finding organizations…" search>Find {searchName} orgs</NavLink>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, p, i, q, sub }: { label: string; p: Part | null; i: number; q: string; sub?: Part["numbers"][number] | null }) {
  const n = val(p, i);
  return (
    <NavLink href={askLink(q)} className="br-tile" label="Working out the answer…">
      <span className="br-tile-l">{label}</span>
      <b>{n?.value ?? "n/a"}</b>
      <span className="br-tile-s">{n ? n.label : "Not available"}{n?.note ? ` (${n.note})` : ""}</span>
      {sub && <span className="br-tile-s">{sub.value} {sub.label}</span>}
    </NavLink>
  );
}

function Years({ f }: { f: Figures }) {
  const max = Math.max(...f.years.map((y) => y.usd), 1);
  return (
    <section className="br-years" aria-label="Foundation grants by year">
      {f.years.map((y) => (
        <div key={y.year}><span className="br-bar" style={{ height: `${Math.max(4, (y.usd / max) * 64)}px` }} /><b>{money(y.usd)}</b><span>{y.year}</span></div>
      ))}
    </section>
  );
}

export const FiguresSkeleton = () => <div className="br-figs"><div className="br-tiles">{[0, 1, 2, 3].map((i) => <div key={i} className="br-tile skel" />)}</div><p className="hint">Loading figures…</p></div>;
