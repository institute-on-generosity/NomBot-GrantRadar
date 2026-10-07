import { SidePanel } from "@/components/SidePanel";
import { BmfViewer } from "@/components/viewers/BmfViewer";

// /source/bmf/<state> opened from inside the app: the compact viewer in the right-hand panel.
export default function BmfPanel(props: PageProps<"/source/bmf/[state]">) {
  return <SidePanel title="IRS master file"><BmfViewer {...props} compact /></SidePanel>;
}
