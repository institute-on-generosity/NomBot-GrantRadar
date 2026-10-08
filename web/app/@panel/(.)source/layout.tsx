import { RouteGate } from "@/components/RouteGate";
import { SidePanel } from "@/components/SidePanel";

// One panel shared by every source viewer: switching sources swaps the viewer inside it
// (keeping its tabs) instead of mounting a second panel.
export default function SourcePanelLayout({ children }: { children: React.ReactNode }) {
  return <RouteGate prefix="/source/"><SidePanel>{children}</SidePanel></RouteGate>;
}
