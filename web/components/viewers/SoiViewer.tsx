import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { NavLink } from "@/components/NavLink";
import { titleCase } from "@/components/text";
import { dollars, getSoi, readValue, section, SOI_DICTIONARY, soiViewerUrl, soiZipUrl, USED } from "@/lib/soi";

type Props = { params: Promise<{ ein: string }>; searchParams: Promise<{ year?: string; form?: string }>; compact?: boolean };

// One organization's record in the IRS SOI annual extract, every reported field explained.
// compact: the right-hand panel version (figures and plain field/value pairs).
export function SoiViewer(props: Props) {
  return (
    <main className="wide">
      <Suspense fallback={<p className="hint">Opening the IRS financial record…</p>}>
        <Viewer {...props} />
      </Suspense>
    </main>
  );
}

const KEY_LABELS = ["Total revenue", "Total expenses", "Total assets (end of year)"];
const formName = (f: string) => (f === "990EZ" ? "990-EZ" : f);

async function Viewer({ params, searchParams, compact }: Props) {
  const [{ ein: einParam }, { year, form }] = await Promise.all([params, searchParams]);
  await connection();
  const soi = await getSoi(einParam);
  if (!soi) notFound();
  const ein = `${soi.ein.slice(0, 2)}-${soi.ein.slice(2)}`;
  const rec = soi.records.find((r) => String(r.year) === year && r.form === form) ?? soi.records[0];

  if (!rec) {
    return (
      <article className={compact ? "viewer compact" : "org viewer"}>
        {!compact && <BackLink fallback={`/org/${ein}`}>← Back</BackLink>}
        <p className="notice">{titleCase(soi.org.name)} has no record in the SOI extract. Small organizations that file Form 990-N aren&apos;t included.</p>
      </article>
    );
  }

  const fields = soi.fields.get(rec.form) ?? [];
  const byCol = new Map(fields.map((f) => [f.col, f]));
  const used = USED[rec.form] ?? [];
  const reported = fields.filter((f) => rec.raw[f.col] !== undefined);
  const groups = new Map<string, typeof reported>();
  for (const f of reported) groups.set(section(rec.form, f.location), [...(groups.get(section(rec.form, f.location)) ?? []), f]);
  const zip = soiZipUrl(rec.form);
  const figure = (col: string) => {
    const v = rec.raw[col];
    return v !== undefined && /^-?\d+$/.test(v) ? Number(v) : 0;
  };

  const tabs = soi.records.length > 1 && (
    <nav className="tabs" aria-label="Returns on file">
      {soi.records.map((r) => (r === rec
        ? <span key={`${r.year}-${r.form}`} className="tab on" aria-current="page">{r.year} · {formName(r.form)}</span>
        : <NavLink key={`${r.year}-${r.form}`} href={soiViewerUrl(soi.ein, r.year, r.form)} className="tab">{r.year} · {formName(r.form)}</NavLink>))}
    </nav>
  );

  if (compact) {
    return (
      <article className="viewer compact">
        <p className="vc-head">
          <b>Form {formName(rec.form)} · {rec.year}</b>
          <span> · <a href={zip} target="_blank" rel="noreferrer">Extract ↗</a> · <a href={SOI_DICTIONARY} target="_blank" rel="noreferrer">Field dictionary ↗</a></span>
        </p>
        {tabs}
        <section className="keyfigs">
          {used.map((col, i) => (
            <div key={col} className={`keyfig${figure(col) < 0 ? " neg" : ""}`} title={`${col}: ${rec.raw[col] ?? "blank"}`}>
              <span>{KEY_LABELS[i]}</span><b>{dollars(figure(col))}</b>
            </div>
          ))}
        </section>
        {[...groups].map(([name, fs]) => {
          const rest = fs.filter((f) => !used.includes(f.col));
          return rest.length > 0 && (
            <section key={name} className="vc-group">
              <h3>{name}</h3>
              <dl className="vc-list">
                {rest.map((f) => {
                  const v = readValue(f, rec.raw[f.col]);
                  return (
                    <div key={f.col} title={`${f.col}: ${rec.raw[f.col]}`}>
                      <dt>{f.description || f.col}</dt>
                      <dd>{v.link ? <a href={v.link} target="_blank" rel="noreferrer">{v.text} ↗</a> : v.text}</dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
      </article>
    );
  }

  return (
    <article className="org viewer">
      <BackLink fallback={`/org/${ein}`}>← Back</BackLink>
      <h1>IRS financial extract · {titleCase(soi.org.name)}</h1>
      <p className="sub">
        Statistics of Income (SOI) annual extract · Form {formName(rec.form)} · tax year {rec.year} · EIN {ein} · <code>{zip.split("/").pop()}</code>
      </p>
      <p className="links">
        <a href={zip} target="_blank" rel="noreferrer">Download the original extract ↗</a>
        <a href={SOI_DICTIONARY} target="_blank" rel="noreferrer">IRS field dictionary (XLSX) ↗</a>
      </p>

      {tabs}

      <section className="keyfigs">
        {used.map((col, i) => (
          <div key={col} className={`keyfig${figure(col) < 0 ? " neg" : ""}`}>
            <span>{KEY_LABELS[i]}</span>
            <b>{dollars(figure(col))}</b>
            <small>{byCol.get(col)?.location} · <code>{col}</code> <span className="tag">used by NomBot</span></small>
          </div>
        ))}
      </section>

      <section className="record">
        <h2>Everything reported <span>{reported.length} of {fields.length} fields · blank and zero fields hidden</span></h2>
        {[...groups].map(([name, fs]) => (
          <div key={name} className="soi-group">
            <h3>{name}</h3>
            <table>
              <thead><tr><th>Field</th><th>What it says</th><th>Exactly as in the file</th></tr></thead>
              <tbody>
                {fs.map((f) => {
                  const raw = rec.raw[f.col];
                  const v = readValue(f, raw);
                  return (
                    <tr key={f.col} className={used.includes(f.col) ? "used" : undefined}>
                      <td><b>{f.description || f.col}</b>{f.location && !/^n\/a/i.test(f.location) && <small>{f.location}</small>}</td>
                      <td className={/^−?\$/.test(v.text) ? "n" : undefined}>
                        {v.link ? <a href={v.link} target="_blank" rel="noreferrer">{v.text} ↗</a> : v.text}
                        {used.includes(f.col) && <span className="tag">used by NomBot</span>}
                      </td>
                      <td><code>{f.col}</code> <code className="raw">{raw}</code></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </article>
  );
}
