// Compact dollars: $3.3B, $1.2M, $59K, $840; losses get a leading minus (−$234K).
export function money(n: number) {
  const a = Math.abs(n), sign = n < 0 ? "−" : "";
  if (a >= 999.5e6) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return a >= 1e3 ? `${sign}$${Math.round(a / 1e3)}K` : `${sign}$${a}`;
}
