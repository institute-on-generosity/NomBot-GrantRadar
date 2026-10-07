"use client";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// Renders children only while the URL path starts with `prefix`.
// Overlays in the @panel slot (source panel, org popover) use it: in this Next version the
// slot keeps its last content after navigating away (even to a route whose slot page renders
// null), so without the gate a closed popover stayed on screen.
export function RouteGate({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  return <Suspense fallback={null}><Gate prefix={prefix}>{children}</Gate></Suspense>;
}

function Gate({ prefix, children }: { prefix: string; children: React.ReactNode }) {
  return usePathname().startsWith(prefix) ? children : null;
}
