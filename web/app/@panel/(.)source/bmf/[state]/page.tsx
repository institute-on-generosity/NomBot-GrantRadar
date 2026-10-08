import { BmfViewer } from "@/components/viewers/BmfViewer";

// /source/bmf/<state> opened from inside the app: the compact viewer in the right-hand panel (see layout).
export default function BmfPanel(props: PageProps<"/source/bmf/[state]">) {
  return <BmfViewer {...props} compact />;
}
