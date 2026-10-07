import { OrgView } from "@/components/OrgView";

export default function OrgPage(props: PageProps<"/org/[ein]">) {
  return <OrgView {...props} />;
}
