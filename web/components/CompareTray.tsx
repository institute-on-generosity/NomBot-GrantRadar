"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "./NavLink";
import { titleCase } from "./text";
import { clearCompare, compareHref, CompareIcon, removeCompare, useCompareList, XIcon } from "./CompareButton";
import styles from "./Compare.module.css";

// Floating frosted bar at the bottom center once anything is picked for comparison.
// URL hooks can't run while the layout prerenders, so the bar lives in its own <Suspense>.
export function CompareTray() {
  return <Suspense fallback={null}><Tray /></Suspense>;
}

function Tray() {
  const path = usePathname();
  const list = useCompareList();
  if (!list.length || path === "/compare") return null;
  const n = list.length;
  return (
    <div className={styles.tray} role="region" aria-label="Compare">
      <ul className={styles.chips}>
        {list.map((o) => (
          <li key={o.ein} className={styles.chip} title={[titleCase(o.name), [o.city && titleCase(o.city), o.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}>
            <span>{titleCase(o.name)}</span>
            <button type="button" onClick={() => removeCompare(o.ein)} aria-label={`Remove ${titleCase(o.name)}`}><XIcon size={10} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.clear} onClick={clearCompare}>Clear</button>
      {n < 2
        ? <span className={`${styles.go} ${styles.off}`} aria-disabled title="Pick at least 2"><CompareIcon />Compare ({n})</span>
        : <NavLink href={compareHref(list.map((o) => o.ein))} className={styles.go} label="Comparing…"><CompareIcon />Compare ({n})</NavLink>}
    </div>
  );
}
