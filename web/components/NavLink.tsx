"use client";
import Link, { useLinkStatus } from "next/link";
import { Loading } from "./Loading";

function Pending({ label, search }: { label?: string; search?: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? <Loading label={label} search={search} /> : null;
}

// A Link that shows the loading popup while its page is on the way.
// search: the target runs a search (shows the step-by-step progress).
// replace: swap the history entry instead of adding one (e.g. switching panes inside a modal).
export function NavLink({ href, className, children, label, title, current, search, replace }: { href: string; className?: string; children: React.ReactNode; label?: string; title?: string; current?: boolean; search?: boolean; replace?: boolean }) {
  return (
    <Link href={href} className={className} title={title} aria-current={current ? "page" : undefined} replace={replace} scroll={replace ? false : undefined}>
      {children}
      <Pending label={label} search={search} />
    </Link>
  );
}
