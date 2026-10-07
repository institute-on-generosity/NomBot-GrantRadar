import { Suspense } from "react";
import { Modal } from "@/components/Modal";
import { OrgView } from "@/components/OrgView";
import { BmfViewer } from "@/components/viewers/BmfViewer";
import { SoiViewer } from "@/components/viewers/SoiViewer";

// An organization opened from Research Buddy: a modal over the results, so the
// conversation stays where it was. ?src=<viewer url> opens that source beside it.
export default function OrgModal(props: PageProps<"/preview/org/[ein]">) {
  return (
    <Suspense fallback={<Modal label="Organization"><p className="hint modal-loading">Loading…</p></Modal>}>
      <OrgModalContent {...props} />
    </Suspense>
  );
}

// Reads the URL inside <Suspense>, as Cache Components requires.
async function OrgModalContent(props: PageProps<"/preview/org/[ein]">) {
  const [{ ein }, sp] = await Promise.all([props.params, props.searchParams]);
  const src = typeof sp.src === "string" ? sp.src : "";
  const source = sourcePane(src);
  return (
    <Modal label="Organization" source={source && { title: source.title, closeHref: `/preview/org/${ein}` }}>
      <OrgView {...props} modal />
      {source?.view}
    </Modal>
  );
}

// "/source/bmf/oh?ein=…" or "/source/soi/<ein>?year=…&form=…" -> the compact viewer for it.
function sourcePane(src: string) {
  const url = src.startsWith("/source/") ? new URL(src, "http://local") : null;
  const q = Object.fromEntries(url?.searchParams ?? []);
  const bmf = url?.pathname.match(/^\/source\/bmf\/([a-z]{2})$/i);
  if (bmf) return { title: "IRS master file", view: <BmfViewer params={Promise.resolve({ state: bmf[1] })} searchParams={Promise.resolve(q)} compact /> };
  const soi = url?.pathname.match(/^\/source\/soi\/(\d{9})$/);
  if (soi) return { title: "IRS financial extract", view: <SoiViewer params={Promise.resolve({ ein: soi[1] })} searchParams={Promise.resolve(q)} compact /> };
  return null;
}
