import { SoiViewer } from "@/components/viewers/SoiViewer";

// /source/soi/<ein> opened from inside the app: the compact viewer in the right-hand panel (see layout).
export default function SoiPanel(props: PageProps<"/source/soi/[ein]">) {
  return <SoiViewer {...props} compact />;
}
