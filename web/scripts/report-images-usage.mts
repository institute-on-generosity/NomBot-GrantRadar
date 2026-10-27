// Report images: lists findings with no entry in lib/reportImages.json (they get the generated cover) and writes a
// review sheet (headline, chosen image or cover, reason) for a quick human check.
//   npx tsx scripts/report-images-usage.mts [path/to/review.html]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
try { process.loadEnvFile(join(import.meta.dirname, "..", ".env.local")); } catch { /* no .env.local */ }
const { listInsights } = await import("../lib/insights");
const man = JSON.parse(readFileSync(join(import.meta.dirname, "..", "lib", "reportImages.json"), "utf8")) as Record<string, { type: string; small?: string; alt?: string; credit?: string; reason: string; queries: string[] }>;
const { insights } = await listInsights();
const missing = insights.filter((i) => !man[i.slug]).map((i) => i.slug);
const uses = new Map<string, number>();
for (const e of Object.values(man)) if (e.small) uses.set(e.small, (uses.get(e.small) ?? 0) + 1);
console.log(`photos ${Object.values(man).filter((e) => e.type === "photo").length}, covers ${Object.values(man).filter((e) => e.type === "cover").length}, not in the manifest (cover) ${missing.length}: ${missing.join(", ") || "none"}`);
console.log(`most reused photo: ${Math.max(0, ...uses.values())} reports`);
const out = process.argv[2];
if (out) {
  const base = process.env.REVIEW_BASE ?? "http://localhost:4000";
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = insights.map((i) => {
    const e = man[i.slug];
    const pic = e?.type === "photo" ? `<img src="${base}${e.small}" alt="${esc(e.alt ?? "")}">` : `<div class="cover">${esc((i.stats?.[0]?.value) ?? "cover")}</div>`;
    return `<tr><td>${pic}</td><td><b>${esc(i.headline)}</b><br><small>${e?.type === "photo" ? "Photo" : "Generated cover"}: ${esc(e?.reason ?? "not in the manifest")}${e?.queries?.length ? `<br>Searched: ${esc(e.queries.join(" · "))}` : ""}${e?.credit ? `<br>${esc(e.credit)}` : ""}</small></td></tr>`;
  }).join("\n");
  writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Report images review</title><style>body{font:14px system-ui;margin:24px;color:#2b2b2e;background:#fafaf8}table{border-collapse:collapse}td{padding:10px;border-bottom:1px solid #ddd;vertical-align:top}img,.cover{width:220px;height:146px;object-fit:cover;border-radius:8px}.cover{display:grid;place-items:center;background:#e8efe9;font:600 30px Georgia,serif;color:#1f5f30}small{color:#666}</style><h1>Report images (${insights.length} reports)</h1><table>${rows}</table>`);
  console.log(`review sheet: ${out}`);
}
process.exit(0);
