import { Modal } from "@/components/Modal";
import { OrgView } from "@/components/OrgView";

// An organization opened from Research Buddy: a modal over the results, so the
// conversation stays where it was.
export default function OrgModal(props: PageProps<"/preview/org/[ein]">) {
  return <Modal label="Organization"><OrgView {...props} modal /></Modal>;
}
