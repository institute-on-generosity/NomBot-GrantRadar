"use client";
import { useRouter } from "next/navigation";
import { useStoredList } from "./useStored";
import styles from "./Compare.module.css";

// Organizations picked for side-by-side comparison, kept only in this browser (like lib/saved.ts).
export type CompareOrg = { ein: string; name: string; city: string | null; state: string | null };

export const COMPARE_KEY = "nombot.compare.v1";
export const COMPARE_EVENT = "nombot-compare";
export const COMPARE_MAX = 4;

const digits = (ein: string) => ein.replace(/\D/g, "");
export const compareHref = (eins: string[]) => `/compare?ein=${eins.map(digits).join(",")}`;

export function readCompare(): CompareOrg[] {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY) ?? "[]"); } catch { return []; }
}
function write(list: CompareOrg[]) {
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify(list)); window.dispatchEvent(new Event(COMPARE_EVENT)); } catch { /* storage unavailable */ }
}
// Adds or removes; adds past the max are ignored.
export function toggleCompare(o: CompareOrg) {
  const ein = digits(o.ein), list = readCompare();
  if (list.some((x) => x.ein === ein)) write(list.filter((x) => x.ein !== ein));
  else if (list.length < COMPARE_MAX) write([...list, { ...o, ein }]);
}
export const removeCompare = (ein: string) => write(readCompare().filter((x) => x.ein !== digits(ein)));
export const clearCompare = () => write([]);
export const useCompareList = () => useStoredList<CompareOrg>(COMPARE_KEY, COMPARE_EVENT);

// Two overlapping columns: SF "rectangle.split" style.
export const CompareIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="4.5" width="7" height="15" rx="2" /><rect x="13.5" y="4.5" width="7" height="15" rx="2" />
  </svg>
);
const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const XIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// Pill toggle beside the ☆ on each result row.
export function CompareButton({ org }: { org: CompareOrg }) {
  const list = useCompareList();
  const ein = digits(org.ein);
  const on = list.some((x) => x.ein === ein);
  const full = !on && list.length >= COMPARE_MAX;
  return (
    <button
      type="button"
      className={`${styles.pick}${on ? ` ${styles.on}` : ""}`}
      onClick={(e) => { e.preventDefault(); toggleCompare(org); }}
      aria-pressed={on}
      disabled={full}
      title={full ? "Compare up to 4" : on ? "Remove from compare" : "Add to compare"}
    >
      {on ? <CheckIcon /> : <CompareIcon size={13} />}<span>Compare</span>
    </button>
  );
}

// × in a compare-page column header: drops the org from the URL and the stored pick.
export function RemoveColumn({ ein, name, eins }: { ein: string; name: string; eins: string[] }) {
  const router = useRouter();
  const rest = eins.filter((e) => e !== digits(ein));
  return (
    <button
      type="button"
      className={styles.colX}
      aria-label={`Remove ${name} from comparison`}
      title="Remove"
      onClick={() => { removeCompare(ein); router.replace(rest.length ? compareHref(rest) : "/compare", { scroll: false }); }}
    >
      <XIcon />
    </button>
  );
}
