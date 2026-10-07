import { SidePanel } from "@/components/SidePanel";
import { SoiViewer } from "@/components/viewers/SoiViewer";

// /source/soi/<ein> opened from inside the app: the compact viewer in the right-hand panel.
export default function SoiPanel(props: PageProps<"/source/soi/[ein]">) {
  return <SidePanel title="IRS financial extract"><SoiViewer {...props} compact /></SidePanel>;
}
