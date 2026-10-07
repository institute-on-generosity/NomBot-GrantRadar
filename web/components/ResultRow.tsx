export function money(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}

// IRS text is often ALL CAPS; show it in sentence case, trimmed to one short paragraph.
function readable(line: string) {
  const letters = line.replace(/[^A-Za-z]/g, "");
  const caps = letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
  const t = caps ? line.charAt(0) + line.slice(1).toLowerCase() : line;
  return t.length > 180 ? t.slice(0, 180).trimEnd() + "…" : t;
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
        {line && <div className="line">{readable(line)}</div>}
      </div>
      {amount != null && <div className="rev"><b>{money(amount)}</b><span>{amountLabel ?? "revenue"}</span></div>}
    </div>
  );
}
