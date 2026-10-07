"use client";
import Link, { useLinkStatus } from "next/link";
import { Loading } from "./Loading";

function Pending({ label }: { label?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loading label={label} /> : null;
}

// A Link that shows the loading popup while its page is on the way.
export function NavLink({ href, className, children, label, title, current }: { href: string; className?: string; children: React.ReactNode; label?: string; title?: string; current?: boolean }) {
  return (
    <Link href={href} className={className} title={title} aria-current={current ? "page" : undefined}>
      {children}
      <Pending label={label} />
    </Link>
  );
}
