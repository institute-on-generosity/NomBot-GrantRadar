// Server start: warm Browse by cause (lib/browse.ts) and the known research answers (lib/warmAnswers.ts) in the
// background, so the first visitor gets cached figures and popover questions answer at once.
// Its disk cache (.next/cache/nombot-browse.json) usually makes this a quick read; a new answer cache version recomputes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { warmBrowse } = await import("./lib/browse");
  const { warmAnswers } = await import("./lib/warmAnswers");
  // Browse figures first, then every known research question's answer; again every 5 h (the answer cache keeps 6 h)
  setTimeout(() => void warmBrowse().then(() => warmAnswers()), 15_000).unref?.();
  setInterval(() => void warmAnswers(), 5 * 3600_000).unref?.();
}
