import { money } from "./money";
import type { Health } from "@/lib/search";

const pct = (x: number) => `${x > 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`;

// Up to two small tags from the organization's own IRS filings: revenue trend (only when it moved
// 10% or more) and the newest filed year's result (surplus of 5%+ or a deficit). Hover a tag for the figures.
export function HealthBadges({ h }: { h: Health | null }) {
  if (!h) return null;
  const t = h.trend;
  const reserves = h.reserveMonths == null ? "" : ` · reserves ${h.reserveMonths >= 12 ? `${(h.reserveMonths / 12).toFixed(1)} years` : `${Math.max(0, Math.round(h.reserveMonths))} months`} of spending`;
  return (
    <>
      {t && Math.abs(t.change) >= 0.1 && (
        <span className={`fin ${t.change > 0 ? "up" : "down"}`} tabIndex={0}>
          {t.change > 0 ? "Growing" : "Shrinking"} {pct(t.change)}
          <span className="fin-tip" role="tooltip">Revenue {money(t.from.amount)} ({t.from.year}) → {money(t.to.amount)} ({t.to.year})</span>
        </span>
      )}
      {h.margin != null && (h.margin < 0 || h.margin >= 0.05) && (
        <span className={`fin ${h.margin < 0 ? "bad" : "ok"}`} tabIndex={0}>
          {h.margin < 0 ? "Deficit" : "Surplus"} {h.year}
          <span className="fin-tip" role="tooltip">{h.year}: revenue {money(h.revenue)}, spending {money(h.expenses)}{reserves}</span>
        </span>
      )}
    </>
  );
}
