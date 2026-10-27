"use client";
import { useState } from "react";
import { Icon } from "./Icons";

// Copy the page link, and print (the article prints cleanly).
export function ShareTools() {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } };
  return (
    <span className="ra-share">
      <button type="button" className="ins-btn" onClick={copy} aria-live="polite"><Icon name="external" size={13} />{copied ? "Copied" : "Copy link"}</button>
      <button type="button" className="ins-btn" onClick={() => window.print()}><Icon name="printer" size={13} />Print</button>
    </span>
  );
}
