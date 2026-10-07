"use client";
import { useEffect } from "react";

// Coming back from history: scroll to the organization the user last opened.
export function ScrollToResult({ id }: { id: string }) {
  useEffect(() => { document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [id]);
  return null;
}
