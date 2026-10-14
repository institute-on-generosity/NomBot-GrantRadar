import { Suspense } from "react";
import { connection } from "next/server";
import { PersonView } from "@/components/PersonView";
import { personProfile } from "@/lib/people";

// /person?name=Darren+Walker: one person's board seats (linked from "Board connections" on org pages).
export default function PersonPage({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  return (
    <main>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Person searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Person({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const name = ((await searchParams).name ?? "").trim().slice(0, 80);
  await connection();
  const profile = name ? await personProfile(name) : { key: null, seats: [], giving: [], peers: [], between: [] };
  return <PersonView name={name || "Unknown"} profile={profile} />;
}
