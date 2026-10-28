// Prewarm (Oct 27, speed): after a server start, compute the answer for every question NomBot offers (lib/knownQuestions:
// the cause popover, Browse asks, curated prompts), two at a time, so clicking one answers from the cache. Repeats
// before the answer cache expires. Deterministic SQL, no Claude calls.
import { answer } from "./answer";
import { knownQuestions } from "./knownQuestions";

export async function warmAnswers() {
  const t0 = Date.now(), list = knownQuestions();
  let i = 0, failed = 0;
  const worker = async () => {
    while (i < list.length) {
      const { q, spec } = list[i++];
      await answer(q, spec).catch(() => { failed++; });
    }
  };
  await Promise.all([worker(), worker()]);
  console.log(`answers: ${list.length - failed} known questions warm in ${Math.round((Date.now() - t0) / 1000)} s${failed ? ` (${failed} failed)` : ""}`);
}
