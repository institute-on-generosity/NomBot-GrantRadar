import { OrgView } from "@/components/OrgView";

// Research Buddy links here. Opened from inside the app it's intercepted into a modal
// (app/@panel/(.)preview/...); loaded directly it's the regular organization page.
export default function OrgPreviewPage(props: PageProps<"/preview/org/[ein]">) {
  return <OrgView {...props} />;
}
