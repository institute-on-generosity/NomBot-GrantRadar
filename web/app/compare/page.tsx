import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { NavLink } from "@/components/NavLink";
import { money } from "@/components/money";
import { readable, titleCase } from "@/components/text";
import { CompareIcon, RemoveColumn } from "@/components/CompareButton";
import { loadCompare, parseEins, type Compared } from "@/lib/compare";
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
      <Link href="/">← Back to search</Link>
    </div>
  );
}

// Empty cells under an "Add one more" column (compare needs at least two).
const Slots = ({ n }: { n: number }) => <>{Array.from({ length: n }, (_, i) => <td key={`slot-${i}`} className={styles.slot} />)}</>;

// One numeric row: the largest value is bold so differences pop.
type Cell = { value: number | null; year?: number | null; show?: (v: number) => string };
function NumRow({ label, cells, slots = 0 }: { label: string; cells: Cell[]; slots?: number }) {
  const vals = cells.map((c) => c.value).filter((v): v is number => v != null);
  const max = vals.length > 1 && new Set(vals).size > 1 ? Math.max(...vals) : null;
  return (
    <tr>
      <th scope="row" className={styles.rowLabel}>{label}</th>
      {cells.map((c, i) => (
        <td key={i} className={styles.num}>
          {c.value == null ? <span className={styles.none}>—</span> : (
            <><span className={c.value === max ? styles.max : undefined}>{(c.show ?? n)(c.value)}</span>{c.year ? <small>{c.year}</small> : null}</>
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

// Latest year that reports a given figure.
const latest = (o: Compared, k: "revenue" | "expenses" | "assets") => {
  const y = o.years.find((y) => y[k] != null);
  return { value: y ? y[k] : null, year: y?.year ?? null };
};

async function Table({ searchParams }: Props) {
  const { ein } = await searchParams;
  const eins = parseEins(ein);
  if (!eins.length) return <Empty text="Pick 2–4 organizations from your search results to compare them" />;
  await connection();
  const orgs = await loadCompare(eins);
  if (!orgs.length) return <Empty text="We couldn't find those organizations" />;
  const shown = orgs.map((o) => digits(o.ein));
  const slots = Math.max(0, 2 - orgs.length); // keep two columns: a placeholder asks for one more

  return (
    <>
      <p className={styles.lede}>
        {orgs.length < 2 ? "Add one more organization to compare" : "Largest figure in each row in bold · from IRS filings"}
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
                    <NavLink href={`/org/${digits(o.ein)}`} label="Opening…">{titleCase(o.name)}</NavLink>
                    <RemoveColumn ein={o.ein} name={titleCase(o.name)} eins={shown} />
                  </div>
                  <span className={styles.ein}>EIN {o.ein}</span>
                </th>
              ))}
              {Array.from({ length: slots }, (_, i) => (
                <th key={`slot-${i}`} scope="col" className={styles.slotHead}>
                  <div className={styles.slotCard}>
                    <CompareIcon size={20} />
                    <b>Add one more</b>
                    <span>Compare needs at least two · pick one with Compare on a search result</span>
                    <BackLink fallback="/">Back to results</BackLink>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={styles.rowLabel}>Place</th>
              {orgs.map((o) => <td key={o.ein}>{[o.city && titleCase(o.city), o.state].filter(Boolean).join(", ") || <span className={styles.none}>—</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Cause</th>
              {orgs.map((o) => <td key={o.ein}>{o.ntee?.label ?? <span className={styles.none}>—</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <NumRow label="Revenue" slots={slots} cells={orgs.map((o) => ({ ...latest(o, "revenue"), show: money }))} />
            <NumRow label="Expenses" slots={slots} cells={orgs.map((o) => ({ ...latest(o, "expenses"), show: money }))} />
            <NumRow label="Assets" slots={slots} cells={orgs.map((o) => ({ ...latest(o, "assets"), show: money }))} />
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
                      {v == null ? <span className={styles.none}>—</span> : <span className={v === max ? styles.max : undefined}>{n(v)}</span>}
                      {o.team?.staff === 0 && (v ?? 0) > 0 && <><br /><span className={styles.badge}>All-volunteer</span></>}
                    </td>
                  );
                });
              })()}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Tax-exempt since</th>
              {orgs.map((o) => <td key={o.ein} className={styles.num}>{o.ruling ?? <span className={styles.none}>—</span>}</td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Mission</th>
              {orgs.map((o) => <td key={o.ein}><Clamp id={`mission-${digits(o.ein)}`} text={o.mission} /></td>)}
              <Slots n={slots} />
            </tr>
            <tr>
              <th scope="row" className={styles.rowLabel}>Programs</th>
              {orgs.map((o) => <td key={o.ein}><Clamp id={`programs-${digits(o.ein)}`} text={o.programs} /></td>)}
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
