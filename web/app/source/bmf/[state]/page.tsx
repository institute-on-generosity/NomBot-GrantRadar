import { Suspense } from "react";
import { NavLink } from "@/components/NavLink";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { Header } from "@/components/Header";
import { titleCase } from "@/components/text";
import { BMF_GUIDE, bmfFileUrl, FIELDS, loadBmf, STATE_NAMES } from "@/lib/bmf";
import { nteeLabel } from "@/lib/ntee";

type Props = { params: Promise<{ state: string }>; searchParams: Promise<{ ein?: string; at?: string }> };

const WINDOW = 10; // rows shown on each side of the highlighted one

export default function BmfViewer(props: Props) {
  return (
    <main className="wide">
      <Header />
      <Suspense fallback={<p className="hint">Opening the IRS master file from irs.gov…</p>}>
        <Viewer {...props} />
      </Suspense>
    </main>
  );
}

const money = (v: string) => (/^-?\d+$/.test(v) ? `$${Number(v).toLocaleString("en-US")}` : "—");

async function Viewer({ params, searchParams }: Props) {
  const [{ state: raw }, { ein: einRaw = "", at }] = await Promise.all([params, searchParams]);
  const state = raw.toUpperCase();
  if (!STATE_NAMES[state]) notFound();
  await connection();
  const file = await loadBmf(state);
  const col = (name: string) => file.header.indexOf(name);
  const ein = einRaw.replace(/\D/g, "");
  const hit = ein ? file.rows.findIndex((r) => r[col("EIN")] === ein) : -1;
  const center = at && /^\d+$/.test(at) ? Math.min(Number(at), file.rows.length - 1) : Math.max(hit, 0);
  const from = Math.max(0, center - WINDOW), to = Math.min(file.rows.length, center + WINDOW + 1);
  const row = hit >= 0 ? file.rows[hit] : null;
  const fileName = `eo_${state.toLowerCase()}.csv`;
  const here = (atRow: number) => `/source/bmf/${state.toLowerCase()}?${new URLSearchParams({ ...(ein ? { ein } : {}), at: String(atRow) })}`;

  return (
    <article className="org viewer">
      <BackLink fallback={ein ? `/org/${ein.slice(0, 2)}-${ein.slice(2)}` : "/"}>← Back</BackLink>
      <h1>IRS master file · {STATE_NAMES[state]}</h1>
      <p className="sub">
        Exempt Organizations Business Master File · <code>{fileName}</code> · {file.rows.length.toLocaleString("en-US")} organizations · read from irs.gov {file.fetchedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
      <p className="links">
        <a href={bmfFileUrl(state)} target="_blank" rel="noreferrer">Download the original CSV ↗</a>
        <a href={BMF_GUIDE} target="_blank" rel="noreferrer">IRS field guide (PDF) ↗</a>
      </p>

      {ein && !row && <p className="notice">EIN {einRaw} isn&apos;t in this file. It may be listed under another state or have been removed by the IRS.</p>}

      {row && (
        <section className="record">
          <h2>This organization&apos;s row <span>row {(hit + 1).toLocaleString("en-US")} of {file.rows.length.toLocaleString("en-US")}</span></h2>
          <table>
            <thead><tr><th>Field</th><th>What it says</th><th>Exactly as in the file</th></tr></thead>
            <tbody>
              {FIELDS.map((f) => {
                const v = row[col(f.col)] ?? "";
                const shown = f.decode ? f.decode(v) : v;
                return (
                  <tr key={f.col} className={f.used ? "used" : undefined}>
                    <td><b>{f.label}</b><small>{f.help}</small></td>
                    <td>{shown || <span className="empty">blank</span>}{f.used && <span className="tag">used by NomBot</span>}</td>
                    <td><code>{f.col}</code> <code className="raw">{v || " "}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="rawline"><b>The raw line</b><code>{file.lines[hit]}</code></p>
        </section>
      )}

      <section>
        <h2>Where it sits in the file <span>rows {(from + 1).toLocaleString("en-US")}–{to.toLocaleString("en-US")}</span></h2>
        <table className="filetable">
          <thead><tr><th className="n">Row</th><th>Name</th><th>City</th><th>Cause</th><th className="n">Revenue</th><th>Latest return</th></tr></thead>
          <tbody>
            {file.rows.slice(from, to).map((r, i) => {
              const idx = from + i;
              const e = r[col("EIN")];
              const ntee = r[col("NTEE_CD")];
              const tp = r[col("TAX_PERIOD")];
              return (
                <tr key={idx} className={idx === hit ? "hit" : undefined}>
                  <td className="n">{(idx + 1).toLocaleString("en-US")}</td>
                  <td>{idx === hit ? <b>{titleCase(r[col("NAME")])}</b> : <NavLink href={`/source/bmf/${state.toLowerCase()}?ein=${e}`}>{titleCase(r[col("NAME")])}</NavLink>}</td>
                  <td>{titleCase(r[col("CITY")] ?? "")}</td>
                  <td>{ntee ? nteeLabel(ntee) ?? ntee : "—"}</td>
                  <td className="n">{money(r[col("REVENUE_AMT")])}</td>
                  <td>{/^\d{6}$/.test(tp) ? tp.slice(0, 4) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="pager">
          {from > 0 && <NavLink href={here(Math.max(0, center - 2 * WINDOW - 1))}>← Earlier rows</NavLink>}
          {hit >= 0 && center !== hit && <NavLink href={here(hit)}>Back to this organization</NavLink>}
          {to < file.rows.length && <NavLink href={here(Math.min(file.rows.length - 1, center + 2 * WINDOW + 1))}>Later rows →</NavLink>}
        </p>
      </section>
    </article>
  );
}
