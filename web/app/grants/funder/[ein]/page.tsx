import { Suspense } from "react";
import { FunderView } from "@/components/FunderView";

// A foundation opened directly (shared link, reload). From the matches it opens as a sheet instead.
export default function FunderPage(props: PageProps<"/grants/funder/[ein]">) {
  return (
    <main className="wide">
      <Suspense fallback={<p className="hint">Opening the foundation…</p>}>
        <Content {...props} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: PageProps<"/grants/funder/[ein]">) {
  const [{ ein }, sp] = await Promise.all([params, searchParams]);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return <FunderView ein={ein} mission={str(sp.mission)} state={str(sp.st)} back={str(sp.back)} />;
}
