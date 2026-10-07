import Link from "next/link";

export function Header() {
  return (
    <header className="top">
      <Link href="/" className="brand"><span className="logo">N</span>NomBot</Link>
      <nav className="toplinks"><Link href="/history">History</Link><Link href="/saved">★ Saved</Link></nav>
    </header>
  );
}
