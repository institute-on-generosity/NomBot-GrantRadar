import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { titleCase, orgTitle } from "@/components/text";
import { orgFunding, FUNDING_NOTES, FUNDER_CLASS, type Funder, type GivenType, type Recipient, type Transfer, type YearTotal } from "@/lib/orgFunding";

// Grants received (990-PF foundations, Schedule I charities, federal awards) and grants given, for one org page.
// Async server component: the org page streams it in its own Suspense so the profile shows first.
export async function OrgFunding({ ein }: { ein: string }) {
  const f = await orgFunding(ein.replace(/\D/g, ""));
  const received = [f.foundations, f.charities, f.federal].some(Boolean) || !!f.transfers?.received.length;
  const given = !!(f.given.scheduleI || f.given.foundation || f.transfers?.given.length);
  if (!received && !given) return null;
  return (
    <>
      {received && <Received f={f} />}
      {given && <Given f={f} />}
    </>
  );
}

const SHOW = 5;
const span = (ys: { year: number }[]) => {
  const a = Math.min(...ys.map((y) => y.year)), b = Math.max(...ys.map((y) => y.year));
  return a === b ? `${a}` : `${a} to ${b}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// Top N shown, the rest behind "Show more".
function More<T>({ items, render, noun, extra }: { items: T[]; render: (x: T, i: number) => React.ReactNode; noun: string; extra?: boolean }) {
  const head = items.slice(0, SHOW), rest = items.slice(SHOW);
  return (
    <>
      <ul className="people fund-list">{head.map(render)}</ul>
      {rest.length > 0 && (
        <details className="fund-more">
          <summary>Show {rest.length} more {noun}{extra && <>, top {items.length} listed</>}</summary>
          <ul className="people fund-list">{rest.map((x, i) => render(x, i + SHOW))}</ul>
        </details>
      )}
    </>
  );
}

function OrgName({ ein, name }: { ein: string | null; name: string }) {
  return ein ? <NavLink href={`/org/${ein}`} label="Opening the organization…" className="person-link"><b>{orgTitle(name)}</b></NavLink> : <b data-org-ein="" data-org-name={orgTitle(name)} tabIndex={0}>{orgTitle(name)}</b>;
}

function FunderRow({ x }: { x: Funder }) {
  return (
    <li>
      <span><OrgName ein={x.ein} name={x.name} /><small>{[x.kind && FUNDER_CLASS[x.kind], plural(x.n, "grant"), `latest ${x.latest}`].filter(Boolean).join(" · ")}</small></span>
      <span>{money(x.total)}</span>
    </li>
  );
}

function RecipientRow({ x }: { x: Recipient }) {
  const place = [x.city && titleCase(x.city), x.state].filter(Boolean).join(", ");
  return (
    <li>
      <span><OrgName ein={x.ein} name={x.name} /><small>{[place, plural(x.n, "grant"), `latest ${x.latest}`].filter(Boolean).join(" · ")}</small></span>
      <span>{money(x.total)}</span>
    </li>
  );
}

// Schedule I transfers between related organizations (generosity-data 067): listed, never in a total.
function Transfers({ items, side }: { items: Transfer[]; side: "from" | "to" }) {
  const total = items.reduce((a, x) => a + x.amount, 0);
  return (
    <div className="fund-block">
      <h3>Transfers {side} related organizations <small>Schedule I, {plural(items.length, "line")}, {money(total)}, left out of the totals above</small></h3>
      <ul className="people fund-list">
        {items.map((x) => (
          <li key={x.id}>
            <span>{x.ein ? <OrgName ein={x.ein} name={x.name} /> : <b>{orgTitle(x.name)}</b>}<small>{[x.kind === "error" ? "Likely reporting error" : x.noncash >= x.amount / 2 ? "Mostly non-cash" : "Cash", `tax year ${x.year}`, x.reason].join(" · ")}</small></span>
            <span>{money(x.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="note-small">{FUNDING_NOTES.transfers}</p>
    </div>
  );
}

// Share bars, the same look as "Where the money comes from".
function Bars({ rows, total }: { rows: { key: string; label: string; total: number; note?: string }[]; total: number }) {
  const pct = (x: number) => `${Math.max(0, Math.round((100 * x) / total))}%`;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} title={r.note}>
          <span>{r.label}</span>
          <span className="income-bar"><i style={{ width: pct(r.total) }} /></span>
          <b>{pct(r.total)}</b><small>{money(r.total)}</small>
        </li>
      ))}
    </ul>
  );
}

function Received({ f }: { f: Awaited<ReturnType<typeof orgFunding>> }) {
  const { foundations: pf, charities: ci, federal: fed } = f;
  const by = (ys: YearTotal[] | undefined, y: number) => ys?.find((r) => r.year === y)?.total;
  const allYears = [...new Set([...(pf?.years ?? []), ...(ci?.years ?? []), ...(fed?.years ?? [])].map((y) => y.year))].sort((a, b) => b - a);
  const cell = (v: number | undefined) => <td className="n">{v == null ? "–" : money(v)}</td>;
  const tiles = [
    pf && { k: "From private foundations", v: money(pf.total), d: `${plural(pf.n, "grant")}, Form 990-PF, ${span(pf.years)}` },
    ci && { k: "From public charities", v: money(ci.total), d: `${plural(ci.n, "grant")}, Schedule I, ${span(ci.years)}` },
    fed && { k: "Federal awards", v: money(fed.total), d: `${plural(fed.awards, "award")}, USAspending, FY${span(fed.years).replace(" to ", " to FY")}` },
  ].filter((x): x is { k: string; v: string; d: string } => Boolean(x));

  return (
    <section className="funding">
      <h2>Grants received</h2>
      <dl className="yoy-facts fund-tiles">
        {tiles.map((t) => <div key={t.k}><dt>{t.k}</dt><dd><b>{t.v}</b><small>{t.d}</small></dd></div>)}
      </dl>
      {allYears.length > 1 && (
        <table className="fund-years">
          <thead><tr><th>Year</th>{pf && <th className="n">Foundations</th>}{ci && <th className="n">Public charities</th>}{fed && <th className="n">Federal (fiscal year)</th>}</tr></thead>
          <tbody>
            {allYears.map((y) => <tr key={y}><td>{y}</td>{pf && cell(by(pf.years, y))}{ci && cell(by(ci.years, y))}{fed && cell(by(fed.years, y))}</tr>)}
          </tbody>
        </table>
      )}

      {ci && (
        <div className="fund-block">
          <h3>From public charities <small>Form 990 Schedule I</small></h3>
          {ci.byKind.length > 1 && <div className="income"><Bars total={ci.total} rows={ci.byKind.map((k) => ({ key: k.kind, label: k.label, total: k.total, note: `${plural(k.funders, "funder")}, ${plural(k.n, "grant")}` }))} /></div>}
          <More items={ci.top} noun="funders" extra={ci.more} render={(x) => <FunderRow key={x.ein} x={x} />} />
          <p className="note-small">{FUNDING_NOTES.charities} Donor-advised fund sponsors pass on gifts their donors recommend.</p>
        </div>
      )}

      {pf && (
        <div className="fund-block">
          <h3>From private foundations <small>Form 990-PF</small></h3>
          <More items={pf.top} noun="foundations" extra={pf.more} render={(x) => <FunderRow key={x.ein} x={x} />} />
          <p className="note-small">{FUNDING_NOTES.foundations}</p>
        </div>
      )}

      {fed && (
        <div className="fund-block">
          <h3>Federal awards <small>USAspending, grants and cooperative agreements</small></h3>
          <div className="income"><Bars total={Math.max(fed.total, 1)} rows={fed.agencies.slice(0, 6).map((a) => ({ key: a.name, label: a.name, total: a.total, note: plural(a.n, "award") }))} /></div>
          <More items={fed.programs} noun="programs" extra={fed.more} render={(p, i) => (
            <li key={`${p.cfda}-${i}`}>
              <span><b>{p.title ? (p.title === p.title.toUpperCase() ? titleCase(p.title) : p.title) : "Unnamed program"}</b><small>{[p.cfda && `Assistance listing ${p.cfda}`, p.agency, plural(p.n, "award")].filter(Boolean).join(" · ")}</small></span>
              <span>{money(p.total)}</span>
            </li>
          )} />
          {fed.places.length > 0 && (
            <p className="fund-places">Where the work happens: {fed.places.slice(0, 6).map((p, i) => <span key={p.place}>{i > 0 && " · "}{p.place} <b>{money(p.total)}</b></span>)}{fed.places.length > 6 && <> · {fed.places.length - 6} more</>}</p>
          )}
          <p className="note-small">{FUNDING_NOTES.federal}</p>
        </div>
      )}
      {!!f.transfers?.received.length && <Transfers items={f.transfers.received} side="from" />}
      <p className="note-small">{FUNDING_NOTES.overlap}</p>
    </section>
  );
}

// 990-PF grants given by who received them (lib/orgFunding pfGivenTypes): shown when any went to a government,
// public university, international body or company. Top names for those four types.
const pctOf = (x: number) => (x >= 0.095 ? `${Math.round(x * 100)}%` : x >= 0.0005 ? `${(x * 100).toFixed(1)}%` : "<0.1%");
const nameOf = (x: string) => (x === x.toUpperCase() ? orgTitle(x) : x);
function GivenTypes({ types }: { types: GivenType[] }) {
  const non = types.filter((t) => ["government", "public_university", "international", "company"].includes(t.type));
  const share = non.reduce((a, t) => a + t.share, 0);
  return (
    <>
      <h3 className="fund-sub">Who received it <small>{pctOf(share)} to governments, public universities, international bodies and companies</small></h3>
      <table className="fund-years">
        <thead><tr><th>Recipient</th><th className="n">Grants</th><th className="n">Total</th><th className="n">Share</th></tr></thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.type}>
              <td>{t.label}{t.top.length > 0 && <small className="fund-type-top"> {t.top.map((x) => nameOf(x.name)).join(", ")}</small>}</td>
              <td className="n">{t.n.toLocaleString("en-US")}</td><td className="n">{money(t.total)}</td><td className="n">{pctOf(t.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note-small">{FUNDING_NOTES.types}</p>
    </>
  );
}

function Given({ f }: { f: Awaited<ReturnType<typeof orgFunding>> }) {
  const { scheduleI: si, foundation: pf } = f.given;
  return (
    <section className="funding">
      <h2>Grants given</h2>
      {si && (
        <div className="fund-block first">
          <h3>Schedule I grants <small>{si.n > 0 ? <>{plural(si.n, "grant")}, {money(si.total)}{si.notItemized > 0 && <>, plus {money(si.notItemized)} not itemized</>}</> : si.notItemized > 0 ? <>{money(si.notItemized)} reported, none itemized by recipient</> : <>no grants listed</>}{si.transfers > 0 && <>, {money(si.transfers)} of transfers left out</>}, {span(si.years)}</small></h3>
          <table className="fund-years">
            <thead><tr><th>Tax year</th><th className="n">Grants listed</th><th className="n">Listed total</th>{si.notItemized > 0 && <th className="n" title="Reported but not listed by recipient: Part IX line 1 minus the grants listed by name, including lines such as SEE ATTACHED or VARIOUS">Not itemized</th>}{si.transfers > 0 && <th className="n" title="Transfers between related organizations, left out of the listed total">Transfers</th>}<th className="n" title="Form 990 Part IX line 1, grants to domestic organizations">Return total (Part IX)</th></tr></thead>
            <tbody>
              {si.years.map((y) => <tr key={y.year}><td>{y.year}</td><td className="n">{y.n.toLocaleString("en-US")}</td><td className="n">{money(y.total)}</td>{si.notItemized > 0 && <td className="n">{y.notItemized > 0 ? money(y.notItemized) : "–"}</td>}{si.transfers > 0 && <td className="n">{y.transfers > 0 ? money(y.transfers) : "–"}</td>}<td className="n">{y.line1 == null ? "–" : money(y.line1)}</td></tr>)}
            </tbody>
          </table>
          {si.top.length > 0 && <>
            <h3 className="fund-sub">Top recipients</h3>
            <More items={si.top} noun="recipients" extra={si.more} render={(x, i) => <RecipientRow key={`${x.ein ?? x.name}-${i}`} x={x} />} />
          </>}
        </div>
      )}
      {pf && (
        <div className={`fund-block${si ? "" : " first"}`}>
          <h3>Foundation grants <small>Form 990-PF, {plural(pf.n, "grant")}, {money(pf.total)}, {span(pf.years)}</small></h3>
          {pf.years.length > 1 && (
            <table className="fund-years">
              <thead><tr><th>Tax year</th><th className="n">Grants</th><th className="n">Total</th></tr></thead>
              <tbody>{pf.years.map((y) => <tr key={y.year}><td>{y.year}</td><td className="n">{y.n.toLocaleString("en-US")}</td><td className="n">{money(y.total)}</td></tr>)}</tbody>
            </table>
          )}
          <h3 className="fund-sub">Top recipients</h3>
          <More items={pf.top} noun="recipients" extra={pf.more} render={(x, i) => <RecipientRow key={`${x.ein ?? x.name}-${i}`} x={x} />} />
          {pf.byType.length > 0 && <GivenTypes types={pf.byType} />}
        </div>
      )}
      {!!f.transfers?.given.length && <Transfers items={f.transfers.given} side="to" />}
      <p className="note-small">{FUNDING_NOTES.given} Totals are summed across all listed years.</p>
    </section>
  );
}
