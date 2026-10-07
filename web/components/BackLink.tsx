"use client";
import { useRouter } from "next/navigation";

// "← Back" to wherever the user came from (results list or detail page).
export function BackLink({ fallback, children }: { fallback: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <a href={fallback} className="back" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); router.back(); } }}>
      {children}
    </a>
  );
}
