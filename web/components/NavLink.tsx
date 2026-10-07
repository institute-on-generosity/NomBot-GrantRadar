"use client";
import Link, { useLinkStatus } from "next/link";
import { Loading } from "./Loading";

function Pending({ label }: { label?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Loading label={label} /> : null;
}

// A Link that shows the loading popup while its page is on the way.
export function NavLink({ href, className, children, label, title }: { href: string; className?: string; children: React.ReactNode; label?: string; title?: string }) {
  return (
    <Link href={href} className={className} title={title}>
      {children}
      <Pending label={label} />
    </Link>
  );
}
