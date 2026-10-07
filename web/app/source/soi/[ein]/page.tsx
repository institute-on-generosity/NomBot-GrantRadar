import { SoiViewer } from "@/components/viewers/SoiViewer";

export default function SoiPage(props: PageProps<"/source/soi/[ein]">) {
  return <SoiViewer {...props} />;
}
