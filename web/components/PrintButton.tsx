"use client";
import { useEffect, useState } from "react";

const PrintIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v6.5H7z" /></svg>;

// Print this page as a short memo (print styles in globals.css drop the app around it), for readers
// who'd rather keep a paper copy. PrintStamp adds where and when it came from, only on paper.
export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" className="print-btn" onClick={() => window.print()}><PrintIcon />{label}</button>;
}

export function PrintStamp() {
  const [at, setAt] = useState("");
  useEffect(() => setAt(`${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · ${location.href}`), []);
  return <p className="print-stamp">NomBot · from public IRS filings · printed {at}</p>;
}
