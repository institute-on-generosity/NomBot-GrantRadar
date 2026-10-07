export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="chips">{items.map((c) => <span key={c} className="chip">{c}</span>)}</div>;
}
