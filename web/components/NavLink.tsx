"use client";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { Loading } from "./Loading";

function Pending({ label, search }: { label?: string; search?: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? <Loading label={label} search={search} /> : null;
}

// A Link that shows the loading popup while its page is on the way.
// search: the target runs a search (shows the step-by-step progress).
// replace: swap the history entry instead of adding one (e.g. switching panes inside a modal).
// Going from one source viewer to another always replaces, so the source panel closes in one
// step. That's decided on click: reading the path while rendering would block prerendering.
export function NavLink({ href, className, children, label, title, current, search, replace }: { href: string; className?: string; children: React.ReactNode; label?: string; title?: string; current?: boolean; search?: boolean; replace?: boolean }) {
  const router = useRouter();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (replace || !href.startsWith("/source/") || !location.pathname.startsWith("/source/")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    router.replace(href, { scroll: false });
  };
  return (
    <Link href={href} className={className} title={title} aria-current={current ? "page" : undefined} replace={replace} scroll={replace ? false : undefined} onClick={onClick}>
      {children}
      <Pending label={label} search={search} />
    </Link>
  );
}
