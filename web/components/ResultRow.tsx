export function money(n: number) {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function ResultRow({ name, place, line, amount, amountLabel }: { name: string; place: string; line?: string | null; amount?: number | null; amountLabel?: string }) {
  return (
    <div className="row">
      <div>
        <div className="name">{titleCase(name)}</div>
        <div className="sub">{place}</div>
        {line && <div className="line">{line.length > 180 ? line.slice(0, 180) + "…" : line.charAt(0) + line.slice(1).toLowerCase()}</div>}
      </div>
      {amount != null && <div className="rev"><b>{money(amount)}</b><span>{amountLabel ?? "revenue"}</span></div>}
    </div>
  );
}
