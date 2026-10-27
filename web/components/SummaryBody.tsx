"use client";
import { Suspense, use, useEffect, useState } from "react";
import { PublishSummary } from "./PublishSummary";
import type { SummaryText } from "@/lib/searchSummary";

// The summary's AI text. Shows the first description (closest matches) at once; if relevance scoring later finds
// the strong matches differ a lot, the rewrite (later) streams in and replaces it quietly.
export function SummaryBody({ first, later, question }: { first: SummaryText | null; later: Promise<SummaryText | null>; question: string }) {
  const [t, setT] = useState(first);
  return (
    <>
      {t && (
        <>
          <p className="sum-text" data-basis={t.basis}>{t.text}</p>
          <p className="sum-foot">AI summary of the {t.basis === "closest" ? "closest" : "strong"} matches&apos; IRS filings · verify details</p>
          <PublishSummary question={question} text={t.text} explore={t.explore} />
        </>
      )}
      <Suspense fallback={null}><Swap later={later} onSwap={setT} /></Suspense>
    </>
  );
}

function Swap({ later, onSwap }: { later: Promise<SummaryText | null>; onSwap: (t: SummaryText) => void }) {
  const t = use(later);
  useEffect(() => { if (t) onSwap(t); }, [t, onSwap]);
  return null;
}
