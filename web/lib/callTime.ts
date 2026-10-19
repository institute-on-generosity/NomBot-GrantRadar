// Time format for the /admin API calls tab and its CSV (server and browser): New York wall clock to the millisecond.
export const CALL_TZ = "America/New_York";

// 2026-10-19 14:03:07.123 in New York time (what the tab and the CSV show).
export function fmtCallTime(iso: string) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: CALL_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
}
