import { Suspense } from "react";
import { connection } from "next/server";
import { PersonView } from "@/components/PersonView";
import { personProfile } from "@/lib/people";

// /person?name=Darren+Walker: one person's board seats (linked from "Board connections" on org pages).
// &ein=…: the person holding that seat, when several people share the name (generosity-data 078).
export default function PersonPage({ searchParams }: { searchParams: Promise<{ name?: string; ein?: string }> }) {
  return (
    <main>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Person searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Person({ searchParams }: { searchParams: Promise<{ name?: string; ein?: string }> }) {
  const p = await searchParams;
  const name = (p.name ?? "").trim().slice(0, 80), ein = /^\d{9}$/.test(p.ein ?? "") ? p.ein : undefined;
  await connection();
  const profile = name ? await personProfile(name, ein) : { key: null, seats: [], others: [], giving: [], peers: [], between: [] };
  return <PersonView name={name || "Unknown"} profile={profile} />;
}
