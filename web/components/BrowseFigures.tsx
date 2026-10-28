// Browse by cause figures (lib/browse.ts): every number is a research answer's own, with a link that asks it.
// UI copy: no semicolons, no em dashes.
import { connection } from "next/server";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { orgName } from "@/components/text";
import { TrustMark } from "@/components/TrustMark";
import { trustOf, trustText, type Trust } from "@/lib/sdg";
import { askLink, cachedFigures, asks, entry, figures, perOrgHint, topOrgs, type Part } from "@/lib/browse";

const val = (p: Part | null, i = 0) => (p && p.status !== "unanswerable" ? p.numbers[i] ?? null : null);

// One number for a goal tile: foundation grants 2022 to 2024 (growth and org count in the tooltip).
export async function MiniFigures({ id }: { id: string }) {
  await connection();
  const f = await figures(id).catch(() => null);
  if (!f || f.status !== "ok") return <span className="br-num muted">n/a</span>;
  const t = val(f.parts.total), tr = val(f.parts.trend), n = val(f.parts.count_orgs);
  return <span className="br-num" title={["2022 to 2024", tr && `${tr.value} since 2020`, n && `${n.value} orgs`].filter(Boolean).join(" · ")}>{t?.value ?? "n/a"}</span>;
}
export const MiniSkeleton = () => <span className="br-num muted">…</span>;

// ---------- Browse redesign (Oct 27): one focal number, a ranked list, two compact top-5 columns ----------

// The focal block: foundation grants 2022 to 2024, big, with growth since 2020 and a small by-year sparkline.
export async function Focal({ id, chart = false }: { id: string; chart?: boolean }) {
  await connection();
  const f = await figures(id).catch(() => null);
  if (!f || f.status !== "ok") return <p className="hint">{f?.parts.total?.headline ?? "No foundation grants matched this cause."}</p>;
  const t = val(f.parts.total), tr = val(f.parts.trend);
  const q = asks(entry(id)?.name ?? "");
  const max = Math.max(1, ...f.years.map((y) => y.usd));
  return (
    <section className="br-focal">
      <NavLink href={askLink(q.total)} className="br-big" label="Working out the answer…" title={t?.note ?? undefined}>{t?.value ?? "n/a"}</NavLink>
      <span className="br-big-l">foundation grants, 2022–24</span>
      {(() => { const e = entry(id); const t = e ? trustOf(e.sub, e.isScope ? e.sdg : null) : null; return t === "estimated" ? <p className="trust-note br-est" title={trustText(e!.sub, e!.isScope ? e!.sdg : null)}>≈ Estimated from {e!.coverage === "keywords" ? "keywords" : "IRS codes"}</p> : null; })()}
      {tr && <NavLink href={askLink(q.trend)} className={`br-trend ${tr.value.startsWith("−") ? "down" : "up"}`} label="Working out the answer…" title={tr.label}>{tr.value} since 2020</NavLink>}
      {f.years.length > 1 && (chart
        ? <div className="br-bars" aria-label="Foundation grants by year">{f.years.map((y) => <span key={y.year} title={`${y.year}: ${money(y.usd)}`}><i style={{ height: `${Math.max(4, (y.usd / max) * 72)}px` }} /><small>{String(y.year).slice(2)}</small></span>)}</div>
        : <svg className="br-spark" viewBox={`0 0 ${(f.years.length - 1) * 20} 32`} preserveAspectRatio="none" aria-hidden>
            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={f.years.map((y, i) => `${i * 20},${30 - (y.usd / max) * 28}`).join(" ")} />
          </svg>)}
    </section>
  );
}

// Subcategories as a ranked list: name, dollars 2022 to 2024 and a bar for its size against the largest.
export async function SubList({ items }: { items: { id: string; name: string; href: string | null; note?: string; trust?: Trust; tip?: string }[] }) {
  await connection();
  const rows = await Promise.all(items.map(async (x) => ({ ...x, f: x.href ? await figures(x.id).catch(() => null) : null })));
  const usd = (r: (typeof rows)[number]) => (r.f?.status === "ok" ? r.f.usdYear : 0);
  rows.sort((a, b) => usd(b) - usd(a));
  const max = Math.max(1, ...rows.map(usd));
  return (
    <ol className="br-rank">
      {rows.map((r) => {
        const v = r.f?.status === "ok" ? val(r.f.parts.total)?.value : null;
        const body = <><span className="br-rank-n">{r.name}{r.trust && r.tip && <TrustMark trust={r.trust} tip={r.tip} />}</span><span className="br-rank-bar"><i style={{ width: `${(100 * usd(r)) / max}%` }} /></span><b>{v ?? (r.href ? "n/a" : "Not in our data")}</b></>;
        return <li key={r.id} title={r.note}>{r.href ? <NavLink href={r.href} className="br-rank-row">{body}</NavLink> : <span className="br-rank-row off">{body}</span>}</li>;
      })}
    </ol>
  );
}

// Top funders and top states, five each, side by side; one "Ask about this" button; the crowded or under-funded
// line; method under "How we count".
export async function Below({ id, searchName }: { id: string; searchName: string }) {
  await connection();
  const f = await figures(id).catch(() => null);
  if (!f || f.status !== "ok") return null;
  const q = asks(entry(id)?.name ?? searchName);
  const hint = perOrgHint(id, await cachedFigures());
  return (
    <>
      <div className="br-two">
        <section><h3>Top funders</h3>{f.funders.length ? <ol className="br-list">{f.funders.slice(0, 5).map((x) => <li key={x.name}>{x.ein ? <NavLink href={`/org/${x.ein}`} label="Opening the foundation…">{orgName(x.name)}</NavLink> : <span title={x.state ?? undefined}>{orgName(x.name)}</span>}<b>{money(x.usd)}</b></li>)}</ol> : <p className="muted">None found</p>}</section>
        <section><h3>Top states</h3>{f.states.length ? <ol className="br-list">{f.states.slice(0, 5).map((x) => <li key={x.state}><span>{x.name}</span><b>{money(x.usd)}</b></li>)}</ol> : <p className="muted">None found</p>}</section>
      </div>
      {hint && f.perOrg != null && (
        <p className={`br-crowd ${hint.tone}`} title={hint.text}>
          <b>{money(f.perOrg)}</b> a year per org, rank {hint.rank} of {hint.of} causes. <NavLink href={askLink(q.underfunded)} label="Working out the answer…">Find under-funded orgs →</NavLink>
        </p>
      )}
      <div className="br-actions">
        <NavLink href={askLink(q.top_funders)} className="br-ask-btn" label="Working out the answer…">Ask about this</NavLink>
        <NavLink href={`/?${new URLSearchParams({ question: searchName })}`} className="br-ask-btn ghost" label="Finding organizations…" search>Find orgs</NavLink>
      </div>
      <details className="more-info br-meta">
        <summary><span className="when-closed">How we count</span><span className="when-open">Hide how we count</span></summary>
        <p>{f.causeNote.replace(/\s*\(org_labels\)/g, "")}</p>
        {f.recency && <p><b>Data years.</b> {f.recency}</p>}
        <p className="muted">Every figure is the research answer for this cause, refreshed daily. Click one to see it asked.</p>
      </details>
    </>
  );
}

// A subcategory's organizations (round-2 audit V4): the top 10 recipients of its foundation money, each name a link with
// the site-wide hover card, and the full ranking one click away as a research answer.
export async function TopOrgs({ id }: { id: string }) {
  await connection();
  const t = await topOrgs(id).catch(() => null);
  if (!t) return null;
  const max = Math.max(...t.orgs.map((o) => o.usd), 1);
  return (
    <section className="br-orgs">
      <h3>Organizations it funds most</h3>
      <ol className="br-rank">
        {t.orgs.map((o) => (
          <li key={o.ein} className="br-rank-row">
            <NavLink href={`/org/${o.ein}`} label="Opening the organization…" className="br-rank-n">{orgName(o.name, 200)}{o.partial && <small title="One of its programs, not its main purpose"> · partly</small>}</NavLink>
            <span className="br-rank-bar"><i style={{ width: `${(100 * o.usd) / max}%` }} /></span>
            <b>{money(o.usd)}</b>
          </li>
        ))}
      </ol>
      <NavLink href={askLink(t.ask)} className="br-more" label="Working out the answer…">Full ranking →</NavLink>
    </section>
  );
}
