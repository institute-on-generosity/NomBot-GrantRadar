import { Suspense } from "react";
import { FunderView } from "@/components/FunderView";
import { Modal } from "@/components/Modal";
import { RouteGate } from "@/components/RouteGate";

// A foundation opened from the matches: a sheet over the results, which stay where they were.
export default function FunderSheet(props: PageProps<"/grants/funder/[ein]">) {
  return (
    <RouteGate prefix="/grants/funder/">
      <Suspense fallback={<Modal label="Foundation" variant="sheet"><p className="hint modal-loading">Opening the foundation…</p></Modal>}>
        <Content {...props} />
      </Suspense>
    </RouteGate>
  );
}

async function Content({ params, searchParams }: PageProps<"/grants/funder/[ein]">) {
  const [{ ein }, sp] = await Promise.all([params, searchParams]);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    <Modal label="Foundation" variant="sheet">
      <FunderView ein={ein} mission={str(sp.mission)} state={str(sp.st)} back={str(sp.back)} sheet />
    </Modal>
  );
}
