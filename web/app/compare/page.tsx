import { Suspense } from "react";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { readable, titleCase, orgTitle } from "@/components/text";
import { CompareIcon, RemoveColumn } from "@/components/CompareButton";
import { loadCompare, parseEins } from "@/lib/compare";
import { GRANT_YEARS } from "@/lib/placeReport";
import styles from "@/components/Compare.module.css";

export const metadata = { title: "Compare · NomBot" };

type Props = { searchParams: Promise<{ ein?: string | string[] }> };

// 2–4 organizations side by side: one column each, row labels stuck to the left.
export default function ComparePage({ searchParams }: Props) {
  return (
    <main className={styles.page}>
      <BackLink fallback="/">← Back to results</BackLink>
      <h1 className="pagetitle">Compare</h1>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Table searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const n = (v: number) => v.toLocaleString("en-US");
const digits = (ein: string) => ein.replace(/\D/g, "");

function Empty({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <CompareIcon size={34} />
      <p>{text}</p>
    </div>
  );
}

// Empty cells under an "Add one more" column (compare needs at least two).
const Slots = ({ n }: { n: number }) => <>{Array.from({ length: n }, (_, i) => <td key={`slot-${i}`} className={styles.slot} />)}</>;

// One numeric row: the largest value is bold so differences pop.
type Cell = { value: number | null; year?: number | null; show?: (v: number) => string; tone?: "good" | "bad" | null };
// bold: only when every org's figure comes from the same year, so "largest" means something
function NumRow({ label, cells, slots = 0, bold = true }: { label: string; cells: Cell[]; slots?: number; bold?: boolean }) {
  const vals = cells.map((c) => c.value).filter((v): v is number => v != null);
  const max = bold && vals.length > 1 && new Set(vals).size > 1 ? Math.max(...vals) : null;
  return (
    <tr>
      <th scope="row" className={styles.rowLabel}>{label}</th>
      {cells.map((c, i) => (
        <td key={i} className={styles.num}>
          {c.value == null ? <span className={styles.none}>Not reported</span> : (
            <><span className={[c.value === max ? styles.max : "", c.tone ? `tone-${c.tone}` : ""].filter(Boolean).join(" ") || undefined}>{(c.show ?? n)(c.value)}</span>{c.year ? <small>{c.year}</small> : null}</>
          )}
        </td>
      ))}
      <Slots n={slots} />
    </tr>
  );
}

// Clamped to ~4 lines; long text gets a CSS-only "more" toggle.
function Clamp({ id, text }: { id: string; text: string | null }) {
  if (!text) return <span className={styles.none}>Not filed</span>;
  const t = readable(text);
  if (t.length < 200) return <p className={styles.clamp}>{t}</p>;
  return (
    <div className={styles.clampBox}>
      <input type="checkbox" id={id} aria-label="Show full text" />
      <p className={styles.clamp}>{t}</p>
      <label htmlFor={id} className={styles.more} />
    </div>
  );
}

function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith("/")
    ? <NavLink href={href} label="Opening the IRS file…">{children}</NavLink>
    : <a href={href} target="_blank" rel="noreferrer">{children} ↗</a>;
}

const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(Math.abs(v))}`;
const months = (v: number) => (v >= 12 ? `${(v / 12).toFixed(1)} years` : `${v < 1 ? "<1" : Math.round(v)} month${Math.round(v) === 1 ? "" : "s"}`);
const pctOf = (v: number) => `${Math.round(v * 100)}%`;

async function Table({ searchParams }: Props) {
  const { ein } = await searchParams;
  const eins = parseEins(ein);
  if (!eins.length) return <Empty text="Pick 2–4 organizations with Compare, on a search result or an org page" />;
  await connection();
  const orgs = await loadCompare(eins);
  if (!orgs.length) return <Empty text="We couldn't find those organizations" />;
  const shown = orgs.map((o) => digits(o.ein));
  const slots = Math.max(0, 2 - orgs.length); // keep two columns: a placeholder asks for one more
  const sameYear = new Set(orgs.map((o) => o.vet.year)).size === 1;

  return (
    <>
      <p className={styles.lede}>
        {orgs.length < 2 ? "Add one more organization to compare" : sameYear ? "Largest figure in each row in bold · from IRS filings" : "Each column uses its own newest full filing year · from IRS filings"}
      </p>
      <div className={styles.scroll}>
        <table className={styles.table} style={{ minWidth: 130 + (orgs.length + slots) * 200 }}>
          <colgroup><col className={styles.labels} />{orgs.map((o) => <col key={o.ein} className={styles.org} />)}{Array.from({ length: slots }, (_, i) => <col key={`s${i}`} className={styles.org} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.rowLabel}><span className="sr">Organization</span></th>
              {orgs.map((o) => (
                <th key={o.ein} scope="col">
                  <div className={styles.head}>
                    <NavLink href={`/org/${digits(o.ein)}`} label="Opening…">{orgTitle(o.name)}</NavLink>
                    <RemoveColumn ein={o.ein} name={orgTitle(o.name)} eins={shown} />
                  </div>
                  <span className={styles.ein}>{o.vet.year ? `Figures from ${o.vet.year}${o.vet.form ? ` (${o.vet.form === "990EZ" ? "990-EZ" : "990"})` : ""}` : "No filing figures"} · EIN {o.ein}</span>
                </th>
              ))}
              {Array.from({ length: slots }, (_, i) => (
                <th key={`slot-${i}`} scope="col" className={styles.slotHead}>
                  <div className={styles.slotCard}>
                    <CompareIcon size={20} />
                    <b>Add one more</b>
                    <span>Compare needs at least two · pick one with Compare on a search result or an org page</span>
                    <BackLink fallback="/">Back to results</BackLink>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={styles.rowLabel}>Place</th>
              {orgs.map((o) => <td key={o.ein}>{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ") || <span className={styles.none}>Not reported</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Cause</th>
              {orgs.map((o) => <td key={o.ein}>{o.ntee?.label ?? <span className={styles.none}>Not classified</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <NumRow label="Income" slots={slots} bold={sameYear} cells={orgs.map((o) => ({ value: o.vet.revenue, show: money }))} />
            <NumRow label="Spending" slots={slots} bold={sameYear} cells={orgs.map((o) => ({ value: o.vet.expenses, show: money }))} />
            <NumRow label="Surplus or deficit" slots={slots} bold={false} cells={orgs.map((o) => ({ value: o.vet.surplus, show: signed, tone: o.vet.surplus == null ? null : o.vet.surplus < 0 ? "bad" : "good" }))} />
            <NumRow label="Cash on hand" slots={slots} bold={false} cells={orgs.map((o) => ({ value: o.vet.monthsCash, show: months, tone: o.vet.monthsCash != null && o.vet.monthsCash < 3 ? "bad" : null }))} />
            <NumRow label="Spent on programs" slots={slots} bold={false} cells={orgs.map((o) => ({ value: o.vet.programRatio, show: pctOf }))} />
            <NumRow label="Assets" slots={slots} bold={sameYear} cells={orgs.map((o) => ({ value: o.vet.assets, show: money }))} />
            <tr>
              <th scope="row" className={styles.rowLabel}>Foundation grants, {GRANT_YEARS[0]}–{String(GRANT_YEARS[1]).slice(2)}</th>
              {orgs.map((o) => <td key={o.ein} className={styles.num}>{o.vet.foundationGrants > 0 ? <>{money(o.vet.foundationGrants)}<small>{o.vet.foundationFunders} funder{o.vet.foundationFunders === 1 ? "" : "s"}</small></> : <span className={styles.none}>None found</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <NumRow label="Staff" slots={slots} cells={orgs.map((o) => ({ value: o.team?.staff ?? null }))} />
            <tr>
              <th scope="row" className={styles.rowLabel}>Volunteers</th>
              {(() => {
                const vals = orgs.map((o) => o.team?.volunteers ?? null);
                const nums = vals.filter((v): v is number => v != null);
                const max = nums.length > 1 && new Set(nums).size > 1 ? Math.max(...nums) : null;
                return orgs.map((o, i) => {
                  const v = vals[i];
                  return (
                    <td key={o.ein} className={styles.num}>
                      {v == null ? <span className={styles.none}>Not reported</span> : <span className={v === max ? styles.max : undefined}>{n(v)}</span>}
                      {o.team?.staff === 0 && (v ?? 0) > 0 && <><br /><span className={styles.badge}>All-volunteer</span></>}
                    </td>
                  );
                });
              })()}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Tax-exempt since</th>
              {orgs.map((o) => <td key={o.ein} className={styles.num}>{o.ruling ?? <span className={styles.none}>Not reported</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Mission</th>
              {orgs.map((o) => <td key={o.ein}><Clamp id={`mission-${digits(o.ein)}`} text={o.mission && readable(o.mission, [o.name])} /></td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Programs</th>
              {orgs.map((o) => <td key={o.ein}><Clamp id={`programs-${digits(o.ein)}`} text={o.programs && readable(o.programs, [o.name])} /></td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Sources</th>
              {orgs.map((o) => (
                <td key={o.ein}>
                  <div className={styles.srcs}>
                    {o.filing?.url && <Source href={o.filing.url}>Form {o.filing.form} ({o.filing.year})</Source>}
                    {o.sources.filter((s) => s.url !== o.filing?.url).slice(-1).map((s) => <Source key={s.url} href={s.url}>{s.label}</Source>)}
                  </div>
                </td>
              ))}
              <Slots n={slots} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
