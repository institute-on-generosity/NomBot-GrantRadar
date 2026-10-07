import { BmfViewer } from "@/components/viewers/BmfViewer";

export default function BmfPage(props: PageProps<"/source/bmf/[state]">) {
  return <BmfViewer {...props} />;
}
