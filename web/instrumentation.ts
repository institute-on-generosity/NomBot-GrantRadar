// Server start: warm Browse by cause (lib/browse.ts) in the background, so the first visitor gets cached figures.
// Its disk cache (.next/cache/nombot-browse.json) usually makes this a quick read; a new answer cache version recomputes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { warmBrowse } = await import("./lib/browse");
  setTimeout(() => void warmBrowse(), 15_000).unref?.();
}
