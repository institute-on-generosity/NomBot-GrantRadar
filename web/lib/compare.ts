// Side-by-side comparison of 2–4 organizations (server side).
// The picked list itself lives in the browser: see components/CompareButton.tsx
// (kept there so client code never imports this file's database access).
import { getOrg } from "./org";

export const COMPARE_MAX = 4;

// "?ein=a,b,c" → up to 4 unique 9-digit EINs.
export function parseEins(param: string | string[] | undefined): string[] {
  const raw = (Array.isArray(param) ? param.join(",") : param ?? "").split(",").map((e) => e.replace(/\D/g, ""));
  return [...new Set(raw.filter((e) => e.length === 9))].slice(0, COMPARE_MAX);
}

export type Compared = NonNullable<Awaited<ReturnType<typeof getOrg>>>;

// Call after `await connection()`. Fetches in parallel; unknown EINs are dropped.
export async function loadCompare(eins: string[]): Promise<Compared[]> {
  const orgs = await Promise.all(eins.slice(0, COMPARE_MAX).map((e) => getOrg(e).catch(() => null)));
  return orgs.filter((o): o is Compared => o != null);
}
