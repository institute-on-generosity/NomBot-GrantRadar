export function money(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}
